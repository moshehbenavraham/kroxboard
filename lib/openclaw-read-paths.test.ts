import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getCachedComputation,
	listBoundedDirectory,
	readBoundedTextFile,
	resetOpenclawReadPathState,
} from "@/lib/openclaw-read-paths";

describe("openclaw-read-paths", () => {
	let tempDir = "";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-paths-"));
		resetOpenclawReadPathState();
	});

	afterEach(() => {
		resetOpenclawReadPathState();
		fs.rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("rejects directory scans that exceed the configured entry budget", async () => {
		fs.mkdirSync(path.join(tempDir, "skills", "a"), { recursive: true });
		fs.mkdirSync(path.join(tempDir, "skills", "b"), { recursive: true });
		fs.mkdirSync(path.join(tempDir, "skills", "c"), { recursive: true });

		await expect(
			listBoundedDirectory(path.join(tempDir, "skills"), {
				maxEntries: 2,
				filter: (entry) => entry.isDirectory(),
			}),
		).rejects.toMatchObject({
			code: "entry_limit",
		});
	});

	it("rejects oversized file reads before returning content", async () => {
		const filePath = path.join(tempDir, "session.jsonl");
		fs.writeFileSync(filePath, "123456789");

		await expect(
			readBoundedTextFile(filePath, {
				maxBytes: 8,
			}),
		).rejects.toMatchObject({
			code: "file_too_large",
		});
	});

	it("returns empty results for missing paths when allowMissing is enabled", async () => {
		await expect(
			listBoundedDirectory(path.join(tempDir, "missing"), {
				allowMissing: true,
				maxEntries: 4,
			}),
		).resolves.toEqual([]);

		await expect(
			readBoundedTextFile(path.join(tempDir, "missing.json"), {
				allowMissing: true,
				maxBytes: 16,
			}),
		).resolves.toBeNull();
	});

	it("rethrows missing files when allowMissing is disabled and supports unfiltered scans", async () => {
		const dirPath = path.join(tempDir, "skills");
		fs.mkdirSync(dirPath, { recursive: true });
		fs.writeFileSync(path.join(dirPath, "b.txt"), "b");
		fs.writeFileSync(path.join(dirPath, "a.txt"), "a");

		await expect(
			listBoundedDirectory(dirPath, {
				maxEntries: 4,
			}),
		).resolves.toEqual(["a.txt", "b.txt"]);

		await expect(
			readBoundedTextFile(path.join(tempDir, "missing.json"), {
				maxBytes: 16,
			}),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("dedupes in-flight computations and reuses cached results until ttl expiry", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-31T10:00:00.000Z"));

		let release: (() => void) | undefined;
		const blocker = new Promise<void>((resolve) => {
			release = resolve;
		});
		const load = vi.fn(async () => {
			await blocker;
			return { ok: true, loadedAt: Date.now() };
		});

		const first = getCachedComputation("stats-all", {
			ttlMs: 30_000,
			load,
		});
		const second = getCachedComputation("stats-all", {
			ttlMs: 30_000,
			load,
		});

		expect(load).toHaveBeenCalledTimes(1);
		if (release) {
			release();
		}

		const [firstValue, secondValue] = await Promise.all([first, second]);
		expect(firstValue).toEqual(secondValue);
		expect(load).toHaveBeenCalledTimes(1);

		const cached = await getCachedComputation("stats-all", {
			ttlMs: 30_000,
			load,
		});
		expect(cached).toEqual(firstValue);
		expect(load).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date("2026-03-31T10:00:31.000Z"));

		await getCachedComputation("stats-all", {
			ttlMs: 30_000,
			load,
		});
		expect(load).toHaveBeenCalledTimes(2);
	});
});
