import crypto from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
	callOpenclawGateway,
	execOpenclaw,
	parseJsonFromMixedOutput,
	parseOpenclawJsonOutput,
	resolveConfigSnapshotHash,
} from "@/lib/openclaw-cli";

vi.mock("node:child_process", () => {
	const mockedChildProcess: any = {
		execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
			if (typeof cb === "function") {
				cb(null, "openclaw 1.2.3\n", "");
			}
			return { on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
		}),
		exec: vi.fn((_cmd: string, _opts: any, cb: any) => {
			if (typeof cb === "function") {
				cb(null, "openclaw 1.2.3\n", "");
			}
			return { on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
		}),
	};
	mockedChildProcess.execFile[promisify.custom] = vi.fn(
		(_cmd: string, _args: string[], _opts: any) => ({
			stdout: "openclaw 1.2.3\n",
			stderr: "",
		}),
	);
	mockedChildProcess.exec[promisify.custom] = vi.fn(
		(_cmd: string, _opts: any) => ({
			stdout: "openclaw 1.2.3\n",
			stderr: "",
		}),
	);
	return {
		...mockedChildProcess,
		default: mockedChildProcess,
		__esModule: true,
	} as any;
});

describe("parseJsonFromMixedOutput", () => {
	it("extracts JSON from clean output", () => {
		expect(parseJsonFromMixedOutput('{"status":"ok"}')).toEqual({
			status: "ok",
		});
	});

	it("extracts JSON surrounded by non-JSON text", () => {
		const output = 'Loading config...\n{"result":42}\nDone.';
		expect(parseJsonFromMixedOutput(output)).toEqual({ result: 42 });
	});

	it("handles nested JSON objects", () => {
		const output = 'prefix {"a":{"b":{"c":1}}} suffix';
		expect(parseJsonFromMixedOutput(output)).toEqual({ a: { b: { c: 1 } } });
	});

	it("handles strings containing braces", () => {
		const output = '{"text":"value with {braces}"}';
		expect(parseJsonFromMixedOutput(output)).toEqual({
			text: "value with {braces}",
		});
	});

	it("handles escaped quotes in strings", () => {
		const output = '{"text":"say \\"hello\\""}';
		expect(parseJsonFromMixedOutput(output)).toEqual({
			text: 'say "hello"',
		});
	});

	it("returns null when no JSON is found", () => {
		expect(parseJsonFromMixedOutput("no json here")).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(parseJsonFromMixedOutput("")).toBeNull();
	});
});

describe("parseOpenclawJsonOutput", () => {
	it("parses clean JSON stdout", () => {
		expect(parseOpenclawJsonOutput('{"ok":true}')).toEqual({ ok: true });
	});

	it("falls back to mixed output parsing when stdout is not pure JSON", () => {
		const stdout = 'Warning: something\n{"ok":true}\n';
		expect(parseOpenclawJsonOutput(stdout)).toEqual({ ok: true });
	});

	it("searches stderr when stdout has no JSON", () => {
		expect(parseOpenclawJsonOutput("", '{"error":"fail"}')).toEqual({
			error: "fail",
		});
	});

	it("returns null when neither has JSON", () => {
		expect(parseOpenclawJsonOutput("no json", "also no json")).toBeNull();
	});

	it("trims whitespace from stdout before parsing", () => {
		expect(parseOpenclawJsonOutput('  {"trimmed":true}  ')).toEqual({
			trimmed: true,
		});
	});
});

describe("resolveConfigSnapshotHash", () => {
	it("returns the hash when present in the snapshot", () => {
		expect(resolveConfigSnapshotHash({ hash: "abc123" })).toBe("abc123");
	});

	it("trims whitespace from the hash", () => {
		expect(resolveConfigSnapshotHash({ hash: "  abc123  " })).toBe("abc123");
	});

	it("computes sha256 from raw when hash is absent", () => {
		const raw = "some config content";
		const expected = crypto.createHash("sha256").update(raw).digest("hex");
		expect(resolveConfigSnapshotHash({ raw })).toBe(expected);
	});

	it("returns null for null/undefined snapshot", () => {
		expect(resolveConfigSnapshotHash(null)).toBeNull();
		expect(resolveConfigSnapshotHash(undefined)).toBeNull();
	});

	it("returns null when hash is empty and raw is missing", () => {
		expect(resolveConfigSnapshotHash({ hash: "", raw: null })).toBeNull();
	});

	it("returns null when hash is whitespace-only and raw is null", () => {
		expect(resolveConfigSnapshotHash({ hash: "   ", raw: null })).toBeNull();
	});
});

describe("parseJsonFromMixedOutput (edge cases)", () => {
	it("returns null for balanced braces containing invalid JSON", () => {
		expect(parseJsonFromMixedOutput("{not valid json}")).toBeNull();
	});

	it("skips invalid first candidate and returns null when no valid JSON exists", () => {
		expect(parseJsonFromMixedOutput("{bad} more text")).toBeNull();
	});
});

describe("execOpenclaw", () => {
	it("executes openclaw and returns stdout/stderr", async () => {
		const result = await execOpenclaw(["--version"]);
		expect(typeof result.stdout).toBe("string");
		expect(result.stdout.trim().length).toBeGreaterThan(0);
	});
});

describe("callOpenclawGateway", () => {
	it("wraps errors with context when the gateway command fails", async () => {
		await expect(
			callOpenclawGateway("nonexistent.method", {}, 1000),
		).rejects.toThrow();
	});
});
