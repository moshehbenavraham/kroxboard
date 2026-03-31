import fs from "node:fs";
import {
	type GatewayLaunchTarget,
	getLatestDirectSessionKeyFromSessions,
	type SessionIndexEntry,
} from "@/lib/gateway-launch";
import { readJsonFileSync } from "@/lib/json";
import {
	resolveOpenclawAgentSessionsFile,
	resolveOpenclawConfigFileOrThrow,
} from "@/lib/openclaw-paths";

function readAgentSessions(
	agentId: string,
): Record<string, SessionIndexEntry> | null {
	try {
		const sessionsPath = resolveOpenclawAgentSessionsFile(agentId);
		if (!sessionsPath) return null;
		return JSON.parse(fs.readFileSync(sessionsPath, "utf-8")) as Record<
			string,
			SessionIndexEntry
		>;
	} catch {
		return null;
	}
}

function readDiscordFallbackUserId(agentId: string): string | null {
	if (agentId !== "main") return null;
	try {
		const config = readJsonFileSync<any>(resolveOpenclawConfigFileOrThrow());
		const candidate = config?.channels?.discord?.dm?.allowFrom?.[0];
		return typeof candidate === "string" && candidate.trim().length > 0
			? candidate.trim()
			: null;
	} catch {
		return null;
	}
}

export function resolveGatewayLaunchSessionKey(
	target: GatewayLaunchTarget,
): string | null {
	if (target.kind === "session") {
		return target.sessionKey;
	}
	if (target.kind === "agent") {
		return `agent:${target.agentId}:main`;
	}
	const directSessionKey = getLatestDirectSessionKeyFromSessions(
		readAgentSessions(target.agentId),
		target.platform,
	);
	if (directSessionKey) return directSessionKey;
	if (target.platform !== "discord") return null;
	const fallbackUserId = readDiscordFallbackUserId(target.agentId);
	return fallbackUserId
		? `agent:${target.agentId}:${target.platform}:direct:${fallbackUserId}`
		: null;
}
