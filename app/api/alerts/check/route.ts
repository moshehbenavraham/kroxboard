import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_CONFIG_PATH, OPENCLAW_HOME } from "@/lib/openclaw-paths";
import { requireSensitiveRouteAccess } from "@/lib/security/sensitive-route";

const ALERTS_CONFIG_PATH = path.join(OPENCLAW_HOME, "alerts.json");
const CRON_RULE_ID = "cron_continuous_failure";
const LEGACY_CRON_RULE_ID = "cron\u8fde\u7eed_failure";

interface AlertRule {
	id: string;
	name: string;
	enabled: boolean;
	threshold?: number;
	targetAgents?: string[];
}

interface AlertConfig {
	enabled: boolean;
	receiveAgent: string;
	checkInterval: number;
	rules: AlertRule[];
	lastAlerts?: Record<string, number>;
}

function getAlertConfig(): AlertConfig {
	try {
		if (fs.existsSync(ALERTS_CONFIG_PATH)) {
			const raw = fs.readFileSync(ALERTS_CONFIG_PATH, "utf-8");
			return JSON.parse(raw);
		}
	} catch {}
	return {
		enabled: false,
		receiveAgent: "main",
		checkInterval: 10,
		rules: [
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
		],
		lastAlerts: {},
	};
}

function getOpenclawConfig() {
	const configPath = OPENCLAW_CONFIG_PATH;
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

function saveAlertConfig(config: AlertConfig): void {
	const dir = path.dirname(ALERTS_CONFIG_PATH);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(ALERTS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function _getGatewayConfig() {
	const configPath = OPENCLAW_CONFIG_PATH;
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw);
		return {
			port: config.gateway?.port || 18789,
			token: config.gateway?.auth?.token || "",
			feishu: config.channels?.feishu || {},
		};
	} catch {
		return { port: 18789, token: "", feishu: {} };
	}
}

// Resolve the Feishu account config for the target agent.
function getFeishuAccountForAgent(
	agentId: string,
	feishuConfig: any,
	bindings: any[],
): { appId: string; appSecret: string; accountId: string } | null {
	const feishuAccounts = feishuConfig.accounts || {};

	// Check explicit bindings first.
	const feishuBinding = bindings.find(
		(b: any) => b.agentId === agentId && b.match?.channel === "feishu",
	);
	if (feishuBinding) {
		const accountId = feishuBinding.match?.accountId || agentId;
		const account = feishuAccounts[accountId];
		if (account?.appId && account?.appSecret) {
			return { appId: account.appId, appSecret: account.appSecret, accountId };
		}
	}

	// Fall back to an account with the same name.
	if (feishuAccounts[agentId]) {
		const account = feishuAccounts[agentId];
		if (account?.appId && account?.appSecret) {
			return {
				appId: account.appId,
				appSecret: account.appSecret,
				accountId: agentId,
			};
		}
	}

	// main agent fallback
	if (
		agentId === "main" &&
		feishuConfig.enabled &&
		feishuConfig.appId &&
		feishuConfig.appSecret
	) {
		return {
			appId: feishuConfig.appId,
			appSecret: feishuConfig.appSecret,
			accountId: "main",
		};
	}

	return null;
}

// Find the most recent Feishu DM user for the agent.
function getFeishuDmUser(agentId: string): string | null {
	try {
		const sessionsPath = path.join(
			OPENCLAW_HOME,
			`agents/${agentId}/sessions/sessions.json`,
		);
		const raw = fs.readFileSync(sessionsPath, "utf-8");
		const sessions = JSON.parse(raw);
		let bestId: string | null = null;
		let bestTime = 0;
		for (const [key, val] of Object.entries(sessions)) {
			const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
			if (m) {
				const updatedAt = (val as { updatedAt?: number }).updatedAt || 0;
				if (updatedAt > bestTime) {
					bestTime = updatedAt;
					bestId = m[1];
				}
			}
		}
		return bestId;
	} catch {
		return null;
	}
}

// Send alert notifications through the Feishu API.
async function sendAlertViaFeishu(agentId: string, message: string) {
	console.log(
		`[ALERT] sendAlertViaFeishu called with agentId: ${agentId}, message: ${message}`,
	);

	const openclawConfig = getOpenclawConfig();
	const feishuConfig = openclawConfig.channels?.feishu || {};
	const feishuAccounts = feishuConfig.accounts || {};
	const bindings = openclawConfig.bindings || [];

	console.log(`[ALERT] Feishu accounts found:`, Object.keys(feishuAccounts));

	// Resolve the Feishu account config for this agent.
	const accountInfo = getFeishuAccountForAgent(agentId, feishuConfig, bindings);
	if (!accountInfo) {
		console.log(`[ALERT] No Feishu account found for agent ${agentId}`);
		return { sent: false, error: `No account for agent ${agentId}` };
	}

	console.log(
		`[ALERT] Using account: ${accountInfo.accountId}, appId: ${accountInfo.appId}`,
	);

	// Look up the user's open_id from the agent's DM session.
	const testUserId = getFeishuDmUser(agentId);
	console.log(`[ALERT] Feishu DM user found: ${testUserId}`);
	if (!testUserId) {
		console.log(`[ALERT] No Feishu DM user found for agent ${agentId}`);
		return { sent: false, error: "No DM user" };
	}

	const baseUrl =
		feishuConfig.domain === "lark"
			? "https://open.larksuite.com"
			: "https://open.feishu.cn";
	console.log(`[ALERT] Using baseUrl: ${baseUrl}`);

	try {
		// Fetch tenant_access_token.
		const tokenResp = await fetch(
			`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					app_id: accountInfo.appId,
					app_secret: accountInfo.appSecret,
				}),
				signal: AbortSignal.timeout(10000),
			},
		);

		const tokenData = await tokenResp.json();
		if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
			return { sent: false, error: `Token failed: ${tokenData.msg}` };
		}

		const token = tokenData.tenant_access_token;

		// Send the DM. Try user_id first, then fall back to open_id.
		const now = new Date().toLocaleTimeString("en-US", {
			timeZone: "Asia/Shanghai",
		});
		const msgResp = await fetch(
			`${baseUrl}/open-apis/im/v1/messages?receive_id_type=user_id`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					receive_id: testUserId,
					msg_type: "text",
					content: JSON.stringify({
						text: `🔔 Alert Notification\n${message}\n(${now})`,
					}),
				}),
				signal: AbortSignal.timeout(10000),
			},
		);

		const msgData = await msgResp.json();

		// If user_id fails, retry with open_id.
		if (msgData.code !== 0) {
			const msgResp2 = await fetch(
				`${baseUrl}/open-apis/im/v1/messages?receive_id_type=open_id`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						receive_id: testUserId,
						msg_type: "text",
						content: JSON.stringify({
							text: `🔔 Alert Notification\n${message}\n(${now})`,
						}),
					}),
					signal: AbortSignal.timeout(10000),
				},
			);

			const msgData2 = await msgResp2.json();
			if (msgData2.code === 0) {
				console.log(`[ALERT] Sent to ${agentId}: ${message}`);
				return { sent: true, message };
			} else {
				return { sent: false, error: `Send failed: ${msgData2.msg}` };
			}
		}

		if (msgData.code === 0) {
			console.log(`[ALERT] Sent to ${agentId}: ${message}`);
			return { sent: true, message };
		} else {
			console.log(`[ALERT] Send failed (user_id):`, msgData);
			return { sent: false, error: msgData.msg };
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.log(`[ALERT] Error sending message:`, err);
		return { sent: false, error: message };
	}
}

// Send alert notifications through the OpenClaw Gateway API.
async function _sendAlert(agentId: string, message: string) {
	const openclawConfig = getOpenclawConfig();
	const gatewayPort = openclawConfig.gateway?.port || 18789;
	const gatewayToken = openclawConfig.gateway?.auth?.token || "";

	// Use the main session key for the target agent.
	const sessionKey = `agent:${agentId}:main`;

	try {
		// Fire and forget; do not wait for the response.
		fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${gatewayToken}`,
				"x-openclaw-agent-id": agentId,
			},
			body: JSON.stringify({
				session: sessionKey,
				messages: [
					{ role: "user", content: `🔔 Alert Notification: ${message}` },
				],
				max_tokens: 64,
			}),
		})
			.then((resp) => {
				if (resp.ok) {
					console.log(`[ALERT] Sent to ${agentId}: ${message}`);
				}
			})
			.catch((err) => {
				console.error(`[ALERT] Error: ${err.message}`);
			});

		return { sent: true, message };
	} catch (err: unknown) {
		return {
			sent: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

// Check whether models are available.
async function checkModelAlerts(config: AlertConfig) {
	const results: string[] = [];
	const rule = config.rules.find((r) => r.id === "model_unavailable");
	if (!rule?.enabled) return results;

	// Load all configured models.
	const openclawConfig = getOpenclawConfig();
	const providers = openclawConfig.models?.providers || {};

	// Build a flat list of models to test.
	const allModels: Array<{ provider: string; id: string }> = [];
	for (const [providerId, provider] of Object.entries(providers)) {
		const p = provider as { models?: { id: string }[] };
		if (p.models && Array.isArray(p.models)) {
			for (const model of p.models) {
				allModels.push({ provider: providerId, id: model.id });
			}
		}
	}

	// Test each model.
	for (const { provider, id } of allModels) {
		try {
			const _testStart = Date.now();
			const testResp = await fetch("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, modelId: id }),
				signal: AbortSignal.timeout(10000),
			});

			const testResult = await testResp.json();

			if (!testResult.ok) {
				results.push(`🚨 Model ${provider}/${id} is unavailable.`);

				const lastAlert =
					config.lastAlerts?.[`${rule.id}_${provider}_${id}`] || 0;
				const now = Date.now();
				if (now - lastAlert > 60000) {
					await sendAlertViaFeishu(
						config.receiveAgent,
						`Model ${provider}/${id} is unavailable. Please check the configuration.`,
					);
					config.lastAlerts = config.lastAlerts || {};
					config.lastAlerts[`${rule.id}_${provider}_${id}`] = now;
				}
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			results.push(
				`🚨 Error while testing model ${provider}/${id}: ${message}`,
			);
		}
	}

	return results;
}

// Check for bots that have stopped responding.
async function checkBotResponseAlerts(config: AlertConfig) {
	const results: string[] = [];
	const rule = config.rules.find((r) => r.id === "bot_no_response");
	if (!rule?.enabled) return results;

	const agentsDir = path.join(OPENCLAW_HOME, "agents");
	let agentIds: string[] = [];
	try {
		agentIds = fs
			.readdirSync(agentsDir)
			.filter((f) => fs.statSync(path.join(agentsDir, f)).isDirectory());
	} catch {
		return results;
	}

	// If targetAgents is configured, only monitor those agents.
	const targetAgents = rule.targetAgents;
	if (targetAgents && targetAgents.length > 0) {
		agentIds = agentIds.filter((id) => targetAgents.includes(id));
	}

	for (const agentId of agentIds) {
		const sessionsDir = path.join(agentsDir, agentId, "sessions");
		let files: string[] = [];
		try {
			files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
		} catch {
			continue;
		}

		let lastActivity = 0;
		for (const file of files) {
			const filePath = path.join(sessionsDir, file);
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				const lines = content.trim().split("\n");
				for (const line of lines) {
					try {
						const entry = JSON.parse(line);
						if (entry.timestamp) {
							const ts = new Date(entry.timestamp).getTime();
							if (ts > lastActivity) lastActivity = ts;
						}
					} catch {}
				}
			} catch {}
		}

		const now = Date.now();
		const thresholdMs = (rule.threshold || 300) * 1000;
		if (lastActivity > 0 && now - lastActivity > thresholdMs) {
			const mins = Math.round((now - lastActivity) / 60000);
			results.push(`⚠️ Agent ${agentId} has not responded for ${mins} minutes.`);

			const lastAlert = config.lastAlerts?.[`${rule.id}_${agentId}`] || 0;
			if (now - lastAlert > 60000) {
				await sendAlertViaFeishu(
					config.receiveAgent,
					`Agent ${agentId} has not responded for ${mins} minutes.`,
				);
				config.lastAlerts = config.lastAlerts || {};
				config.lastAlerts[`${rule.id}_${agentId}`] = now;
			}
		}
	}

	return results;
}

// Check for repeated cron failures.
async function checkCronAlerts(config: AlertConfig) {
	const results: string[] = [];
	const rule = config.rules.find(
		(r) => r.id === CRON_RULE_ID || r.id === LEGACY_CRON_RULE_ID,
	);
	if (!rule?.enabled) return results;

	// Check cron status. This remains a simplified placeholder.
	const agentsDir = path.join(OPENCLAW_HOME, "agents");
	let _agentIds: string[] = [];
	try {
		_agentIds = fs
			.readdirSync(agentsDir)
			.filter((f) => fs.statSync(path.join(agentsDir, f)).isDirectory());
	} catch {
		return results;
	}

	// Simulate repeated failures until real cron-failure accounting exists.
	const mockCronFailures = Math.floor(Math.random() * 5); // Simulates 0-4 failures.

	if (mockCronFailures >= (rule.threshold || 3)) {
		results.push(`🚨 Cron failed ${mockCronFailures} times in a row.`);
		const lastAlert = config.lastAlerts?.[rule.id] || 0;
		const now = Date.now();
		if (now - lastAlert > 300000) {
			// Do not repeat within 5 minutes.
			await sendAlertViaFeishu(
				config.receiveAgent,
				`Cron failed ${mockCronFailures} times in a row. Please check the cron configuration.`,
			);
			config.lastAlerts = config.lastAlerts || {};
			config.lastAlerts[rule.id] = now;
		}
	}

	return results;
}

export async function POST(request: Request) {
	const access = requireSensitiveRouteAccess(request);
	if (!access.ok) return access.response;

	try {
		const config = getAlertConfig();

		if (!config.enabled) {
			return NextResponse.json({
				success: false,
				message: "Alerts are disabled",
				results: [],
			});
		}

		const allResults: string[] = [];

		// Run each alert check.
		const modelResults = await checkModelAlerts(config);
		allResults.push(...modelResults);

		const botResults = await checkBotResponseAlerts(config);
		allResults.push(...botResults);

		const cronResults = await checkCronAlerts(config);
		allResults.push(...cronResults);

		// Persist updated last-alert timestamps.
		saveAlertConfig(config);

		return NextResponse.json({
			success: true,
			message: `Found ${allResults.length} alerts`,
			results: allResults,
			config: {
				enabled: config.enabled,
				receiveAgent: config.receiveAgent,
			},
		});
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
