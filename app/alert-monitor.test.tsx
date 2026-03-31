import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMonitor } from "./alert-monitor";

vi.mock("@/app/components/operator-elevation-provider", () => ({
	useOperatorElevation: () => ({
		sessionState: { ok: true },
	}),
}));

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("AlertMonitor", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "/api/alerts") {
					return jsonResponse({
						enabled: true,
						checkInterval: 10,
					});
				}
				if (url === "/api/alerts/check") {
					return jsonResponse({
						results: [],
						notifications: [],
					});
				}
				throw new Error(`Unexpected fetch: ${url}`);
			}),
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("does not run an immediate alert check on mount and cleans up timers on unmount", async () => {
		const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		const { unmount } = render(<AlertMonitor />);

		await Promise.resolve();
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/alerts",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(
			fetchMock.mock.calls.some(
				([input]) => String(input) === "/api/alerts/check",
			),
		).toBe(false);

		await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
		expect(
			fetchMock.mock.calls.filter(
				([input]) => String(input) === "/api/alerts/check",
			),
		).toHaveLength(1);

		unmount();
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
		expect(
			fetchMock.mock.calls.filter(
				([input]) => String(input) === "/api/alerts/check",
			),
		).toHaveLength(1);
	});
});
