import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
	it("returns a healthy status", async () => {
		const response = await GET();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe("healthy");
		expect(body.timestamp).toBeDefined();
	});

	it("returns a valid ISO timestamp", async () => {
		const response = await GET();
		const body = await response.json();
		const parsed = new Date(body.timestamp);
		expect(parsed.toISOString()).toBe(body.timestamp);
	});
});
