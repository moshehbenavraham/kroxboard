import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameSpy = vi.fn();
const ORIGINAL_ENV = { ...process.env };

vi.mock("node:fs/promises", async () => {
	const actual =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	renameSpy.mockImplementation(actual.rename);
	return {
		...actual,
		rename: renameSpy,
	};
});

describe("alert config helper", () => {
	let tempOpenclawHome = "";
	let configPath = "";

	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		tempOpenclawHome = fs.mkdtempSync(
			path.join(os.tmpdir(), "kroxboard-alert-config-"),
		);
		configPath = path.join(tempOpenclawHome, "alerts.json");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tempOpenclawHome, { recursive: true, force: true });
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns the default alert config when alerts.json is missing", async () => {
		const { CRON_RULE_ID, loadAlertConfigFromPath } = await import(
			"@/lib/alert-config"
		);
		const config = await loadAlertConfigFromPath(configPath);
		expect(config).toMatchObject({
			enabled: false,
			receiveAgent: "main",
			checkInterval: 10,
			lastAlerts: {},
		});
		expect(config.rules.map((rule) => rule.id)).toEqual([
			"model_unavailable",
			"bot_no_response",
			"message_failure_rate",
			CRON_RULE_ID,
		]);
	});

	it("normalizes the legacy cron rule id and fills in default rules", async () => {
		const { CRON_RULE_ID, loadAlertConfigFromPath } = await import(
			"@/lib/alert-config"
		);
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				enabled: true,
				receiveAgent: "helper",
				checkInterval: 5,
				rules: [
					{
						id: "cron\u8fde\u7eed_failure",
						name: "Legacy Cron Rule",
						enabled: true,
						threshold: 9,
					},
				],
				lastAlerts: {
					cron_continuous_failure_backup: 123,
				},
			}),
		);

		const config = await loadAlertConfigFromPath(configPath);
		expect(config.enabled).toBe(true);
		expect(config.receiveAgent).toBe("helper");
		expect(config.rules).toHaveLength(4);
		expect(config.rules.find((rule) => rule.id === CRON_RULE_ID)).toMatchObject(
			{
				name: "Legacy Cron Rule",
				enabled: true,
				threshold: 9,
			},
		);
	});

	it("removes the temp file and preserves the prior config when rename fails", async () => {
		const { writeAlertConfigToPath } = await import("@/lib/alert-config");
		const originalConfig = {
			enabled: false,
			receiveAgent: "main",
			checkInterval: 10,
			rules: [],
			lastAlerts: {},
		};
		fs.writeFileSync(configPath, JSON.stringify(originalConfig, null, 2));
		renameSpy.mockRejectedValueOnce(new Error("rename failed"));

		await expect(
			writeAlertConfigToPath(configPath, {
				enabled: true,
				receiveAgent: "helper",
				checkInterval: 5,
				rules: [],
				lastAlerts: {},
			}),
		).rejects.toThrow("rename failed");

		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(
			originalConfig,
		);
		expect(
			fs
				.readdirSync(tempOpenclawHome)
				.filter(
					(entry) =>
						entry.startsWith(".alerts.json.") && entry.endsWith(".tmp"),
				),
		).toEqual([]);
	});

	it("uses OPENCLAW_ALERTS_PATH when loading and writing alert config", async () => {
		process.env.OPENCLAW_HOME = tempOpenclawHome;
		process.env.OPENCLAW_ALERTS_PATH = "config/alerts.custom.json";
		const overridePath = path.join(
			tempOpenclawHome,
			"config",
			"alerts.custom.json",
		);
		const { loadAlertConfig, writeAlertConfig } = await import(
			"@/lib/alert-config"
		);

		const initial = await loadAlertConfig();
		expect(initial).toMatchObject({
			enabled: false,
			receiveAgent: "main",
		});

		await writeAlertConfig({
			enabled: true,
			receiveAgent: "helper",
			checkInterval: 5,
			rules: [],
			lastAlerts: {},
		});

		expect(JSON.parse(fs.readFileSync(overridePath, "utf8"))).toMatchObject({
			enabled: true,
			receiveAgent: "helper",
			checkInterval: 5,
		});
	});
});
