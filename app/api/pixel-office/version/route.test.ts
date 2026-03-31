import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function createVersionRequest(ip: string): Request {
	return new Request("http://localhost:3000/api/pixel-office/version", {
		headers: {
			"cf-connecting-ip": ip,
		},
	});
}

describe("GET /api/pixel-office/version", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		process.env.OPENCLAW_REPO = "openclaw/openclaw";
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns cached release data on later reads and rate limits repeated checks", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						tag_name: "v1.2.3",
						name: "v1.2.3",
						published_at: "2026-03-31T00:00:00.000Z",
						body: "Release notes",
						html_url: "https://example.com/releases/v1.2.3",
					}),
					{ status: 200 },
				),
		);
		vi.stubGlobal("fetch", fetchSpy);
		const route = await import("./route");

		const first = await route.GET(createVersionRequest("198.51.100.62"));
		expect(first.status).toBe(200);
		await expect(first.json()).resolves.toMatchObject({
			tag: "v1.2.3",
			cached: false,
		});
		const firstBody = await route.GET(createVersionRequest("198.51.100.63"));
		const firstPayload = await firstBody.json();
		expect(firstPayload.body).toBeUndefined();
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const second = await route.GET(createVersionRequest("198.51.100.62"));
		expect(second.status).toBe(200);
		await expect(second.json()).resolves.toMatchObject({
			tag: "v1.2.3",
			cached: true,
			stale: false,
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		for (let attempt = 0; attempt < 4; attempt++) {
			const response = await route.GET(createVersionRequest("198.51.100.62"));
			expect(response.status).toBe(200);
		}

		const denied = await route.GET(createVersionRequest("198.51.100.62"));
		expect(denied.status).toBe(429);
		await expect(denied.json()).resolves.toMatchObject({
			rateLimit: {
				capability: "pixel_office_version",
			},
		});
	});
});
