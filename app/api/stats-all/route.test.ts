import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ANALYTICS_SESSION_FILE_BYTES } from "@/lib/openclaw-analytics";

const ORIGINAL_ENV = { ...process.env };

function createStatsRequest(ip: string): Request {
	return new Request("http://localhost:3000/api/stats-all", {
		headers: {
			"cf-connecting-ip": ip,
		},
	});
}

describe("GET /api/stats-all", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-stats-all-"),
		);
		process.env.OPENCLAW_HOME = tempOpenclawHome;
		fs.mkdirSync(path.join(tempOpenclawHome, "agents", "main", "sessions"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempOpenclawHome, "agents", "main", "sessions", "main.jsonl"),
			[
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-31T00:00:00.000Z",
					message: { role: "user" },
				}),
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-31T00:00:02.000Z",
					message: {
						role: "assistant",
						stopReason: "stop",
						usage: {
							input: 10,
							output: 5,
							totalTokens: 15,
						},
					},
				}),
			].join("\n"),
		);
	});

	afterEach(() => {
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns cached stats responses and rate limits repeated reads", async () => {
		const readSpy = vi.spyOn(fs.promises, "readFile");
		const route = await import("./route");

		const first = await route.GET(createStatsRequest("198.51.100.60"));
		expect(first.status).toBe(200);
		const firstBody = await first.json();
		expect(firstBody.daily).toHaveLength(1);
		expect(readSpy).toHaveBeenCalledTimes(1);

		const second = await route.GET(createStatsRequest("198.51.100.60"));
		expect(second.status).toBe(200);
		expect(readSpy).toHaveBeenCalledTimes(1);

		for (let attempt = 0; attempt < 10; attempt++) {
			const response = await route.GET(createStatsRequest("198.51.100.60"));
			expect(response.status).toBe(200);
		}

		const denied = await route.GET(createStatsRequest("198.51.100.60"));
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "stats_all",
			},
		});
	});

	it("returns a sanitized failure when a session file exceeds the read budget", async () => {
		fs.writeFileSync(
			path.join(
				tempOpenclawHome,
				"agents",
				"main",
				"sessions",
				"oversize.jsonl",
			),
			"x".repeat(MAX_ANALYTICS_SESSION_FILE_BYTES + 1),
		);

		const route = await import("./route");
		const response = await route.GET(createStatsRequest("198.51.100.62"));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Stats aggregation failed",
		});
	});
});
