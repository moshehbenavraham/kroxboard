import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

interface TestRequest {
  agentId: string;
  platform: string;
  sessionKey: string;
}

async function testPlatformSession(req: TestRequest): Promise<{
  agentId: string;
  platform: string;
  ok: boolean;
  reply?: string;
  error?: string;
  elapsed: number;
}> {
  const startTime = Date.now();
  try {
    const result = execSync(
      `openclaw agent --agent ${req.agentId} --session-id "${req.sessionKey}" --message "Platform health check: reply with OK" --timeout 30 --json`,
      { timeout: 40000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );

    const elapsed = Date.now() - startTime;
    const lines = result.split("\n");
    const jsonStartIdx = lines.findIndex(l => l.trimStart().startsWith("{"));
    if (jsonStartIdx === -1) {
      return { agentId: req.agentId, platform: req.platform, ok: false, error: "No JSON in CLI output", elapsed };
    }
    const jsonStr = lines.slice(jsonStartIdx).join("\n");
    const data = JSON.parse(jsonStr);
    const payloads = data?.result?.payloads || [];
    const reply = payloads[0]?.text || "";
    const durationMs = data?.result?.meta?.durationMs || elapsed;
    const ok = data.status === "ok";

    return {
      agentId: req.agentId,
      platform: req.platform,
      ok,
      reply: reply ? reply.slice(0, 200) : (ok ? "(no reply)" : ""),
      error: ok ? undefined : "Agent returned error status",
      elapsed: durationMs,
    };
  } catch (execErr: any) {
    const elapsed = Date.now() - startTime;
    const isTimeout = execErr.killed || execErr.signal === "SIGTERM";
    return {
      agentId: req.agentId,
      platform: req.platform,
      ok: false,
      error: isTimeout
        ? "Timeout: platform not responding (30s)"
        : (execErr.stderr || execErr.message || "Unknown error").slice(0, 300),
      elapsed,
    };
  }
}

export async function POST() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    const defaults = config.agents?.defaults || {};
    const defaultModel = typeof defaults.model === "string"
      ? defaults.model
      : defaults.model?.primary || "unknown";
    const bindings = config.bindings || [];
    const channels = config.channels || {};
    const feishuAccounts = channels.feishu?.accounts || {};

    let agentList = config.agents?.list || [];
    if (agentList.length === 0) {
      try {
        const agentsDir = path.join(OPENCLAW_HOME, "agents");
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        agentList = dirs
          .filter((d: any) => d.isDirectory() && !d.name.startsWith("."))
          .map((d: any) => ({ id: d.name }));
      } catch {}
      if (agentList.length === 0) {
        agentList = [{ id: "main" }];
      }
    }

    // Build test requests for each agent's platforms
    const testRequests: TestRequest[] = [];

    for (const agent of agentList) {
      const id = agent.id;

      // Find feishu sessions
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      const hasFeishuBinding = !!feishuBinding;
      const hasFeishuAccount = !!feishuAccounts[id];

      if (hasFeishuBinding || hasFeishuAccount) {
        // Find the most recent feishu DM session for this agent
        try {
          const sessionsPath = path.join(OPENCLAW_HOME, `agents/${id}/sessions/sessions.json`);
          const sessRaw = fs.readFileSync(sessionsPath, "utf-8");
          const sessions = JSON.parse(sessRaw);
          let bestKey: string | null = null;
          let bestTime = 0;
          for (const [key, val] of Object.entries(sessions)) {
            if (key.match(/^agent:[^:]+:feishu:direct:/)) {
              const updatedAt = (val as any).updatedAt || 0;
              if (updatedAt > bestTime) { bestTime = updatedAt; bestKey = key; }
            }
          }
          if (bestKey) {
            testRequests.push({ agentId: id, platform: "feishu", sessionKey: bestKey });
          }
        } catch {}
      }

      // main agent special: also check discord
      if (id === "main" && channels.discord?.enabled) {
        try {
          const sessionsPath = path.join(OPENCLAW_HOME, `agents/${id}/sessions/sessions.json`);
          const sessRaw = fs.readFileSync(sessionsPath, "utf-8");
          const sessions = JSON.parse(sessRaw);
          let bestKey: string | null = null;
          let bestTime = 0;
          for (const [key, val] of Object.entries(sessions)) {
            if (key.match(/^agent:[^:]+:discord:direct:/)) {
              const updatedAt = (val as any).updatedAt || 0;
              if (updatedAt > bestTime) { bestTime = updatedAt; bestKey = key; }
            }
          }
          if (bestKey) {
            testRequests.push({ agentId: id, platform: "discord", sessionKey: bestKey });
          }
        } catch {}
      }

      // Non-main agents with discord bindings
      if (id !== "main") {
        const discordBinding = bindings.find(
          (b: any) => b.agentId === id && b.match?.channel === "discord"
        );
        if (discordBinding) {
          try {
            const sessionsPath = path.join(OPENCLAW_HOME, `agents/${id}/sessions/sessions.json`);
            const sessRaw = fs.readFileSync(sessionsPath, "utf-8");
            const sessions = JSON.parse(sessRaw);
            let bestKey: string | null = null;
            let bestTime = 0;
            for (const [key, val] of Object.entries(sessions)) {
              if (key.match(/^agent:[^:]+:discord:direct:/)) {
                const updatedAt = (val as any).updatedAt || 0;
                if (updatedAt > bestTime) { bestTime = updatedAt; bestKey = key; }
              }
            }
            if (bestKey) {
              testRequests.push({ agentId: id, platform: "discord", sessionKey: bestKey });
            }
          } catch {}
        }
      }
    }

    // Run all tests in parallel
    const results = await Promise.all(testRequests.map(testPlatformSession));

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
