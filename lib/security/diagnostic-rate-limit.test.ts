import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
	resetDiagnosticRateLimitStore,
} from "./diagnostic-rate-limit";

function createRequest(ip: string): Request {
	return new Request("http://localhost:3000/api/test-model", {
		headers: {
			"cf-connecting-ip": ip,
		},
	});
}

describe("diagnostic-rate-limit", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-31T06:34:00.000Z"));
		resetDiagnosticRateLimitStore();
	});

	afterEach(() => {
		resetDiagnosticRateLimitStore();
		vi.useRealTimers();
	});

	it("returns a typed 429 payload after the configured request budget is exceeded", async () => {
		const request = createRequest("198.51.100.10");
		for (let attempt = 0; attempt < 6; attempt++) {
			const result = enforceDiagnosticRateLimit(request, "provider_probe");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.metadata.remaining).toBe(5 - attempt);
			}
		}

		const denied = enforceDiagnosticRateLimit(request, "provider_probe");
		expect(denied.ok).toBe(false);
		if (denied.ok) throw new Error("Expected a denied result");
		expect(denied.response.status).toBe(429);
		expect(denied.headers.get("X-Diagnostic-RateLimit-Capability")).toBe(
			"provider_probe",
		);
		await expect(denied.response.json()).resolves.toMatchObject({
			ok: false,
			rateLimit: {
				type: "diagnostic_rate_limit",
				capability: "provider_probe",
				metadata: {
					limit: 6,
					remaining: 0,
				},
			},
		});
	});

	it("resets the budget after the configured window elapses", () => {
		const request = createRequest("198.51.100.11");
		for (let attempt = 0; attempt < 6; attempt++) {
			const result = enforceDiagnosticRateLimit(request, "session_diagnostic");
			expect(result.ok).toBe(true);
		}

		const denied = enforceDiagnosticRateLimit(request, "session_diagnostic");
		expect(denied.ok).toBe(false);

		vi.advanceTimersByTime(60_001);

		const reset = enforceDiagnosticRateLimit(request, "session_diagnostic");
		expect(reset.ok).toBe(true);
		if (!reset.ok) throw new Error("Expected reset window allowance");
		expect(reset.metadata.remaining).toBe(5);
	});

	it("isolates keys by identity and capability", () => {
		const firstIdentity = createRequest("198.51.100.12");
		const secondIdentity = createRequest("198.51.100.13");

		for (let attempt = 0; attempt < 6; attempt++) {
			expect(
				enforceDiagnosticRateLimit(firstIdentity, "provider_probe").ok,
			).toBe(true);
		}

		expect(enforceDiagnosticRateLimit(firstIdentity, "provider_probe").ok).toBe(
			false,
		);
		expect(
			enforceDiagnosticRateLimit(secondIdentity, "provider_probe").ok,
		).toBe(true);
		expect(
			enforceDiagnosticRateLimit(firstIdentity, "provider_probe_batch").ok,
		).toBe(true);
	});

	it("applies deterministic headers to successful responses", () => {
		const limited = enforceDiagnosticRateLimit(
			createRequest("198.51.100.14"),
			"pixel_office_version",
		);
		expect(limited.ok).toBe(true);
		if (!limited.ok) throw new Error("Expected an allowed result");

		const response = applyDiagnosticRateLimitHeaders(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
			limited.metadata,
		);
		expect(response.headers.get("X-Diagnostic-RateLimit-Limit")).toBe("6");
		expect(response.headers.get("X-Diagnostic-RateLimit-Remaining")).toBe("5");
		expect(response.headers.get("X-Diagnostic-RateLimit-Window")).toBe(
			String(60 * 60_000),
		);
	});
});
