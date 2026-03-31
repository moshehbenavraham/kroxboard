import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMonitor } from "./alert-monitor";

const { mockCreateClientPoller, mockPoller } = vi.hoisted(() => ({
	mockCreateClientPoller: vi.fn(),
	mockPoller: {
		start: vi.fn(),
		stop: vi.fn(),
		trigger: vi.fn(),
		isInFlight: vi.fn(() => false),
	},
}));

vi.mock("next/navigation", () => ({
	usePathname: () => "/",
}));

vi.mock("@/app/components/operator-elevation-provider", () => ({
	useOperatorElevation: () => ({
		sessionState: { ok: true },
	}),
}));

vi.mock("@/lib/client-polling", () => ({
	createClientPoller: mockCreateClientPoller,
}));

function setVisibilityState(state: "visible" | "hidden"): void {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		value: state,
	});
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: state === "hidden",
	});
}

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

describe("AlertMonitor", () => {
	beforeEach(() => {
		setVisibilityState("visible");
		mockCreateClientPoller.mockReset().mockReturnValue(mockPoller);
		mockPoller.start.mockReset();
		mockPoller.stop.mockReset();
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
		setVisibilityState("visible");
	});

	it("does not run an immediate alert check on mount and cleans up the shared poller on unmount", async () => {
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
		await waitFor(() => {
			expect(mockPoller.start).toHaveBeenCalledTimes(1);
		});

		unmount();
		expect(mockPoller.stop).toHaveBeenCalledTimes(1);
	});

	it("configures the shared bounded poller for scheduled alert checks", async () => {
		render(<AlertMonitor />);

		await Promise.resolve();
		await Promise.resolve();
		await waitFor(() => {
			expect(mockCreateClientPoller).toHaveBeenCalledWith(
				expect.objectContaining({
					intervalMs: 10 * 60 * 1000,
					sharedKey: "alerts:scheduled-check",
					reuseResultMs: 60_000,
				}),
			);
		});
	});
});
