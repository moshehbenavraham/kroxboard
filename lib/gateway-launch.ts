const GATEWAY_PROXY_PREFIX = "/gateway";
const GATEWAY_CHAT_PROXY_PATH = `${GATEWAY_PROXY_PREFIX}/chat`;
const GATEWAY_LAUNCH_PARAM = "launch";
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export type GatewayLaunchTarget =
	| {
			kind: "agent";
			agentId: string;
	  }
	| {
			kind: "platform";
			agentId: string;
			platform: string;
	  }
	| {
			kind: "session";
			sessionKey: string;
	  };

export interface SessionIndexEntry {
	updatedAt?: number;
}

function isSafeIdentifier(value: unknown): value is string {
	return typeof value === "string" && SAFE_IDENTIFIER_RE.test(value);
}

function isSafeSessionKey(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.length > 512) {
		return false;
	}
	if (!value.startsWith("agent:")) return false;
	const parts = value.split(":");
	if (parts.length < 4) return false;
	const [, agentId, platform, ...sessionParts] = parts;
	if (!isSafeIdentifier(agentId) || !isSafeIdentifier(platform)) return false;
	if (sessionParts.length === 0) return false;
	return sessionParts.every(
		(segment) =>
			segment.length > 0 &&
			!segment.includes("/") &&
			!segment.includes("\\") &&
			!hasControlCharacters(segment),
	);
}

function hasControlCharacters(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}

export function isGatewayLaunchTarget(
	value: unknown,
): value is GatewayLaunchTarget {
	if (!value || typeof value !== "object") return false;
	const target = value as Record<string, unknown>;
	if (target.kind === "agent") {
		return isSafeIdentifier(target.agentId);
	}
	if (target.kind === "platform") {
		return (
			isSafeIdentifier(target.agentId) && isSafeIdentifier(target.platform)
		);
	}
	if (target.kind === "session") {
		return isSafeSessionKey(target.sessionKey);
	}
	return false;
}

export function encodeGatewayLaunchTarget(target: GatewayLaunchTarget): string {
	return Buffer.from(JSON.stringify(target), "utf-8").toString("base64url");
}

export function decodeGatewayLaunchTarget(
	encoded: string,
): GatewayLaunchTarget | null {
	try {
		const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
		const parsed = JSON.parse(decoded) as unknown;
		return isGatewayLaunchTarget(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function buildGatewayLaunchPath(target?: GatewayLaunchTarget): string {
	if (!target) return GATEWAY_CHAT_PROXY_PATH;
	const launch = encodeGatewayLaunchTarget(target);
	return `${GATEWAY_CHAT_PROXY_PATH}?${GATEWAY_LAUNCH_PARAM}=${encodeURIComponent(launch)}`;
}

export function buildGatewayHomeLaunchPath(): string {
	return buildGatewayLaunchPath();
}

export function buildGatewayAgentLaunchPath(agentId: string): string | null {
	if (!isSafeIdentifier(agentId)) return null;
	return buildGatewayLaunchPath({ kind: "agent", agentId });
}

export function buildGatewayPlatformLaunchPath(
	agentId: string,
	platform: string,
): string | null {
	if (!isSafeIdentifier(agentId) || !isSafeIdentifier(platform)) return null;
	return buildGatewayLaunchPath({ kind: "platform", agentId, platform });
}

export function buildGatewaySessionLaunchPath(
	sessionKey: string,
): string | null {
	if (!isSafeSessionKey(sessionKey)) return null;
	return buildGatewayLaunchPath({ kind: "session", sessionKey });
}

export function validateGatewayProxyPath(
	pathSegments: string[],
): string[] | null {
	if (!Array.isArray(pathSegments) || pathSegments.length === 0) return null;
	const normalized = pathSegments
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
	if (normalized.length === 0) return null;
	for (const segment of normalized) {
		if (
			segment === "." ||
			segment === ".." ||
			segment.includes("/") ||
			segment.includes("\\") ||
			hasControlCharacters(segment)
		) {
			return null;
		}
	}
	return normalized;
}

export function getLatestDirectSessionKeyFromSessions(
	sessions: Record<string, SessionIndexEntry> | null | undefined,
	platform: string,
): string | null {
	if (!sessions || !isSafeIdentifier(platform)) return null;
	const escapedPlatform = platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern =
		platform === "feishu"
			? /^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/
			: new RegExp(`^agent:[^:]+:${escapedPlatform}:direct:(.+)$`);
	let bestKey: string | null = null;
	let bestUpdatedAt = -1;
	for (const [sessionKey, meta] of Object.entries(sessions)) {
		if (!pattern.test(sessionKey)) continue;
		const updatedAt =
			typeof meta?.updatedAt === "number" && Number.isFinite(meta.updatedAt)
				? meta.updatedAt
				: 0;
		if (updatedAt >= bestUpdatedAt) {
			bestUpdatedAt = updatedAt;
			bestKey = sessionKey;
		}
	}
	return bestKey;
}

export function getGatewayLaunchParamName(): string {
	return GATEWAY_LAUNCH_PARAM;
}
