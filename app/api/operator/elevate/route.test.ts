import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function withLocalOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: "http://localhost:3000",
		...headers,
	};
}

function withRemoteOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		host: "board.example.com",
		origin: "https://board.example.com",
		...headers,
	};
}

function withCrossOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: "https://evil.example.com",
		...headers,
	};
}

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

describe("/api/operator/elevate", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	describe("POST", () => {
		it("issues a signed cookie for a trusted localhost operator", async () => {
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
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
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ code: "wrong code" }),
				}),
			);

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({
				ok: false,
				error: "Invalid operator code",
			});
		});

		it("rejects an empty code", async () => {
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ code: "   " }),
				}),
			);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBe("Operator code is required");
		});

		it("rejects missing body", async () => {
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
					body: "not json",
				}),
			);

			expect(response.status).toBe(400);
		});

		it("returns 403 when operator code is disabled", async () => {
			process.env.DASHBOARD_OPERATOR_CODE_REQUIRED = "false";
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ code: "something" }),
				}),
			);
			expect(response.status).toBe(403);
		});

		it("returns 403 for remote requests without CF identity", async () => {
			const route = await import("./route");
			const response = await route.POST(
				new Request("https://board.example.com/api/operator/elevate", {
					method: "POST",
					headers: withRemoteOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ code: "something" }),
				}),
			);
			expect(response.status).toBe(403);
		});

		it("returns config error when env is incomplete", async () => {
			delete process.env.DASHBOARD_CF_ACCESS_ENABLED;
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ code: "test" }),
				}),
			);
			expect(response.status).toBe(503);
		});
	});

	describe("DELETE", () => {
		it("clears the session cookie", async () => {
			const route = await import("./route");
			const response = await route.DELETE(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "DELETE",
					headers: withLocalOrigin(),
				}),
			);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.ok).toBe(true);
			expect(body.cleared).toBe(true);
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toContain("dashboard_operator_session=");
		});

		it("rejects cross-origin session clear requests", async () => {
			const route = await import("./route");
			const response = await route.DELETE(
				new Request("http://localhost:3000/api/operator/elevate", {
					method: "DELETE",
					headers: withCrossOrigin(),
				}),
			);

			expect(response.status).toBe(403);
			await expect(response.json()).resolves.toMatchObject({
				mutation: {
					state: "origin_denied",
					type: "sensitive_mutation",
				},
			});
		});
	});
});
