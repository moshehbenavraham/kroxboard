import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

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
}

describe("PUT /api/alerts", () => {
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
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("rejects a remote write without a trusted operator identity", async () => {
		const route = await import("./route");
		const response = await route.PUT(
			new Request("https://board.example.com/api/alerts", {
				method: "PUT",
				headers: {
					host: "board.example.com",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ enabled: true }),
			}),
		);

		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.auth.state).toBe("identity_denied");
	});

	it("allows a localhost operator with a valid signed session cookie", async () => {
		const { parseDashboardAuthEnv } = await import(
			"@/lib/security/dashboard-env"
		);
		const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } =
			await import("@/lib/security/operator-session");
		const route = await import("./route");

		const env = parseDashboardAuthEnv(process.env);
		const { token } = createOperatorSession(
			{
				mode: "localhost",
				subject: "localhost",
				email: null,
				isLocal: true,
			},
			env,
			new Date("2026-03-31T00:00:00.000Z"),
		);

		const response = await route.PUT(
			new Request("http://localhost:3000/api/alerts", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					cookie: `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
				},
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
});
