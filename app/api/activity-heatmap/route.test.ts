import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ANALYTICS_SESSION_FILE_BYTES } from "@/lib/openclaw-analytics";

const ORIGINAL_ENV = { ...process.env };

function createHeatmapRequest(ip: string): Request {
	return new Request("http://localhost:3000/api/activity-heatmap", {
		headers: {
			"cf-connecting-ip": ip,
		},
	});
}

describe("GET /api/activity-heatmap", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-heatmap-"),
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
					message: { role: "assistant" },
				}),
			].join("\n"),
		);
	});

	afterEach(() => {
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns cached heatmap responses and rate limits repeated reads", async () => {
		const readSpy = vi.spyOn(fs.promises, "readFile");
		const route = await import("./route");

		const first = await route.GET(createHeatmapRequest("198.51.100.61"));
		expect(first.status).toBe(200);
		const firstBody = await first.json();
		expect(firstBody.agents).toHaveLength(1);
		const readCount = readSpy.mock.calls.length;
		expect(readCount).toBeGreaterThan(0);

		const second = await route.GET(createHeatmapRequest("198.51.100.61"));
		expect(second.status).toBe(200);
		expect(readSpy.mock.calls.length).toBe(readCount);

		for (let attempt = 0; attempt < 10; attempt++) {
			const response = await route.GET(createHeatmapRequest("198.51.100.61"));
			expect(response.status).toBe(200);
		}

		const denied = await route.GET(createHeatmapRequest("198.51.100.61"));
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "activity_heatmap",
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
		const response = await route.GET(createHeatmapRequest("198.51.100.63"));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Activity heatmap generation failed",
		});
	});
});
