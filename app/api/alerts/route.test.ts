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
	process.env.ENABLE_ALERT_WRITES = "true";
}

async function makeAuthCookie(env: any) {
	const { parseDashboardAuthEnv } = await import(
		"@/lib/security/dashboard-env"
	);
	const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } = await import(
		"@/lib/security/operator-session"
	);
	const parsedEnv = parseDashboardAuthEnv(env);
	const { token } = createOperatorSession(
		{ mode: "localhost", subject: "localhost", email: null, isLocal: true },
		parsedEnv,
		new Date("2026-03-31T00:00:00.000Z"),
	);
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("/api/alerts", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-alerts-route-"),
		);
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv(tempOpenclawHome);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	describe("GET", () => {
		it("returns default alert config when no file exists", async () => {
			const route = await import("./route");
			const response = await route.GET();
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.enabled).toBe(false);
			expect(body.receiveAgent).toBe("main");
			expect(Array.isArray(body.rules)).toBe(true);
		});

		it("returns persisted config from alerts.json", async () => {
			const configPath = path.join(tempOpenclawHome, "alerts.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					enabled: true,
					receiveAgent: "helper",
					checkInterval: 5,
					rules: [],
				}),
			);

			const route = await import("./route");
			const response = await route.GET();
			const body = await response.json();
			expect(body.enabled).toBe(true);
			expect(body.receiveAgent).toBe("helper");
		});
	});

	describe("POST", () => {
		it("rejects remote requests without identity", async () => {
			const route = await import("./route");
			const response = await route.POST(
				new Request("https://board.example.com/api/alerts", {
					method: "POST",
					headers: withRemoteOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ enabled: true }),
				}),
			);
			expect(response.status).toBe(403);
		});

		it("updates config with a valid session cookie", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({
						enabled: true,
						receiveAgent: "helper",
						checkInterval: 5,
					}),
				}),
			);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.enabled).toBe(true);
			expect(body.receiveAgent).toBe("helper");
		});

		it("rejects cross-origin alert writes before updating config", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withCrossOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({ enabled: true }),
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

		it("returns 403 when alert writes are disabled", async () => {
			process.env.ENABLE_ALERT_WRITES = "false";
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({ enabled: true }),
				}),
			);
			expect(response.status).toBe(403);
			await expect(response.json()).resolves.toMatchObject({
				feature: {
					flag: "ENABLE_ALERT_WRITES",
				},
			});
		});

		it("rejects invalid alert write payloads", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({ rules: "invalid" }),
				}),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				invalid: {
					field: "rules",
					reason: "invalid_value",
					type: "invalid_request",
				},
			});
		});

		it("rejects malformed alert JSON before config persistence", async () => {
			const cookie = await makeAuthCookie(process.env);
			const configPath = path.join(tempOpenclawHome, "alerts.json");
			const readSpy = vi.spyOn(fs, "readFileSync");
			const writeSpy = vi.spyOn(fs, "writeFileSync");
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: "{",
				}),
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				invalid: {
					field: "body",
					reason: "invalid_json",
					type: "invalid_request",
				},
			});
			expect(fs.existsSync(configPath)).toBe(false);
			expect(readSpy).not.toHaveBeenCalled();
			expect(writeSpy).not.toHaveBeenCalled();
		});

		it("rejects oversized alert JSON before config persistence", async () => {
			const cookie = await makeAuthCookie(process.env);
			const configPath = path.join(tempOpenclawHome, "alerts.json");
			const readSpy = vi.spyOn(fs, "readFileSync");
			const writeSpy = vi.spyOn(fs, "writeFileSync");
			const oversizedBody = JSON.stringify({
				rules: [{ id: "model_unavailable", enabled: true }],
				padding: "x".repeat(5000),
			});
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						"Content-Length": String(Buffer.byteLength(oversizedBody)),
						cookie,
					}),
					body: oversizedBody,
				}),
			);

			expect(response.status).toBe(413);
			await expect(response.json()).resolves.toMatchObject({
				invalid: {
					field: "body",
					reason: "payload_too_large",
					type: "invalid_request",
				},
			});
			expect(fs.existsSync(configPath)).toBe(false);
			expect(readSpy).not.toHaveBeenCalled();
			expect(writeSpy).not.toHaveBeenCalled();
		});

		it("merges rule updates by id", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.POST(
				new Request("http://localhost:3000/api/alerts", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({
						rules: [
							{ id: "model_unavailable", enabled: true },
							{
								id: "bot_no_response",
								enabled: true,
								threshold: 600,
								targetAgents: ["main"],
							},
						],
					}),
				}),
			);
			expect(response.status).toBe(200);
			const body = await response.json();
			const modelRule = body.rules.find(
				(r: any) => r.id === "model_unavailable",
			);
			expect(modelRule.enabled).toBe(true);
			const botRule = body.rules.find((r: any) => r.id === "bot_no_response");
			expect(botRule.threshold).toBe(600);
			expect(botRule.targetAgents).toEqual(["main"]);
		});
	});

	describe("PUT", () => {
		it("rejects a remote write without a trusted operator identity", async () => {
			const route = await import("./route");
			const response = await route.PUT(
				new Request("https://board.example.com/api/alerts", {
					method: "PUT",
					headers: withRemoteOrigin({
						"Content-Type": "application/json",
					}),
					body: JSON.stringify({ enabled: true }),
				}),
			);
			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.auth.state).toBe("identity_denied");
		});

		it("allows a localhost operator with a valid signed session cookie", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.PUT(
				new Request("http://localhost:3000/api/alerts", {
					method: "PUT",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({ enabled: true }),
				}),
			);
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({ enabled: true });

			const configPath = path.join(tempOpenclawHome, "alerts.json");
			expect(fs.existsSync(configPath)).toBe(true);
			expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toMatchObject({
				enabled: true,
			});
		});

		it("returns 403 on PUT when alert writes are disabled", async () => {
			process.env.ENABLE_ALERT_WRITES = "false";
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.PUT(
				new Request("http://localhost:3000/api/alerts", {
					method: "PUT",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({ enabled: true }),
				}),
			);
			expect(response.status).toBe(403);
			await expect(response.json()).resolves.toMatchObject({
				feature: {
					flag: "ENABLE_ALERT_WRITES",
				},
			});
		});

		it("persists merged rule updates", async () => {
			const cookie = await makeAuthCookie(process.env);
			const route = await import("./route");
			const response = await route.PUT(
				new Request("http://localhost:3000/api/alerts", {
					method: "PUT",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						cookie,
					}),
					body: JSON.stringify({
						rules: [
							{ id: "message_failure_rate", enabled: true, threshold: 70 },
						],
					}),
				}),
			);
			expect(response.status).toBe(200);
			const body = await response.json();
			const rule = body.rules.find((r: any) => r.id === "message_failure_rate");
			expect(rule.enabled).toBe(true);
			expect(rule.threshold).toBe(70);
		});
	});
});
