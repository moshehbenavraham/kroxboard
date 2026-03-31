import fs from "node:fs";
import path from "node:path";

const CHARACTER_SPRITE_PATTERN = /^char_(\d+)\.png$/;

export function listPixelOfficeCharacterSprites(
	rootDir = process.cwd(),
): string[] {
	const charactersDir = path.join(
		rootDir,
		"public",
		"assets",
		"pixel-office",
		"characters",
	);

	return fs
		.readdirSync(charactersDir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const match = CHARACTER_SPRITE_PATTERN.exec(entry.name);
			if (!match) return null;

			return {
				id: Number.parseInt(match[1], 10),
				url: `/assets/pixel-office/characters/${entry.name}`,
			};
		})
		.filter((entry) => entry !== null)
		.sort((left, right) => left.id - right.id)
		.map((entry) => entry.url);
}
