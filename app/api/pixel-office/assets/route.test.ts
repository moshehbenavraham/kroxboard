import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listPixelOfficeCharacterSprites = vi.fn();

vi.mock("@/lib/pixel-office/assets", () => ({
	listPixelOfficeCharacterSprites,
}));

describe("GET /api/pixel-office/assets", () => {
	beforeEach(() => {
		vi.resetModules();
		listPixelOfficeCharacterSprites.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns the available character sprite urls", async () => {
		listPixelOfficeCharacterSprites.mockReturnValue([
			"/assets/pixel-office/characters/char_0.png",
			"/assets/pixel-office/characters/char_8.png",
		]);
		const route = await import("./route");
		const response = await route.GET();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			characters: [
				"/assets/pixel-office/characters/char_0.png",
				"/assets/pixel-office/characters/char_8.png",
			],
		});
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=300, stale-while-revalidate=3600",
		);
	});

	it("returns a sanitized failure when asset discovery throws", async () => {
		listPixelOfficeCharacterSprites.mockImplementation(() => {
			throw new Error("boom");
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const route = await import("./route");
		const response = await route.GET();

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Pixel office assets unavailable",
		});
		expect(errorSpy).toHaveBeenCalledWith(
			"[pixel-office/assets] failed",
			expect.any(Error),
		);
	});
});
