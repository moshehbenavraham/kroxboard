import { describe, expect, it, vi } from "vitest";

const mockExecOpenclaw = vi.fn();

vi.mock("@/lib/openclaw-cli", () => ({
	execOpenclaw: (...args: any[]) => mockExecOpenclaw(...args),
	parseJsonFromMixedOutput: (output: string) => {
		try {
			for (let i = 0; i < output.length; i++) {
				if (output[i] !== "{") continue;
				let depth = 0;
				for (let j = i; j < output.length; j++) {
					if (output[j] === "{") depth++;
					if (output[j] === "}") depth--;
					if (depth === 0) {
						return JSON.parse(output.slice(i, j + 1));
					}
				}
			}
		} catch {}
		return null;
	},
}));

import {
	parseApiJsonSafely,
	shouldFallbackToCli,
	testSessionViaCli,
} from "@/lib/session-test-fallback";

describe("shouldFallbackToCli", () => {
	it("returns true for a 404 response", () => {
		const resp = new Response("Not Found", { status: 404 });
		expect(shouldFallbackToCli(resp, "Not Found")).toBe(true);
	});

	it("returns true when raw text is 'Not Found'", () => {
		const resp = new Response("Not Found", { status: 200 });
		expect(shouldFallbackToCli(resp, "Not Found")).toBe(true);
	});

	it("returns true when raw text is 'Not Found' with whitespace", () => {
		const resp = new Response("  Not Found  ", { status: 200 });
		expect(shouldFallbackToCli(resp, "  Not Found  ")).toBe(true);
	});

	it("returns false for a successful response", () => {
		const resp = new Response('{"ok":true}', { status: 200 });
		expect(shouldFallbackToCli(resp, '{"ok":true}')).toBe(false);
	});

	it("returns false for a 500 error that is not 'Not Found'", () => {
		const resp = new Response("Internal error", { status: 500 });
		expect(shouldFallbackToCli(resp, "Internal error")).toBe(false);
	});
});

describe("parseApiJsonSafely", () => {
	it("parses valid JSON", () => {
		expect(parseApiJsonSafely('{"ok":true}')).toEqual({ ok: true });
	});

	it("returns null for invalid JSON", () => {
		expect(parseApiJsonSafely("not json")).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(parseApiJsonSafely("")).toBeNull();
	});

	it("parses JSON arrays", () => {
		expect(parseApiJsonSafely("[1,2,3]")).toEqual([1, 2, 3]);
	});
});

describe("testSessionViaCli", () => {
	it("returns success with reply text when CLI responds", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ reply: "Hello, I am healthy!" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Hello");
		expect(typeof result.elapsed).toBe("number");
	});

	it("extracts reply from text field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ text: "I'm OK" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("OK");
	});

	it("extracts reply from outputText field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ outputText: "Output is fine" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Output is fine");
	});

	it("extracts reply from nested result.reply field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ result: { reply: "Nested reply" } }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Nested reply");
	});

	it("extracts reply from response.text field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ response: { text: "Response text" } }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Response text");
	});

	it("extracts reply from response.output_text field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({
				response: { output_text: "Output response" },
			}),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Output response");
	});

	it("extracts reply from message field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ message: "Message reply" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("Message reply");
	});

	it("returns OK summary for status:ok responses", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ status: "ok", summary: "all good" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("OK");
		expect(result.reply).toContain("all good");
	});

	it("returns OK with 'completed' when summary is empty", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ status: "ok" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("completed");
	});

	it("falls back to raw stdout when no parsed reply fields exist", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: "some raw output",
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply).toContain("some raw output");
	});

	it("returns error when parsed output contains an error field", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ error: { message: "Agent timeout" } }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Agent timeout");
	});

	it("returns error when parsed output contains a string error", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ error: "Something went wrong" }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Something went wrong");
	});

	it("returns error result when exec throws", async () => {
		mockExecOpenclaw.mockRejectedValue(new Error("Command not found"));

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("Command not found");
		expect(typeof result.elapsed).toBe("number");
	});

	it("handles non-Error exceptions", async () => {
		mockExecOpenclaw.mockRejectedValue("string error");

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("CLI fallback failed");
	});

	it("truncates long reply text to 200 characters", async () => {
		mockExecOpenclaw.mockResolvedValue({
			stdout: JSON.stringify({ reply: "a".repeat(500) }),
			stderr: "",
		});

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(true);
		expect(result.reply!.length).toBeLessThanOrEqual(200);
	});

	it("truncates long error text to 300 characters", async () => {
		mockExecOpenclaw.mockRejectedValue(new Error("x".repeat(500)));

		const result = await testSessionViaCli("main");
		expect(result.ok).toBe(false);
		expect(result.error!.length).toBeLessThanOrEqual(300);
	});
});
