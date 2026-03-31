import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("GET /api/operator/session", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns challenge_required for localhost without a session cookie", async () => {
		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost:3000/api/operator/session"),
		);
		const body = await response.json();
		expect(body.ok).toBe(false);
		expect(body.auth.state).toBe("challenge_required");
	});

	it("returns elevated session for localhost with a valid cookie", async () => {
		const { parseDashboardAuthEnv } = await import(
			"@/lib/security/dashboard-env"
		);
		const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } =
			await import("@/lib/security/operator-session");
		const route = await import("./route");

		const env = parseDashboardAuthEnv(process.env);
		const { token } = createOperatorSession(
			{ mode: "localhost", subject: "localhost", email: null, isLocal: true },
			env,
			new Date(),
		);

		const response = await route.GET(
			new Request("http://localhost:3000/api/operator/session", {
				headers: {
					cookie: `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
				},
			}),
		);
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.session.state).toBe("elevated");
	});

	it("returns identity_denied for remote requests without CF identity", async () => {
		const route = await import("./route");
		const response = await route.GET(
			new Request("https://board.example.com/api/operator/session", {
				headers: { host: "board.example.com" },
			}),
		);
		const body = await response.json();
		expect(body.ok).toBe(false);
		expect(body.auth.state).toBe("identity_denied");
	});

	it("returns config error when env is incomplete", async () => {
		delete process.env.DASHBOARD_CF_ACCESS_ENABLED;
		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost:3000/api/operator/session"),
		);
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.ok).toBe(false);
	});
});
