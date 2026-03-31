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

	it("overwrites the previous cache entry", () => {
		setConfigCache({ data: { first: true }, ts: 1 });
		setConfigCache({ data: { second: true }, ts: 2 });
		expect(getConfigCache()).toEqual({ data: { second: true }, ts: 2 });
	});

	it("clears the cache", () => {
		setConfigCache({ data: {}, ts: Date.now() });
		clearConfigCache();
		expect(getConfigCache()).toBeNull();
	});
});
