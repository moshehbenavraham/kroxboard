import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCallOpenclawGateway = vi.fn();
const mockResolveConfigSnapshotHash = vi.fn();
const mockClearConfigCache = vi.fn();

vi.mock("@/lib/openclaw-cli", () => ({
	callOpenclawGateway: mockCallOpenclawGateway,
	resolveConfigSnapshotHash: mockResolveConfigSnapshotHash,
}));

vi.mock("@/lib/config-cache", () => ({
	clearConfigCache: mockClearConfigCache,
}));

const ORIGINAL_ENV = { ...process.env };

function applyBaseEnv(): void {
	process.env.DASHBOARD_HOST = "board.example.com";
	process.env.DASHBOARD_ALLOWED_EMAILS = "operator@example.com";
	process.env.DASHBOARD_CF_ACCESS_ENABLED = "true";
	process.env.DASHBOARD_CF_ACCESS_OTP_PRIMARY = "true";
	process.env.DASHBOARD_CF_ACCESS_SESSION_HOURS = "24";
	process.env.DASHBOARD_CF_ACCESS_AUD = "cf-aud";
	process.env.DASHBOARD_CF_ACCESS_EMAIL_HEADER =
		"CF-Access-Authenticated-User-Email";
	process.env.DASHBOARD_CF_ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
	process.env.DASHBOARD_OPERATOR_CODE_REQUIRED = "true";
	process.env.DASHBOARD_OPERATOR_CODE = "correct horse battery staple";
	process.env.DASHBOARD_OPERATOR_COOKIE_SECRET =
		"0123456789abcdef0123456789abcdef";
	process.env.DASHBOARD_OPERATOR_SESSION_HOURS = "12";
}

describe("PATCH /api/config/agent-model", () => {
	beforeEach(() => {
		vi.resetModules();
		mockCallOpenclawGateway.mockReset();
		mockResolveConfigSnapshotHash.mockReset();
		mockClearConfigCache.mockReset();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("denies remote requests before touching the gateway when identity is missing", async () => {
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("https://board.example.com/api/config/agent-model", {
				method: "PATCH",
				headers: {
					host: "board.example.com",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					agentId: "main",
					model: "provider/model-two",
				}),
			}),
		);

		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.auth.state).toBe("identity_denied");
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
		expect(mockClearConfigCache).not.toHaveBeenCalled();
	});
});
