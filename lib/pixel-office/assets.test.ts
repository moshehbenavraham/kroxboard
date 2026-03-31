import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listPixelOfficeCharacterSprites } from "./assets";

describe("listPixelOfficeCharacterSprites", () => {
	let tempDir = "";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-office-assets-"));
		fs.mkdirSync(
			path.join(tempDir, "public", "assets", "pixel-office", "characters"),
			{
				recursive: true,
			},
		);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns numerically sorted character sprite urls", () => {
		const charactersDir = path.join(
			tempDir,
			"public",
			"assets",
			"pixel-office",
			"characters",
		);
		fs.writeFileSync(path.join(charactersDir, "char_10.png"), "");
		fs.writeFileSync(path.join(charactersDir, "char_2.png"), "");
		fs.writeFileSync(path.join(charactersDir, "char_1.png"), "");
		fs.writeFileSync(path.join(charactersDir, "readme.txt"), "");
		fs.mkdirSync(path.join(charactersDir, "nested"));

		expect(listPixelOfficeCharacterSprites(tempDir)).toEqual([
			"/assets/pixel-office/characters/char_1.png",
			"/assets/pixel-office/characters/char_2.png",
			"/assets/pixel-office/characters/char_10.png",
		]);
	});
});
