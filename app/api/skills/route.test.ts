import { describe, expect, it, vi } from "vitest";

const mockListOpenclawSkills = vi.fn();

vi.mock("@/lib/openclaw-skills", () => ({
	listOpenclawSkills: mockListOpenclawSkills,
}));

describe("GET /api/skills", () => {
	it("returns skills from listOpenclawSkills", async () => {
		mockListOpenclawSkills.mockReturnValue({
			skills: [
				{
					id: "web_search",
					name: "Web Search",
					description: "Search the web",
					emoji: "W",
					source: "builtin",
					usedBy: [],
				},
			],
			agents: {},
			total: 1,
		});

		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.skills).toHaveLength(1);
		expect(body.skills[0].id).toBe("web_search");
		expect(body.skills[0].location).toBeUndefined();
	});

	it("returns 500 when listOpenclawSkills throws", async () => {
		mockListOpenclawSkills.mockImplementation(() => {
			throw new Error("Config not found");
		});

		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("Config not found");
	});
});
