import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// 配置文件路径：优先使用 OPENCLAW_HOME 环境变量，否则默认 ~/.openclaw
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");
const OPENCLAW_DIR = OPENCLAW_HOME;

// 从配置的 allowFrom 读取用户 id，用于构建 session key

// 从 OpenClaw sessions 文件获取每个 agent 最近活跃的飞书 DM session 的用户 open_id
function getFeishuUserOpenIds(agentIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const agentId of agentIds) {
    try {
      const sessionsPath = path.join(OPENCLAW_DIR, `agents/${agentId}/sessions/sessions.json`);
      const raw = fs.readFileSync(sessionsPath, "utf-8");
      const sessions = JSON.parse(raw);
      let best: { openId: string; updatedAt: number } | null = null;
      for (const [key, val] of Object.entries(sessions)) {
        const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
        if (m) {
          const updatedAt = (val as any).updatedAt || 0;
          if (!best || updatedAt > best.updatedAt) {
            best = { openId: m[1], updatedAt };
          }
        }
      }
      if (best) map[agentId] = best.openId;
    } catch {}
  }
  return map;
}
// 从 IDENTITY.md 读取机器人名字
function readIdentityName(agentId: string, agentDir?: string, workspace?: string): string | null {
  const candidates = [
    agentDir ? path.join(agentDir, "IDENTITY.md") : null,
    workspace ? path.join(workspace, "IDENTITY.md") : null,
    path.join(OPENCLAW_DIR, `agents/${agentId}/agent/IDENTITY.md`),
    path.join(OPENCLAW_DIR, `workspace-${agentId}/IDENTITY.md`),
    // 只有 main agent 才 fallback 到默认 workspace
    agentId === "main" ? path.join(OPENCLAW_DIR, `workspace/IDENTITY.md`) : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, "utf-8");
      const match = content.match(/\*\*Name:\*\*\s*(.+)/);
      if (match) {
        const name = match[1].trim();
        if (name && !name.startsWith("_") && !name.startsWith("(")) return name;
      }
    } catch {}
  }
  return null;
}

export async function GET() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    // 提取 agents 信息
    const defaults = config.agents?.defaults || {};
    const defaultModel = typeof defaults.model === "string"
      ? defaults.model
      : defaults.model?.primary || "unknown";
    const fallbacks = typeof defaults.model === "object"
      ? defaults.model?.fallbacks || []
      : [];

    const agentList = config.agents?.list || [];
    const bindings = config.bindings || [];
    const channels = config.channels || {};
    const feishuAccounts = channels.feishu?.accounts || {};

    // 从 OpenClaw sessions 文件获取每个 agent 飞书 DM 的用户 open_id
    const agentIds = agentList.map((a: any) => a.id);
    const feishuUserOpenIds = getFeishuUserOpenIds(agentIds);
    const discordDmAllowFrom = channels.discord?.dm?.allowFrom || [];

    // 构建 agent 详情
    const agents = await Promise.all(agentList.map(async (agent: any) => {
      const id = agent.id;
      const identityName = readIdentityName(id, agent.agentDir, agent.workspace);
      const name = identityName || agent.name || id;
      const emoji = agent.identity?.emoji || "🤖";
      const model = agent.model || defaultModel;

      // 查找绑定的平台
      const platforms: { name: string; accountId?: string; appId?: string; botOpenId?: string; botUserId?: string }[] = [];

      // 检查飞书绑定
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      if (feishuBinding) {
        const accountId = feishuBinding.match?.accountId || id;
        const acc = feishuAccounts[accountId];
        const appId = acc?.appId;
        const userOpenId = feishuUserOpenIds[id] || null;
        platforms.push({ name: "feishu", accountId, appId, ...(userOpenId && { botOpenId: userOpenId }) });
      }

      // main agent 特殊处理：默认绑定所有未显式绑定的 channel
      if (id === "main") {
        if (!feishuBinding && channels.feishu?.enabled) {
          const acc = feishuAccounts["main"];
          const appId = acc?.appId || channels.feishu?.appId;
          const userOpenId = feishuUserOpenIds["main"] || null;
          platforms.push({ name: "feishu", accountId: "main", appId, ...(userOpenId && { botOpenId: userOpenId }) });
        }
        if (channels.discord?.enabled) {
          const botUserId = discordDmAllowFrom[0] || null;
          platforms.push({ name: "discord", ...(botUserId && { botUserId }) });
        }
      }

      return { id, name, emoji, model, platforms };
    }));

    // 提取模型 providers
    const providers = Object.entries(config.models?.providers || {}).map(
      ([providerId, provider]: [string, any]) => {
        const models = (provider.models || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          reasoning: m.reasoning,
          input: m.input,
        }));

        // 找出使用该 provider 的 agents
        const usedBy = agents
          .filter((a: any) => a.model.startsWith(providerId + "/"))
          .map((a: any) => ({ id: a.id, emoji: a.emoji }));

        return {
          id: providerId,
          api: provider.api,
          models,
          usedBy,
        };
      }
    );

    return NextResponse.json({
      agents,
      providers,
      defaults: { model: defaultModel, fallbacks },
      gateway: { port: config.gateway?.port || 18789, token: config.gateway?.auth?.token || "" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
