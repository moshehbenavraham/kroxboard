import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("GET /api/stats/[agentId]", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-stats-route-"),
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

	it("rejects invalid agent ids before reading the sessions directory", async () => {
		const readdirSpy = vi.spyOn(fs, "readdirSync");
		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost/api/stats/../evil"),
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
		expect(readdirSpy).not.toHaveBeenCalled();
	});

	it("returns aggregated stats for a valid agent", async () => {
		const sessionsDir = path.join(
			tempOpenclawHome,
			"agents",
			"main",
			"sessions",
		);
		fs.mkdirSync(sessionsDir, { recursive: true });
		fs.writeFileSync(
			path.join(sessionsDir, "session-1.jsonl"),
			[
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-30T10:00:00.000Z",
					message: { role: "user" },
				}),
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-30T10:00:05.000Z",
					message: {
						role: "assistant",
						stopReason: "stop",
						usage: { input: 3, output: 5, totalTokens: 8 },
					},
				}),
			].join("\n"),
		);

		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost/api/stats/main"),
			{
				params: Promise.resolve({ agentId: "main" }),
			},
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.agentId).toBe("main");
		expect(body.daily).toHaveLength(1);
		expect(body.daily[0]).toMatchObject({
			date: "2026-03-30",
			inputTokens: 3,
			outputTokens: 5,
			totalTokens: 8,
			messageCount: 1,
			avgResponseMs: 5000,
		});
		expect(body.weekly).toHaveLength(1);
		expect(body.monthly).toHaveLength(1);
	});
});
