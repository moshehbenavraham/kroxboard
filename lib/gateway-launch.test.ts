import { describe, expect, it } from "vitest";
import {
	buildGatewayAgentLaunchPath,
	buildGatewayHomeLaunchPath,
	buildGatewayPlatformLaunchPath,
	buildGatewaySessionLaunchPath,
	decodeGatewayLaunchTarget,
	encodeGatewayLaunchTarget,
	getGatewayLaunchParamName,
	getLatestDirectSessionKeyFromSessions,
	validateGatewayProxyPath,
} from "@/lib/gateway-launch";

describe("gateway launch helpers", () => {
	it("builds the same-origin gateway home launch path", () => {
		expect(buildGatewayHomeLaunchPath()).toBe("/gateway/chat");
	});

	it("encodes and decodes agent launch targets", () => {
		const path = buildGatewayAgentLaunchPath("main");
		expect(path).toMatch(/^\/gateway\/chat\?launch=/);

		const url = new URL(`https://board.example${path}`);
		const launch = url.searchParams.get(getGatewayLaunchParamName());
		expect(launch).toBeTruthy();
		expect(decodeGatewayLaunchTarget(launch || "")).toEqual({
			kind: "agent",
			agentId: "main",
		});
	});

	it("builds platform launch paths without exposing raw ids in the URL", () => {
		const path = buildGatewaySessionLaunchPath(
			"agent:main:discord:direct:123456789",
		);
		expect(path).toBeTruthy();
		expect(path).not.toContain("123456789");
	});

	it("rejects invalid launch target identifiers", () => {
		expect(buildGatewayAgentLaunchPath("../main")).toBeNull();
		expect(buildGatewayPlatformLaunchPath("main", "discord/main")).toBeNull();
		expect(buildGatewaySessionLaunchPath("bad key")).toBeNull();
	});

	it("round-trips platform launch targets", () => {
		const encoded = encodeGatewayLaunchTarget({
			kind: "platform",
			agentId: "main",
			platform: "discord",
		});
		expect(decodeGatewayLaunchTarget(encoded)).toEqual({
			kind: "platform",
			agentId: "main",
			platform: "discord",
		});
	});

	it("validates proxy path segments and rejects traversal", () => {
		expect(validateGatewayProxyPath(["chat", "assets", "app.js"])).toEqual([
			"chat",
			"assets",
			"app.js",
		]);
		expect(validateGatewayProxyPath(["chat", ".."])).toBeNull();
		expect(validateGatewayProxyPath(["chat", "nested/path"])).toBeNull();
	});

	it("picks the latest direct session for a platform", () => {
		const latest = getLatestDirectSessionKeyFromSessions(
			{
				"agent:main:discord:direct:older": { updatedAt: 1 },
				"agent:main:discord:direct:newer": { updatedAt: 2 },
				"agent:main:main": { updatedAt: 5 },
			},
			"discord",
		);
		expect(latest).toBe("agent:main:discord:direct:newer");
	});

	it("builds valid platform launch paths", () => {
		const launchPath = buildGatewayPlatformLaunchPath("main", "discord");
		expect(launchPath).toBeTruthy();
		expect(launchPath).toMatch(/^\/gateway\/chat\?launch=/);
	});

	it("handles feishu platform session keys", () => {
		const latest = getLatestDirectSessionKeyFromSessions(
			{
				"agent:main:feishu:direct:ou_abc123def456": { updatedAt: 10 },
			},
			"feishu",
		);
		expect(latest).toBe("agent:main:feishu:direct:ou_abc123def456");
	});

	it("rejects empty path segments", () => {
		expect(validateGatewayProxyPath([""])).toBeNull();
	});

	it("returns null for invalid decode targets", () => {
		expect(decodeGatewayLaunchTarget("not-valid-base64!!!")).toBeNull();
	});

	it("returns null for sessions with no direct matches", () => {
		const latest = getLatestDirectSessionKeyFromSessions(
			{
				"agent:main:main": { updatedAt: 5 },
			},
			"discord",
		);
		expect(latest).toBeNull();
	});

	it("returns null for invalid platform in getLatestDirectSessionKeyFromSessions", () => {
		expect(getLatestDirectSessionKeyFromSessions({}, "../invalid")).toBeNull();
	});
});
