import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorElevationProvider } from "@/app/components/operator-elevation-provider";
import Home from "./page";

vi.mock("./gateway-status", () => ({
	GatewayStatus: () => <div>Gateway status</div>,
}));

vi.mock("./components/agent-card", () => ({
	AgentCard: ({ agent, onModelChange }: any) => (
		<button
			type="button"
			onClick={() => {
				void onModelChange?.(agent.id, "provider/model-two").catch(() => null);
			}}
		>
			change-model-{agent.id}
		</button>
	),
	ModelBadge: ({ model }: { model: string }) => <span>{model}</span>,
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

describe("Home page operator elevation wiring", () => {
	beforeEach(() => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === "/api/operator/session") {
				return jsonResponse({
					ok: false,
					error: "Operator elevation required",
					auth: {
						ok: false,
						type: "operator_auth",
						state: "challenge_required",
						message: "Operator elevation required",
						canChallenge: true,
					},
				});
			}
			if (url === "/api/config") {
				return jsonResponse({
					agents: [
						{
							id: "main",
							name: "Main",
							emoji: "M",
							model: "provider/model-one",
							platforms: [],
						},
					],
					defaults: {
						model: "provider/model-one",
						fallbacks: [],
					},
					providers: [],
					gateway: { port: 18789 },
				});
			}
			if (url === "/api/stats-all") {
				return jsonResponse({
					daily: [],
					weekly: [],
					monthly: [],
				});
			}
			if (url === "/api/agent-status") {
				return jsonResponse({ statuses: [] });
			}
			if (url === "/api/agent-activity") {
				return jsonResponse({ agents: [] });
			}
			if (url === "/api/config/agent-model") {
				return jsonResponse(
					{
						ok: false,
						error: "Operator access denied",
						auth: {
							ok: false,
							type: "operator_auth",
							state: "identity_denied",
							message: "Operator access denied",
							canChallenge: false,
						},
					},
					403,
				);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows an explicit denied-state banner when model mutation access is denied", async () => {
		render(
			<OperatorElevationProvider>
				<Home />
			</OperatorElevationProvider>,
		);

		const changeButton = await screen.findByRole("button", {
			name: "change-model-main",
		});
		fireEvent.click(changeButton);

		await waitFor(() => {
			expect(screen.getByText("Operator access denied")).toBeTruthy();
		});
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
