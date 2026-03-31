import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CRON_STORE_PREFERRED_SEGMENTS = ["cron-store", "jobs.json"] as const;
const CRON_STORE_LEGACY_SEGMENTS = ["cron", "jobs.json"] as const;

export const OPENCLAW_HOME =
	process.env.OPENCLAW_HOME || path.join(home, ".openclaw");
export const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");
export const OPENCLAW_AGENTS_DIR = path.join(OPENCLAW_HOME, "agents");
export const OPENCLAW_PIXEL_OFFICE_DIR = path.join(
	OPENCLAW_HOME,
	"pixel-office",
);

function uniquePaths(paths: Array<string | undefined>): string[] {
	return Array.from(
		new Set(paths.filter((value): value is string => Boolean(value?.trim()))),
	);
}

function normalizeAbsolutePath(value: string): string {
	return path.resolve(value);
}

export function isPathWithinBoundary(
	candidatePath: string,
	boundaryPath: string,
): boolean {
	const normalizedCandidate = normalizeAbsolutePath(candidatePath);
	const normalizedBoundary = normalizeAbsolutePath(boundaryPath);

	return (
		normalizedCandidate === normalizedBoundary ||
		normalizedCandidate.startsWith(`${normalizedBoundary}${path.sep}`)
	);
}

function resolveWithinBoundary(
	boundaryPath: string,
	...segments: string[]
): string | null {
	const candidatePath = path.resolve(boundaryPath, ...segments);
	return isPathWithinBoundary(candidatePath, boundaryPath)
		? candidatePath
		: null;
}

export function isValidOpenclawAgentId(agentId: string): boolean {
	return AGENT_ID_PATTERN.test(agentId);
}

export function resolveOpenclawAgentDir(
	agentId: string,
	openclawHome = OPENCLAW_HOME,
): string | null {
	if (!isValidOpenclawAgentId(agentId)) return null;

	const agentsDir = normalizeAbsolutePath(path.join(openclawHome, "agents"));
	return resolveWithinBoundary(agentsDir, agentId);
}

export function resolveOpenclawAgentSessionsDir(
	agentId: string,
	openclawHome = OPENCLAW_HOME,
): string | null {
	const agentDir = resolveOpenclawAgentDir(agentId, openclawHome);
	return agentDir ? resolveWithinBoundary(agentDir, "sessions") : null;
}

export function resolveOpenclawAgentSessionsFile(
	agentId: string,
	openclawHome = OPENCLAW_HOME,
): string | null {
	const sessionsDir = resolveOpenclawAgentSessionsDir(agentId, openclawHome);
	return sessionsDir
		? resolveWithinBoundary(sessionsDir, "sessions.json")
		: null;
}

export function getOpenclawCronStoreBoundaries(
	openclawHome = OPENCLAW_HOME,
): string[] {
	return [
		normalizeAbsolutePath(
			path.join(openclawHome, CRON_STORE_PREFERRED_SEGMENTS[0]),
		),
		normalizeAbsolutePath(
			path.join(openclawHome, CRON_STORE_LEGACY_SEGMENTS[0]),
		),
	];
}

export function resolveOpenclawCronStorePath(
	rawStorePath: string | null | undefined,
	openclawHome = OPENCLAW_HOME,
	userHome = home,
): string | null {
	const normalizedHome = normalizeAbsolutePath(openclawHome);
	const allowedRoots = getOpenclawCronStoreBoundaries(normalizedHome);
	const preferredDefaultPath = path.join(
		normalizedHome,
		...CRON_STORE_PREFERRED_SEGMENTS,
	);
	const legacyDefaultPath = path.join(
		normalizedHome,
		...CRON_STORE_LEGACY_SEGMENTS,
	);

	if (typeof rawStorePath !== "string" || !rawStorePath.trim()) {
		if (
			fs.existsSync(legacyDefaultPath) &&
			!fs.existsSync(preferredDefaultPath)
		) {
			return legacyDefaultPath;
		}
		return preferredDefaultPath;
	}

	const trimmed = rawStorePath.trim();
	const candidatePath = trimmed.startsWith("~")
		? path.resolve(userHome, trimmed.slice(1).replace(/^[/\\]+/, ""))
		: path.resolve(normalizedHome, trimmed);

	return allowedRoots.some((root) => isPathWithinBoundary(candidatePath, root))
		? candidatePath
		: null;
}

export function getOpenclawPackageCandidates(
	version = process.version,
): string[] {
	const appData = process.env.APPDATA;
	const homebrewPrefix = process.env.HOMEBREW_PREFIX;
	const npmPrefix = process.env.npm_config_prefix || process.env.PREFIX;

	return uniquePaths([
		process.env.OPENCLAW_PACKAGE_DIR,
		path.join(home, ".local", "lib", "node_modules", "openclaw"),
		npmPrefix ? path.join(npmPrefix, "node_modules", "openclaw") : undefined,
		path.join(
			home,
			".nvm",
			"versions",
			"node",
			version,
			"lib",
			"node_modules",
			"openclaw",
		),
		path.join(
			home,
			".fnm",
			"node-versions",
			version,
			"installation",
			"lib",
			"node_modules",
			"openclaw",
		),
		path.join(home, ".npm-global", "lib", "node_modules", "openclaw"),
		path.join(
			home,
			".local",
			"share",
			"pnpm",
			"global",
			"5",
			"node_modules",
			"openclaw",
		),
		path.join(
			home,
			"Library",
			"pnpm",
			"global",
			"5",
			"node_modules",
			"openclaw",
		),
		appData ? path.join(appData, "npm", "node_modules", "openclaw") : undefined,
		homebrewPrefix
			? path.join(homebrewPrefix, "lib", "node_modules", "openclaw")
			: undefined,
		"/opt/homebrew/lib/node_modules/openclaw",
		"/usr/local/lib/node_modules/openclaw",
		"/usr/lib/node_modules/openclaw",
	]);
}
