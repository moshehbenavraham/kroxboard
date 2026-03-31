import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getOpenclawCronStoreBoundaries,
	getOpenclawPackageCandidates,
	isPathWithinBoundary,
	isValidOpenclawAgentId,
	resolveOpenclawAgentSessionsDir,
	resolveOpenclawAgentSessionsFile,
	resolveOpenclawCronStorePath,
} from "@/lib/openclaw-paths";

describe("getOpenclawPackageCandidates", () => {
	it("returns an array of candidate paths", () => {
		const candidates = getOpenclawPackageCandidates("v20.0.0");
		expect(Array.isArray(candidates)).toBe(true);
		expect(candidates.length).toBeGreaterThan(0);
	});

	it("includes nvm path with the given version", () => {
		const candidates = getOpenclawPackageCandidates("v20.0.0");
		expect(candidates.some((p) => p.includes("v20.0.0"))).toBe(true);
	});

	it("includes fnm path with the given version", () => {
		const candidates = getOpenclawPackageCandidates("v18.0.0");
		expect(
			candidates.some((p) => p.includes("v18.0.0") && p.includes("fnm")),
		).toBe(true);
	});

	it("deduplicates paths", () => {
		const candidates = getOpenclawPackageCandidates();
		const unique = new Set(candidates);
		expect(candidates.length).toBe(unique.size);
	});

	it("includes the local lib path", () => {
		const candidates = getOpenclawPackageCandidates();
		expect(
			candidates.some((p) => p.includes(".local/lib/node_modules/openclaw")),
		).toBe(true);
	});
});

describe("openclaw path boundaries", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("accepts safe agent identifiers and rejects traversal-shaped values", () => {
		expect(isValidOpenclawAgentId("main")).toBe(true);
		expect(isValidOpenclawAgentId("helper_01")).toBe(true);
		expect(isValidOpenclawAgentId("../main")).toBe(false);
		expect(isValidOpenclawAgentId("main/child")).toBe(false);
	});

	it("resolves agent sessions paths inside the approved boundary", () => {
		const openclawHome = "/tmp/openclaw-home";
		expect(resolveOpenclawAgentSessionsDir("main", openclawHome)).toBe(
			path.resolve(openclawHome, "agents", "main", "sessions"),
		);
		expect(resolveOpenclawAgentSessionsFile("main", openclawHome)).toBe(
			path.resolve(openclawHome, "agents", "main", "sessions", "sessions.json"),
		);
		expect(
			resolveOpenclawAgentSessionsFile("../main", openclawHome),
		).toBeNull();
	});

	it("checks whether a path stays inside its approved boundary", () => {
		expect(
			isPathWithinBoundary(
				"/tmp/openclaw-home/agents/main/sessions/sessions.json",
				"/tmp/openclaw-home/agents",
			),
		).toBe(true);
		expect(
			isPathWithinBoundary(
				"/tmp/openclaw-home/../secrets/file.txt",
				"/tmp/openclaw-home/agents",
			),
		).toBe(false);
	});

	it("resolves a relative cron-store path inside the approved openclaw directories", () => {
		const openclawHome = "/tmp/openclaw-home";
		expect(
			resolveOpenclawCronStorePath("cron-store/jobs.json", openclawHome),
		).toBe(path.resolve(openclawHome, "cron-store", "jobs.json"));
		expect(
			resolveOpenclawCronStorePath(
				"~/cron-store/jobs.json",
				openclawHome,
				"/home/tester",
			),
		).toBeNull();
	});

	it("rejects cron-store paths that escape approved directories", () => {
		const openclawHome = "/tmp/openclaw-home";
		expect(
			resolveOpenclawCronStorePath("../secrets/jobs.json", openclawHome),
		).toBeNull();
		expect(
			resolveOpenclawCronStorePath("/tmp/jobs.json", openclawHome),
		).toBeNull();
	});

	it("uses the legacy cron-store default when only the legacy file exists", () => {
		const openclawHome = "/tmp/openclaw-home";
		const existsSpy = vi
			.spyOn(fs, "existsSync")
			.mockImplementation(
				(filePath: fs.PathLike) =>
					String(filePath) === path.join(openclawHome, "cron", "jobs.json"),
			);

		expect(resolveOpenclawCronStorePath(undefined, openclawHome)).toBe(
			path.join(openclawHome, "cron", "jobs.json"),
		);
		expect(existsSpy).toHaveBeenCalled();
		expect(getOpenclawCronStoreBoundaries(openclawHome)).toEqual([
			path.resolve(openclawHome, "cron-store"),
			path.resolve(openclawHome, "cron"),
		]);
	});
});
