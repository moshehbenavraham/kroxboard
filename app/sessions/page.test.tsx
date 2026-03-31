import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionsPage from "./page";

const mockRunProtectedRequest = vi.fn();

vi.mock("next/navigation", () => ({
	useSearchParams: () => ({
		get: (key: string) => (key === "agent" ? "main" : null),
	}),
}));

vi.mock("@/app/components/operator-elevation-provider", () => ({
	useOperatorElevation: () => ({
		runProtectedRequest: mockRunProtectedRequest,
		sessionState: null,
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

describe("Sessions page operator banners", () => {
	beforeEach(() => {
		mockRunProtectedRequest.mockReset().mockResolvedValue({
			ok: false,
			auth: {
				ok: false,
				type: "operator_auth",
				state: "identity_denied",
				message: "Operator access denied",
				canChallenge: false,
			},
			status: 403,
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === "/api/sessions/main") {
				return jsonResponse({
					sessions: [
						{
							key: "agent:main:main",
							type: "main",
							target: "main",
							sessionId: "session-1",
							updatedAt: 1743379200000,
							totalTokens: 1200,
							contextTokens: 4000,
							systemSent: false,
						},
					],
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows a denied-state banner when session diagnostics are refused", async () => {
		render(<SessionsPage />);

		const testButton = await screen.findByRole("button", {
			name: "sessions.test",
		});
		fireEvent.click(testButton);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeTruthy();
		});
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Access denied");
		expect(alert.textContent).toContain("Operator access denied");
		expect(document.activeElement).toBe(alert);
	});
});
