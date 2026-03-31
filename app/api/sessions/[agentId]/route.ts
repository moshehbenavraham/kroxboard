import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveOpenclawAgentSessionsFile } from "@/lib/openclaw-paths";
import {
	createInvalidRequestBoundaryResponse,
	validateAgentId,
} from "@/lib/security/request-boundary";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ agentId: string }> },
) {
	try {
		const { agentId: rawAgentId } = await params;
		const agentId = validateAgentId(rawAgentId);
		if (!agentId.ok) {
			return createInvalidRequestBoundaryResponse(agentId.error);
		}

		const sessionsPath = resolveOpenclawAgentSessionsFile(agentId.value);
		if (!sessionsPath) {
			return createInvalidRequestBoundaryResponse({
				ok: false,
				type: "invalid_request_boundary",
				field: "agentId",
				reason: "invalid_format",
				message: "Invalid agentId",
			});
		}
		if (!fs.existsSync(sessionsPath)) {
			return NextResponse.json({ agentId: agentId.value, sessions: [] });
		}

		const raw = fs.readFileSync(sessionsPath, "utf-8");
		const sessions = JSON.parse(raw);

		const list = Object.entries(sessions).map(([key, val]: [string, any]) => {
			// Derive the session type from the key.
			let type = "unknown";
			let target = "";
			if (key.endsWith(":main")) {
				type = "main";
			} else if (key.includes(":feishu:direct:")) {
				type = "feishu-dm";
				target = key.split(":feishu:direct:")[1];
			} else if (key.includes(":feishu:group:")) {
				type = "feishu-group";
				target = key.split(":feishu:group:")[1];
			} else if (key.includes(":discord:direct:")) {
				type = "discord-dm";
				target = key.split(":discord:direct:")[1];
			} else if (key.includes(":discord:channel:")) {
				type = "discord-channel";
				target = key.split(":discord:channel:")[1];
			} else if (key.includes(":telegram:direct:")) {
				type = "telegram-dm";
				target = key.split(":telegram:direct:")[1];
			} else if (key.includes(":telegram:group:")) {
				type = "telegram-group";
				target = key.split(":telegram:group:")[1];
			} else if (key.includes(":whatsapp:direct:")) {
				type = "whatsapp-dm";
				target = key.split(":whatsapp:direct:")[1];
			} else if (key.includes(":whatsapp:group:")) {
				type = "whatsapp-group";
				target = key.split(":whatsapp:group:")[1];
			} else if (key.includes(":cron:")) {
				type = "cron";
				target = key.split(":cron:")[1];
			}

			return {
				key,
				type,
				target,
				sessionId: val.sessionId || null,
				updatedAt: val.updatedAt || 0,
				totalTokens: val.totalTokens || 0,
				contextTokens: val.contextTokens || 0,
				systemSent: val.systemSent || false,
			};
		});

		// Sort by most recent activity.
		list.sort((a, b) => b.updatedAt - a.updatedAt);

		return NextResponse.json({ agentId: agentId.value, sessions: list });
	} catch {
		return NextResponse.json(
			{ error: "Unable to load sessions" },
			{ status: 500 },
		);
	}
}
