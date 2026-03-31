import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import PixelOfficePage from "./page";

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

vi.mock("@/lib/pixel-office/notificationSound", () => ({
	isSoundEnabled: () => false,
	playBackgroundMusic: vi.fn(async () => undefined),
	playDoneSound: vi.fn(),
	setSoundEnabled: vi.fn(),
	skipToNextTrack: vi.fn(),
	stopBackgroundMusic: vi.fn(),
	unlockAudio: vi.fn(),
}));

vi.mock("@/lib/pixel-office/sprites/pngLoader", () => ({
	loadCharacterPNGs: vi.fn(async () => undefined),
	loadWallPNG: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pixel-office/engine/renderer", async () => {
	const actual = await vi.importActual<
		typeof import("@/lib/pixel-office/engine/renderer")
	>("@/lib/pixel-office/engine/renderer");
	return {
		...actual,
		renderFrame: vi.fn(),
	};
});

vi.mock("@/lib/pixel-office/agentBridge", () => ({
	syncAgentsToOffice: vi.fn(),
}));

vi.mock("../components/agent-card", () => ({
	AgentCard: () => <div>Agent card</div>,
}));

vi.mock("./components/EditActionBar", () => ({
	EditActionBar: ({ onSave }: { onSave: () => void }) => (
		<button type="button" onClick={onSave}>
			save-layout
		</button>
	),
}));

vi.mock("./components/EditorToolbar", () => ({
	EditorToolbar: () => <div>Editor toolbar</div>,
}));

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const OriginalImage = globalThis.Image;
const originalMatchMedia = window.matchMedia;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const mockCanvasContext = {
	imageSmoothingEnabled: false,
	scale: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	clearRect: vi.fn(),
	drawImage: vi.fn(),
	fillRect: vi.fn(),
	fillText: vi.fn(),
	strokeRect: vi.fn(),
	strokeText: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	stroke: vi.fn(),
	setTransform: vi.fn(),
	resetTransform: vi.fn(),
	measureText: vi.fn(() => ({ width: 0 })),
} as unknown as CanvasRenderingContext2D;

beforeAll(() => {
	window.matchMedia = vi.fn().mockImplementation(() => ({
		matches: false,
		media: "",
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
	window.requestAnimationFrame = vi.fn(() => 1);
	window.cancelAnimationFrame = vi.fn();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		() => mockCanvasContext,
	);
	class MockImage {
		onload: null | (() => void) = null;
		private _src = "";

		set src(value: string) {
			this._src = value;
			queueMicrotask(() => this.onload?.());
		}

		get src(): string {
			return this._src;
		}
	}
	globalThis.Image = MockImage as unknown as typeof Image;
});

afterAll(() => {
	globalThis.Image = OriginalImage;
	window.matchMedia = originalMatchMedia;
	window.requestAnimationFrame = originalRequestAnimationFrame;
	window.cancelAnimationFrame = originalCancelAnimationFrame;
	HTMLCanvasElement.prototype.getContext = originalGetContext;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	localStorage.clear();
});

describe("Pixel office page operator banners", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockRunProtectedRequest.mockReset().mockResolvedValue({
			ok: false,
			mutation: {
				ok: false,
				type: "sensitive_mutation",
				state: "origin_denied",
				message: "Cross-origin dashboard writes are not allowed.",
			},
			status: 403,
		});

		fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === "/api/pixel-office/layout") {
				return jsonResponse({ layout: null });
			}
			if (url === "/api/pixel-office/contributions") {
				return jsonResponse({ weeks: [], username: "mock" });
			}
			if (url === "/api/activity-heatmap") {
				return jsonResponse({ agents: [] });
			}
			if (url === "/api/pixel-office/idle-rank") {
				return jsonResponse({ items: [] });
			}
			if (url === "/api/agent-activity") {
				return jsonResponse({ agents: [] });
			}
			if (url === "/api/config") {
				return jsonResponse({
					agents: [],
					providers: [],
					defaults: {
						model: "openai/gpt-4.1",
						fallbacks: [],
					},
				});
			}
			if (url === "/api/gateway-health") {
				return jsonResponse({
					ok: true,
					status: "healthy",
					checkedAt: 1743379200000,
					responseMs: 40,
				});
			}
			if (url === "/api/pixel-office/version") {
				return jsonResponse({
					tag: "v1.0.0",
					name: "v1.0.0",
					publishedAt: "2026-03-31T00:00:00.000Z",
					body: "",
					htmlUrl: "https://example.com/release",
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	it("shows a denied-state banner when layout saves are rejected", async () => {
		render(<PixelOfficePage />);

		const editModeButton = await screen.findByRole("button", {
			name: "pixelOffice.editMode",
		});
		fireEvent.click(editModeButton);

		const saveButton = await screen.findByRole("button", {
			name: "save-layout",
		});
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(
				screen.getByText("Cross-origin dashboard writes are not allowed."),
			).toBeTruthy();
		});
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("Access denied");
		expect(document.activeElement).toBe(alert);
	});

	it("loads version data from the bounded endpoint without a force-refresh query", async () => {
		render(<PixelOfficePage />);

		await waitFor(() => {
			expect(
				fetchMock.mock.calls.some(
					([input]) => String(input) === "/api/pixel-office/version",
				),
			).toBe(true);
		});
		expect(
			fetchMock.mock.calls.some(([input]) =>
				String(input).includes("/api/pixel-office/version?force=1"),
			),
		).toBe(false);
	});
});
