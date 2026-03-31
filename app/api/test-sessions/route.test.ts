import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

function withCrossOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: "https://evil.example.com",
		...headers,
	};
}

function applyBaseEnv(openclawHome: string): void {
	process.env.OPENCLAW_HOME = openclawHome;
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
	process.env.ENABLE_OUTBOUND_TESTS = "true";
}

async function makeAuthCookie(): Promise<string> {
	const { parseDashboardAuthEnv } = await import(
		"@/lib/security/dashboard-env"
	);
	const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } = await import(
		"@/lib/security/operator-session"
	);
	const env = parseDashboardAuthEnv(process.env);
	const { token } = createOperatorSession(
		{ mode: "localhost", subject: "localhost", email: null, isLocal: true },
		env,
		new Date(),
	);
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("POST /api/test-sessions", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-test-sessions-"),
		);
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv(tempOpenclawHome);
		fs.writeFileSync(
			path.join(tempOpenclawHome, "openclaw.json"),
			JSON.stringify({
				gateway: {
					port: 18789,
					auth: { token: "gateway-token" },
				},
				agents: {
					list: [{ id: "main" }],
				},
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns 403 when outbound tests are disabled", async () => {
		process.env.ENABLE_OUTBOUND_TESTS = "false";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-sessions", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			feature: {
				flag: "ENABLE_OUTBOUND_TESTS",
			},
		});
	});

	it("does not export GET so the framework returns 405", async () => {
		const route = await import("./route");
		expect((route as { GET?: unknown }).GET).toBeUndefined();
	});

	it("rejects cross-origin batch diagnostics before calling the gateway", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-sessions", {
				method: "POST",
				headers: withCrossOrigin({ cookie }),
			}),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			mutation: {
				state: "origin_denied",
				type: "sensitive_mutation",
			},
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns batch session diagnostic results", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							choices: [{ message: { content: "OK from gateway" } }],
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-sessions", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.results).toHaveLength(1);
		expect(body.results[0]).toMatchObject({
			agentId: "main",
			ok: true,
		});
	});

	it("returns 429 after repeated batch session diagnostics", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							choices: [{ message: { content: "OK from gateway" } }],
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");

		for (let attempt = 0; attempt < 4; attempt++) {
			const response = await route.POST(
				new Request("http://localhost:3000/api/test-sessions", {
					method: "POST",
					headers: withLocalOrigin({
						"cf-connecting-ip": "198.51.100.53",
						cookie,
					}),
				}),
			);
			expect(response.status).toBe(200);
		}

		const denied = await route.POST(
			new Request("http://localhost:3000/api/test-sessions", {
				method: "POST",
				headers: withLocalOrigin({
					"cf-connecting-ip": "198.51.100.53",
					cookie,
				}),
			}),
		);
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "session_diagnostic_batch",
			},
		});
	});
});
