import { describe, expect, it, vi } from "vitest";

const mockGetOpenclawSkillContent = vi.fn();

vi.mock("@/lib/openclaw-skills", () => ({
	getOpenclawSkillContent: mockGetOpenclawSkillContent,
}));

describe("GET /api/skills/content", () => {
	it("returns 400 when source is missing", async () => {
		const { GET } = await import("./route");
		const response = await GET(
			new Request("http://localhost:3000/api/skills/content?id=test"),
		);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("Missing source or id");
	});

	it("returns 400 when id is missing", async () => {
		const { GET } = await import("./route");
		const response = await GET(
			new Request("http://localhost:3000/api/skills/content?source=builtin"),
		);
		expect(response.status).toBe(400);
	});

	it("returns 404 when skill is not found", async () => {
		mockGetOpenclawSkillContent.mockReturnValue(null);

		const { GET } = await import("./route");
		const response = await GET(
			new Request(
				"http://localhost:3000/api/skills/content?source=builtin&id=nonexistent",
			),
		);
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe("Skill not found");
	});

	it("returns skill content when found", async () => {
		mockGetOpenclawSkillContent.mockReturnValue({
			skill: {
				id: "web_search",
				name: "Web Search",
				source: "builtin",
			},
			content: "# Web Search\nSearch the web.",
		});

		const { GET } = await import("./route");
		const response = await GET(
			new Request(
				"http://localhost:3000/api/skills/content?source=builtin&id=web_search",
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.id).toBe("web_search");
		expect(body.content).toContain("Web Search");
	});

	it("returns 500 when an error is thrown", async () => {
		mockGetOpenclawSkillContent.mockImplementation(() => {
			throw new Error("Read error");
		});

		const { GET } = await import("./route");
		const response = await GET(
			new Request(
				"http://localhost:3000/api/skills/content?source=builtin&id=broken",
			),
		);
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe("Read error");
	});
});
