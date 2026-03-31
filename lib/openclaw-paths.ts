import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = os.homedir();
const DEFAULT_OPENCLAW_HOME = path.join(home, ".openclaw");
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CRON_STORE_PREFERRED_SEGMENTS = ["cron-store", "jobs.json"] as const;
const CRON_STORE_LEGACY_SEGMENTS = ["cron", "jobs.json"] as const;

export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || DEFAULT_OPENCLAW_HOME;
export const OPENCLAW_CONFIG_PATH = path.join(
	/*turbopackIgnore: true*/ OPENCLAW_HOME,
	"openclaw.json",
);
export const OPENCLAW_AGENTS_DIR = path.join(
	/*turbopackIgnore: true*/ OPENCLAW_HOME,
	"agents",
);
export const OPENCLAW_PIXEL_OFFICE_DIR = path.join(
	/*turbopackIgnore: true*/ OPENCLAW_HOME,
	"pixel-office",
);

export type OpenclawPathErrorCode =
	| "openclaw_home_invalid"
	| "openclaw_runtime_path_invalid"
	| "openclaw_config_path_invalid"
	| "openclaw_alerts_path_invalid"
	| "openclaw_agents_path_invalid"
	| "openclaw_cron_store_path_invalid";

export class OpenclawPathError extends Error {
	readonly code: OpenclawPathErrorCode;

	constructor(code: OpenclawPathErrorCode, message: string) {
		super(message);
		this.name = "OpenclawPathError";
		this.code = code;
	}
}

function uniquePaths(paths: Array<string | undefined>): string[] {
	return Array.from(
		new Set(paths.filter((value): value is string => Boolean(value?.trim()))),
	);
}

function normalizeAbsolutePath(value: string): string {
	return path.resolve(/*turbopackIgnore: true*/ value);
}

function expandHomePath(value: string, userHome = home): string {
	if (value === "~") return userHome;
	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(userHome, value.slice(2));
	}
	return value;
}

function hasConfiguredPathOverride(
	value: string | null | undefined,
): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function resolveConfiguredOpenclawHome(
	openclawHome = process.env.OPENCLAW_HOME,
	userHome = home,
): string | null {
	const trimmed = openclawHome?.trim();
	if (!trimmed) {
		return normalizeAbsolutePath(DEFAULT_OPENCLAW_HOME);
	}

	const expanded = expandHomePath(trimmed, userHome);
	if (!path.isAbsolute(expanded)) {
		return null;
	}

	return normalizeAbsolutePath(expanded);
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
	const candidatePath = path.resolve(
		/*turbopackIgnore: true*/ boundaryPath,
		...segments,
	);
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

	const agentsDir = resolveOpenclawAgentsDir(openclawHome);
	if (!agentsDir) return null;
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

export function resolveOpenclawRuntimePath(
	openclawHome = OPENCLAW_HOME,
	...segments: string[]
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome);
	if (!normalizedHome) return null;
	return resolveWithinBoundary(normalizedHome, ...segments);
}

export function resolveOpenclawRuntimeOverridePath(
	rawPath: string | null | undefined,
	openclawHome = OPENCLAW_HOME,
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome);
	if (!normalizedHome || typeof rawPath !== "string" || !rawPath.trim()) {
		return null;
	}

	const trimmed = rawPath.trim();
	const candidatePath = path.isAbsolute(trimmed)
		? path.resolve(trimmed)
		: path.resolve(normalizedHome, trimmed);

	return isPathWithinBoundary(candidatePath, normalizedHome)
		? candidatePath
		: null;
}

export function resolveOpenclawAgentsDir(
	openclawHome = OPENCLAW_HOME,
): string | null {
	return resolveOpenclawRuntimePath(openclawHome, "agents");
}

export function resolveOpenclawConfigFile(
	openclawHome = OPENCLAW_HOME,
): string | null {
	return resolveOpenclawRuntimePath(openclawHome, "openclaw.json");
}

export function resolveConfiguredOpenclawConfigFile(
	openclawHome = process.env.OPENCLAW_HOME,
	rawConfigPath = process.env.OPENCLAW_CONFIG_PATH,
	userHome = home,
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome, userHome);
	if (!normalizedHome) return null;

	if (hasConfiguredPathOverride(rawConfigPath)) {
		return resolveOpenclawRuntimeOverridePath(rawConfigPath, normalizedHome);
	}

	return resolveOpenclawConfigFile(normalizedHome);
}

export function resolveOpenclawAlertsConfigFile(
	openclawHome = OPENCLAW_HOME,
): string | null {
	return resolveOpenclawRuntimePath(openclawHome, "alerts.json");
}

export function resolveConfiguredOpenclawAlertsConfigFile(
	openclawHome = process.env.OPENCLAW_HOME,
	rawAlertsPath = process.env.OPENCLAW_ALERTS_PATH,
	userHome = home,
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome, userHome);
	if (!normalizedHome) return null;

	if (hasConfiguredPathOverride(rawAlertsPath)) {
		return resolveOpenclawRuntimeOverridePath(rawAlertsPath, normalizedHome);
	}

	return resolveOpenclawAlertsConfigFile(normalizedHome);
}

export function resolveOpenclawAgentConfigDir(
	agentId: string,
	openclawHome = OPENCLAW_HOME,
): string | null {
	const agentDir = resolveOpenclawAgentDir(agentId, openclawHome);
	return agentDir ? resolveWithinBoundary(agentDir, "agent") : null;
}

export function resolveOpenclawAgentModelsFile(
	agentId: string,
	openclawHome = OPENCLAW_HOME,
): string | null {
	const agentConfigDir = resolveOpenclawAgentConfigDir(agentId, openclawHome);
	return agentConfigDir
		? resolveWithinBoundary(agentConfigDir, "models.json")
		: null;
}

export function getOpenclawCronStoreBoundaries(
	openclawHome = OPENCLAW_HOME,
): string[] {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome);
	if (!normalizedHome) return [];
	return [
		normalizeAbsolutePath(
			path.join(normalizedHome, CRON_STORE_PREFERRED_SEGMENTS[0]),
		),
		normalizeAbsolutePath(
			path.join(normalizedHome, CRON_STORE_LEGACY_SEGMENTS[0]),
		),
	];
}

export function resolveOpenclawCronStorePath(
	rawStorePath: string | null | undefined,
	openclawHome = OPENCLAW_HOME,
	userHome = home,
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome, userHome);
	if (!normalizedHome) return null;
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

export function resolveConfiguredOpenclawCronStorePath(
	rawStorePath: string | null | undefined,
	openclawHome = process.env.OPENCLAW_HOME,
	userHome = home,
	rawConfiguredStorePath = process.env.OPENCLAW_CRON_STORE_PATH,
): string | null {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome, userHome);
	if (!normalizedHome) return null;

	return resolveOpenclawCronStorePath(
		hasConfiguredPathOverride(rawConfiguredStorePath)
			? rawConfiguredStorePath
			: rawStorePath,
		normalizedHome,
		userHome,
	);
}

function getOpenclawPathErrorMessage(code: OpenclawPathErrorCode): string {
	switch (code) {
		case "openclaw_home_invalid":
			return "OpenClaw runtime root is invalid";
		case "openclaw_config_path_invalid":
			return "OpenClaw runtime config path is invalid";
		case "openclaw_alerts_path_invalid":
			return "OpenClaw alerts config path is invalid";
		case "openclaw_agents_path_invalid":
			return "OpenClaw agents path is invalid";
		case "openclaw_cron_store_path_invalid":
			return "OpenClaw cron store path is invalid";
		default:
			return "OpenClaw runtime path is invalid";
	}
}

function throwOpenclawPathError(code: OpenclawPathErrorCode): never {
	throw new OpenclawPathError(code, getOpenclawPathErrorMessage(code));
}

export function resolveOpenclawHomeOrThrow(
	openclawHome = process.env.OPENCLAW_HOME,
	userHome = home,
): string {
	const normalizedHome = resolveConfiguredOpenclawHome(openclawHome, userHome);
	if (!normalizedHome) {
		throwOpenclawPathError("openclaw_home_invalid");
	}
	return normalizedHome;
}

export function resolveOpenclawRuntimePathOrThrow(
	openclawHome = OPENCLAW_HOME,
	...segments: string[]
): string {
	const runtimePath = resolveOpenclawRuntimePath(openclawHome, ...segments);
	if (!runtimePath) {
		throwOpenclawPathError("openclaw_runtime_path_invalid");
	}
	return runtimePath;
}

export function resolveOpenclawAgentsDirOrThrow(
	openclawHome = OPENCLAW_HOME,
): string {
	const agentsDir = resolveOpenclawAgentsDir(openclawHome);
	if (!agentsDir) {
		throwOpenclawPathError("openclaw_agents_path_invalid");
	}
	return agentsDir;
}

export function resolveOpenclawConfigFileOrThrow(
	openclawHome = process.env.OPENCLAW_HOME,
	rawConfigPath = process.env.OPENCLAW_CONFIG_PATH,
	userHome = home,
): string {
	const configPath = resolveConfiguredOpenclawConfigFile(
		openclawHome,
		rawConfigPath,
		userHome,
	);
	if (!configPath) {
		throwOpenclawPathError("openclaw_config_path_invalid");
	}
	return configPath;
}

export function resolveOpenclawAlertsConfigFileOrThrow(
	openclawHome = process.env.OPENCLAW_HOME,
	rawAlertsPath = process.env.OPENCLAW_ALERTS_PATH,
	userHome = home,
): string {
	const configPath = resolveConfiguredOpenclawAlertsConfigFile(
		openclawHome,
		rawAlertsPath,
		userHome,
	);
	if (!configPath) {
		throwOpenclawPathError("openclaw_alerts_path_invalid");
	}
	return configPath;
}

export function resolveOpenclawCronStorePathOrThrow(
	rawStorePath: string | null | undefined,
	openclawHome = process.env.OPENCLAW_HOME,
	userHome = home,
	rawConfiguredStorePath = process.env.OPENCLAW_CRON_STORE_PATH,
): string {
	const storePath = resolveConfiguredOpenclawCronStorePath(
		rawStorePath,
		openclawHome,
		userHome,
		rawConfiguredStorePath,
	);
	if (!storePath) {
		throwOpenclawPathError("openclaw_cron_store_path_invalid");
	}
	return storePath;
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
