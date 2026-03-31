import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCallOpenclawGateway = vi.fn();
const mockResolveConfigSnapshotHash = vi.fn();
const mockClearConfigCache = vi.fn();
const mockResolveOpenclawAgentSessionsFile = vi.fn();

vi.mock("@/lib/openclaw-cli", () => ({
	callOpenclawGateway: mockCallOpenclawGateway,
	resolveConfigSnapshotHash: mockResolveConfigSnapshotHash,
}));

vi.mock("@/lib/config-cache", () => ({
	clearConfigCache: mockClearConfigCache,
}));

const mockFsExistsSync = vi.fn(() => false);
const mockFsReadFileSync = vi.fn(() => "{}");
const mockFsWriteFileSync = vi.fn();
const mockFsRenameSync = vi.fn();
const mockFsMkdirSync = vi.fn();

vi.mock("node:fs", () => {
	const fsMock = {
		existsSync: (filePath: string) => (mockFsExistsSync as any)(filePath),
		readFileSync: (filePath: string, encoding?: string) =>
			(mockFsReadFileSync as any)(filePath, encoding),
		writeFileSync: (filePath: string, data: string, encoding?: string) =>
			(mockFsWriteFileSync as any)(filePath, data, encoding),
		renameSync: (fromPath: string, toPath: string) =>
			(mockFsRenameSync as any)(fromPath, toPath),
		mkdirSync: (dirPath: string, options?: { recursive?: boolean }) =>
			(mockFsMkdirSync as any)(dirPath, options),
	};
	return { ...fsMock, default: fsMock };
});

vi.mock("@/lib/openclaw-paths", () => ({
	isValidOpenclawAgentId: (agentId: string) =>
		/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(agentId),
	resolveOpenclawAgentSessionsFile: (agentId: string) =>
		(mockResolveOpenclawAgentSessionsFile as any)(agentId),
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

function withRemoteOrigin(
	headers: Record<string, string> = {},
): Record<string, string> {
	return {
		host: "board.example.com",
		origin: "https://board.example.com",
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
	process.env.ENABLE_MODEL_MUTATIONS = "true";
}

async function makeLocalAuthCookie(): Promise<string> {
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
		new Date("2026-03-31T00:00:00.000Z"),
	);
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("PATCH /api/config/agent-model", () => {
	beforeEach(() => {
		vi.resetModules();
		mockCallOpenclawGateway.mockReset();
		mockResolveConfigSnapshotHash.mockReset();
		mockClearConfigCache.mockReset();
		mockResolveOpenclawAgentSessionsFile
			.mockReset()
			.mockImplementation(
				(agentId: string) => `/mock/agents/${agentId}/sessions/sessions.json`,
			);
		mockFsExistsSync.mockReset().mockReturnValue(false);
		mockFsReadFileSync.mockReset().mockReturnValue("{}");
		mockFsWriteFileSync.mockReset();
		mockFsRenameSync.mockReset();
		mockFsMkdirSync.mockReset();
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
				headers: withRemoteOrigin({
					"Content-Type": "application/json",
				}),
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

	it("returns 400 when agentId is missing", async () => {
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ model: "provider/model" }),
			}),
		);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toContain("Missing");
	});

	it("returns 400 when agentId is invalid", async () => {
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "../evil",
					model: "provider/model",
				}),
			}),
		);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			invalid: {
				field: "agentId",
				reason: "invalid_format",
			},
		});
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
	});

	it("rejects cross-origin writes before touching the gateway", async () => {
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withCrossOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "provider/model-two",
				}),
			}),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			mutation: {
				state: "origin_denied",
				type: "sensitive_mutation",
			},
		});
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
		expect(mockClearConfigCache).not.toHaveBeenCalled();
	});

	it("returns 403 when model mutations are disabled", async () => {
		process.env.ENABLE_MODEL_MUTATIONS = "false";
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "provider/model",
				}),
			}),
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			feature: {
				flag: "ENABLE_MODEL_MUTATIONS",
			},
		});
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
	});

	it("returns 400 when model is missing", async () => {
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ agentId: "main" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("rejects malformed JSON before touching the gateway", async () => {
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: "{",
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			invalid: {
				field: "body",
				reason: "invalid_json",
				type: "invalid_request",
			},
		});
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
		expect(mockResolveConfigSnapshotHash).not.toHaveBeenCalled();
		expect(mockClearConfigCache).not.toHaveBeenCalled();
	});

	it("rejects oversized JSON before touching the gateway", async () => {
		const cookie = await makeLocalAuthCookie();
		const oversizedBody = JSON.stringify({
			agentId: "main",
			model: "provider/model",
			padding: "x".repeat(3000),
		});
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					"Content-Length": String(Buffer.byteLength(oversizedBody)),
					cookie,
				}),
				body: oversizedBody,
			}),
		);

		expect(response.status).toBe(413);
		await expect(response.json()).resolves.toMatchObject({
			invalid: {
				field: "body",
				reason: "payload_too_large",
				type: "invalid_request",
			},
		});
		expect(mockCallOpenclawGateway).not.toHaveBeenCalled();
		expect(mockResolveConfigSnapshotHash).not.toHaveBeenCalled();
		expect(mockClearConfigCache).not.toHaveBeenCalled();
	});

	it("returns 400 when config snapshot is invalid", async () => {
		mockCallOpenclawGateway.mockResolvedValue({
			result: { valid: false, config: null },
		});
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ agentId: "main", model: "prov/model" }),
			}),
		);
		expect(response.status).toBe(400);
	});

	it("returns 500 when baseHash cannot be resolved", async () => {
		mockCallOpenclawGateway.mockResolvedValue({
			result: {
				valid: true,
				config: { agents: { list: [{ id: "main", model: "prov/old" }] } },
			},
		});
		mockResolveConfigSnapshotHash.mockReturnValue(null);
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ agentId: "main", model: "prov/model" }),
			}),
		);
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toContain("baseHash");
	});

	it("returns 404 when agent is not found in config", async () => {
		mockCallOpenclawGateway.mockResolvedValue({
			result: {
				valid: true,
				config: { agents: { list: [{ id: "other", model: "prov/m" }] } },
			},
		});
		mockResolveConfigSnapshotHash.mockReturnValue("abc123");
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ agentId: "main", model: "prov/model" }),
			}),
		);
		expect(response.status).toBe(404);
	});

	it("returns 400 when model is not in the known models set", async () => {
		mockCallOpenclawGateway.mockResolvedValue({
			result: {
				valid: true,
				config: {
					agents: {
						list: [{ id: "main", model: "prov/existing" }],
						defaults: { model: "prov/existing" },
					},
				},
			},
		});
		mockResolveConfigSnapshotHash.mockReturnValue("abc123");
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "unknown/model-xyz",
				}),
			}),
		);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toContain("Unknown model");
	});

	it("handles gateway errors with appropriate status codes", async () => {
		mockCallOpenclawGateway.mockRejectedValue(
			new Error("Gateway closed unexpectedly"),
		);
		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({ agentId: "main", model: "prov/model" }),
			}),
		);
		expect(response.status).toBe(503);
	});

	it("applies the model change and returns success", async () => {
		const config = {
			models: {
				providers: {
					prov: {
						models: [{ id: "existing" }, { id: "new-model" }],
					},
				},
			},
			agents: {
				list: [{ id: "main", model: "prov/existing" }],
			},
		};
		const updatedConfig = {
			...config,
			agents: { list: [{ id: "main", model: "prov/new-model" }] },
		};

		mockCallOpenclawGateway
			.mockResolvedValueOnce({ result: { valid: true, config } })
			.mockResolvedValueOnce({ result: { ok: true } })
			.mockResolvedValueOnce({
				result: { valid: true, config: updatedConfig },
			});
		mockResolveConfigSnapshotHash.mockReturnValue("hash123");

		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "prov/new-model",
				}),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.agentId).toBe("main");
		expect(body.model).toBe("prov/new-model");
		expect(body.applied).toBe(true);
		expect(mockClearConfigCache).toHaveBeenCalledTimes(2);
	});

	it("clears session model fields when sessions exist", async () => {
		const config = {
			models: {
				providers: {
					prov: {
						models: [{ id: "existing" }, { id: "new-model" }],
					},
				},
			},
			agents: {
				list: [{ id: "main", model: "prov/existing" }],
			},
		};
		const updatedConfig = {
			...config,
			agents: { list: [{ id: "main", model: "prov/new-model" }] },
		};

		mockCallOpenclawGateway
			.mockResolvedValueOnce({ result: { valid: true, config } })
			.mockResolvedValueOnce({ result: { ok: true } })
			.mockResolvedValueOnce({
				result: { valid: true, config: updatedConfig },
			});
		mockResolveConfigSnapshotHash.mockReturnValue("hash123");
		mockFsExistsSync.mockReturnValue(true);
		mockFsReadFileSync.mockReturnValue(
			JSON.stringify({
				session1: {
					providerOverride: "prov",
					modelOverride: "x",
					model: "prov/old",
				},
			}),
		);

		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "prov/new-model",
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(mockFsWriteFileSync).toHaveBeenCalled();
		expect(mockFsRenameSync).toHaveBeenCalled();
	});

	it("skips session cleanup when bounded session-path resolution fails", async () => {
		const config = {
			models: {
				providers: {
					prov: {
						models: [{ id: "existing" }, { id: "new-model" }],
					},
				},
			},
			agents: {
				list: [{ id: "main", model: "prov/existing" }],
			},
		};
		const updatedConfig = {
			...config,
			agents: { list: [{ id: "main", model: "prov/new-model" }] },
		};

		mockCallOpenclawGateway
			.mockResolvedValueOnce({ result: { valid: true, config } })
			.mockResolvedValueOnce({ result: { ok: true } })
			.mockResolvedValueOnce({
				result: { valid: true, config: updatedConfig },
			});
		mockResolveConfigSnapshotHash.mockReturnValue("hash123");
		mockResolveOpenclawAgentSessionsFile.mockReturnValue(null);

		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "prov/new-model",
				}),
			}),
		);

		expect(response.status).toBe(200);
		const existsCalls = mockFsExistsSync.mock.calls as unknown as Array<
			[unknown]
		>;
		expect(
			existsCalls.some(([filePath]) =>
				String(filePath).includes("/mock/agents/main/sessions/sessions.json"),
			),
		).toBe(false);
		expect(mockFsWriteFileSync).not.toHaveBeenCalled();
		expect(mockFsRenameSync).not.toHaveBeenCalled();
	});

	it("recognizes models from defaults with object model and fallbacks", async () => {
		const config = {
			models: { providers: {} },
			agents: {
				list: [{ id: "main", model: "prov/current" }],
				defaults: {
					model: {
						primary: "prov/current",
						fallbacks: ["prov/fallback-model"],
					},
					models: { "prov/models-key": {} },
				},
			},
		};
		const updatedConfig = {
			...config,
			agents: {
				...config.agents,
				list: [{ id: "main", model: "prov/fallback-model" }],
			},
		};

		mockCallOpenclawGateway
			.mockResolvedValueOnce({ result: { valid: true, config } })
			.mockResolvedValueOnce({ result: { ok: true } })
			.mockResolvedValueOnce({
				result: { valid: true, config: updatedConfig },
			});
		mockResolveConfigSnapshotHash.mockReturnValue("hash123");

		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "prov/fallback-model",
				}),
			}),
		);

		expect(response.status).toBe(200);
	});

	it("returns 409 for config conflict errors", async () => {
		const config = {
			models: {
				providers: {
					prov: { models: [{ id: "model" }] },
				},
			},
			agents: {
				list: [{ id: "main", model: "prov/model" }],
			},
		};

		mockCallOpenclawGateway
			.mockResolvedValueOnce({ result: { valid: true, config } })
			.mockRejectedValueOnce(new Error("Config changed since last load"));
		mockResolveConfigSnapshotHash.mockReturnValue("hash123");

		const cookie = await makeLocalAuthCookie();
		const route = await import("./route");
		const response = await route.PATCH(
			new Request("http://localhost:3000/api/config/agent-model", {
				method: "PATCH",
				headers: withLocalOrigin({
					"Content-Type": "application/json",
					cookie,
				}),
				body: JSON.stringify({
					agentId: "main",
					model: "prov/model",
				}),
			}),
		);

		expect(response.status).toBe(409);
	});
});
