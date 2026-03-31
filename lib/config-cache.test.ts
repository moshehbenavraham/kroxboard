import { afterEach, describe, expect, it } from "vitest";
import {
	clearConfigCache,
	getConfigCache,
	setConfigCache,
} from "@/lib/config-cache";

afterEach(() => {
	clearConfigCache();
});

describe("config cache", () => {
	it("returns null when no cache is set", () => {
		expect(getConfigCache()).toBeNull();
	});

	it("stores and retrieves a cache entry", () => {
		const entry = { data: { agents: [] }, ts: Date.now() };
		setConfigCache(entry);
		expect(getConfigCache()).toEqual(entry);
	});

	it("returns an isolated snapshot to callers", () => {
		setConfigCache({ data: { agents: [{ id: "main" }] }, ts: 1 });
		const cached = getConfigCache<{ agents: Array<{ id: string }> }>();
		expect(cached).not.toBeNull();
		if (!cached) {
			throw new Error("Expected cached config to be present");
		}
		cached.data.agents.push({ id: "helper" });

		expect(getConfigCache()).toEqual({
			data: { agents: [{ id: "main" }] },
			ts: 1,
		});
	});

	it("overwrites the previous cache entry", () => {
		setConfigCache({ data: { first: true }, ts: 1 });
		setConfigCache({ data: { second: true }, ts: 2 });
		expect(getConfigCache()).toEqual({ data: { second: true }, ts: 2 });
	});

	it("stores a defensive copy of the provided entry", () => {
		const entry = { data: { flags: { safe: true } }, ts: 1 };
		setConfigCache(entry);
		entry.data.flags.safe = false;

		expect(getConfigCache()).toEqual({
			data: { flags: { safe: true } },
			ts: 1,
		});
	});

	it("clears the cache", () => {
		setConfigCache({ data: {}, ts: Date.now() });
		clearConfigCache();
		expect(getConfigCache()).toBeNull();
	});
});
