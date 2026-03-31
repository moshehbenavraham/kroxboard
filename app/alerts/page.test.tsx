import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "./page";

const mockRunProtectedRequest = vi.fn();

vi.mock("@/app/components/operator-elevation-provider", () => ({
	useOperatorElevation: () => ({
		runProtectedRequest: mockRunProtectedRequest,
		sessionState: {
			ok: false,
			error: "Operator elevation required",
			auth: {
				ok: false,
				type: "operator_auth",
				state: "challenge_required",
				message: "Operator elevation required",
				canChallenge: true,
			},
		},
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

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	localStorage.clear();
});

describe("Alerts page operator banners", () => {
	beforeEach(() => {
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
});
