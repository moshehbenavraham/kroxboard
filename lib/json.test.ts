import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	parseJsonText,
	readJsonFile,
	readJsonFileSync,
	stripUtf8Bom,
} from "@/lib/json";

describe("stripUtf8Bom", () => {
	it("strips the UTF-8 BOM from the start of a string", () => {
		expect(stripUtf8Bom('\uFEFF{"key":1}')).toBe('{"key":1}');
	});

	it("returns the input unchanged when no BOM is present", () => {
		expect(stripUtf8Bom('{"key":1}')).toBe('{"key":1}');
	});

	it("only strips the leading BOM, not internal occurrences", () => {
		expect(stripUtf8Bom("\uFEFFhello\uFEFF")).toBe("hello\uFEFF");
	});

	it("handles an empty string", () => {
		expect(stripUtf8Bom("")).toBe("");
	});
});

describe("parseJsonText", () => {
	it("parses plain JSON", () => {
		expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
	});

	it("parses JSON with a BOM prefix", () => {
		expect(parseJsonText('\uFEFF{"a":1}')).toEqual({ a: 1 });
	});

	it("throws on invalid JSON", () => {
		expect(() => parseJsonText("not json")).toThrow();
	});

	it("parses arrays", () => {
		expect(parseJsonText("[1,2,3]")).toEqual([1, 2, 3]);
	});
});

describe("readJsonFileSync / readJsonFile", () => {
	let tmpDir: string;
	let filePath: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "json-test-"));
		filePath = path.join(tmpDir, "test.json");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("reads and parses a JSON file synchronously", () => {
		fs.writeFileSync(filePath, '{"hello":"world"}');
		expect(readJsonFileSync(filePath)).toEqual({ hello: "world" });
	});

	it("handles files with a BOM synchronously", () => {
		fs.writeFileSync(filePath, '\uFEFF{"bom":true}');
		expect(readJsonFileSync(filePath)).toEqual({ bom: true });
	});

	it("reads and parses a JSON file asynchronously", async () => {
		fs.writeFileSync(filePath, '{"async":true}');
		await expect(readJsonFile(filePath)).resolves.toEqual({ async: true });
	});

	it("handles files with a BOM asynchronously", async () => {
		fs.writeFileSync(filePath, '\uFEFF{"bom":"async"}');
		await expect(readJsonFile(filePath)).resolves.toEqual({ bom: "async" });
	});

	it("throws when the file does not exist (sync)", () => {
		expect(() => readJsonFileSync("/nonexistent/path.json")).toThrow();
	});

	it("rejects when the file does not exist (async)", async () => {
		await expect(readJsonFile("/nonexistent/path.json")).rejects.toThrow();
	});
});
