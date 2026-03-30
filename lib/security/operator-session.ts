import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { DashboardAuthEnv } from "@/lib/security/dashboard-env";
import { isLocalDashboardRequest } from "@/lib/security/operator-identity";
import type {
	OperatorIdentity,
	OperatorSessionSummary,
} from "@/lib/security/types";

const OPERATOR_SESSION_VERSION = 1;

interface StoredOperatorSession {
	v: number;
	sub: string;
	mode: OperatorIdentity["mode"];
	email: string | null;
	iat: number;
	exp: number;
}

export type OperatorSessionVerificationResult =
	| {
			ok: true;
			session: OperatorSessionSummary;
	  }
	| {
			ok: false;
			state: "challenge_required" | "session_expired";
			shouldClear: boolean;
	  };

export const OPERATOR_SESSION_COOKIE_NAME = "dashboard_operator_session";

function sha256Buffer(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

function timingSafeStringEquals(left: string, right: string): boolean {
	return timingSafeEqual(sha256Buffer(left), sha256Buffer(right));
}

function signPayload(encodedPayload: string, secret: string): string {
	return createHmac("sha256", secret)
		.update(encodedPayload)
		.digest("base64url");
}

function parseStoredSession(token: string): {
	payload: StoredOperatorSession;
	signatureValid: boolean;
} | null {
	const dotIndex = token.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === token.length - 1) {
		return null;
	}

	const encodedPayload = token.slice(0, dotIndex);
	const signature = token.slice(dotIndex + 1);

	try {
		const payload = JSON.parse(
			Buffer.from(encodedPayload, "base64url").toString("utf8"),
		) as StoredOperatorSession;
		return {
			payload,
			signatureValid: signature.length > 0,
		};
	} catch {
		return null;
	}
}

function parseCookieHeader(
	cookieHeader: string | null,
): Record<string, string> {
	if (!cookieHeader) return {};

	const pairs = cookieHeader.split(";");
	const cookies: Record<string, string> = {};
	for (const pair of pairs) {
		const separatorIndex = pair.indexOf("=");
		if (separatorIndex <= 0) continue;
		const key = pair.slice(0, separatorIndex).trim();
		const value = pair.slice(separatorIndex + 1).trim();
		if (!key) continue;
		cookies[key] = decodeURIComponent(value);
	}
	return cookies;
}

function shouldUseSecureCookie(request: Request): boolean {
	const forwardedProto = request.headers.get("x-forwarded-proto");
	if (forwardedProto?.trim()) {
		return forwardedProto.trim().toLowerCase() === "https";
	}

	try {
		const protocol = new URL(request.url).protocol;
		if (protocol === "https:") return true;
	} catch {}

	return isLocalDashboardRequest(request);
}

function validateStoredSession(payload: StoredOperatorSession): boolean {
	return (
		payload.v === OPERATOR_SESSION_VERSION &&
		typeof payload.sub === "string" &&
		payload.sub.length > 0 &&
		(payload.mode === "localhost" || payload.mode === "cloudflare_access") &&
		(payload.email === null || typeof payload.email === "string") &&
		Number.isInteger(payload.iat) &&
		Number.isInteger(payload.exp) &&
		payload.exp > payload.iat
	);
}

function createStoredSession(
	identity: OperatorIdentity,
	env: DashboardAuthEnv,
	now: Date,
): StoredOperatorSession {
	const issuedAt = Math.floor(now.getTime() / 1000);
	const expiresAt = issuedAt + Math.floor(env.operatorSessionHours * 60 * 60);

	return {
		v: OPERATOR_SESSION_VERSION,
		sub: identity.subject,
		mode: identity.mode,
		email: identity.email,
		iat: issuedAt,
		exp: expiresAt,
	};
}

export function isOperatorCodeValid(
	candidateCode: string,
	env: DashboardAuthEnv,
): boolean {
	if (!env.operatorCodeRequired) return false;
	return timingSafeStringEquals(candidateCode.trim(), env.operatorCode);
}

export function createOperatorSession(
	identity: OperatorIdentity,
	env: DashboardAuthEnv,
	now: Date = new Date(),
): {
	token: string;
	expiresAt: Date;
	session: OperatorSessionSummary;
} {
	const payload = createStoredSession(identity, env, now);
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
		"base64url",
	);
	const signature = signPayload(encodedPayload, env.operatorCookieSecret);
	const token = `${encodedPayload}.${signature}`;
	const issuedAt = new Date(payload.iat * 1000);
	const expiresAt = new Date(payload.exp * 1000);

	return {
		token,
		expiresAt,
		session: {
			state: "elevated",
			mode: identity.mode,
			email: identity.email,
			issuedAt: issuedAt.toISOString(),
			expiresAt: expiresAt.toISOString(),
		},
	};
}

export function readOperatorSessionToken(request: Request): string | null {
	const cookies = parseCookieHeader(request.headers.get("cookie"));
	return cookies[OPERATOR_SESSION_COOKIE_NAME] || null;
}

export function verifyOperatorSessionToken(
	token: string | null,
	identity: OperatorIdentity,
	env: DashboardAuthEnv,
	now: Date = new Date(),
): OperatorSessionVerificationResult {
	if (!token) {
		return {
			ok: false,
			state: "challenge_required",
			shouldClear: false,
		};
	}

	const dotIndex = token.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === token.length - 1) {
		return {
			ok: false,
			state: "challenge_required",
			shouldClear: true,
		};
	}

	const encodedPayload = token.slice(0, dotIndex);
	const signature = token.slice(dotIndex + 1);
	const expectedSignature = signPayload(
		encodedPayload,
		env.operatorCookieSecret,
	);

	if (!timingSafeStringEquals(signature, expectedSignature)) {
		return {
			ok: false,
			state: "challenge_required",
			shouldClear: true,
		};
	}

	const parsed = parseStoredSession(token);
	if (!parsed?.signatureValid || !validateStoredSession(parsed.payload)) {
		return {
			ok: false,
			state: "challenge_required",
			shouldClear: true,
		};
	}

	const { payload } = parsed;
	if (payload.sub !== identity.subject || payload.mode !== identity.mode) {
		return {
			ok: false,
			state: "challenge_required",
			shouldClear: true,
		};
	}

	if (payload.exp <= Math.floor(now.getTime() / 1000)) {
		return {
			ok: false,
			state: "session_expired",
			shouldClear: true,
		};
	}

	return {
		ok: true,
		session: {
			state: "elevated",
			mode: payload.mode,
			email: payload.email,
			issuedAt: new Date(payload.iat * 1000).toISOString(),
			expiresAt: new Date(payload.exp * 1000).toISOString(),
		},
	};
}

export function setOperatorSessionCookie(
	response: NextResponse,
	request: Request,
	token: string,
	expiresAt: Date,
): void {
	response.cookies.set({
		name: OPERATOR_SESSION_COOKIE_NAME,
		value: token,
		httpOnly: true,
		sameSite: "strict",
		secure: shouldUseSecureCookie(request),
		path: "/",
		expires: expiresAt,
	});
}

export function clearOperatorSessionCookie(
	response: NextResponse,
	request: Request,
): void {
	response.cookies.set({
		name: OPERATOR_SESSION_COOKIE_NAME,
		value: "",
		httpOnly: true,
		sameSite: "strict",
		secure: shouldUseSecureCookie(request),
		path: "/",
		expires: new Date(0),
	});
}
