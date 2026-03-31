import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import {
	getInvalidRequestStatus,
	readBoundedJsonBody,
} from "@/lib/security/request-body";
import {
	createInvalidRequestResponse,
	validateAlertWriteInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";

const ALERTS_CONFIG_PATH = path.join(OPENCLAW_HOME, "alerts.json");
const CRON_RULE_ID = "cron_continuous_failure";
const ALERT_WRITE_BODY_MAX_BYTES = 4096;

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

async function handleAlertWrite(request: Request): Promise<NextResponse> {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST", "PUT"],
	});
	if (!access.ok) return access.response;

	const feature = requireFeatureFlag("ENABLE_ALERT_WRITES");
	if (!feature.ok) return feature.response;

	const parsedBody = await readBoundedJsonBody(request, {
		maxBytes: ALERT_WRITE_BODY_MAX_BYTES,
	});
	if (!parsedBody.ok) {
		return createInvalidRequestResponse(
			parsedBody.error,
			getInvalidRequestStatus(parsedBody.error),
		);
	}

	try {
		const update = validateAlertWriteInput(parsedBody.value);
		if (!update.ok) {
			return createInvalidRequestResponse(update.error);
		}
		const config = getAlertConfig();

		if (update.value.enabled !== undefined)
			config.enabled = update.value.enabled;
		if (update.value.receiveAgent)
			config.receiveAgent = update.value.receiveAgent;
		if (update.value.checkInterval !== undefined) {
			config.checkInterval = update.value.checkInterval;
		}
		if (update.value.rules) {
			for (const newRule of update.value.rules) {
				const existingRule = config.rules.find((r) => r.id === newRule.id);
				if (existingRule) {
					if (newRule.enabled !== undefined) {
						existingRule.enabled = newRule.enabled;
					}
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
	} catch {
		return NextResponse.json(
			{ error: "Alert configuration update failed" },
			{ status: 500 },
		);
	}
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
	return handleAlertWrite(request);
}

export async function PUT(request: Request) {
	return handleAlertWrite(request);
}
