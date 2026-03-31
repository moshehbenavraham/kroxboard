import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getConfigCache, setConfigCache } from "@/lib/config-cache";
import {
	buildGatewayAgentLaunchPath,
	buildGatewayHomeLaunchPath,
	buildGatewayPlatformLaunchPath,
} from "@/lib/gateway-launch";
import { OPENCLAW_CONFIG_PATH, OPENCLAW_HOME } from "@/lib/openclaw-paths";
import { shouldHidePlatformChannel } from "@/lib/platforms";

// Config path: prefer OPENCLAW_HOME, otherwise default to ~/.openclaw.
const CONFIG_PATH = OPENCLAW_CONFIG_PATH;
const OPENCLAW_DIR = OPENCLAW_HOME;

const CACHE_TTL_MS = 30_000;

// Read agent session state from JSONL files, including recent activity and token usage.
interface SessionStatus {
	lastActive: number | null;
	totalTokens: number;
	contextTokens: number;
	sessionCount: number;
	todayAvgResponseMs: number;
	messageCount: number;
	weeklyResponseMs: number[]; // Average response time for each of the past 7 days.
	weeklyTokens: number[]; // Token usage for each of the past 7 days.
}

function getAgentSessionStatus(agentId: string): SessionStatus {
	const result: SessionStatus = {
		lastActive: null,
		totalTokens: 0,
		contextTokens: 0,
		sessionCount: 0,
		todayAvgResponseMs: 0,
		messageCount: 0,
		weeklyResponseMs: [],
		weeklyTokens: [],
	};
	const sessionsDir = path.join(OPENCLAW_DIR, `agents/${agentId}/sessions`);

	const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

	// Build the date list for the last 7 days.
	const weekDates: string[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(Date.now() - i * 86400000);
		weekDates.push(d.toISOString().slice(0, 10));
	}
	const dailyResponseTimes: Record<string, number[]> = {};
	const dailyTokens: Record<string, number> = {};
	for (const d of weekDates) {
		dailyResponseTimes[d] = [];
		dailyTokens[d] = 0;
	}

	let files: string[];
	try {
		const allFiles = fs
			.readdirSync(sessionsDir)
			.filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted."));
		// Only read files modified in the last 7 days.
		const cutoff = Date.now() - 7 * 86400000;
		files = allFiles.filter((f) => {
			try {
				return fs.statSync(path.join(sessionsDir, f)).mtimeMs >= cutoff;
			} catch {
				return false;
			}
		});
	} catch {
		return result;
	}

	// Track unique session keys with a Set.
	const sessionKeys = new Set<string>();

	for (const file of files) {
		const filePath = path.join(sessionsDir, file);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const lines = content.trim().split("\n");
		const messages: { role: string; ts: string; stopReason?: string }[] = [];

		for (const line of lines) {
			let entry: any;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}

			// Count sessions from sessionKey fields.
			if (entry.sessionKey) {
				sessionKeys.add(entry.sessionKey);
			}

			// Read token usage from assistant message usage blocks.
			if (entry.type === "message" && entry.message) {
				const msg = entry.message;
				if (msg.role === "assistant" && msg.usage) {
					result.totalTokens += msg.usage.input || 0;
					result.totalTokens += msg.usage.output || 0;
					result.messageCount += 1;
					// Aggregate tokens by day.
					if (entry.timestamp) {
						const msgDate = entry.timestamp.slice(0, 10);
						if (dailyTokens[msgDate] !== undefined) {
							dailyTokens[msgDate] +=
								(msg.usage.input || 0) + (msg.usage.output || 0);
						}
					}
				}
				// Update last activity.
				if (entry.timestamp) {
					const ts = new Date(entry.timestamp).getTime();
					if (!result.lastActive || ts > result.lastActive) {
						result.lastActive = ts;
					}
					messages.push({
						role: msg.role,
						ts: entry.timestamp,
						stopReason: msg.stopReason,
					});
				}
			}
		}

		// O(n) response-time calculation: pair each user message with the next assistant stop.
		let lastUserTs: string | null = null;
		for (const msg of messages) {
			if (msg.role === "user") {
				lastUserTs = msg.ts;
			} else if (
				msg.role === "assistant" &&
				msg.stopReason === "stop" &&
				lastUserTs
			) {
				const msgDate = lastUserTs.slice(0, 10);
				if (dailyResponseTimes[msgDate]) {
					const diffMs =
						new Date(msg.ts).getTime() - new Date(lastUserTs).getTime();
					if (diffMs > 0 && diffMs < 600000) {
						dailyResponseTimes[msgDate].push(diffMs);
					}
				}
				lastUserTs = null;
			}
		}
	}

	result.sessionCount = sessionKeys.size || files.length; // Fallback to file count.
	const todayTimes = dailyResponseTimes[today] || [];
	if (todayTimes.length > 0) {
		result.todayAvgResponseMs = Math.round(
			todayTimes.reduce((a, b) => a + b, 0) / todayTimes.length,
		);
	}
	result.weeklyResponseMs = weekDates.map((d) => {
		const times = dailyResponseTimes[d];
		if (!times || times.length === 0) return 0;
		return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
	});
	result.weeklyTokens = weekDates.map((d) => dailyTokens[d] || 0);
	return result;
}

// Read all group-chat info for the provided agents.
interface GroupChat {
	groupId: string;
	agents: { id: string; emoji: string; name: string }[];
	channel: string;
}

function getGroupChats(
	agentIds: string[],
	agentMap: Record<string, { emoji: string; name: string }>,
	_feishuAgentIds: string[],
	sessionsMap: Map<string, any>,
): GroupChat[] {
	const groupAgents: Record<string, { agents: Set<string>; channel: string }> =
		{};
	for (const agentId of agentIds) {
		try {
			const sessions = sessionsMap.get(agentId);
			if (!sessions) continue;
			for (const key of Object.keys(sessions)) {
				// Match group-session keys across supported channels.
				const feishuGroup = key.match(/^agent:[^:]+:feishu:group:(.+)$/);
				const discordGroup = key.match(/^agent:[^:]+:discord:channel:(.+)$/);
				const telegramGroup = key.match(/^agent:[^:]+:telegram:group:(.+)$/);
				const whatsappGroup = key.match(/^agent:[^:]+:whatsapp:group:(.+)$/);
				if (feishuGroup) {
					const gid = `feishu:${feishuGroup[1]}`;
					if (!groupAgents[gid])
						groupAgents[gid] = { agents: new Set(), channel: "feishu" };
					groupAgents[gid].agents.add(agentId);
				}
				if (discordGroup) {
					const gid = `discord:${discordGroup[1]}`;
					if (!groupAgents[gid])
						groupAgents[gid] = { agents: new Set(), channel: "discord" };
					groupAgents[gid].agents.add(agentId);
				}
				if (telegramGroup) {
					const gid = `telegram:${telegramGroup[1]}`;
					if (!groupAgents[gid])
						groupAgents[gid] = { agents: new Set(), channel: "telegram" };
					groupAgents[gid].agents.add(agentId);
				}
				if (whatsappGroup) {
					const gid = `whatsapp:${whatsappGroup[1]}`;
					if (!groupAgents[gid])
						groupAgents[gid] = { agents: new Set(), channel: "whatsapp" };
					groupAgents[gid].agents.add(agentId);
				}
			}
		} catch {}
	}
	// Return the agents that actually have sessions in each group chat.
	return Object.entries(groupAgents)
		.filter(([, v]) => v.agents.size > 0)
		.map(([groupId, v]) => ({
			groupId,
			channel: v.channel,
			agents: Array.from(v.agents).map((id) => ({
				id,
				emoji: agentMap[id]?.emoji || "[bot]",
				name: agentMap[id]?.name || id,
			})),
		}));
}

// Read the most recently active Feishu DM user open_id for each agent.
function getFeishuUserOpenIds(
	agentIds: string[],
	sessionsMap: Map<string, any>,
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const agentId of agentIds) {
		try {
			const sessions = sessionsMap.get(agentId);
			if (!sessions) continue;
			let best: { openId: string; updatedAt: number } | null = null;
			for (const [key, val] of Object.entries(sessions)) {
				const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
				if (m) {
					const updatedAt = (val as any).updatedAt || 0;
					if (!best || updatedAt > best.updatedAt) {
						best = { openId: m[1], updatedAt };
					}
				}
			}
			if (best) map[agentId] = best.openId;
		} catch {}
	}
	return map;
}

function getChannelDirectPeerIds(
	agentIds: string[],
	sessionsMap: Map<string, any>,
	channel: string,
): Record<string, string> {
	const map: Record<string, string> = {};
	const pattern = new RegExp(`^agent:[^:]+:${channel}:direct:(.+)$`);
	for (const agentId of agentIds) {
		try {
			const sessions = sessionsMap.get(agentId);
			if (!sessions) continue;
			let best: { peerId: string; updatedAt: number } | null = null;
			for (const [key, val] of Object.entries(sessions)) {
				const m = key.match(pattern);
				if (m) {
					const updatedAt = (val as any).updatedAt || 0;
					if (!best || updatedAt > best.updatedAt) {
						best = { peerId: m[1], updatedAt };
					}
				}
			}
			if (best) map[agentId] = best.peerId;
		} catch {}
	}
	return map;
}
// Read the bot name from IDENTITY.md.
function readIdentityName(
	agentId: string,
	agentDir?: string,
	workspace?: string,
): string | null {
	const candidates = [
		agentDir ? path.join(agentDir, "IDENTITY.md") : null,
		workspace ? path.join(workspace, "IDENTITY.md") : null,
		path.join(OPENCLAW_DIR, `agents/${agentId}/agent/IDENTITY.md`),
		path.join(OPENCLAW_DIR, `workspace-${agentId}/IDENTITY.md`),
		// Only the main agent falls back to the default workspace.
		agentId === "main"
			? path.join(OPENCLAW_DIR, `workspace/IDENTITY.md`)
			: null,
	].filter(Boolean) as string[];

	for (const p of candidates) {
		try {
			const content = fs.readFileSync(p, "utf-8");
			const match = content.match(/\*\*Name:\*\*\s*(.+)/);
			if (match) {
				const name = match[1].trim();
				if (name && !name.startsWith("_") && !name.startsWith("(")) return name;
			}
		} catch {}
	}
	return null;
}

export async function GET() {
	// Return cached data when available.
	const configCache = getConfigCache();
	if (configCache && Date.now() - configCache.ts < CACHE_TTL_MS) {
		return NextResponse.json(configCache.data);
	}

	try {
		const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
		const config = JSON.parse(raw);

		// Extract agent information.
		const defaults = config.agents?.defaults || {};
		const defaultModel =
			typeof defaults.model === "string"
				? defaults.model
				: defaults.model?.primary || "unknown";
		const fallbacks =
			typeof defaults.model === "object" ? defaults.model?.fallbacks || [] : [];
		const normalizeModelRef = (value: any, fallback: string): string => {
			const pick = (v: any): string | null => {
				if (typeof v === "string") {
					const s = v.trim();
					return s.length > 0 ? s : null;
				}
				return null;
			};

			const direct = pick(value);
			if (direct) return direct;

			if (value && typeof value === "object") {
				const primary = pick(value.primary);
				if (primary) return primary;
				const def = pick(value.default);
				if (def) return def;
			}

			const fb = pick(fallback);
			return fb || "unknown";
		};

		let agentList = config.agents?.list || [];
		const bindings = config.bindings || [];
		const channels = config.channels || {};
		const feishuAccounts = channels.feishu?.accounts || {};

		// Auto-discover agents from ~/.openclaw/agents/ when agents.list is empty
		if (agentList.length === 0) {
			try {
				const agentsDir = path.join(OPENCLAW_DIR, "agents");
				const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
				agentList = dirs
					.filter((d) => d.isDirectory() && !d.name.startsWith("."))
					.map((d) => ({ id: d.name }));
			} catch {}
			// If still empty, at least include "main"
			if (agentList.length === 0) {
				agentList = [{ id: "main" }];
			}
		}

		// Read all sessions.json files once to avoid repeated I/O.
		const agentIds = agentList.map((a: any) => a.id);
		const sessionsMap = new Map<string, any>();
		for (const agentId of agentIds) {
			try {
				const sessionsPath = path.join(
					OPENCLAW_DIR,
					`agents/${agentId}/sessions/sessions.json`,
				);
				const raw = fs.readFileSync(sessionsPath, "utf-8");
				sessionsMap.set(agentId, JSON.parse(raw));
			} catch {}
		}

		// Resolve Feishu open_id values from the preloaded session data.
		const feishuUserOpenIds = getFeishuUserOpenIds(agentIds, sessionsMap);
		const enabledChannelNames: string[] = Object.entries(channels)
			.filter(
				([channelName, cfg]) =>
					cfg &&
					typeof cfg === "object" &&
					(cfg as any).enabled !== false &&
					!shouldHidePlatformChannel(channelName, channels),
			)
			.map(([channelName]) => channelName);
		const boundChannelNames: string[] = Array.from(
			new Set(
				bindings
					.map((b: any) => b.match?.channel)
					.filter(
						(v: any): v is string =>
							typeof v === "string" &&
							v.length > 0 &&
							!shouldHidePlatformChannel(v, channels),
					),
			),
		);
		const discoverChannelNames: string[] = Array.from(
			new Set([...enabledChannelNames, ...boundChannelNames]),
		);
		const directPeerIdsByChannel: Record<string, Record<string, string>> = {};
		for (const channelName of discoverChannelNames) {
			if (channelName === "feishu") continue;
			directPeerIdsByChannel[channelName] = getChannelDirectPeerIds(
				agentIds,
				sessionsMap,
				channelName,
			);
		}
		const discordDmAllowFrom = channels.discord?.dm?.allowFrom || [];

		// Build agent detail records.
		const agents = await Promise.all(
			agentList.map(async (agent: any) => {
				const id = agent.id;
				const identityName = readIdentityName(
					id,
					agent.agentDir,
					agent.workspace,
				);
				const name = identityName || agent.name || id;
				const emoji = agent.identity?.emoji || "[bot]";
				const model = normalizeModelRef(agent.model, defaultModel);
				const launchPath =
					buildGatewayAgentLaunchPath(id) || buildGatewayHomeLaunchPath();

				// Resolve bound platforms.
				const platforms: {
					name: string;
					accountId?: string;
					launchPath?: string;
				}[] = [];
				const addPlatform = (platform: {
					name: string;
					accountId?: string;
					launchPath?: string;
				}) => {
					if (!platform?.name) return;
					const exists = platforms.some(
						(p) =>
							p.name === platform.name &&
							(p.accountId || "") === (platform.accountId || ""),
					);
					if (!exists) platforms.push(platform);
				};

				// Check explicit Feishu bindings.
				const feishuBinding = bindings.find(
					(b: any) => b.agentId === id && b.match?.channel === "feishu",
				);
				if (feishuBinding) {
					const accountId = feishuBinding.match?.accountId || id;
					const userOpenId = feishuUserOpenIds[id] || null;
					addPlatform({
						name: "feishu",
						accountId,
						...(userOpenId && {
							launchPath:
								buildGatewayPlatformLaunchPath(id, "feishu") || undefined,
						}),
					});
				}

				// If no explicit binding, check if there's a feishu account matching this agent id
				if (!feishuBinding && feishuAccounts[id]) {
					const userOpenId = feishuUserOpenIds[id] || null;
					addPlatform({
						name: "feishu",
						accountId: id,
						...(userOpenId && {
							launchPath:
								buildGatewayPlatformLaunchPath(id, "feishu") || undefined,
						}),
					});
				}

				// Special-case main: show all enabled channels not explicitly bound elsewhere.
				if (id === "main") {
					const hasFeishu = platforms.some((p) => p.name === "feishu");
					if (
						!hasFeishu &&
						channels.feishu &&
						channels.feishu.enabled !== false
					) {
						// main gets feishu if channel is configured and not explicitly disabled
						const userOpenId = feishuUserOpenIds.main || null;
						addPlatform({
							name: "feishu",
							accountId: "main",
							...(userOpenId && {
								launchPath:
									buildGatewayPlatformLaunchPath(id, "feishu") || undefined,
							}),
						});
					}

					// The main agent shows all enabled channels by default; Feishu is handled separately.
					for (const channelName of enabledChannelNames) {
						if (channelName === "feishu") continue;
						const hasLaunchTarget =
							directPeerIdsByChannel[channelName]?.[id] ||
							(channelName === "discord"
								? discordDmAllowFrom[0] || null
								: null);
						addPlatform({
							name: channelName,
							...(hasLaunchTarget && {
								launchPath:
									buildGatewayPlatformLaunchPath(id, channelName) || undefined,
							}),
						});
					}
				}

				// Non-main agents only show channels from explicit bindings.
				if (id !== "main") {
					const seenBindingChannels = new Set<string>();
					for (const binding of bindings) {
						if (binding?.agentId !== id) continue;
						const channelName = binding?.match?.channel;
						if (
							!channelName ||
							channelName === "feishu" ||
							shouldHidePlatformChannel(channelName, channels)
						)
							continue;
						if (seenBindingChannels.has(channelName)) continue;
						seenBindingChannels.add(channelName);
						const hasLaunchTarget =
							directPeerIdsByChannel[channelName]?.[id] || null;
						const accountId =
							typeof binding?.match?.accountId === "string"
								? binding.match.accountId
								: undefined;
						addPlatform({
							name: channelName,
							...(accountId && { accountId }),
							...(hasLaunchTarget && {
								launchPath:
									buildGatewayPlatformLaunchPath(id, channelName) || undefined,
							}),
						});
					}
				}

				return { id, name, emoji, model, launchPath, platforms };
			}),
		);

		// Attach session stats to each agent.
		const agentsWithStatus = agents.map((agent: any) => ({
			...agent,
			session: getAgentSessionStatus(agent.id),
		}));

		// Build a lookup map for group-chat rendering.
		const agentMap: Record<string, { emoji: string; name: string }> = {};
		for (const a of agentsWithStatus)
			agentMap[a.id] = { emoji: a.emoji, name: a.name };

		// Collect group-chat info for all relevant agents.
		const feishuAgentIds = agentsWithStatus
			.filter((a: any) => a.platforms.some((p: any) => p.name === "feishu"))
			.map((a: any) => a.id);
		const groupChats = getGroupChats(
			agentIds,
			agentMap,
			feishuAgentIds,
			sessionsMap,
		);

		const authProviderIds = new Set<string>();
		if (config.auth?.profiles) {
			for (const profileKey of Object.keys(config.auth.profiles)) {
				const profile = config.auth.profiles[profileKey];
				const providerId = profile?.provider || profileKey.split(":")[0];
				if (providerId) authProviderIds.add(providerId);
			}
		}

		// Extract model providers.
		const providers = Object.entries(config.models?.providers || {}).map(
			([providerId, provider]: [string, any]) => {
				const models = (provider.models || []).map((m: any) => ({
					id: m.id,
					name: m.name || m.id,
					contextWindow: m.contextWindow,
					maxTokens: m.maxTokens,
					reasoning: m.reasoning,
					input: m.input,
				}));

				// Find agents using this provider.
				const usedBy = agentsWithStatus
					.filter(
						(a: any) =>
							typeof a.model === "string" &&
							a.model.startsWith(`${providerId}/`),
					)
					.map((a: any) => ({ id: a.id, emoji: a.emoji, name: a.name }));

				return {
					id: providerId,
					api: provider.api,
					accessMode: authProviderIds.has(providerId) ? "auth" : "api_key",
					models,
					usedBy,
				};
			},
		);

		// Always merge inferred provider/model refs from auth.profiles and agents/defaults.
		// This keeps the UI working when models.providers and auth.profiles coexist.
		const providerModels: Record<string, { id: string; name?: string }[]> = {};

		const ensureProvider = (providerId: string) => {
			if (providerId && !providerModels[providerId])
				providerModels[providerId] = [];
		};
		const addModelRef = (modelKey?: string, alias?: string) => {
			if (!modelKey || typeof modelKey !== "string") return;
			const slashIdx = modelKey.indexOf("/");
			if (slashIdx <= 0 || slashIdx >= modelKey.length - 1) return;
			const providerId = modelKey.slice(0, slashIdx);
			const modelId = modelKey.slice(slashIdx + 1);
			ensureProvider(providerId);
			if (!providerModels[providerId].some((m) => m.id === modelId)) {
				providerModels[providerId].push({
					id: modelId,
					...(alias && { name: alias }),
				});
			}
		};

		// Add provider names from auth.profiles.
		for (const providerId of authProviderIds) ensureProvider(providerId);

		// Add model refs from agents.defaults.models.
		const defaultsModels = config.agents?.defaults?.models || {};
		for (const modelKey of Object.keys(defaultsModels)) {
			const alias = defaultsModels[modelKey]?.alias;
			addModelRef(modelKey, alias);
		}

		// Add the primary and fallback model refs.
		addModelRef(defaultModel);
		for (const fallback of fallbacks) addModelRef(fallback);

		// Add each agent's current model ref.
		for (const agent of agentsWithStatus) addModelRef(agent.model);

		for (const [providerId, inferredModels] of Object.entries(providerModels)) {
			let target = providers.find((p: any) => p.id === providerId);
			if (!target) {
				const usedBy = agentsWithStatus
					.filter(
						(a: any) =>
							typeof a.model === "string" &&
							a.model.startsWith(`${providerId}/`),
					)
					.map((a: any) => ({ id: a.id, emoji: a.emoji, name: a.name }));
				target = {
					id: providerId,
					api: undefined,
					accessMode: authProviderIds.has(providerId) ? "auth" : "api_key",
					models: [],
					usedBy,
				};
				providers.push(target);
			}

			// auth profile should take precedence in UI access-mode labeling.
			target.accessMode = authProviderIds.has(providerId)
				? "auth"
				: target.accessMode || "api_key";

			for (const m of inferredModels) {
				const exists = target.models.find((x: any) => x.id === m.id);
				if (!exists) {
					target.models.push({
						id: m.id,
						name: m.name || m.id,
						contextWindow: undefined,
						maxTokens: undefined,
						reasoning: undefined,
						input: undefined,
					});
				} else if (!exists.name) {
					exists.name = m.name || exists.id;
				}
			}
		}

		const data = {
			agents: agentsWithStatus,
			providers,
			defaults: { model: defaultModel, fallbacks },
			gateway: {
				launchPath: buildGatewayHomeLaunchPath(),
			},
			groupChats,
		};
		setConfigCache({ data, ts: Date.now() });
		return NextResponse.json(data);
	} catch (err: any) {
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}
