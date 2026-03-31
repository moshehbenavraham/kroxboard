import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	readBoundedStorageRecord,
	readBoundedStorageValue,
	writeBoundedStorageRecord,
	writeBoundedStorageValue,
} from "./client-persistence";

describe("client-persistence", () => {
	let now = 1_700_000_000_000;

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("expires bounded values once their TTL elapses", () => {
		expect(
			writeBoundedStorageValue("pixel-office-sound", true, {
				storage: localStorage,
				ttlMs: 1_000,
				now: () => now,
			}),
		).toBe(true);

		expect(
			readBoundedStorageValue<boolean>("pixel-office-sound", {
				storage: localStorage,
				ttlMs: 1_000,
				now: () => now,
			}),
		).toBe(true);

		now += 1_001;

		expect(
			readBoundedStorageValue<boolean>("pixel-office-sound", {
				storage: localStorage,
				ttlMs: 1_000,
				now: () => now,
			}),
		).toBeNull();
		expect(localStorage.getItem("pixel-office-sound")).toBeNull();
	});

	it("caps record entries to the configured retention budget", () => {
		expect(
			writeBoundedStorageRecord(
				"agentTestResults",
				{
					alpha: { ok: true },
					bravo: { ok: false },
					charlie: { ok: true },
				},
				{
					storage: localStorage,
					ttlMs: 60_000,
					maxEntries: 2,
					now: () => now,
				},
			),
		).toBe(true);

		expect(
			readBoundedStorageRecord<{ ok: boolean }>("agentTestResults", {
				storage: localStorage,
				ttlMs: 60_000,
				maxEntries: 2,
				now: () => now,
			}),
		).toEqual({
			bravo: { ok: false },
			charlie: { ok: true },
		});
	});

	it("drops malformed payloads instead of surfacing parse failures to pages", () => {
		localStorage.setItem("sessionTestResults", "{not-json");
		expect(
			readBoundedStorageRecord("sessionTestResults", {
				storage: localStorage,
				ttlMs: 60_000,
				now: () => now,
			}),
		).toBeNull();
		expect(localStorage.getItem("sessionTestResults")).toBeNull();
	});
});
