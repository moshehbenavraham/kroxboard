import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFileSync = vi.fn();

vi.mock("node:child_process", () => ({
	execFileSync: mockExecFileSync,
	default: {
		execFileSync: mockExecFileSync,
	},
}));

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
	process.env.ENABLE_LIVE_SEND_DIAGNOSTICS = "false";
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

describe("POST /api/test-platforms", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		mockExecFileSync.mockReset().mockReturnValue('{"ok":true}');
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-test-platforms-"),
		);
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv(tempOpenclawHome);
		fs.writeFileSync(
			path.join(tempOpenclawHome, "openclaw.json"),
			JSON.stringify({
				agents: {
					list: [{ id: "main" }],
				},
				gateway: {
					port: 18789,
					auth: { token: "gateway-token" },
				},
				channels: {
					telegram: {
						enabled: true,
						token: "telegram-token",
					},
				},
				bindings: [],
			}),
		);
		fs.mkdirSync(path.join(tempOpenclawHome, "agents", "main", "sessions"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(
				tempOpenclawHome,
				"agents",
				"main",
				"sessions",
				"sessions.json",
			),
			JSON.stringify({
				"agent:main:telegram:direct:12345": {
					updatedAt: 1743379200000,
				},
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns 403 when outbound diagnostics are disabled", async () => {
		process.env.ENABLE_OUTBOUND_TESTS = "false";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
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

	it("rejects cross-origin platform diagnostics before running checks", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
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
		expect(mockExecFileSync).not.toHaveBeenCalled();
	});

	it("returns dry-run metadata when live-send diagnostics are disabled", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 200 })),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.diagnostic).toMatchObject({
			mode: "dry_run",
			liveSendEnabled: false,
		});
		expect(body.results[0].detail).toContain("dry-run");
		expect(mockExecFileSync).not.toHaveBeenCalled();
	});

	it("returns live-send metadata when live sends are enabled", async () => {
		process.env.ENABLE_LIVE_SEND_DIAGNOSTICS = "true";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.diagnostic).toMatchObject({
			mode: "live_send",
			liveSendEnabled: true,
		});
		expect(body.results[0].detail).toContain("DM sent");
		expect(mockExecFileSync).toHaveBeenCalled();
	});

	it("skips invalid configured agent ids before session lookup", async () => {
		fs.writeFileSync(
			path.join(tempOpenclawHome, "openclaw.json"),
			JSON.stringify({
				agents: {
					list: [{ id: "main" }, { id: "../evil" }],
				},
				gateway: {
					port: 18789,
					auth: { token: "gateway-token" },
				},
				channels: {
					telegram: {
						enabled: true,
						token: "telegram-token",
					},
				},
				bindings: [],
			}),
		);
		const readSpy = vi.spyOn(fs, "readFileSync");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 200 })),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(
			body.results.some(
				(entry: { agentId: string }) => entry.agentId === "../evil",
			),
		).toBe(false);
		expect(
			readSpy.mock.calls.some(([filePath]) =>
				String(filePath).includes("agents/../evil"),
			),
		).toBe(false);
	});

	it("returns 429 after repeated platform diagnostic runs", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 200 })),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");

		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await route.POST(
				new Request("http://localhost:3000/api/test-platforms", {
					method: "POST",
					headers: withLocalOrigin({
						"cf-connecting-ip": "198.51.100.55",
						cookie,
					}),
				}),
			);
			expect(response.status).toBe(200);
		}

		const denied = await route.POST(
			new Request("http://localhost:3000/api/test-platforms", {
				method: "POST",
				headers: withLocalOrigin({
					"cf-connecting-ip": "198.51.100.55",
					cookie,
				}),
			}),
		);
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "platform_diagnostics",
			},
		});
	});
});
