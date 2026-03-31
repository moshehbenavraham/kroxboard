import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ANALYTICS_SESSION_FILE_BYTES } from "@/lib/openclaw-analytics";

const ORIGINAL_ENV = { ...process.env };

describe("GET /api/stats-models", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-stats-models-"),
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
					timestamp: "2026-03-31T00:00:03.000Z",
					message: {
						role: "assistant",
						stopReason: "stop",
						model: "gpt-4o-mini",
						provider: "openai",
						usage: {
							input: 10,
							output: 5,
							totalTokens: 15,
						},
					},
				}),
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-31T00:01:00.000Z",
					message: { role: "user" },
				}),
				JSON.stringify({
					type: "message",
					timestamp: "2026-03-31T00:01:04.000Z",
					message: {
						role: "assistant",
						stopReason: "stop",
						model: "claude-sonnet",
						provider: "anthropic",
						usage: {
							input: 25,
							output: 5,
							totalTokens: 30,
						},
					},
				}),
			].join("\n"),
		);
	});

	afterEach(() => {
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
		vi.restoreAllMocks();
	});

	it("returns cached model stats with deterministic ordering", async () => {
		const readSpy = vi.spyOn(fs.promises, "readFile");
		const route = await import("./route");

		const first = await route.GET();
		expect(first.status).toBe(200);
		const firstBody = await first.json();
		expect(firstBody.models).toHaveLength(2);
		expect(
			firstBody.models.map((entry: { modelId: string }) => entry.modelId),
		).toEqual(["claude-sonnet", "gpt-4o-mini"]);
		expect(firstBody.models[0]).toMatchObject({
			modelId: "claude-sonnet",
			provider: "anthropic",
			totalTokens: 30,
			avgResponseMs: 4000,
		});
		expect(readSpy).toHaveBeenCalledTimes(1);

		const second = await route.GET();
		expect(second.status).toBe(200);
		expect(readSpy).toHaveBeenCalledTimes(1);
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
		const response = await route.GET();

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Unable to load model stats",
		});
	});
});
