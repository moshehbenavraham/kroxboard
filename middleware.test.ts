import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function createMockRequest(
	url: string,
	headers: Record<string, string> = {},
): any {
	const req = new Request(url, { headers });
	return Object.assign(req, {
		ip: headers["x-real-ip"] || "127.0.0.1",
		nextUrl: new URL(url),
	});
}

describe("middleware", () => {
	it("sets security headers", () => {
		const request = createMockRequest("http://localhost:3000/api/test");
		const response = middleware(request);

		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
		expect(response.headers.get("Referrer-Policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
			"same-origin",
		);
		expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
			"same-origin",
		);
		expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
		expect(response.headers.get("X-DNS-Prefetch-Control")).toBe("off");
	});

	it("sets Content-Security-Policy header", () => {
		const request = createMockRequest("http://localhost:3000/");
		const response = middleware(request);

		const csp = response.headers.get("Content-Security-Policy");
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self'");
	});

	it("sets rate limit headers", () => {
		const request = createMockRequest("http://localhost:3000/api/test", {
			"x-forwarded-for": "10.0.0.1",
		});
		const response = middleware(request);

		expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
		const remaining = Number(response.headers.get("X-RateLimit-Remaining"));
		expect(remaining).toBeLessThanOrEqual(100);
		expect(remaining).toBeGreaterThanOrEqual(0);
		expect(response.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
	});

	it("uses CF-Connecting-IP when available", () => {
		const r1 = createMockRequest("http://localhost:3000/api/test", {
			"cf-connecting-ip": "1.2.3.4",
		});
		const res1 = middleware(r1);
		expect(res1.status).not.toBe(429);
	});

	it("returns 429 when rate limit is exceeded", () => {
		const ip = `ratelimit-test-${Date.now()}`;
		for (let i = 0; i < 101; i++) {
			const req = createMockRequest("http://localhost:3000/api/test", {
				"cf-connecting-ip": ip,
			});
			const res = middleware(req);
			if (i === 100) {
				expect(res.status).toBe(429);
				expect(res.headers.get("Retry-After")).toBe("60");
				expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
			}
		}
	});
});
