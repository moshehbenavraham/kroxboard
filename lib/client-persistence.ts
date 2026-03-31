export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface BoundedStorageOptions {
	ttlMs: number;
	maxBytes?: number;
	now?: () => number;
	storage?: StorageLike | null;
}

export interface BoundedRecordOptions extends BoundedStorageOptions {
	maxEntries?: number;
}

interface BaseEnvelope {
	version: 1;
	savedAt: number;
	expiresAt: number;
}

interface ValueEnvelope<T> extends BaseEnvelope {
	kind: "value";
	value: T;
}

interface RecordEntryEnvelope<T> {
	savedAt: number;
	value: T;
}

interface RecordEnvelope<T> extends BaseEnvelope {
	kind: "record";
	entries: Record<string, RecordEntryEnvelope<T>>;
}

const ENVELOPE_VERSION = 1;
const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_ENTRIES = 200;
const textEncoder = new TextEncoder();

function getNow(options: BoundedStorageOptions): number {
	return options.now ? options.now() : Date.now();
}

function getMaxBytes(options: BoundedStorageOptions): number {
	return options.maxBytes ?? DEFAULT_MAX_BYTES;
}

function getMaxEntries(options: BoundedRecordOptions): number {
	return options.maxEntries ?? DEFAULT_MAX_ENTRIES;
}

function getStorage(storage?: StorageLike | null): StorageLike | null {
	if (storage !== undefined) return storage;
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getSerializedSize(value: unknown): number {
	return textEncoder.encode(JSON.stringify(value)).length;
}

function safeParse(raw: string): unknown | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function isBaseEnvelope(value: unknown): value is BaseEnvelope {
	if (!isObjectRecord(value)) return false;
	return (
		value.version === ENVELOPE_VERSION &&
		typeof value.savedAt === "number" &&
		Number.isFinite(value.savedAt) &&
		typeof value.expiresAt === "number" &&
		Number.isFinite(value.expiresAt)
	);
}

function isValueEnvelope<T>(value: unknown): value is ValueEnvelope<T> {
	return (
		isObjectRecord(value) &&
		isBaseEnvelope(value) &&
		value.kind === "value" &&
		"value" in value
	);
}

function isRecordEntryEnvelope<T>(
	value: unknown,
): value is RecordEntryEnvelope<T> {
	if (!isObjectRecord(value)) return false;
	return (
		typeof value.savedAt === "number" &&
		Number.isFinite(value.savedAt) &&
		"value" in value
	);
}

function isRecordEnvelope<T>(value: unknown): value is RecordEnvelope<T> {
	if (
		!isObjectRecord(value) ||
		!isBaseEnvelope(value) ||
		value.kind !== "record"
	)
		return false;
	return isObjectRecord(value.entries);
}

function isExpired(expiresAt: number, now: number): boolean {
	return expiresAt <= now;
}

function buildValueEnvelope<T>(
	value: T,
	options: BoundedStorageOptions,
): ValueEnvelope<T> {
	const now = getNow(options);
	return {
		kind: "value",
		version: ENVELOPE_VERSION,
		savedAt: now,
		expiresAt: now + options.ttlMs,
		value,
	};
}

function trimPairsToBudget<T>(
	pairs: Array<[string, RecordEntryEnvelope<T>]>,
	baseEnvelope: BaseEnvelope,
	maxBytes: number,
): RecordEnvelope<T> | null {
	let nextPairs = [...pairs];
	while (nextPairs.length > 0) {
		const nextEnvelope: RecordEnvelope<T> = {
			kind: "record",
			...baseEnvelope,
			entries: Object.fromEntries(nextPairs),
		};
		if (getSerializedSize(nextEnvelope) <= maxBytes) {
			return nextEnvelope;
		}
		nextPairs = nextPairs.slice(1);
	}
	return null;
}

function buildRecordEnvelope<T>(
	value: Record<string, T>,
	options: BoundedRecordOptions,
): RecordEnvelope<T> | null {
	const now = getNow(options);
	const baseEnvelope: BaseEnvelope = {
		version: ENVELOPE_VERSION,
		savedAt: now,
		expiresAt: now + options.ttlMs,
	};
	const maxEntries = getMaxEntries(options);
	const maxBytes = getMaxBytes(options);
	const entryPairs = Object.entries(value)
		.filter(([, entryValue]) => entryValue !== undefined)
		.slice(-maxEntries)
		.map(
			([entryKey, entryValue]) =>
				[entryKey, { savedAt: now, value: entryValue }] as [
					string,
					RecordEntryEnvelope<T>,
				],
		);
	return trimPairsToBudget(entryPairs, baseEnvelope, maxBytes);
}

function persistRecordEnvelope<T>(
	key: string,
	storage: StorageLike,
	envelope: RecordEnvelope<T>,
): void {
	storage.setItem(key, JSON.stringify(envelope));
}

function removeStorageKey(key: string, storage: StorageLike | null): void {
	if (!storage) return;
	storage.removeItem(key);
}

export function readBoundedStorageValue<T>(
	key: string,
	options: BoundedStorageOptions,
): T | null {
	const storage = getStorage(options.storage);
	if (!storage) return null;
	const raw = storage.getItem(key);
	if (!raw) return null;
	const parsed = safeParse(raw);
	const now = getNow(options);
	if (!isValueEnvelope<T>(parsed)) {
		removeStorageKey(key, storage);
		return null;
	}
	if (
		isExpired(parsed.expiresAt, now) ||
		getSerializedSize(parsed) > getMaxBytes(options)
	) {
		removeStorageKey(key, storage);
		return null;
	}
	return parsed.value;
}

export function writeBoundedStorageValue<T>(
	key: string,
	value: T,
	options: BoundedStorageOptions,
): boolean {
	const storage = getStorage(options.storage);
	if (!storage) return false;
	const envelope = buildValueEnvelope(value, options);
	if (getSerializedSize(envelope) > getMaxBytes(options)) {
		removeStorageKey(key, storage);
		return false;
	}
	storage.setItem(key, JSON.stringify(envelope));
	return true;
}

export function readBoundedStorageRecord<T>(
	key: string,
	options: BoundedRecordOptions,
): Record<string, T> | null {
	const storage = getStorage(options.storage);
	if (!storage) return null;
	const raw = storage.getItem(key);
	if (!raw) return null;
	const parsed = safeParse(raw);
	const now = getNow(options);
	if (!isRecordEnvelope<T>(parsed)) {
		removeStorageKey(key, storage);
		return null;
	}
	if (isExpired(parsed.expiresAt, now)) {
		removeStorageKey(key, storage);
		return null;
	}

	const maxEntries = getMaxEntries(options);
	const maxBytes = getMaxBytes(options);
	const validPairs = Object.entries(parsed.entries).filter(
		([entryKey, entryEnvelope]) =>
			entryKey.length > 0 &&
			isRecordEntryEnvelope<T>(entryEnvelope) &&
			entryEnvelope.savedAt + options.ttlMs > now,
	);
	if (validPairs.length === 0) {
		removeStorageKey(key, storage);
		return null;
	}

	const retainedPairs = validPairs.slice(-maxEntries);
	const nextEnvelope = trimPairsToBudget(
		retainedPairs,
		{
			version: ENVELOPE_VERSION,
			savedAt: parsed.savedAt,
			expiresAt: parsed.expiresAt,
		},
		maxBytes,
	);
	if (!nextEnvelope || Object.keys(nextEnvelope.entries).length === 0) {
		removeStorageKey(key, storage);
		return null;
	}

	const shouldRewrite =
		retainedPairs.length !== Object.keys(parsed.entries).length ||
		getSerializedSize(parsed) > maxBytes;
	if (shouldRewrite) {
		persistRecordEnvelope(key, storage, nextEnvelope);
	}

	return Object.fromEntries(
		Object.entries(nextEnvelope.entries).map(([entryKey, entryValue]) => [
			entryKey,
			entryValue.value,
		]),
	);
}

export function writeBoundedStorageRecord<T>(
	key: string,
	value: Record<string, T>,
	options: BoundedRecordOptions,
): boolean {
	const storage = getStorage(options.storage);
	if (!storage) return false;
	const envelope = buildRecordEnvelope(value, options);
	if (!envelope) {
		removeStorageKey(key, storage);
		return false;
	}
	persistRecordEnvelope(key, storage, envelope);
	return true;
}

export function clearBoundedStorageKey(
	key: string,
	storage?: StorageLike | null,
): void {
	removeStorageKey(key, getStorage(storage));
}
