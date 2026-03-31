import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenclawAlertsConfigFileOrThrow } from "@/lib/openclaw-paths";

export const CRON_RULE_ID = "cron_continuous_failure";
export const LEGACY_CRON_RULE_ID = "cron\u8fde\u7eed_failure";

export interface AlertRule {
	id: string;
	name: string;
	enabled: boolean;
	threshold?: number;
	targetAgents?: string[];
}

export interface AlertConfig {
	enabled: boolean;
	receiveAgent: string;
	checkInterval: number;
	rules: AlertRule[];
	lastAlerts?: Record<string, number>;
}

const DEFAULT_ALERT_RULES: AlertRule[] = [
	{ id: "model_unavailable", name: "Model Unavailable", enabled: false },
	{
		id: "bot_no_response",
		name: "Bot Long Time No Response",
		enabled: false,
		threshold: 300,
	},
	{
		id: "message_failure_rate",
		name: "Message Failure Rate High",
		enabled: false,
		threshold: 50,
	},
	{
		id: CRON_RULE_ID,
		name: "Cron Continuous Failure",
		enabled: false,
		threshold: 3,
	},
];

const alertConfigWriteQueue = new Map<string, Promise<void>>();

function cloneAlertRule(rule: AlertRule): AlertRule {
	return {
		...rule,
		...(rule.targetAgents ? { targetAgents: [...rule.targetAgents] } : {}),
	};
}

export function cloneAlertConfig(config: AlertConfig): AlertConfig {
	return {
		enabled: config.enabled,
		receiveAgent: config.receiveAgent,
		checkInterval: config.checkInterval,
		rules: config.rules.map(cloneAlertRule),
		lastAlerts: config.lastAlerts ? { ...config.lastAlerts } : {},
	};
}

export function createDefaultAlertConfig(): AlertConfig {
	return {
		enabled: false,
		receiveAgent: "main",
		checkInterval: 10,
		rules: DEFAULT_ALERT_RULES.map(cloneAlertRule),
		lastAlerts: {},
	};
}

function normalizeRuleId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed === LEGACY_CRON_RULE_ID ? CRON_RULE_ID : trimmed;
}

function normalizeAlertRule(
	defaultRule: AlertRule,
	override: unknown,
): AlertRule {
	const nextRule = cloneAlertRule(defaultRule);
	if (!override || typeof override !== "object" || Array.isArray(override)) {
		return nextRule;
	}

	const record = override as Record<string, unknown>;
	if (typeof record.name === "string" && record.name.trim()) {
		nextRule.name = record.name.trim();
	}
	if (typeof record.enabled === "boolean") {
		nextRule.enabled = record.enabled;
	}
	if (
		typeof record.threshold === "number" &&
		Number.isFinite(record.threshold)
	) {
		nextRule.threshold = record.threshold;
	}
	if (Array.isArray(record.targetAgents)) {
		nextRule.targetAgents = record.targetAgents.filter(
			(value): value is string =>
				typeof value === "string" && value.trim().length > 0,
		);
	}
	return nextRule;
}

export function normalizeAlertConfig(value: unknown): AlertConfig {
	const defaults = createDefaultAlertConfig();
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return defaults;
	}

	const record = value as Record<string, unknown>;
	const rawRules = Array.isArray(record.rules) ? record.rules : [];
	const rulesById = new Map<string, unknown>();
	for (const rawRule of rawRules) {
		const ruleId = normalizeRuleId((rawRule as Record<string, unknown>)?.id);
		if (ruleId) {
			rulesById.set(ruleId, rawRule);
		}
	}

	const rules = DEFAULT_ALERT_RULES.map((defaultRule) =>
		normalizeAlertRule(defaultRule, rulesById.get(defaultRule.id)),
	);

	const lastAlerts: Record<string, number> = {};
	if (record.lastAlerts && typeof record.lastAlerts === "object") {
		for (const [key, rawValue] of Object.entries(record.lastAlerts)) {
			if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
				lastAlerts[key] = rawValue;
			}
		}
	}

	return {
		enabled:
			typeof record.enabled === "boolean" ? record.enabled : defaults.enabled,
		receiveAgent:
			typeof record.receiveAgent === "string" && record.receiveAgent.trim()
				? record.receiveAgent.trim()
				: defaults.receiveAgent,
		checkInterval:
			typeof record.checkInterval === "number" &&
			Number.isInteger(record.checkInterval) &&
			record.checkInterval > 0
				? record.checkInterval
				: defaults.checkInterval,
		rules,
		lastAlerts,
	};
}

async function withAlertConfigWriteLock<T>(
	configPath: string,
	work: () => Promise<T>,
): Promise<T> {
	const previous = alertConfigWriteQueue.get(configPath) ?? Promise.resolve();
	let releaseCurrent!: () => void;
	const current = new Promise<void>((resolve) => {
		releaseCurrent = resolve;
	});
	const queued = previous.catch(() => undefined).then(() => current);
	alertConfigWriteQueue.set(configPath, queued);

	await previous.catch(() => undefined);
	try {
		return await work();
	} finally {
		releaseCurrent();
		if (alertConfigWriteQueue.get(configPath) === queued) {
			alertConfigWriteQueue.delete(configPath);
		}
	}
}

export async function loadAlertConfigFromPath(
	configPath: string,
): Promise<AlertConfig> {
	try {
		const raw = await fs.readFile(configPath, "utf8");
		return normalizeAlertConfig(JSON.parse(raw));
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			return createDefaultAlertConfig();
		}
		return createDefaultAlertConfig();
	}
}

export async function loadAlertConfig(): Promise<AlertConfig> {
	const configPath = resolveOpenclawAlertsConfigFileOrThrow();
	return loadAlertConfigFromPath(configPath);
}

export async function writeAlertConfigToPath(
	configPath: string,
	config: AlertConfig,
): Promise<AlertConfig> {
	const normalizedConfig = normalizeAlertConfig(config);
	const dir = path.dirname(configPath);
	const tempPath = path.join(
		dir,
		`.alerts.json.${process.pid}.${randomUUID()}.tmp`,
	);

	await fs.mkdir(dir, { recursive: true });
	try {
		await fs.writeFile(
			tempPath,
			JSON.stringify(normalizedConfig, null, 2),
			"utf8",
		);
		await fs.rename(tempPath, configPath);
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}

	return normalizedConfig;
}

export async function writeAlertConfig(
	config: AlertConfig,
): Promise<AlertConfig> {
	const configPath = resolveOpenclawAlertsConfigFileOrThrow();
	return writeAlertConfigToPath(configPath, config);
}

export async function updateAlertConfig(
	update: (
		config: AlertConfig,
	) => AlertConfig | undefined | Promise<AlertConfig | undefined>,
): Promise<AlertConfig> {
	const configPath = resolveOpenclawAlertsConfigFileOrThrow();
	return withAlertConfigWriteLock(configPath, async () => {
		const current = await loadAlertConfigFromPath(configPath);
		const draft = cloneAlertConfig(current);
		const nextConfig = normalizeAlertConfig((await update(draft)) ?? draft);
		return writeAlertConfigToPath(configPath, nextConfig);
	});
}
