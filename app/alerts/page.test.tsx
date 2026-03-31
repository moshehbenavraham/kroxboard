import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "./page";

const { mockCreateClientPoller, mockPoller } = vi.hoisted(() => ({
	mockCreateClientPoller: vi.fn(),
	mockPoller: {
		start: vi.fn(),
		stop: vi.fn(),
		trigger: vi.fn(),
		isInFlight: vi.fn(() => false),
	},
}));

const mockRunProtectedRequest = vi.fn();
let mockSessionState: any = {
	ok: false,
	error: "Operator elevation required",
	auth: {
		ok: false,
		type: "operator_auth",
		state: "challenge_required",
		message: "Operator elevation required",
		canChallenge: true,
	},
};

vi.mock("@/app/components/operator-elevation-provider", () => ({
	useOperatorElevation: () => ({
		runProtectedRequest: mockRunProtectedRequest,
		sessionState: mockSessionState,
		sessionLoading: false,
		refreshSessionState: vi.fn(),
		clearSession: vi.fn(),
	}),
	OperatorElevationProvider: ({ children }: { children: any }) => children,
}));

vi.mock("@/lib/i18n", () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: "en",
	}),
}));

vi.mock("@/lib/client-polling", () => ({
	createClientPoller: mockCreateClientPoller,
}));

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

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

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
	localStorage.clear();
	setVisibilityState("visible");
});

describe("Alerts page operator banners", () => {
	beforeEach(() => {
		mockCreateClientPoller.mockReset().mockReturnValue(mockPoller);
		mockPoller.start.mockReset();
		mockPoller.stop.mockReset();
		mockSessionState = {
			ok: false,
			error: "Operator elevation required",
			auth: {
				ok: false,
				type: "operator_auth",
				state: "challenge_required",
				message: "Operator elevation required",
				canChallenge: true,
			},
		};
		mockRunProtectedRequest.mockReset().mockResolvedValue({
			ok: false,
			feature: {
				ok: false,
				type: "feature_disabled",
				flag: "ENABLE_OUTBOUND_TESTS",
				capability: "alert diagnostics",
				message: "Alert diagnostics are disabled",
			},
			status: 403,
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === "/api/alerts") {
				return jsonResponse({
					enabled: true,
					receiveAgent: "main",
					checkInterval: 10,
					rules: [
						{
							id: "model_unavailable",
							name: "Model Unavailable",
							enabled: true,
						},
					],
				});
			}
			if (url === "/api/config") {
				return jsonResponse({
					agents: [{ id: "main", name: "Main", emoji: "M" }],
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows a disabled-state banner when manual alert checks are unavailable", async () => {
		render(<AlertsPage />);

		const checkButton = await screen.findByRole("button", {
			name: "Refresh Check Now",
		});
		fireEvent.click(checkButton);

		await waitFor(() => {
			expect(screen.getByText("Alert diagnostics are disabled")).toBeTruthy();
		});
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Action disabled");
		expect(document.activeElement).toBe(alert);
	});

	it("shows an explicit rate-limited banner when manual checks are throttled", async () => {
		mockRunProtectedRequest.mockResolvedValueOnce({
			ok: false,
			rateLimit: {
				ok: false,
				type: "diagnostic_rate_limit",
				capability: "alert_diagnostics",
				message:
					"Alert diagnostics are temporarily rate limited. Retry in 60 seconds.",
				metadata: {
					capability: "alert_diagnostics",
					limit: 4,
					remaining: 0,
					windowMs: 600000,
					windowStartedAt: 0,
					resetAt: 600000,
					retryAfterSeconds: 60,
					policy: "local_process",
				},
			},
			status: 429,
		});

		render(<AlertsPage />);

		const checkButton = await screen.findByRole("button", {
			name: "Refresh Check Now",
		});
		fireEvent.click(checkButton);

		await waitFor(() => {
			expect(
				screen.getByText(
					"Alert diagnostics are temporarily rate limited. Retry in 60 seconds.",
				),
			).toBeTruthy();
		});
		const banner = screen.getByRole("status");
		expect(banner.textContent).toContain("Rate limited");
		expect(document.activeElement).toBe(banner);
	});

	it("configures the shared scheduled poller when the operator session is elevated", async () => {
		mockSessionState = { ok: true };

		render(<AlertsPage />);

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
			expect(mockPoller.start).toHaveBeenCalledTimes(1);
		});
	});
});
