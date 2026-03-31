import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("GET /api/sessions/[agentId]", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-sessions-route-"),
		);
		process.env = {
			...ORIGINAL_ENV,
			OPENCLAW_HOME: tempOpenclawHome,
		};
	});

	afterEach(() => {
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
		vi.restoreAllMocks();
	});

	it("rejects invalid agent ids before reading the filesystem", async () => {
		const readSpy = vi.spyOn(fs, "readFileSync");
		const route = await import("./route");
		readSpy.mockClear();
		const response = await route.GET(
			new Request("http://localhost/api/sessions/../evil"),
			{
				params: Promise.resolve({ agentId: "../evil" }),
			},
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			boundary: {
				field: "agentId",
				reason: "invalid_format",
			},
		});
		expect(
			readSpy.mock.calls.some(([filePath]) =>
				String(filePath).includes(tempOpenclawHome),
			),
		).toBe(false);
	});

	it("returns sorted sessions for a valid agent", async () => {
		const sessionsDir = path.join(
			tempOpenclawHome,
			"agents",
			"main",
			"sessions",
		);
		fs.mkdirSync(sessionsDir, { recursive: true });
		fs.writeFileSync(
			path.join(sessionsDir, "sessions.json"),
			JSON.stringify({
				"agent:main:main": {
					sessionId: "session-main",
					updatedAt: 20,
					totalTokens: 12,
				},
				"agent:main:discord:direct:12345": {
					sessionId: "session-dm",
					updatedAt: 40,
					totalTokens: 18,
				},
			}),
		);

		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost/api/sessions/main"),
			{
				params: Promise.resolve({ agentId: "main" }),
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			agentId: "main",
			sessions: [
				{
					key: "agent:main:discord:direct:12345",
					type: "discord-dm",
					target: "12345",
				},
				{
					key: "agent:main:main",
					type: "main",
				},
			],
		});
	});
});
