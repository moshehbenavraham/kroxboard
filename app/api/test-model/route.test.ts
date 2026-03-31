import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockProbeModel = vi.fn();

vi.mock("@/lib/model-probe", () => ({
	DEFAULT_MODEL_PROBE_TIMEOUT_MS: 15000,
	probeModel: mockProbeModel,
}));

const ORIGINAL_ENV = { ...process.env };

function withLocalOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: "http://localhost:3000",
		...headers,
	};
}

function withCrossOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		origin: "https://evil.example.com",
		...headers,
	};
}

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
	process.env.ENABLE_PROVIDER_PROBES = "true";
}

async function makeAuthCookie(): Promise<string> {
	const { parseDashboardAuthEnv } = await import(
		"@/lib/security/dashboard-env"
	);
	const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } = await import(
		"@/lib/security/operator-session"
	);
	const env = parseDashboardAuthEnv(process.env);
	const { token } = createOperatorSession(
		{ mode: "localhost", subject: "localhost", email: null, isLocal: true },
		env,
		new Date(),
	);
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("POST /api/test-model", () => {
	beforeEach(() => {
		vi.resetModules();
		mockProbeModel.mockReset();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns a typed feature-disabled response when provider probes are off", async () => {
		process.env.ENABLE_PROVIDER_PROBES = "false";
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ provider: "openai", modelId: "gpt-4.1" }),
			}),
		);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			feature: {
				flag: "ENABLE_PROVIDER_PROBES",
			},
		});
		expect(mockProbeModel).not.toHaveBeenCalled();
	});

	it("returns 400 for missing probe inputs", async () => {
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ provider: "openai" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("rejects cross-origin provider probes before calling the provider", async () => {
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: withCrossOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ provider: "openai", modelId: "gpt-4.1" }),
			}),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			mutation: {
				state: "origin_denied",
				type: "sensitive_mutation",
			},
		});
		expect(mockProbeModel).not.toHaveBeenCalled();
	});

	it("returns probe results when provider probes are enabled", async () => {
		mockProbeModel.mockResolvedValue({
			ok: true,
			elapsed: 25,
			model: "openai/gpt-4.1",
			mode: "api_key",
			status: "ok",
			text: "OK",
			precision: "model",
			source: "direct_model_probe",
		});
		const cookie = await makeAuthCookie();
		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ provider: "openai", modelId: "gpt-4.1" }),
			}),
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			ok: true,
			model: "openai/gpt-4.1",
			elapsed: 25,
		});
	});

	it("returns 429 after repeated provider probes from the same identity", async () => {
		mockProbeModel.mockResolvedValue({
			ok: true,
			elapsed: 25,
			model: "openai/gpt-4.1",
			mode: "api_key",
			status: "ok",
			text: "OK",
			precision: "model",
			source: "direct_model_probe",
		});
		const cookie = await makeAuthCookie();
		const route = await import("./route");

		for (let attempt = 0; attempt < 6; attempt++) {
			const response = await route.POST(
				new Request("http://localhost:3000/api/test-model", {
					method: "POST",
					headers: withLocalOrigin({
						"Content-Type": "application/json",
						"cf-connecting-ip": "198.51.100.50",
						cookie,
					}),
					body: JSON.stringify({ provider: "openai", modelId: "gpt-4.1" }),
				}),
			);
			expect(response.status).toBe(200);
		}

		const denied = await route.POST(
			new Request("http://localhost:3000/api/test-model", {
				method: "POST",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					"cf-connecting-ip": "198.51.100.50",
					cookie,
				}),
				body: JSON.stringify({ provider: "openai", modelId: "gpt-4.1" }),
			}),
		);
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				type: "diagnostic_rate_limit",
				capability: "provider_probe",
			},
		});
		expect(mockProbeModel).toHaveBeenCalledTimes(6);
	});
});
