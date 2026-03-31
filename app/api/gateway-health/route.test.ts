import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
const mockExec = vi.fn();
const mockReadJsonFileSync = vi.fn();
const ORIGINAL_ENV = { ...process.env };

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
	exec: mockExec,
	default: {
		execFile: mockExecFile,
		exec: mockExec,
	},
}));

vi.mock("node:util", async () => ({
	promisify: (value: unknown) => value,
	default: {
		promisify: (value: unknown) => value,
	},
}));

vi.mock("@/lib/json", () => ({
	readJsonFileSync: mockReadJsonFileSync,
}));

describe("GET /api/gateway-health", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		mockExecFile.mockReset();
		mockExec.mockReset();
		mockReadJsonFileSync.mockReset();
		mockReadJsonFileSync.mockReturnValue({
			gateway: {
				port: 18789,
				auth: { token: "gateway-secret" },
			},
		});
		mockExecFile.mockImplementation(async (...args: any[]) => {
			const commandArgs = Array.isArray(args[1]) ? args[1] : [];
			if (commandArgs.includes("--version")) {
				return { stdout: "2026.3.1\n", stderr: "" };
			}
			return {
				stdout: JSON.stringify({ rpc: { ok: false, error: "Gateway down" } }),
				stderr: "",
			};
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns a same-origin launch path for healthy gateway responses", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/health")) {
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.launchPath).toBe("/gateway/chat");
		expect(body.data).toBeUndefined();
		expect(body.webUrl).toBeUndefined();
	});

	it("uses OPENCLAW_CONFIG_PATH when resolving the runtime config location", async () => {
		process.env.OPENCLAW_HOME = "/tmp/openclaw-home";
		process.env.OPENCLAW_CONFIG_PATH = "config/runtime.json";
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/health")) {
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(200);
		expect(mockReadJsonFileSync).toHaveBeenCalledWith(
			"/tmp/openclaw-home/config/runtime.json",
		);
	});

	it("omits launch metadata when the gateway is down", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/health")) {
				return new Response("upstream failed", { status: 500 });
			}
			if (url.includes("/chat?token=")) {
				return new Response("upstream failed", { status: 500 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { GET } = await import("./route");
		const response = await GET();
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.ok).toBe(false);
		expect(body.status).toBe("down");
		expect(body.launchPath).toBeUndefined();
		expect(body.error).toBe("Gateway down");
	});

	it("returns healthy when the HTTP and web probes fail but the CLI probe succeeds", async () => {
		mockExecFile.mockImplementation(async (...args: any[]) => {
			const commandArgs = Array.isArray(args[1]) ? args[1] : [];
			if (commandArgs.includes("--version")) {
				return { stdout: "2026.3.1\n", stderr: "" };
			}
			return {
				stdout: JSON.stringify({ rpc: { ok: true } }),
				stderr: "",
			};
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/health")) {
				return new Response("upstream failed", { status: 500 });
			}
			if (url.includes("/chat?token=")) {
				return new Response("upstream failed", { status: 500 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { GET } = await import("./route");
		const response = await GET();
		const body = await response.json();

		expect(body.ok).toBe(true);
		expect(body.status).toBe("healthy");
		expect(body.launchPath).toBe("/gateway/chat");
		expect(body.data).toBeUndefined();
	});

	it("returns a sanitized down-state error when the CLI probe output is malformed", async () => {
		mockExecFile.mockImplementation(async (...args: any[]) => {
			const commandArgs = Array.isArray(args[1]) ? args[1] : [];
			if (commandArgs.includes("--version")) {
				return { stdout: "2026.3.1\n", stderr: "" };
			}
			return {
				stdout: "warning only",
				stderr: "still not json",
			};
		});

		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/health")) {
				return new Response("upstream failed", { status: 500 });
			}
			if (url.includes("/chat?token=")) {
				return new Response("upstream failed", { status: 500 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const { GET } = await import("./route");
		const response = await GET();
		const body = await response.json();

		expect(body.ok).toBe(false);
		expect(body.status).toBe("down");
		expect(body.error).toBe(
			"Gateway status probe returned malformed OpenClaw output",
		);
		expect(body.launchPath).toBeUndefined();
	});
});
