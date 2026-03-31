import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGatewayAgentLaunchPath } from "@/lib/gateway-launch";

const mockRequireSensitiveRouteAccess = vi.fn();
const mockRequireSensitiveMutationAccess = vi.fn();
const mockReadJsonFileSync = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("@/lib/security/sensitive-route", () => ({
	requireSensitiveRouteAccess: mockRequireSensitiveRouteAccess,
}));

vi.mock("@/lib/security/sensitive-mutation", () => ({
	requireSensitiveMutationAccess: mockRequireSensitiveMutationAccess,
}));

vi.mock("@/lib/json", () => ({
	readJsonFileSync: mockReadJsonFileSync,
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		warn: mockLoggerWarn,
		error: mockLoggerError,
	},
}));

describe("gateway proxy route", () => {
	beforeEach(() => {
		vi.resetModules();
		mockRequireSensitiveRouteAccess.mockReset();
		mockRequireSensitiveMutationAccess.mockReset();
		mockReadJsonFileSync.mockReset();
		mockLoggerWarn.mockReset();
		mockLoggerError.mockReset();
		mockRequireSensitiveRouteAccess.mockReturnValue({
			ok: true,
			identity: { mode: "localhost", subject: "localhost", email: null },
			session: { issuedAt: "now", expiresAt: "later" },
		});
		mockRequireSensitiveMutationAccess.mockReturnValue({
			ok: true,
			identity: { mode: "localhost", subject: "localhost", email: null },
			session: { issuedAt: "now", expiresAt: "later" },
		});
		mockReadJsonFileSync.mockReturnValue({
			gateway: {
				port: 18789,
				auth: { token: "secret-token" },
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("denies access before proxying when auth fails", async () => {
		mockRequireSensitiveRouteAccess.mockReturnValue({
			ok: false,
			response: new Response("denied", { status: 401 }),
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost/gateway/chat"),
			{
				params: Promise.resolve({ path: ["chat"] }),
			},
		);

		expect(response.status).toBe(401);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects invalid launch payloads", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const route = await import("./route");
		const response = await route.GET(
			new Request("http://localhost/gateway/chat?launch=not-valid", {
				headers: { accept: "application/json" },
			}),
			{
				params: Promise.resolve({ path: ["chat"] }),
			},
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			ok: false,
			error: "Invalid gateway launch target",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("attaches the gateway credential server-side for proxied launches", async () => {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				expect(url).toContain("http://127.0.0.1:18789/chat?");
				expect(url).toContain("session=agent%3Amain%3Amain");
				expect(url).toContain("token=secret-token");
				expect(init?.headers).toBeInstanceOf(Headers);
				expect((init?.headers as Headers).get("Authorization")).toBe(
					"Bearer secret-token",
				);
				return new Response("proxied", {
					status: 200,
					headers: { "content-type": "text/plain; charset=utf-8" },
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		const launchPath = buildGatewayAgentLaunchPath("main");
		const route = await import("./route");
		const response = await route.GET(
			new Request(`http://localhost${launchPath}`),
			{
				params: Promise.resolve({ path: ["chat"] }),
			},
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("proxied");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("denies mutation requests before proxying when same-origin enforcement fails", async () => {
		mockRequireSensitiveMutationAccess.mockReturnValue({
			ok: false,
			response: new Response("mutation denied", { status: 403 }),
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const route = await import("./route");
		const response = await route.POST(
			new Request("http://localhost/gateway/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ prompt: "hello" }),
			}),
			{
				params: Promise.resolve({ path: ["chat"] }),
			},
		);

		expect(response.status).toBe(403);
		expect(mockRequireSensitiveMutationAccess).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
