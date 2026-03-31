import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir = "";
let tempPkgDir = "";

vi.mock("@/lib/openclaw-paths", () => ({
	get OPENCLAW_HOME() {
		return tempDir;
	},
	get OPENCLAW_CONFIG_PATH() {
		return path.join(tempDir, "openclaw.json");
	},
	getOpenclawPackageCandidates: () => [tempPkgDir],
}));

function writeConfigFile(agents: unknown[] = []): void {
	fs.writeFileSync(
		path.join(tempDir, "openclaw.json"),
		JSON.stringify({ agents: { list: agents } }),
	);
}

function setupPkgDir(): void {
	fs.writeFileSync(
		path.join(tempPkgDir, "package.json"),
		JSON.stringify({ name: "openclaw" }),
	);
}

describe("openclaw-skills", () => {
	beforeEach(() => {
		vi.resetModules();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-home-"));
		tempPkgDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-pkg-"));
		setupPkgDir();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		fs.rmSync(tempPkgDir, { recursive: true, force: true });
	});

	describe("listOpenclawSkills", () => {
		it("returns empty skills when no skill directories exist", async () => {
			writeConfigFile([]);
			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.skills).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("scans builtin skills from the package directory", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "web-search");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				`---
name: Web Search
description: Search the web
---
# Web Search
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.skills).toHaveLength(1);
			expect(result.skills[0].id).toBe("web-search");
			expect(result.skills[0].name).toBe("Web Search");
			expect(result.skills[0].source).toBe("builtin");
		});

		it("scans custom skills from OPENCLAW_HOME/skills", async () => {
			const customDir = path.join(tempDir, "skills", "my-skill");
			fs.mkdirSync(customDir, { recursive: true });
			fs.writeFileSync(
				path.join(customDir, "SKILL.md"),
				`---
name: My Skill
description: A custom skill
---
# My Skill
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.skills.some((skill) => skill.id === "my-skill")).toBe(true);
			expect(
				result.skills.find((skill) => skill.id === "my-skill")?.source,
			).toBe("custom");
		});

		it("scans extension skills and nested extension skills directories", async () => {
			const extensionDir = path.join(tempPkgDir, "extensions", "my-ext");
			const nestedSkillDir = path.join(extensionDir, "skills", "nested-skill");
			fs.mkdirSync(nestedSkillDir, { recursive: true });
			fs.writeFileSync(
				path.join(extensionDir, "SKILL.md"),
				`---
name: Extension Skill
description: An extension
---
`,
			);
			fs.writeFileSync(
				path.join(nestedSkillDir, "SKILL.md"),
				`---
name: Nested Skill
description: Nested in extension
---
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(
				result.skills.some((skill) => skill.source === "extension:my-ext"),
			).toBe(true);
			expect(result.skills.some((skill) => skill.id === "nested-skill")).toBe(
				true,
			);
		});

		it("maps agent names from config", async () => {
			writeConfigFile([
				{
					id: "main",
					name: "MainBot",
					identity: { emoji: ":bot:" },
				},
			]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.agents.main).toEqual({
				name: "MainBot",
				emoji: ":bot:",
			});
		});

		it("falls back to id for agent name when not specified", async () => {
			writeConfigFile([{ id: "helper" }]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.agents.helper.name).toBe("helper");
		});

		it("handles SKILL.md without frontmatter", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "plain");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"# Plain Skill\nJust text, no frontmatter.",
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			const skill = result.skills.find((entry) => entry.id === "plain");
			expect(skill).toBeDefined();
			expect(skill?.name).toBe("plain");
			expect(skill?.emoji).toBe("[tool]");
		});

		it("falls back to the first package candidate and default metadata when frontmatter is incomplete", async () => {
			fs.rmSync(path.join(tempPkgDir, "package.json"));
			const skillDir = path.join(tempPkgDir, "skills", "partial-frontmatter");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: Broken frontmatter",
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			const skill = result.skills.find(
				(entry) => entry.id === "partial-frontmatter",
			);
			expect(skill).toBeDefined();
			expect(skill?.name).toBe("partial-frontmatter");
			expect(skill?.emoji).toBe("[tool]");
		});

		it("reads custom skills and preserves emoji metadata from frontmatter", async () => {
			const skillDir = path.join(tempDir, "skills", "emoji-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				`---
name: Emoji Skill
description: With emoji
"emoji": ":zap:"
---
# Emoji Skill
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills, getOpenclawSkillContent } = await import(
				"@/lib/openclaw-skills"
			);
			const list = await listOpenclawSkills();
			expect(
				list.skills.find((skill) => skill.id === "emoji-skill")?.emoji,
			).toBe(":zap:");

			const content = await getOpenclawSkillContent("custom", "emoji-skill");
			expect(content?.skill.emoji).toBe(":zap:");
		});

		it("ignores malformed snapshots and oversize snapshot files while collecting usedBy hints", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "code-review");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, "SKILL.md"),
				"---\nname: Code Review\ndescription: Reviews code\n---\n# Code Review\n",
			);

			const sessionsDir = path.join(tempDir, "agents", "helper", "sessions");
			fs.mkdirSync(sessionsDir, { recursive: true });
			fs.writeFileSync(
				path.join(sessionsDir, "session-001.jsonl"),
				'{"skillsSnapshot":[{"name"',
			);
			fs.writeFileSync(
				path.join(sessionsDir, "session-002.jsonl"),
				"x".repeat(262_145),
			);
			fs.writeFileSync(
				path.join(sessionsDir, "session-003.jsonl"),
				'{"skillsSnapshot":[{"name":"code-review"},{"name":"exec"}]}\n',
			);
			writeConfigFile([{ id: "helper", name: "Helper" }]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			const skill = result.skills.find((entry) => entry.id === "code-review");
			expect(skill?.usedBy).toEqual(["helper"]);
		});

		it("excludes oversize skill files from the skills listing", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "huge-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), "A".repeat(131_073));
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = await listOpenclawSkills();
			expect(result.skills).toEqual([]);
		});

		it("ignores malformed config payloads and malformed agent entries", async () => {
			fs.writeFileSync(path.join(tempDir, "openclaw.json"), JSON.stringify([]));
			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			await expect(listOpenclawSkills()).resolves.toMatchObject({
				agents: {},
			});

			fs.writeFileSync(
				path.join(tempDir, "openclaw.json"),
				JSON.stringify({
					agents: {
						list: [
							null,
							{ id: "", name: "ignored" },
							{ id: "helper", identity: { name: "  ", emoji: "   " } },
						],
					},
				}),
			);

			const result = await listOpenclawSkills();
			expect(result.agents.helper).toEqual({
				name: "helper",
				emoji: "[bot]",
			});
		});
	});

	describe("getOpenclawSkillContent", () => {
		it("returns null when skill is not found", async () => {
			writeConfigFile([]);
			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			const result = await getOpenclawSkillContent("builtin", "nonexistent");
			expect(result).toBeNull();
		});

		it("returns skill content when found", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "test-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			const content = `---
name: Test Skill
description: For testing
---
# Test Skill Content
`;
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
			writeConfigFile([]);

			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			const result = await getOpenclawSkillContent("builtin", "test-skill");
			expect(result).not.toBeNull();
			expect(result?.skill.id).toBe("test-skill");
			expect(result?.content).toContain("Test Skill Content");
		});

		it("rejects oversize skill content reads", async () => {
			const skillDir = path.join(tempPkgDir, "skills", "huge-skill");
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), "A".repeat(131_073));
			writeConfigFile([]);

			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			await expect(
				getOpenclawSkillContent("builtin", "huge-skill"),
			).rejects.toMatchObject({
				code: "file_too_large",
			});
		});

		it("returns extension root content when the id matches the extension name", async () => {
			const extensionDir = path.join(tempPkgDir, "extensions", "root-ext");
			fs.mkdirSync(extensionDir, { recursive: true });
			fs.writeFileSync(
				path.join(extensionDir, "SKILL.md"),
				"---\nname: Root Extension\ndescription: Root skill\n---\n# Root Extension\n",
			);
			writeConfigFile([]);

			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			const result = await getOpenclawSkillContent(
				"extension:root-ext",
				"root-ext",
			);
			expect(result?.skill.id).toBe("root-ext");
			expect(result?.content).toContain("Root Extension");
		});

		it("returns null for unsupported skill sources", async () => {
			writeConfigFile([]);
			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			await expect(
				getOpenclawSkillContent("unsupported", "whatever"),
			).resolves.toBeNull();
		});
	});
});
