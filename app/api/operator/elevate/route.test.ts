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

describe("POST /api/operator/elevate", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("issues a signed cookie for a trusted localhost operator", async () => {
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/operator/elevate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: process.env.DASHBOARD_OPERATOR_CODE,
				}),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.session.state).toBe("elevated");
		expect(response.headers.get("set-cookie")).toContain(
			"dashboard_operator_session=",
		);
	});

	it("rejects an invalid operator code", async () => {
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/operator/elevate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: "wrong code" }),
			}),
		);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({
			ok: false,
			error: "Invalid operator code",
		});
	});
});
