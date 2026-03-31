import { describe, expect, it } from "vitest";
import {
	getInvalidRequestStatus,
	readBoundedJsonBody,
} from "@/lib/security/request-body";

describe("request-body", () => {
	it("parses JSON when the body stays within the byte budget", async () => {
		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ enabled: true }),
		});

		const result = await readBoundedJsonBody(request, { maxBytes: 128 });
		expect(result).toEqual({
			ok: true,
			value: { enabled: true },
		});
	});

	it("rejects malformed JSON with a sanitized invalid request", async () => {
		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: "{",
		});

		const result = await readBoundedJsonBody(request, { maxBytes: 128 });
		expect(result).toMatchObject({
			ok: false,
			error: {
				field: "body",
				reason: "invalid_json",
				message: "Invalid JSON body",
				type: "invalid_request",
			},
		});
		if (result.ok) {
			throw new Error("Expected malformed JSON to be rejected");
		}
		expect(getInvalidRequestStatus(result.error)).toBe(400);
	});

	it("rejects oversized requests from Content-Length preflight", async () => {
		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": "512",
			},
			body: JSON.stringify({ enabled: true }),
		});

		const result = await readBoundedJsonBody(request, { maxBytes: 64 });
		expect(result).toMatchObject({
			ok: false,
			error: {
				field: "body",
				reason: "payload_too_large",
				message: "Request body too large",
			},
		});
		if (result.ok) {
			throw new Error("Expected oversized body to be rejected");
		}
		expect(getInvalidRequestStatus(result.error)).toBe(413);
	});

	it("rejects oversized requests when the actual body exceeds the budget", async () => {
		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": "16",
			},
			body: JSON.stringify({ layout: new Array(64).fill("tile") }),
		});

		const result = await readBoundedJsonBody(request, { maxBytes: 32 });
		expect(result).toMatchObject({
			ok: false,
			error: {
				field: "body",
				reason: "payload_too_large",
				message: "Request body too large",
			},
		});
	});

	it("ignores missing or inaccurate Content-Length when the actual body is valid", async () => {
		const request = new Request("http://localhost/api/test", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": "4",
			},
			body: JSON.stringify({ agentId: "main", model: "prov/model" }),
		});

		const result = await readBoundedJsonBody(request, { maxBytes: 128 });
		expect(result).toEqual({
			ok: true,
			value: {
				agentId: "main",
				model: "prov/model",
			},
		});
	});
});
