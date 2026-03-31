import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe("gateway launch server helpers", () => {
	const originalEnv = { ...process.env };
	let tempHome = "";

	beforeEach(() => {
		vi.resetModules();
		tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "krox-gateway-launch-"));
		process.env = { ...originalEnv, OPENCLAW_HOME: tempHome };
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		if (tempHome) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
	});

	it("resolves agent launches to the main session key", async () => {
		const { resolveGatewayLaunchSessionKey } = await import(
			"./gateway-launch-server"
		);
		expect(
			resolveGatewayLaunchSessionKey({ kind: "agent", agentId: "main" }),
		).toBe("agent:main:main");
	});

	it("resolves platform launches from the stored sessions index", async () => {
		writeJson(path.join(tempHome, "agents/main/sessions/sessions.json"), {
			"agent:main:discord:direct:older": { updatedAt: 1 },
			"agent:main:discord:direct:newer": { updatedAt: 2 },
		});
		const { resolveGatewayLaunchSessionKey } = await import(
			"./gateway-launch-server"
		);
		expect(
			resolveGatewayLaunchSessionKey({
				kind: "platform",
				agentId: "main",
				platform: "discord",
			}),
		).toBe("agent:main:discord:direct:newer");
	});

	it("falls back to the configured main discord user when no direct session exists", async () => {
		writeJson(path.join(tempHome, "openclaw.json"), {
			channels: {
				discord: {
					dm: { allowFrom: ["fallback-user"] },
				},
			},
		});
		writeJson(path.join(tempHome, "agents/main/sessions/sessions.json"), {});
		const { resolveGatewayLaunchSessionKey } = await import(
			"./gateway-launch-server"
		);
		expect(
			resolveGatewayLaunchSessionKey({
				kind: "platform",
				agentId: "main",
				platform: "discord",
			}),
		).toBe("agent:main:discord:direct:fallback-user");
	});
});
