import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("GET /api/agent-activity", () => {
	let tempOpenclawHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-agent-activity-"),
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

	function writeAgentConfig(cronStore: string): void {
		fs.writeFileSync(
			path.join(tempOpenclawHome, "openclaw.json"),
			JSON.stringify({
				agents: {
					list: [{ id: "main", name: "Main" }],
				},
				cron: {
					store: cronStore,
				},
			}),
		);
	}

	function writeRecentSessionsIndex(): void {
		const sessionsDir = path.join(
			tempOpenclawHome,
			"agents",
			"main",
			"sessions",
		);
		fs.mkdirSync(sessionsDir, { recursive: true });
		fs.writeFileSync(
			path.join(sessionsDir, "sessions.json"),
			JSON.stringify({}),
		);
	}

	it("ignores cron-store paths that escape the approved openclaw boundary", async () => {
		writeAgentConfig("../outside/jobs.json");
		writeRecentSessionsIndex();
		fs.mkdirSync(path.join(tempOpenclawHome, "..", "outside"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempOpenclawHome, "..", "outside", "jobs.json"),
			JSON.stringify({
				jobs: [{ id: "job-1", agentId: "main", state: { lastRunAtMs: 1 } }],
			}),
		);

		const route = await import("./route");
		const response = await route.GET();

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.agents).toHaveLength(1);
		expect(body.agents[0].agentId).toBe("main");
		expect(body.agents[0].cronJobs).toBeUndefined();
	});

	it("loads cron jobs from an approved cron-store path", async () => {
		writeAgentConfig("cron-store/jobs.json");
		writeRecentSessionsIndex();
		fs.mkdirSync(path.join(tempOpenclawHome, "cron-store"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.join(tempOpenclawHome, "cron-store", "jobs.json"),
			JSON.stringify({
				jobs: [
					{
						id: "job-1",
						agentId: "main",
						name: "Nightly check",
						state: {
							lastRunAtMs: Date.now() - 1000,
							lastStatus: "success",
							consecutiveErrors: 0,
						},
					},
				],
			}),
		);

		const route = await import("./route");
		const response = await route.GET();

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.agents).toHaveLength(1);
		expect(body.agents[0].cronJobs).toHaveLength(1);
		expect(body.agents[0].cronJobs[0]).toMatchObject({
			jobId: "job-1",
			label: "Nightly check",
			lastStatus: "success",
		});
	});
});
