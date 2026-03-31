import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
	type DashboardAuthEnv,
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";
import {
	isLocalDashboardRequest,
	resolveOperatorIdentity,
} from "@/lib/security/operator-identity";
import {
	createOperatorAuthDeniedResponse,
	createOperatorConfigErrorResponse,
	requireSensitiveRouteAccess,
} from "@/lib/security/sensitive-route";
import type {
	OperatorIdentity,
	OperatorSessionSummary,
	SensitiveMutationDeniedPayload,
	SensitiveMutationDeniedState,
} from "@/lib/security/types";

export type SensitiveMutationAuthMode = "elevated" | "identity" | "none";

export interface SensitiveMutationOptions {
	auth?: SensitiveMutationAuthMode;
	allowedMethods?: string[];
}

export type SensitiveMutationAccessResult =
	| {
			ok: true;
			identity: OperatorIdentity | null;
			session: OperatorSessionSummary | null;
	  }
	| {
			ok: false;
			response: NextResponse;
	  };

const DEFAULT_ALLOWED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function getDeniedMessage(state: SensitiveMutationDeniedState): string {
	if (state === "method_not_allowed") {
		return "This endpoint does not allow that mutation method.";
	}
	if (state === "origin_denied") {
		return "Cross-origin dashboard writes are not allowed.";
	}
	return "This action must be submitted from the dashboard origin.";
}

export function createSensitiveMutationDeniedPayload(
	state: SensitiveMutationDeniedState,
	message = getDeniedMessage(state),
): SensitiveMutationDeniedPayload {
	return {
		ok: false,
		error: message,
		mutation: {
			ok: false,
			type: "sensitive_mutation",
			state,
			message,
		},
	};
}

export function createSensitiveMutationDeniedResponse(
	state: SensitiveMutationDeniedState,
	options: {
		message?: string;
		status?: number;
		allow?: string[];
	} = {},
): NextResponse<SensitiveMutationDeniedPayload> {
	const response = NextResponse.json(
		createSensitiveMutationDeniedPayload(state, options.message),
		{
			status: options.status ?? (state === "method_not_allowed" ? 405 : 403),
		},
	);

	if (options.allow?.length) {
		response.headers.set("Allow", options.allow.join(", "));
	}

	return response;
}

function normalizeOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		return `${url.protocol}//${url.host.toLowerCase()}`;
	} catch {
		return null;
	}
}

function normalizeHostOrigin(protocol: string, host: string): string | null {
	const normalizedHost = host.trim().split(",", 1)[0]?.trim();
	if (!normalizedHost) return null;
	return normalizeOrigin(`${protocol}//${normalizedHost}`);
}

function getRequestProtocol(request: Request): string {
	const forwardedProto = request.headers.get("x-forwarded-proto");
	const normalizedForwarded = forwardedProto?.split(",", 1)[0]?.trim();
	if (normalizedForwarded === "http:" || normalizedForwarded === "https:") {
		return normalizedForwarded;
	}
	if (normalizedForwarded === "http" || normalizedForwarded === "https") {
		return `${normalizedForwarded}:`;
	}

	try {
		return new URL(request.url).protocol || "https:";
	} catch {
		return "https:";
	}
}

function getMutationOrigin(request: Request):
	| {
			ok: true;
			origin: string;
			source: "origin" | "referer";
	  }
	| {
			ok: false;
			state: SensitiveMutationDeniedState;
	  } {
	const originHeader = request.headers.get("origin");
	if (originHeader?.trim()) {
		const origin = normalizeOrigin(originHeader.trim());
		if (!origin) {
			return { ok: false, state: "origin_invalid" };
		}
		return { ok: true, origin, source: "origin" };
	}

	const refererHeader = request.headers.get("referer");
	if (refererHeader?.trim()) {
		const origin = normalizeOrigin(refererHeader.trim());
		if (!origin) {
			return { ok: false, state: "origin_invalid" };
		}
		return { ok: true, origin, source: "referer" };
	}

	return { ok: false, state: "origin_required" };
}

function getTrustedOrigins(
	request: Request,
	env: DashboardAuthEnv,
): Set<string> {
	const protocol = getRequestProtocol(request);
	const origins = new Set<string>();

	try {
		const requestOrigin = normalizeOrigin(new URL(request.url).origin);
		if (requestOrigin) origins.add(requestOrigin);
	} catch {}

	const host = request.headers.get("host");
	const hostOrigin = host ? normalizeHostOrigin(protocol, host) : null;
	if (hostOrigin) origins.add(hostOrigin);

	const forwardedHost = request.headers.get("x-forwarded-host");
	const forwardedOrigin = forwardedHost
		? normalizeHostOrigin(protocol, forwardedHost)
		: null;
	if (forwardedOrigin) origins.add(forwardedOrigin);

	if (env.dashboardHost) {
		const requestHostOrigin = normalizeHostOrigin(protocol, env.dashboardHost);
		if (requestHostOrigin) origins.add(requestHostOrigin);
		const httpsOrigin = normalizeHostOrigin("https:", env.dashboardHost);
		if (httpsOrigin) origins.add(httpsOrigin);
	}

	return origins;
}

function requireTrustedMutationOrigin(
	request: Request,
	env: DashboardAuthEnv,
): SensitiveMutationAccessResult {
	const source = getMutationOrigin(request);
	if (!source.ok) {
		logger.warn(
			{ method: request.method, state: source.state },
			"Sensitive mutation origin rejected",
		);
		return {
			ok: false,
			response: createSensitiveMutationDeniedResponse(source.state),
		};
	}

	const trustedOrigins = getTrustedOrigins(request, env);
	if (!trustedOrigins.has(source.origin)) {
		logger.warn(
			{
				method: request.method,
				state: "origin_denied",
				source: source.source,
				origin: source.origin,
				trustedOrigins: Array.from(trustedOrigins),
			},
			"Sensitive mutation origin rejected",
		);
		return {
			ok: false,
			response: createSensitiveMutationDeniedResponse("origin_denied"),
		};
	}

	return {
		ok: true,
		identity: null,
		session: null,
	};
}

export function requireSensitiveMutationAccess(
	request: Request,
	options: SensitiveMutationOptions = {},
): SensitiveMutationAccessResult {
	const allowedMethods = options.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
	const method = request.method.toUpperCase();
	if (!allowedMethods.includes(method)) {
		return {
			ok: false,
			response: createSensitiveMutationDeniedResponse("method_not_allowed", {
				allow: allowedMethods,
			}),
		};
	}

	let env: DashboardAuthEnv;
	try {
		env = parseDashboardAuthEnv();
	} catch (error) {
		const message =
			error instanceof DashboardEnvError
				? "Operator auth is not configured"
				: "Operator auth is unavailable";
		logger.error({ err: error }, message);
		return {
			ok: false,
			response: createOperatorConfigErrorResponse(message),
		};
	}

	const originAccess = requireTrustedMutationOrigin(request, env);
	if (!originAccess.ok) return originAccess;

	const authMode = options.auth ?? "elevated";
	if (authMode === "none") {
		return {
			ok: true,
			identity: null,
			session: null,
		};
	}

	if (authMode === "identity") {
		const identityResolution = resolveOperatorIdentity(request, env);
		if (!identityResolution.ok) {
			logger.warn(
				{ state: identityResolution.state },
				"Sensitive mutation identity denied",
			);
			return {
				ok: false,
				response: createOperatorAuthDeniedResponse(
					request,
					identityResolution.state,
					403,
					env.operatorCodeRequired,
					{ message: identityResolution.message },
				),
			};
		}

		return {
			ok: true,
			identity: identityResolution.identity,
			session: null,
		};
	}

	const access = requireSensitiveRouteAccess(request);
	if (!access.ok) {
		return access;
	}

	return {
		ok: true,
		identity: access.identity,
		session: access.session,
	};
}

export function isLocalMutationRequest(request: Request): boolean {
	return isLocalDashboardRequest(request);
}
