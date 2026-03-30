import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
	type DashboardAuthEnv,
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";
import { resolveOperatorIdentity } from "@/lib/security/operator-identity";
import {
	clearOperatorSessionCookie,
	readOperatorSessionToken,
	verifyOperatorSessionToken,
} from "@/lib/security/operator-session";
import type {
	OperatorAuthDeniedPayload,
	OperatorAuthDeniedState,
	OperatorIdentity,
	OperatorSessionSummary,
} from "@/lib/security/types";

function defaultDeniedMessage(
	state: OperatorAuthDeniedState,
	operatorCodeRequired: boolean,
): string {
	if (state === "identity_denied") return "Operator access denied";
	if (state === "session_expired") return "Operator session expired";
	if (!operatorCodeRequired) return "Operator elevation is disabled";
	return "Operator elevation required";
}

function canChallenge(
	state: OperatorAuthDeniedState,
	operatorCodeRequired: boolean,
): boolean {
	return operatorCodeRequired && state !== "identity_denied";
}

export function createOperatorAuthDeniedPayload(
	state: OperatorAuthDeniedState,
	operatorCodeRequired: boolean,
	message = defaultDeniedMessage(state, operatorCodeRequired),
): OperatorAuthDeniedPayload {
	return {
		ok: false,
		error: message,
		auth: {
			ok: false,
			type: "operator_auth",
			state,
			message,
			canChallenge: canChallenge(state, operatorCodeRequired),
		},
	};
}

export function createOperatorAuthDeniedResponse(
	request: Request,
	state: OperatorAuthDeniedState,
	status: number,
	operatorCodeRequired: boolean,
	options: {
		clearSession?: boolean;
		message?: string;
	} = {},
): NextResponse {
	const response = NextResponse.json(
		createOperatorAuthDeniedPayload(
			state,
			operatorCodeRequired,
			options.message,
		),
		{ status },
	);

	if (options.clearSession) {
		clearOperatorSessionCookie(response, request);
	}

	return response;
}

export function createOperatorConfigErrorResponse(
	message = "Operator auth is not configured",
	status = 503,
): NextResponse {
	return NextResponse.json({ ok: false, error: message }, { status });
}

export type SensitiveRouteAccessResult =
	| {
			ok: true;
			identity: OperatorIdentity;
			session: OperatorSessionSummary;
	  }
	| {
			ok: false;
			response: NextResponse;
	  };

export function requireSensitiveRouteAccess(
	request: Request,
): SensitiveRouteAccessResult {
	let env: DashboardAuthEnv;
	try {
		env = parseDashboardAuthEnv();
	} catch (error) {
		const message =
			error instanceof DashboardEnvError
				? "Operator auth is not configured"
				: "Operator auth is unavailable";
		logger.error({ state: "config_error" }, message);
		return {
			ok: false,
			response: createOperatorConfigErrorResponse(message),
		};
	}

	const identityResolution = resolveOperatorIdentity(request, env);
	if (!identityResolution.ok) {
		logger.warn(
			{ state: identityResolution.state },
			identityResolution.message,
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

	const sessionResult = verifyOperatorSessionToken(
		readOperatorSessionToken(request),
		identityResolution.identity,
		env,
	);
	if (!sessionResult.ok) {
		logger.warn({ state: sessionResult.state }, "Sensitive route auth denied");
		return {
			ok: false,
			response: createOperatorAuthDeniedResponse(
				request,
				sessionResult.state,
				401,
				env.operatorCodeRequired,
				{ clearSession: sessionResult.shouldClear },
			),
		};
	}

	return {
		ok: true,
		identity: identityResolution.identity,
		session: sessionResult.session,
	};
}
