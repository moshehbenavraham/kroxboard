import path from "node:path";
import { parseJsonText } from "@/lib/json";
import {
	getOpenclawPackageCandidates,
	OPENCLAW_HOME,
	resolveConfiguredOpenclawConfigFile,
} from "@/lib/openclaw-paths";
import {
	listBoundedDirectory,
	OpenclawReadPathError,
	readBoundedTextFile,
} from "@/lib/openclaw-read-paths";

const MAX_AGENT_COUNT = 128;
const MAX_CONFIG_FILE_BYTES = 1_048_576;
const MAX_SESSION_FILES_PER_AGENT = 256;
const MAX_SESSION_SNAPSHOT_BYTES = 262_144;
const MAX_SKILL_DIR_ENTRIES = 128;
const MAX_SKILL_FILE_BYTES = 131_072;
const MAX_SKILL_SNAPSHOT_FILES = 3;

const BUILTIN_TOOL_NAMES = new Set([
	"exec",
	"read",
	"edit",
	"write",
	"process",
	"message",
	"web_search",
	"web_fetch",
	"browser",
	"tts",
	"gateway",
	"memory_search",
	"memory_get",
	"cron",
	"nodes",
	"canvas",
	"session_status",
	"sessions_list",
	"sessions_history",
	"sessions_send",
	"sessions_spawn",
	"agents_list",
]);

let openclawPackagePromise: Promise<string> | null = null;

export interface SkillInfo {
	id: string;
	name: string;
	description: string;
	emoji: string;
	source: string;
	usedBy: string[];
}

export interface SkillAgentInfo {
	name: string;
	emoji: string;
}

interface ResolvedSkillInfo extends SkillInfo {
	location: string;
}

interface OpenclawAgentConfig {
	id?: unknown;
	identity?: unknown;
	name?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFrontmatter(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	if (!content.startsWith("---")) return result;
	const parts = content.split("---", 3);
	if (parts.length < 3) return result;
	const frontmatter = parts[1];

	const nameMatch = frontmatter.match(/^name:\s*(.+)/m);
	if (nameMatch) {
		result.name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
	}

	const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m);
	if (descMatch) {
		result.description = descMatch[1].trim().replace(/^["']|["']$/g, "");
	}

	const emojiMatch = frontmatter.match(/"emoji":\s*"([^"]+)"/);
	if (emojiMatch) {
		result.emoji = emojiMatch[1];
	}

	return result;
}

function buildResolvedSkillInfo(
	content: string,
	source: string,
	id: string,
	location: string,
): ResolvedSkillInfo {
	const frontmatter = parseFrontmatter(content);
	return {
		id,
		name: frontmatter.name || id,
		description: frontmatter.description || "",
		emoji: frontmatter.emoji || "[tool]",
		source,
		location,
		usedBy: [],
	};
}

async function findOpenclawPkg(): Promise<string> {
	const candidates = getOpenclawPackageCandidates();
	for (const candidate of candidates) {
		const packageJson = await readBoundedTextFile(
			path.join(candidate, "package.json"),
			{
				allowMissing: true,
				maxBytes: MAX_CONFIG_FILE_BYTES,
			},
		);
		if (packageJson) {
			return candidate;
		}
	}

	return candidates[0] ?? OPENCLAW_HOME;
}

async function getOpenclawPkg(): Promise<string> {
	if (!openclawPackagePromise) {
		openclawPackagePromise = findOpenclawPkg();
	}
	return openclawPackagePromise;
}

async function readSkillFile(
	skillMdPath: string,
	source: string,
	id = path.basename(path.dirname(skillMdPath)),
): Promise<ResolvedSkillInfo | null> {
	try {
		const content = await readBoundedTextFile(skillMdPath, {
			allowMissing: true,
			maxBytes: MAX_SKILL_FILE_BYTES,
		});
		if (!content) {
			return null;
		}
		return buildResolvedSkillInfo(content, source, id, skillMdPath);
	} catch (error) {
		if (error instanceof OpenclawReadPathError) {
			return null;
		}
		throw error;
	}
}

async function scanSkillsDir(
	dirPath: string,
	source: string,
): Promise<ResolvedSkillInfo[]> {
	const skillNames = await listBoundedDirectory(dirPath, {
		allowMissing: true,
		filter: (entry) => entry.isDirectory(),
		maxEntries: MAX_SKILL_DIR_ENTRIES,
	});

	const resolvedSkills = await Promise.all(
		skillNames.map((name) =>
			readSkillFile(path.join(dirPath, name, "SKILL.md"), source, name),
		),
	);

	return resolvedSkills.filter(
		(skill): skill is ResolvedSkillInfo => skill !== null,
	);
}

function extractSkillNames(snapshotChunk: string): Set<string> {
	const skillNames = new Set<string>();
	const matches = snapshotChunk.matchAll(/\\?"name\\?":\s*\\?"([^"\\]+)\\?"/g);

	for (const match of matches) {
		const name = match[1];
		if (
			name.length > 1 &&
			!BUILTIN_TOOL_NAMES.has(name) &&
			!/[/\\]/.test(name)
		) {
			skillNames.add(name);
		}
	}

	return skillNames;
}

async function getAgentSkillsFromSessions(): Promise<
	Record<string, Set<string>>
> {
	const agentsDir = path.join(OPENCLAW_HOME, "agents");
	const agentIds = await listBoundedDirectory(agentsDir, {
		allowMissing: true,
		filter: (entry) => entry.isDirectory(),
		maxEntries: MAX_AGENT_COUNT,
	});

	const result: Record<string, Set<string>> = {};

	await Promise.all(
		agentIds.map(async (agentId) => {
			const sessionsDir = path.join(agentsDir, agentId, "sessions");
			let recentSessionFiles: string[];
			try {
				recentSessionFiles = (
					await listBoundedDirectory(sessionsDir, {
						allowMissing: true,
						filter: (entry) => entry.isFile() && entry.name.endsWith(".jsonl"),
						maxEntries: MAX_SESSION_FILES_PER_AGENT,
					})
				).slice(-MAX_SKILL_SNAPSHOT_FILES);
			} catch (error) {
				if (error instanceof OpenclawReadPathError) {
					return;
				}
				throw error;
			}

			const skillNames = new Set<string>();
			for (const fileName of recentSessionFiles) {
				try {
					const content = await readBoundedTextFile(
						path.join(sessionsDir, fileName),
						{
							allowMissing: true,
							maxBytes: MAX_SESSION_SNAPSHOT_BYTES,
						},
					);
					if (!content) {
						continue;
					}

					const snapshotIndex = content.indexOf("skillsSnapshot");
					if (snapshotIndex < 0) {
						continue;
					}

					const snapshotChunk = content.slice(
						snapshotIndex,
						snapshotIndex + 5000,
					);
					for (const skillName of extractSkillNames(snapshotChunk)) {
						skillNames.add(skillName);
					}
				} catch (error) {
					if (error instanceof OpenclawReadPathError) {
						continue;
					}
					throw error;
				}
			}

			if (skillNames.size > 0) {
				result[agentId] = skillNames;
			}
		}),
	);

	return result;
}

function buildAgentsMap(config: unknown): Record<string, SkillAgentInfo> {
	if (!isRecord(config)) {
		return {};
	}

	const agentsValue = config.agents;
	if (!isRecord(agentsValue) || !Array.isArray(agentsValue.list)) {
		return {};
	}

	const agents: Record<string, SkillAgentInfo> = {};
	for (const rawAgent of agentsValue.list as OpenclawAgentConfig[]) {
		if (
			!isRecord(rawAgent) ||
			typeof rawAgent.id !== "string" ||
			!rawAgent.id
		) {
			continue;
		}

		const identity = isRecord(rawAgent.identity) ? rawAgent.identity : null;
		agents[rawAgent.id] = {
			name:
				typeof identity?.name === "string" && identity.name.trim()
					? identity.name
					: typeof rawAgent.name === "string" && rawAgent.name.trim()
						? rawAgent.name
						: rawAgent.id,
			emoji:
				typeof identity?.emoji === "string" && identity.emoji.trim()
					? identity.emoji
					: "[bot]",
		};
	}

	return agents;
}

async function readAgentsFromConfig(): Promise<Record<string, SkillAgentInfo>> {
	const configPath = resolveConfiguredOpenclawConfigFile();
	if (!configPath) {
		return {};
	}

	const rawConfig = await readBoundedTextFile(configPath, {
		maxBytes: MAX_CONFIG_FILE_BYTES,
	});
	if (!rawConfig) {
		return {};
	}
	return buildAgentsMap(parseJsonText(rawConfig));
}

async function listResolvedOpenclawSkills(): Promise<{
	agents: Record<string, SkillAgentInfo>;
	skills: ResolvedSkillInfo[];
	total: number;
}> {
	const openclawPkg = await getOpenclawPkg();
	const builtinSkills = await scanSkillsDir(
		path.join(openclawPkg, "skills"),
		"builtin",
	);

	const extensionsDir = path.join(openclawPkg, "extensions");
	const extensionNames = await listBoundedDirectory(extensionsDir, {
		allowMissing: true,
		filter: (entry) => entry.isDirectory(),
		maxEntries: MAX_SKILL_DIR_ENTRIES,
	});

	const extensionSkillGroups = await Promise.all(
		extensionNames.map(async (extensionName) => {
			const extensionPath = path.join(extensionsDir, extensionName);
			const source = `extension:${extensionName}`;
			const rootSkill = await readSkillFile(
				path.join(extensionPath, "SKILL.md"),
				source,
				extensionName,
			);
			const nestedSkills = await scanSkillsDir(
				path.join(extensionPath, "skills"),
				source,
			);
			return rootSkill ? [rootSkill, ...nestedSkills] : nestedSkills;
		}),
	);

	const customSkills = await scanSkillsDir(
		path.join(OPENCLAW_HOME, "skills"),
		"custom",
	);
	const allSkills = [
		...builtinSkills,
		...extensionSkillGroups.flat(),
		...customSkills,
	];

	const agentSkills = await getAgentSkillsFromSessions();
	for (const skill of allSkills) {
		for (const [agentId, usedSkills] of Object.entries(agentSkills)) {
			if (usedSkills.has(skill.id) || usedSkills.has(skill.name)) {
				skill.usedBy.push(agentId);
			}
		}
		skill.usedBy.sort();
	}

	const agents = await readAgentsFromConfig();

	return {
		skills: allSkills,
		agents,
		total: allSkills.length,
	};
}

async function resolveSkillCandidatePaths(
	source: string,
	id: string,
): Promise<string[]> {
	const openclawPkg = await getOpenclawPkg();

	if (source === "builtin") {
		return [path.join(openclawPkg, "skills", id, "SKILL.md")];
	}

	if (source === "custom") {
		return [path.join(OPENCLAW_HOME, "skills", id, "SKILL.md")];
	}

	if (!source.startsWith("extension:")) {
		return [];
	}

	const extensionName = source.slice("extension:".length);
	const extensionBaseDir = path.join(openclawPkg, "extensions", extensionName);
	const candidates = [path.join(extensionBaseDir, "skills", id, "SKILL.md")];
	if (id === extensionName) {
		candidates.unshift(path.join(extensionBaseDir, "SKILL.md"));
	}
	return candidates;
}

export async function listOpenclawSkills(): Promise<{
	agents: Record<string, SkillAgentInfo>;
	skills: SkillInfo[];
	total: number;
}> {
	const { skills, agents, total } = await listResolvedOpenclawSkills();
	return {
		skills: skills.map(({ location: _location, ...skill }) => skill),
		agents,
		total,
	};
}

export async function getOpenclawSkillContent(
	source: string,
	id: string,
): Promise<{ skill: SkillInfo; content: string } | null> {
	const { skills } = await listResolvedOpenclawSkills();
	const candidatePaths = await resolveSkillCandidatePaths(source, id);

	for (const candidatePath of candidatePaths) {
		const content = await readBoundedTextFile(candidatePath, {
			allowMissing: true,
			maxBytes: MAX_SKILL_FILE_BYTES,
		});
		if (!content) {
			continue;
		}

		const existingSkill = skills.find(
			(skill) => skill.location === candidatePath,
		);
		const resolvedSkill =
			existingSkill ??
			buildResolvedSkillInfo(content, source, id, candidatePath);
		const { location: _location, ...safeSkill } = resolvedSkill;
		return {
			skill: safeSkill,
			content,
		};
	}

	return null;
}
