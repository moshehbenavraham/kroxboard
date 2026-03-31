import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createOperatorAuthDeniedPayload,
	createOperatorConfigErrorResponse,
} from "@/lib/security/sensitive-route";

describe("createOperatorAuthDeniedPayload", () => {
	it("creates a challenge_required payload with canChallenge=true when code required", () => {
		const payload = createOperatorAuthDeniedPayload("challenge_required", true);
		expect(payload).toEqual({
			ok: false,
			error: "Operator elevation required",
			auth: {
				ok: false,
				type: "operator_auth",
				state: "challenge_required",
				message: "Operator elevation required",
				canChallenge: true,
			},
		});
	});

	it("creates a challenge_required payload with canChallenge=false when code not required", () => {
		const payload = createOperatorAuthDeniedPayload(
			"challenge_required",
			false,
		);
		expect(payload.auth.canChallenge).toBe(false);
		expect(payload.auth.message).toBe("Operator elevation is disabled");
	});

	it("creates an identity_denied payload", () => {
		const payload = createOperatorAuthDeniedPayload("identity_denied", true);
		expect(payload.auth.state).toBe("identity_denied");
		expect(payload.auth.message).toBe("Operator access denied");
		expect(payload.auth.canChallenge).toBe(false);
	});

	it("creates a session_expired payload", () => {
		const payload = createOperatorAuthDeniedPayload("session_expired", true);
		expect(payload.auth.state).toBe("session_expired");
		expect(payload.auth.message).toBe("Operator session expired");
		expect(payload.auth.canChallenge).toBe(true);
	});

	it("uses a custom message when provided", () => {
		const payload = createOperatorAuthDeniedPayload(
			"challenge_required",
			true,
			"Custom message",
		);
		expect(payload.error).toBe("Custom message");
		expect(payload.auth.message).toBe("Custom message");
	});
});

describe("requireSensitiveRouteAccess", () => {
	const ORIGINAL_ENV = { ...process.env };

	function applyBaseEnv(): void {
		process.env.DASHBOARD_HOST = "board.example.com";
		process.env.DASHBOARD_ALLOWED_EMAILS = "operator@example.com";
		process.env.DASHBOARD_CF_ACCESS_ENABLED = "true";
		process.env.DASHBOARD_CF_ACCESS_OTP_PRIMARY = "true";
		process.env.DASHBOARD_CF_ACCESS_SESSION_HOURS = "24";
		process.env.DASHBOARD_CF_ACCESS_AUD = "cf-aud";
		process.env.DASHBOARD_CF_ACCESS_EMAIL_HEADER =
			"CF-Access-Authenticated-User-Email";
		process.env.DASHBOARD_CF_ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
		process.env.DASHBOARD_OPERATOR_CODE_REQUIRED = "true";
		process.env.DASHBOARD_OPERATOR_CODE = "correct horse battery staple";
		process.env.DASHBOARD_OPERATOR_COOKIE_SECRET =
			"0123456789abcdef0123456789abcdef";
		process.env.DASHBOARD_OPERATOR_SESSION_HOURS = "12";
	}

	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("denies access for a remote request without Cloudflare identity", async () => {
		const { requireSensitiveRouteAccess } = await import(
			"@/lib/security/sensitive-route"
		);
		const result = requireSensitiveRouteAccess(
			new Request("https://board.example.com/api/protected", {
				headers: { host: "board.example.com" },
			}),
		);
		expect(result.ok).toBe(false);
	});

	it("grants access for localhost with a valid session cookie", async () => {
		const { requireSensitiveRouteAccess } = await import(
			"@/lib/security/sensitive-route"
		);
		const { parseDashboardAuthEnv } = await import(
			"@/lib/security/dashboard-env"
		);
		const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } =
			await import("@/lib/security/operator-session");

		const env = parseDashboardAuthEnv(process.env);
		const { token } = createOperatorSession(
			{ mode: "localhost", subject: "localhost", email: null, isLocal: true },
			env,
			new Date(),
		);

		const result = requireSensitiveRouteAccess(
			new Request("http://localhost:3000/api/protected", {
				headers: {
					cookie: `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
				},
			}),
		);
		expect(result.ok).toBe(true);
	});

	it("returns config error when env is not set up", async () => {
		delete process.env.DASHBOARD_CF_ACCESS_ENABLED;
		const { requireSensitiveRouteAccess } = await import(
			"@/lib/security/sensitive-route"
		);
		const result = requireSensitiveRouteAccess(
			new Request("http://localhost:3000/api/protected"),
		);
		expect(result.ok).toBe(false);
	});

	it("clears invalid session cookies on denied access", async () => {
		const { requireSensitiveRouteAccess } = await import(
			"@/lib/security/sensitive-route"
		);
		const result = requireSensitiveRouteAccess(
			new Request("http://localhost:3000/api/protected", {
				headers: {
					cookie: "dashboard_operator_session=invalid-token-data",
				},
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(401);
		}
	});
});

describe("createOperatorConfigErrorResponse", () => {
	it("returns a 503 JSON response by default", async () => {
		const response = createOperatorConfigErrorResponse();
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body).toEqual({
			ok: false,
			error: "Operator auth is not configured",
		});
	});

	it("accepts a custom message and status", async () => {
		const response = createOperatorConfigErrorResponse("Custom error", 500);
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("Custom error");
	});
});
