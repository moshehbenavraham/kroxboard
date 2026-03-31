import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	isValidOpenclawAgentId,
	OPENCLAW_CONFIG_PATH,
	OPENCLAW_HOME,
	resolveOpenclawAgentSessionsFile,
} from "@/lib/openclaw-paths";
import { shouldHidePlatformChannel } from "@/lib/platforms";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import {
	parseApiJsonSafely,
	shouldFallbackToCli,
	testSessionViaCli,
} from "@/lib/session-test-fallback";

const CONFIG_PATH = OPENCLAW_CONFIG_PATH;

interface DmSessionResult {
	agentId: string;
	platform: string;
	ok: boolean;
	detail?: string;
	error?: string;
	elapsed: number;
}

function readAgentSessions(agentId: string): Record<string, unknown> | null {
	const sessionsPath = resolveOpenclawAgentSessionsFile(agentId);
	if (!sessionsPath || !fs.existsSync(sessionsPath)) return null;

	try {
		const raw = fs.readFileSync(sessionsPath, "utf-8");
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function getDmUser(agentId: string, platform: string): string | null {
	const sessions = readAgentSessions(agentId);
	if (!sessions) return null;

	let bestId: string | null = null;
	let bestTime = 0;
	const pattern =
		platform === "feishu"
			? /^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/
			: new RegExp(`^agent:[^:]+:${platform}:direct:(.+)$`);
	for (const [key, val] of Object.entries(sessions)) {
		const m = key.match(pattern);
		if (m) {
			const updatedAt = (val as any).updatedAt || 0;
			if (updatedAt > bestTime) {
				bestTime = updatedAt;
				bestId = m[1];
			}
		}
	}
	return bestId;
}

async function testDmSession(
	agentId: string,
	platform: string,
	sessionKey: string,
	gatewayPort: number,
	gatewayToken: string,
): Promise<DmSessionResult> {
	const startTime = Date.now();
	try {
		const resp = await fetch(
			`http://127.0.0.1:${gatewayPort}/v1/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${gatewayToken}`,
					"x-openclaw-agent-id": agentId,
					"x-openclaw-session-key": sessionKey,
				},
				body: JSON.stringify({
					model: `openclaw:${agentId}`,
					messages: [{ role: "user", content: "Health check: reply with OK" }],
					max_tokens: 64,
				}),
				signal: AbortSignal.timeout(100000),
			},
		);

		const rawText = await resp.text();
		const data = parseApiJsonSafely(rawText);
		const elapsed = Date.now() - startTime;

		if (!resp.ok) {
			if (shouldFallbackToCli(resp, rawText)) {
				const fallback = await testSessionViaCli(agentId);
				return fallback.ok
					? {
							agentId,
							platform,
							ok: true,
							detail: `${fallback.reply || "OK"} | DM fallback`,
							elapsed: fallback.elapsed,
						}
					: {
							agentId,
							platform,
							ok: false,
							error: fallback.error || "Gateway route not found",
							elapsed: fallback.elapsed,
						};
			}
			return {
				agentId,
				platform,
				ok: false,
				error: data?.error?.message || rawText || JSON.stringify(data),
				elapsed,
			};
		}

		const reply = data.choices?.[0]?.message?.content || "";
		return {
			agentId,
			platform,
			ok: true,
			detail: reply.slice(0, 200) || "(no reply)",
			elapsed,
		};
	} catch (err: any) {
		return {
			agentId,
			platform,
			ok: false,
			error: err.message,
			elapsed: Date.now() - startTime,
		};
	}
}

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_OUTBOUND_TESTS");
	if (!feature.ok) return feature.response;
	const rateLimit = enforceDiagnosticRateLimit(
		request,
		"dm_session_diagnostic_batch",
	);
	if (!rateLimit.ok) return rateLimit.response;

	try {
		const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
		const config = JSON.parse(raw);
		const gatewayPort = config.gateway?.port || 18789;
		const gatewayToken = config.gateway?.auth?.token || "";
		const channels = config.channels || {};
		const bindings = config.bindings || [];

		let agentList = Array.isArray(config.agents?.list)
			? config.agents.list.filter(
					(agent: any) =>
						agent &&
						typeof agent.id === "string" &&
						isValidOpenclawAgentId(agent.id.trim()),
				)
			: [];
		if (agentList.length === 0) {
			try {
				const agentsDir = path.join(
					/*turbopackIgnore: true*/ OPENCLAW_HOME,
					"agents",
				);
				const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
				agentList = dirs
					.filter(
						(d: any) =>
							d.isDirectory() &&
							!d.name.startsWith(".") &&
							isValidOpenclawAgentId(d.name),
					)
					.map((d: any) => ({ id: d.name }));
			} catch {}
			if (agentList.length === 0) agentList = [{ id: "main" }];
		}

		const results: DmSessionResult[] = [];
		const platformsToTest = Array.from(
			new Set([
				...Object.entries(channels)
					.filter(
						([name, cfg]) =>
							cfg &&
							typeof cfg === "object" &&
							(cfg as any).enabled !== false &&
							!shouldHidePlatformChannel(name, channels),
					)
					.map(([name]) => name),
				...bindings
					.map((b: any) => b?.match?.channel)
					.filter(
						(name: unknown): name is string =>
							typeof name === "string" &&
							name.length > 0 &&
							!shouldHidePlatformChannel(name, channels),
					),
			]),
		);

		for (const agent of agentList) {
			const id = agent.id;
			for (const platform of platformsToTest) {
				const ch = channels[platform];
				if (ch && ch.enabled === false) continue;

				const isMain = id === "main";
				const hasBinding = bindings.some(
					(b: any) => b.agentId === id && b.match?.channel === platform,
				);
				if (!isMain && !hasBinding) continue;

				const dmUser = getDmUser(id, platform);
				if (!dmUser) continue;

				const sessionKey = `agent:${id}:${platform}:direct:${dmUser}`;
				const r = await testDmSession(
					id,
					platform,
					sessionKey,
					gatewayPort,
					gatewayToken,
				);
				results.push(r);
			}
		}

		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ results }),
			rateLimit.metadata,
		);
	} catch (_err: any) {
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ error: "DM diagnostics failed" }, { status: 500 }),
			rateLimit.metadata,
		);
	}
}
