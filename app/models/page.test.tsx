import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelsPage from "./page";

const mockRunProtectedRequest = vi.fn();

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

describe("Models page operator banners", () => {
	beforeEach(() => {
		mockRunProtectedRequest.mockReset().mockResolvedValue({
			ok: false,
			invalid: {
				ok: false,
				type: "invalid_request",
				field: "model",
				reason: "invalid_value",
				message: "Invalid provider probe request",
			},
			status: 400,
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === "/api/config") {
				return jsonResponse({
					providers: [
						{
							id: "openai",
							api: "https://api.openai.com/v1",
							accessMode: "api_key",
							models: [
								{
									id: "gpt-4.1",
									name: "GPT 4.1",
									contextWindow: 128000,
									maxTokens: 4096,
									reasoning: true,
									input: ["text"],
								},
							],
							usedBy: [],
						},
					],
					defaults: {
						model: "openai/gpt-4.1",
						fallbacks: [],
					},
				});
			}
			if (url === "/api/stats-models") {
				return jsonResponse({ models: [] });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows an invalid-state banner when a provider probe request is rejected", async () => {
		render(<ModelsPage />);

		const testButton = (
			await screen.findAllByRole("button", {
				name: "common.test",
			})
		)[0];
		fireEvent.click(testButton);

		await waitFor(() => {
			expect(screen.getByText("Invalid provider probe request")).toBeTruthy();
		});
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Invalid request");
		expect(document.activeElement).toBe(alert);
	});

	it("clears malformed cached model diagnostics on load", async () => {
		localStorage.setItem("modelTestResults", "{broken-json");

		render(<ModelsPage />);

		await screen.findByText("models.title");
		expect(localStorage.getItem("modelTestResults")).toBeNull();
	});
});
