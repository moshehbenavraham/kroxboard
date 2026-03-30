import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import { requireSensitiveRouteAccess } from "@/lib/security/sensitive-route";

const ALERTS_CONFIG_PATH = path.join(OPENCLAW_HOME, "alerts.json");
const CRON_RULE_ID = "cron_continuous_failure";

interface AlertRule {
	id: string;
	name: string;
	enabled: boolean;
	threshold?: number; // Threshold config.
	targetAgents?: string[]; // Specific agents to monitor.
}

interface AlertConfig {
	enabled: boolean;
	receiveAgent: string; // Agent ID that receives alerts.
	checkInterval: number; // Check interval in minutes.
	rules: AlertRule[];
	lastAlerts?: Record<string, number>; // Last alert timestamps.
}

const DEFAULT_RULES: AlertRule[] = [
	{ id: "model_unavailable", name: "Model Unavailable", enabled: false },
	{
		id: "bot_no_response",
		name: "Bot Long Time No Response",
		enabled: false,
		threshold: 300,
	}, // No response for 5 minutes.
	{
		id: "message_failure_rate",
		name: "Message Failure Rate High",
		enabled: false,
		threshold: 50,
	}, // Failure rate exceeds 50%.
	{
		id: CRON_RULE_ID,
		name: "Cron Continuous Failure",
		enabled: false,
		threshold: 3,
	}, // Three consecutive failures.
];

function getAlertConfig(): AlertConfig {
	try {
		if (fs.existsSync(ALERTS_CONFIG_PATH)) {
			const raw = fs.readFileSync(ALERTS_CONFIG_PATH, "utf-8");
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed?.rules)) {
				for (const rule of parsed.rules) {
					if (rule?.id === "cron\u8fde\u7eed_failure") {
						rule.id = CRON_RULE_ID;
					}
				}
			}
			return parsed;
		}
	} catch {}
	return {
		enabled: false,
		receiveAgent: "main",
		checkInterval: 10,
		rules: DEFAULT_RULES,
		lastAlerts: {},
	};
}

function saveAlertConfig(config: AlertConfig): void {
	const dir = path.dirname(ALERTS_CONFIG_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(ALERTS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
	try {
		const config = getAlertConfig();
		return NextResponse.json(config);
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const access = requireSensitiveRouteAccess(request);
	if (!access.ok) return access.response;

	try {
		const body = await request.json();
		const config = getAlertConfig();

		if (body.enabled !== undefined) config.enabled = body.enabled;
		if (body.receiveAgent) config.receiveAgent = body.receiveAgent;
		if (body.checkInterval !== undefined)
			config.checkInterval = body.checkInterval;
		if (body.rules) {
			for (const newRule of body.rules) {
				const existingRule = config.rules.find((r) => r.id === newRule.id);
				if (existingRule) {
					existingRule.enabled = newRule.enabled;
					if (newRule.threshold !== undefined) {
						existingRule.threshold = newRule.threshold;
					}
					if (newRule.targetAgents !== undefined) {
						existingRule.targetAgents = newRule.targetAgents;
					}
				}
			}
		}

		saveAlertConfig(config);
		return NextResponse.json(config);
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}

export async function PUT(request: Request) {
	const access = requireSensitiveRouteAccess(request);
	if (!access.ok) return access.response;

	try {
		const body = await request.json();
		const config = getAlertConfig();

		if (body.enabled !== undefined) config.enabled = body.enabled;
		if (body.receiveAgent) config.receiveAgent = body.receiveAgent;
		if (body.checkInterval !== undefined)
			config.checkInterval = body.checkInterval;
		if (body.rules) {
			// Merge rule config updates.
			for (const newRule of body.rules) {
				const existingRule = config.rules.find((r) => r.id === newRule.id);
				if (existingRule) {
					existingRule.enabled = newRule.enabled;
					if (newRule.threshold !== undefined) {
						existingRule.threshold = newRule.threshold;
					}
					if (newRule.targetAgents !== undefined) {
						existingRule.targetAgents = newRule.targetAgents;
					}
				}
			}
		}

		saveAlertConfig(config);
		return NextResponse.json(config);
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
