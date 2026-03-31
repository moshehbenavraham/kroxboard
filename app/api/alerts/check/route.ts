import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	type AlertConfig,
	CRON_RULE_ID,
	LEGACY_CRON_RULE_ID,
	loadAlertConfig,
	updateAlertConfig,
} from "@/lib/alert-config";
import { probeModel } from "@/lib/model-probe";
import {
	resolveOpenclawAgentSessionsDir,
	resolveOpenclawAgentSessionsFile,
	resolveOpenclawAgentsDirOrThrow,
	resolveOpenclawConfigFileOrThrow,
	resolveOpenclawCronStorePathOrThrow,
} from "@/lib/openclaw-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { resolveOutboundDiagnosticAccess } from "@/lib/security/feature-flags";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import type {
	DiagnosticMetadata,
	DiagnosticRateLimitMetadata,
} from "@/lib/security/types";

interface AlertNotificationResult {
	agentId: string;
	mode: DiagnosticMetadata["mode"];
	status: "dry_run" | "sent" | "failed";
	message: string;
	error?: string;
}

interface AlertCheckOutcome {
	results: string[];
	notifications: AlertNotificationResult[];
}

interface CronStoreJob {
	id: string;
	name?: string;
	state?: {
		consecutiveErrors?: number;
		lastStatus?: string;
		lastRunAtMs?: number;
		nextRunAtMs?: number;
		lastError?: string;
	};
}

function getOpenclawConfig() {
	const configPath = resolveOpenclawConfigFileOrThrow();
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		return JSON.parse(raw);
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error as NodeJS.ErrnoException)?.code === "ENOENT"
		) {
			return {};
		}
		throw error;
	}
}

function loadCronJobs(openclawConfig: any): CronStoreJob[] {
	const rawStorePath =
		typeof openclawConfig?.cron?.store === "string"
			? openclawConfig.cron.store
			: "";
	const storePath = resolveOpenclawCronStorePathOrThrow(rawStorePath);
	if (!fs.existsSync(storePath)) return [];

	try {
		const raw = fs.readFileSync(storePath, "utf-8");
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed?.jobs) ? parsed.jobs.filter(Boolean) : [];
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error as NodeJS.ErrnoException)?.code === "ENOENT"
		) {
			return [];
		}
		throw error;
	}
}

function normalizeCronLabel(job: CronStoreJob): string {
	if (typeof job.name === "string" && job.name.trim()) return job.name.trim();
	if (typeof job.id === "string" && job.id.trim()) return job.id.trim();
	return "unknown";
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
	const sessionsPath = resolveOpenclawAgentSessionsFile(agentId);
	if (!sessionsPath || !fs.existsSync(sessionsPath)) return null;

	try {
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
async function sendAlertViaFeishu(
	agentId: string,
	message: string,
	diagnostic: DiagnosticMetadata,
): Promise<AlertNotificationResult> {
	const openclawConfig = getOpenclawConfig();
	const feishuConfig = openclawConfig.channels?.feishu || {};
	const bindings = openclawConfig.bindings || [];

	// Resolve the Feishu account config for this agent.
	const accountInfo = getFeishuAccountForAgent(agentId, feishuConfig, bindings);
	if (!accountInfo) {
		return {
			agentId,
			mode: diagnostic.mode,
			status: "failed",
			message,
			error: `No account for agent ${agentId}`,
		};
	}

	// Look up the user's open_id from the agent's DM session.
	const testUserId = getFeishuDmUser(agentId);
	if (!testUserId) {
		return {
			agentId,
			mode: diagnostic.mode,
			status: "failed",
			message,
			error: "No DM user",
		};
	}

	const baseUrl =
		feishuConfig.domain === "lark"
			? "https://open.larksuite.com"
			: "https://open.feishu.cn";

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
			return {
				agentId,
				mode: diagnostic.mode,
				status: "failed",
				message,
				error: `Token failed: ${tokenData.msg}`,
			};
		}

		const token = tokenData.tenant_access_token;

		if (diagnostic.mode === "dry_run") {
			return {
				agentId,
				mode: diagnostic.mode,
				status: "dry_run",
				message,
			};
		}

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
						text: `[Bell] Alert Notification\n${message}\n(${now})`,
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
							text: `[Bell] Alert Notification\n${message}\n(${now})`,
						}),
					}),
					signal: AbortSignal.timeout(10000),
				},
			);

			const msgData2 = await msgResp2.json();
			if (msgData2.code === 0) {
				return {
					agentId,
					mode: diagnostic.mode,
					status: "sent",
					message,
				};
			} else {
				return {
					agentId,
					mode: diagnostic.mode,
					status: "failed",
					message,
					error: `Send failed: ${msgData2.msg}`,
				};
			}
		}

		if (msgData.code === 0) {
			return {
				agentId,
				mode: diagnostic.mode,
				status: "sent",
				message,
			};
		} else {
			return {
				agentId,
				mode: diagnostic.mode,
				status: "failed",
				message,
				error: msgData.msg,
			};
		}
	} catch (err: unknown) {
		const alertError = err instanceof Error ? err.message : String(err);
		return {
			agentId,
			mode: diagnostic.mode,
			status: "failed",
			message,
			error: alertError,
		};
	}
}

// Check whether models are available.
async function checkModelAlerts(
	config: AlertConfig,
	diagnostic: DiagnosticMetadata,
): Promise<AlertCheckOutcome> {
	const results: string[] = [];
	const notifications: AlertNotificationResult[] = [];
	const rule = config.rules.find((r) => r.id === "model_unavailable");
	if (!rule?.enabled) return { results, notifications };

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
			const testResult = await probeModel({
				providerId: provider,
				modelId: id,
				timeoutMs: 10000,
			});

			if (!testResult.ok) {
				results.push(`[Alert] Model ${provider}/${id} is unavailable.`);

				const lastAlert =
					config.lastAlerts?.[`${rule.id}_${provider}_${id}`] || 0;
				const now = Date.now();
				if (now - lastAlert > 60000) {
					const notification = await sendAlertViaFeishu(
						config.receiveAgent,
						`Model ${provider}/${id} is unavailable. Please check the configuration.`,
						diagnostic,
					);
					notifications.push(notification);
					if (notification.status === "sent") {
						config.lastAlerts = config.lastAlerts || {};
						config.lastAlerts[`${rule.id}_${provider}_${id}`] = now;
					}
				}
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			results.push(
				`[Alert] Error while testing model ${provider}/${id}: ${message}`,
			);
		}
	}

	return { results, notifications };
}

// Check for bots that have stopped responding.
async function checkBotResponseAlerts(
	config: AlertConfig,
	diagnostic: DiagnosticMetadata,
): Promise<AlertCheckOutcome> {
	const results: string[] = [];
	const notifications: AlertNotificationResult[] = [];
	const rule = config.rules.find((r) => r.id === "bot_no_response");
	if (!rule?.enabled) return { results, notifications };

	const agentsDir = resolveOpenclawAgentsDirOrThrow();
	let agentIds: string[] = [];
	try {
		agentIds = fs.readdirSync(agentsDir).filter((entry) => {
			const sessionsDir = resolveOpenclawAgentSessionsDir(entry);
			if (!sessionsDir) return false;
			try {
				return fs.statSync(sessionsDir).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return { results, notifications };
	}

	// If targetAgents is configured, only monitor those agents.
	const targetAgents = rule.targetAgents;
	if (targetAgents && targetAgents.length > 0) {
		agentIds = agentIds.filter((id) => targetAgents.includes(id));
	}

	for (const agentId of agentIds) {
		const sessionsDir = resolveOpenclawAgentSessionsDir(agentId);
		if (!sessionsDir) continue;
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
			results.push(
				`WARN Agent ${agentId} has not responded for ${mins} minutes.`,
			);

			const lastAlert = config.lastAlerts?.[`${rule.id}_${agentId}`] || 0;
			if (now - lastAlert > 60000) {
				const notification = await sendAlertViaFeishu(
					config.receiveAgent,
					`Agent ${agentId} has not responded for ${mins} minutes.`,
					diagnostic,
				);
				notifications.push(notification);
				if (notification.status === "sent") {
					config.lastAlerts = config.lastAlerts || {};
					config.lastAlerts[`${rule.id}_${agentId}`] = now;
				}
			}
		}
	}

	return { results, notifications };
}

// Check for repeated cron failures.
async function checkCronAlerts(
	config: AlertConfig,
	diagnostic: DiagnosticMetadata,
	openclawConfig: any,
): Promise<AlertCheckOutcome> {
	const results: string[] = [];
	const notifications: AlertNotificationResult[] = [];
	const rule = config.rules.find(
		(r) => r.id === CRON_RULE_ID || r.id === LEGACY_CRON_RULE_ID,
	);
	if (!rule?.enabled) return { results, notifications };
	const threshold = rule.threshold || 3;
	const cronJobs = loadCronJobs(openclawConfig);
	const failingJobs = cronJobs.filter((job) => {
		const consecutiveErrors = job.state?.consecutiveErrors ?? 0;
		return consecutiveErrors >= threshold;
	});

	for (const job of failingJobs) {
		const consecutiveErrors = job.state?.consecutiveErrors ?? 0;
		const label = normalizeCronLabel(job);
		const suffix =
			typeof job.state?.lastError === "string" && job.state.lastError.trim()
				? ` Last error: ${job.state.lastError.trim().slice(0, 120)}.`
				: "";
		results.push(
			`[Alert] Cron job ${label} failed ${consecutiveErrors} times in a row.${suffix}`,
		);

		const dedupeKey = `${rule.id}_${job.id}`;
		const lastAlert = config.lastAlerts?.[dedupeKey] || 0;
		const now = Date.now();
		if (now - lastAlert <= 300000) continue;

		const notification = await sendAlertViaFeishu(
			config.receiveAgent,
			`Cron job ${label} failed ${consecutiveErrors} times in a row. Please check the cron configuration.`,
			diagnostic,
		);
		notifications.push(notification);
		if (notification.status === "sent") {
			config.lastAlerts = config.lastAlerts || {};
			config.lastAlerts[dedupeKey] = now;
		}
	}

	return { results, notifications };
}

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const diagnosticAccess = resolveOutboundDiagnosticAccess();
	if (!diagnosticAccess.ok) return diagnosticAccess.response;
	const { diagnostic } = diagnosticAccess;
	let rateLimitMetadata: DiagnosticRateLimitMetadata | null = null;

	try {
		const config = await loadAlertConfig();

		if (!config.enabled) {
			return NextResponse.json({
				success: false,
				message: "Alerts are disabled",
				results: [],
				notifications: [],
				diagnostic,
			});
		}
		const rateLimit = enforceDiagnosticRateLimit(request, "alert_diagnostics");
		if (!rateLimit.ok) return rateLimit.response;
		rateLimitMetadata = rateLimit.metadata;
		const openclawConfig = getOpenclawConfig();

		const allResults: string[] = [];
		const notifications: AlertNotificationResult[] = [];

		// Run each alert check.
		const modelResults = await checkModelAlerts(config, diagnostic);
		allResults.push(...modelResults.results);
		notifications.push(...modelResults.notifications);

		const botResults = await checkBotResponseAlerts(config, diagnostic);
		allResults.push(...botResults.results);
		notifications.push(...botResults.notifications);

		const cronResults = await checkCronAlerts(
			config,
			diagnostic,
			openclawConfig,
		);
		allResults.push(...cronResults.results);
		notifications.push(...cronResults.notifications);

		// Persist updated last-alert timestamps.
		if (diagnostic.mode === "live_send" && config.lastAlerts) {
			await updateAlertConfig((draft) => {
				draft.lastAlerts = {
					...(draft.lastAlerts || {}),
					...config.lastAlerts,
				};
			});
		}

		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({
				success: true,
				message: `Found ${allResults.length} alerts`,
				results: allResults,
				notifications,
				diagnostic,
				config: {
					enabled: config.enabled,
					receiveAgent: config.receiveAgent,
				},
			}),
			rateLimit.metadata,
		);
	} catch (error) {
		console.error("[alerts/check] failed", error);
		const response = NextResponse.json(
			{ error: "Alert diagnostics failed" },
			{ status: 500 },
		);
		return rateLimitMetadata
			? applyDiagnosticRateLimitHeaders(response, rateLimitMetadata)
			: response;
	}
}
