import { describe, expect, it } from "vitest";
import { buildGatewayUrl } from "@/lib/gateway-url";

describe("buildGatewayUrl", () => {
	it("builds a URL with host override and port", () => {
		const url = buildGatewayUrl(18789, "/api/status", undefined, "myhost");
		expect(url).toBe("http://myhost:18789/api/status");
	});

	it("falls back to localhost in SSR (no window)", () => {
		const url = buildGatewayUrl(18789, "/api/status");
		expect(url).toBe("http://localhost:18789/api/status");
	});

	it("uses a full URL override without appending port", () => {
		const url = buildGatewayUrl(
			18789,
			"/api/status",
			undefined,
			"https://openclaw.local",
		);
		expect(url).toBe("https://openclaw.local/api/status");
	});

	it("strips trailing slash from full URL base", () => {
		const url = buildGatewayUrl(
			18789,
			"/api/status",
			undefined,
			"https://openclaw.local/",
		);
		expect(url).toBe("https://openclaw.local/api/status");
	});

	it("appends query parameters", () => {
		const url = buildGatewayUrl(
			18789,
			"/api/call",
			{ method: "getStatus", timeout: "5000" },
			"myhost",
		);
		const parsed = new URL(url);
		expect(parsed.searchParams.get("method")).toBe("getStatus");
		expect(parsed.searchParams.get("timeout")).toBe("5000");
	});

	it("skips empty-string query parameter values", () => {
		const url = buildGatewayUrl(
			18789,
			"/api/call",
			{ key: "val", empty: "" },
			"myhost",
		);
		const parsed = new URL(url);
		expect(parsed.searchParams.get("key")).toBe("val");
		expect(parsed.searchParams.has("empty")).toBe(false);
	});

	it("handles whitespace-only host override by falling back", () => {
		const url = buildGatewayUrl(18789, "/api/status", undefined, "   ");
		expect(url).toBe("http://localhost:18789/api/status");
	});
});
