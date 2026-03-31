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
		new Date("2026-03-31T00:00:00.000Z"),
	);
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("POST /api/test-session", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-test-session-"),
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
			new Request("http://localhost:3000/api/test-session", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					sessionKey: "agent:main:main",
				}),
			}),
		);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			feature: {
				flag: "ENABLE_OUTBOUND_TESTS",
			},
		});
	});

	it("returns a successful session diagnostic result", async () => {
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
			new Request("http://localhost:3000/api/test-session", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					sessionKey: "agent:main:main",
				}),
			}),
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "ok",
			sessionKey: "agent:main:main",
		});
	});

	it("rejects cross-origin diagnostics before calling the gateway", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-session", {
				method: "POST",
				headers: withCrossOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					sessionKey: "agent:main:main",
				}),
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

	it("rejects invalid identifiers before calling the gateway", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-session", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "../evil",
					sessionKey: "agent:../evil:main",
				}),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			boundary: {
				field: "agentId",
				reason: "invalid_format",
			},
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns 429 after repeated single-session diagnostics", async () => {
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

		for (let attempt = 0; attempt < 6; attempt++) {
			const response = await route.POST(
				new Request("http://localhost:3000/api/test-session", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						"cf-connecting-ip": "198.51.100.52",
						cookie,
					}),
					body: JSON.stringify({
						agentId: "main",
						sessionKey: "agent:main:main",
					}),
				}),
			);
			expect(response.status).toBe(200);
		}

		const denied = await route.POST(
			new Request("http://localhost:3000/api/test-session", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					"cf-connecting-ip": "198.51.100.52",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					sessionKey: "agent:main:main",
				}),
			}),
		);
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "session_diagnostic",
			},
		});
	});
});
