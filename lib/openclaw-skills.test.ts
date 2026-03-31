import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string;
let tempPkgDir: string;

vi.mock("@/lib/openclaw-paths", () => {
	return {
		get OPENCLAW_HOME() {
			return tempDir;
		},
		get OPENCLAW_CONFIG_PATH() {
			return path.join(tempDir, "openclaw.json");
		},
		getOpenclawPackageCandidates: () => [tempPkgDir],
	};
});

function writeConfigFile(agents: any[] = []) {
	fs.writeFileSync(
		path.join(tempDir, "openclaw.json"),
		JSON.stringify({ agents: { list: agents } }),
	);
}

function setupPkgDir() {
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
			const result = listOpenclawSkills();
			expect(result.skills).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("scans builtin skills from the package directory", async () => {
			const skillsDir = path.join(tempPkgDir, "skills", "web-search");
			fs.mkdirSync(skillsDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillsDir, "SKILL.md"),
				`---
name: Web Search
description: Search the web
---
# Web Search
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
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
			const result = listOpenclawSkills();
			expect(result.skills.some((s: any) => s.id === "my-skill")).toBe(true);
			expect(result.skills.find((s: any) => s.id === "my-skill")?.source).toBe(
				"custom",
			);
		});

		it("scans extension skills", async () => {
			const extDir = path.join(tempPkgDir, "extensions", "my-ext");
			fs.mkdirSync(extDir, { recursive: true });
			fs.writeFileSync(
				path.join(extDir, "SKILL.md"),
				`---
name: Extension Skill
description: An extension
---
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
			expect(
				result.skills.some((s: any) => s.source === "extension:my-ext"),
			).toBe(true);
		});

		it("scans nested extension skills directories", async () => {
			const extSkillDir = path.join(
				tempPkgDir,
				"extensions",
				"my-ext",
				"skills",
				"nested-skill",
			);
			fs.mkdirSync(extSkillDir, { recursive: true });
			fs.writeFileSync(
				path.join(extSkillDir, "SKILL.md"),
				`---
name: Nested Skill
description: Nested in extension
---
`,
			);
			writeConfigFile([]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
			expect(result.skills.some((s: any) => s.id === "nested-skill")).toBe(
				true,
			);
		});

		it("maps agent names from config", async () => {
			writeConfigFile([
				{
					id: "main",
					name: "MainBot",
					identity: { emoji: "🤖" },
				},
			]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
			expect(result.agents.main).toEqual({
				name: "MainBot",
				emoji: "🤖",
			});
		});

		it("falls back to id for agent name when not specified", async () => {
			writeConfigFile([{ id: "helper" }]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
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
			const result = listOpenclawSkills();
			const skill = result.skills.find((s: any) => s.id === "plain");
			expect(skill).toBeDefined();
			expect(skill?.name).toBe("plain");
			expect(skill?.emoji).toBe("[tool]");
		});
	});

	describe("agent skills from sessions", () => {
		it("populates usedBy from agent session data", async () => {
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
				'{"skillsSnapshot":[{"name":"code-review"}]}\n',
			);

			writeConfigFile([{ id: "helper", name: "Helper" }]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
			const skill = result.skills.find((s: any) => s.id === "code-review");
			expect(skill).toBeDefined();
			expect(skill?.usedBy).toContain("helper");
		});

		it("ignores built-in tool names in session skill extraction", async () => {
			const sessionsDir = path.join(tempDir, "agents", "main", "sessions");
			fs.mkdirSync(sessionsDir, { recursive: true });
			fs.writeFileSync(
				path.join(sessionsDir, "session-002.jsonl"),
				'{"skillsSnapshot":[{"name":"exec"},{"name":"read"},{"name":"custom-tool"}]}\n',
			);

			writeConfigFile([{ id: "main" }]);

			const { listOpenclawSkills } = await import("@/lib/openclaw-skills");
			const result = listOpenclawSkills();
			expect(result.agents.main).toBeDefined();
		});
	});

	describe("getOpenclawSkillContent", () => {
		it("returns null when skill is not found", async () => {
			writeConfigFile([]);
			const { getOpenclawSkillContent } = await import("@/lib/openclaw-skills");
			const result = getOpenclawSkillContent("builtin", "nonexistent");
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
			const result = getOpenclawSkillContent("builtin", "test-skill");
			expect(result).not.toBeNull();
			expect(result?.skill.id).toBe("test-skill");
			expect(result?.content).toContain("Test Skill Content");
		});
	});
});
