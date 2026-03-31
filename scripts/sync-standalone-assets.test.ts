import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncStandaloneAssets } from "./sync-standalone-assets.mjs";

describe("syncStandaloneAssets", () => {
	let tempDir = "";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "standalone-assets-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("copies hashed Next.js assets into the standalone runtime tree", async () => {
		const sourceStaticDir = path.join(tempDir, ".next", "static", "chunks");
		const destinationStaticDir = path.join(
			tempDir,
			".next",
			"standalone",
			".next",
			"static",
			"chunks",
		);

		fs.mkdirSync(sourceStaticDir, { recursive: true });
		fs.mkdirSync(destinationStaticDir, { recursive: true });

		fs.writeFileSync(path.join(sourceStaticDir, "app.js"), "new chunk");
		fs.writeFileSync(
			path.join(destinationStaticDir, "stale.js"),
			"stale chunk",
		);

		await expect(syncStandaloneAssets(tempDir)).resolves.toEqual([
			".next/static",
		]);

		expect(
			fs.readFileSync(path.join(destinationStaticDir, "app.js"), "utf8"),
		).toBe("new chunk");
		expect(fs.existsSync(path.join(destinationStaticDir, "stale.js"))).toBe(
			false,
		);
	});

	it("copies public assets when the project has a public directory", async () => {
		const sourceStaticDir = path.join(tempDir, ".next", "static", "chunks");
		const sourcePublicDir = path.join(tempDir, "public", "assets");
		const destinationPublicFile = path.join(
			tempDir,
			".next",
			"standalone",
			"public",
			"assets",
			"logo.svg",
		);

		fs.mkdirSync(path.join(tempDir, ".next", "standalone", ".next"), {
			recursive: true,
		});
		fs.mkdirSync(sourceStaticDir, { recursive: true });
		fs.mkdirSync(sourcePublicDir, { recursive: true });

		fs.writeFileSync(path.join(sourceStaticDir, "app.js"), "new chunk");
		fs.writeFileSync(path.join(sourcePublicDir, "logo.svg"), "<svg />");

		await expect(syncStandaloneAssets(tempDir)).resolves.toEqual([
			".next/static",
			"public",
		]);

		expect(fs.readFileSync(destinationPublicFile, "utf8")).toBe("<svg />");
	});

	it("fails fast when the standalone build output is missing", async () => {
		await expect(syncStandaloneAssets(tempDir)).rejects.toThrow(
			'Run "next build" before syncing assets.',
		);
	});
});
