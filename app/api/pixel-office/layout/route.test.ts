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
	process.env.ENABLE_PIXEL_OFFICE_WRITES = "true";
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

describe("/api/pixel-office/layout", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-pixel-layout-route-"),
		);
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv(tempOpenclawHome);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns a null layout when no layout file exists", async () => {
		const route = await import("./route");
		const response = await route.GET();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ layout: null });
	});

	it("returns 403 when layout writes are disabled", async () => {
		process.env.ENABLE_PIXEL_OFFICE_WRITES = "false";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					layout: { version: 1, tiles: [] },
				}),
			}),
		);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			feature: {
				flag: "ENABLE_PIXEL_OFFICE_WRITES",
			},
		});
	});

	it("persists a valid layout when writes are enabled", async () => {
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const layout = {
			version: 1,
			cols: 2,
			rows: 2,
			tiles: [1, 1, 1, 1],
			furniture: [
				{
					uid: "desk-1",
					type: "desk",
					col: 0,
					row: 0,
				},
			],
		};
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ layout }),
			}),
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });

		const layoutPath = path.join(
			tempOpenclawHome,
			"pixel-office",
			"layout.json",
		);
		expect(JSON.parse(fs.readFileSync(layoutPath, "utf8"))).toEqual(layout);
	});

	it("rejects invalid layout payloads", async () => {
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ layout: { version: 2, tiles: null } }),
			}),
		);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			error: "Invalid layout",
		});
	});

	it("rejects malformed layout JSON before writing files", async () => {
		const cookie = await makeAuthCookie();
		const writeSpy = vi.spyOn(fs, "writeFileSync");
		const renameSpy = vi.spyOn(fs, "renameSync");
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
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
		expect(
			fs.existsSync(path.join(tempOpenclawHome, "pixel-office", "layout.json")),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(tempOpenclawHome, "pixel-office", "layout.json.tmp"),
			),
		).toBe(false);
		expect(writeSpy).not.toHaveBeenCalled();
		expect(renameSpy).not.toHaveBeenCalled();
	});

	it("rejects oversized layout JSON before writing files", async () => {
		const cookie = await makeAuthCookie();
		const writeSpy = vi.spyOn(fs, "writeFileSync");
		const renameSpy = vi.spyOn(fs, "renameSync");
		const oversizedBody = JSON.stringify({
			layout: {
				version: 1,
				cols: 64,
				rows: 64,
				tiles: new Array(4096).fill(1),
				furniture: [],
				tileColors: new Array(4096).fill({
					h: 0,
					s: 0,
					b: 0,
					c: 0,
					colorize: false,
				}),
			},
			padding: "x".repeat(300000),
		});
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
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
		expect(
			fs.existsSync(path.join(tempOpenclawHome, "pixel-office", "layout.json")),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(tempOpenclawHome, "pixel-office", "layout.json.tmp"),
			),
		).toBe(false);
		expect(writeSpy).not.toHaveBeenCalled();
		expect(renameSpy).not.toHaveBeenCalled();
	});

	it("rejects cross-origin layout writes before saving", async () => {
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/pixel-office/layout", {
				method: "POST",
				headers: withCrossOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					layout: { version: 1, cols: 1, rows: 1, tiles: [1], furniture: [] },
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
	});
});
