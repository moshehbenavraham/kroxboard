import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockProbeModel = vi.fn();

vi.mock("@/lib/model-probe", () => ({
	probeModel: mockProbeModel,
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

describe("POST /api/alerts/check", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		mockProbeModel.mockReset().mockResolvedValue({
			ok: false,
			elapsed: 12,
			model: "openai/gpt-4.1",
			mode: "api_key",
			status: "error",
			error: "provider down",
			precision: "model",
			source: "direct_model_probe",
		});
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-alert-check-"),
		);
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv(tempOpenclawHome);
		fs.writeFileSync(
			path.join(tempOpenclawHome, "openclaw.json"),
			JSON.stringify({
				cron: {
					store: "cron-store/jobs.json",
				},
				models: {
					providers: {
						openai: {
							models: [{ id: "gpt-4.1" }],
						},
					},
				},
				channels: {
					feishu: {
						enabled: true,
						appId: "feishu-app-id",
						appSecret: "feishu-app-secret",
					},
				},
				bindings: [],
			}),
		);
		fs.mkdirSync(path.join(tempOpenclawHome, "cron-store"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempOpenclawHome, "cron-store", "jobs.json"),
			JSON.stringify({ jobs: [] }),
		);
		fs.writeFileSync(
			path.join(tempOpenclawHome, "alerts.json"),
			JSON.stringify({
				enabled: true,
				receiveAgent: "main",
				checkInterval: 10,
				rules: [
					{ id: "model_unavailable", name: "Model Unavailable", enabled: true },
				],
				lastAlerts: {},
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
				"agent:main:feishu:direct:ou_abcd1234": {
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

	it("returns 403 when outbound alert diagnostics are disabled", async () => {
		process.env.ENABLE_OUTBOUND_TESTS = "false";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
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

	it("rejects cross-origin alert diagnostics before probing models", async () => {
		const cookie = await makeAuthCookie();
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
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
		expect(mockProbeModel).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns dry-run notification metadata when live sends are disabled", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							code: 0,
							tenant_access_token: "tenant-token",
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
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
		expect(body.results[0]).toContain("openai/gpt-4.1");
		expect(body.notifications[0]).toMatchObject({
			status: "dry_run",
			mode: "dry_run",
		});
	});

	it("returns live-send notification metadata when live sends are enabled", async () => {
		process.env.ENABLE_LIVE_SEND_DIAGNOSTICS = "true";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = input.toString();
				if (url.includes("tenant_access_token")) {
					return new Response(
						JSON.stringify({
							code: 0,
							tenant_access_token: "tenant-token",
						}),
						{ status: 200 },
					);
				}
				return new Response(JSON.stringify({ code: 0 }), { status: 200 });
			}),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
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
		expect(body.notifications[0]).toMatchObject({
			status: "sent",
			mode: "live_send",
		});
	});

	it("fails closed when the alert recipient session path is missing", async () => {
		fs.rmSync(
			path.join(
				tempOpenclawHome,
				"agents",
				"main",
				"sessions",
				"sessions.json",
			),
			{ force: true },
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							code: 0,
							tenant_access_token: "tenant-token",
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.notifications[0]).toMatchObject({
			status: "failed",
			error: "No DM user",
		});
	});

	it("derives cron alerts from the configured cron store instead of randomness", async () => {
		fs.writeFileSync(
			path.join(tempOpenclawHome, "alerts.json"),
			JSON.stringify({
				enabled: true,
				receiveAgent: "main",
				checkInterval: 10,
				rules: [
					{
						id: "cron_continuous_failure",
						name: "Cron Continuous Failure",
						enabled: true,
						threshold: 3,
					},
				],
				lastAlerts: {},
			}),
		);
		fs.writeFileSync(
			path.join(tempOpenclawHome, "cron-store", "jobs.json"),
			JSON.stringify({
				jobs: [
					{
						id: "backup",
						name: "Nightly backup",
						state: {
							consecutiveErrors: 4,
							lastStatus: "failed",
							lastError: "disk full",
						},
					},
				],
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							code: 0,
							tenant_access_token: "tenant-token",
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
				method: "POST",
				headers: withLocalOrigin({ cookie }),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.results[0]).toContain("Nightly backup");
		expect(body.results[0]).toContain("4 times in a row");
		expect(body.notifications[0]).toMatchObject({
			status: "dry_run",
			mode: "dry_run",
		});
	});

	it("returns 429 after repeated alert-check requests", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							code: 0,
							tenant_access_token: "tenant-token",
						}),
						{ status: 200 },
					),
			),
		);
		const cookie = await makeAuthCookie();
		const route = await import("./route");

		for (let attempt = 0; attempt < 4; attempt++) {
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts/check", {
					method: "POST",
					headers: withLocalOrigin({
						"cf-connecting-ip": "198.51.100.56",
						cookie,
					}),
				}),
			);
			expect(response.status).toBe(200);
		}

		const denied = await route.POST(
			new Request("http://localhost:3000/api/alerts/check", {
				method: "POST",
				headers: withLocalOrigin({
					"cf-connecting-ip": "198.51.100.56",
					cookie,
				}),
			}),
		);

		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "alert_diagnostics",
			},
		});
	});
});
