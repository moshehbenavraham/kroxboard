import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

// State model:
// working = assistant activity within 2 minutes
// online = activity within 10 minutes
// idle = activity within 24 hours
// offline = inactive for more than 24 hours
type AgentState = "working" | "online" | "idle" | "offline";

interface AgentStatus {
	agentId: string;
	state: AgentState;
	lastActive: number | null;
}

function getAgentState(agentId: string): AgentStatus {
	const sessionsDir = path.join(
		/*turbopackIgnore: true*/ OPENCLAW_HOME,
		`agents/${agentId}/sessions`,
	);
	const now = Date.now();
	let lastActive: number | null = null;
	let lastAssistantTs: number | null = null;

	// Read the latest activity time from sessions.json.
	try {
		const sessionsPath = path.join(sessionsDir, "sessions.json");
		const raw = fs.readFileSync(sessionsPath, "utf-8");
		const sessions = JSON.parse(raw);
		for (const val of Object.values(sessions)) {
			const ts = (val as { updatedAt?: number }).updatedAt || 0;
			if (ts > (lastActive || 0)) lastActive = ts;
		}
	} catch {}

	// Scan recent JSONL files to find the latest assistant message.
	try {
		const files = fs
			.readdirSync(sessionsDir)
			.filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted."))
			.map((f) => ({
				name: f,
				mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
			}))
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, 5); // Only inspect the 5 most recent files.

		for (const file of files) {
			// Only inspect files touched in the last 3 minutes.
			if (now - file.mtime > 3 * 60 * 1000) continue;

			const content = fs.readFileSync(
				path.join(sessionsDir, file.name),
				"utf-8",
			);
			const lines = content.trim().split("\n");
			// Scan backward to find the latest assistant message.
			for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
				try {
					const entry = JSON.parse(lines[i]);
					if (
						entry.type === "message" &&
						entry.message?.role === "assistant" &&
						entry.timestamp
					) {
						const ts = new Date(entry.timestamp).getTime();
						if (!lastAssistantTs || ts > lastAssistantTs) lastAssistantTs = ts;
						if (ts > (lastActive || 0)) lastActive = ts;
					}
				} catch {}
			}
		}
	} catch {}

	let state: AgentState = "offline";
	if (lastActive) {
		const diff = now - lastActive;
		if (lastAssistantTs && now - lastAssistantTs < 3 * 60 * 1000) {
			state = "working";
		} else if (diff < 10 * 60 * 1000) {
			state = "online";
		} else if (diff < 24 * 60 * 60 * 1000) {
			state = "idle";
		}
	}

	return { agentId, state, lastActive };
}

export async function GET() {
	try {
		const agentsDir = path.join(
			/*turbopackIgnore: true*/ OPENCLAW_HOME,
			"agents",
		);
		let agentIds: string[];
		try {
			agentIds = fs
				.readdirSync(agentsDir, { withFileTypes: true })
				.filter((d) => d.isDirectory() && !d.name.startsWith("."))
				.map((d) => d.name);
		} catch {
			agentIds = ["main"];
		}

		const statuses = agentIds.map((id) => getAgentState(id));
		return NextResponse.json({ statuses });
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
