import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveOpenclawAgentSessionsDir } from "@/lib/openclaw-paths";
import {
	createInvalidRequestBoundaryResponse,
	validateAgentId,
} from "@/lib/security/request-boundary";

interface DayStat {
	date: string; // YYYY-MM-DD
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	messageCount: number;
	avgResponseMs: number;
	responseTimes: number[]; // internal, stripped before response
}

function parseSessions(sessionsDir: string): Omit<DayStat, "responseTimes">[] {
	const dayMap: Record<string, DayStat> = {};

	// Find all JSONL files (skip deleted ones)
	let files: string[];
	try {
		files = fs
			.readdirSync(sessionsDir)
			.filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted."));
	} catch {
		return [];
	}

	for (const file of files) {
		const filePath = path.join(sessionsDir, file);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const lines = content.trim().split("\n");
		// Collect messages for response time calculation
		const messages: { role: string; ts: string; stopReason?: string }[] = [];

		for (const line of lines) {
			let entry: {
				type?: string;
				message?: {
					role?: string;
					stopReason?: string;
					usage?: { input?: number; output?: number; totalTokens?: number };
				};
				timestamp?: string;
			};
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}

			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (!msg || !entry.timestamp || !msg.role) continue;

			const ts = entry.timestamp;
			const date = ts.slice(0, 10); // YYYY-MM-DD from ISO string

			messages.push({ role: msg.role, ts, stopReason: msg.stopReason });

			if (msg.role === "assistant" && msg.usage) {
				if (!dayMap[date]) {
					dayMap[date] = {
						date,
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
						messageCount: 0,
						avgResponseMs: 0,
						responseTimes: [],
					};
				}
				const day = dayMap[date];
				day.inputTokens += msg.usage.input || 0;
				day.outputTokens += msg.usage.output || 0;
				day.totalTokens += msg.usage.totalTokens || 0;
				day.messageCount += 1;
			}
		}

		// Calculate response times: user msg -> next assistant msg with stopReason=stop
		for (let i = 0; i < messages.length; i++) {
			if (messages[i].role !== "user") continue;
			for (let j = i + 1; j < messages.length; j++) {
				if (
					messages[j].role === "assistant" &&
					messages[j].stopReason === "stop"
				) {
					const userTs = new Date(messages[i].ts).getTime();
					const assistTs = new Date(messages[j].ts).getTime();
					const diffMs = assistTs - userTs;
					if (diffMs > 0 && diffMs < 600000) {
						// cap at 10 min
						const date = messages[i].ts.slice(0, 10);
						if (!dayMap[date]) {
							dayMap[date] = {
								date,
								inputTokens: 0,
								outputTokens: 0,
								totalTokens: 0,
								messageCount: 0,
								avgResponseMs: 0,
								responseTimes: [],
							};
						}
						dayMap[date].responseTimes.push(diffMs);
					}
					break;
				}
			}
		}
	}

	// Compute avg response time and clean up
	const result = Object.values(dayMap).sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	for (const day of result) {
		if (day.responseTimes.length > 0) {
			day.avgResponseMs = Math.round(
				day.responseTimes.reduce((a, b) => a + b, 0) / day.responseTimes.length,
			);
		}
	}

	return result.map(({ responseTimes, ...rest }) => rest);
}

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

		const sessionsDir = resolveOpenclawAgentSessionsDir(agentId.value);
		if (!sessionsDir) {
			return createInvalidRequestBoundaryResponse({
				ok: false,
				type: "invalid_request_boundary",
				field: "agentId",
				reason: "invalid_format",
				message: "Invalid agentId",
			});
		}

		const daily = parseSessions(sessionsDir);

		// Aggregate weekly and monthly
		const weekMap: Record<string, Omit<DayStat, "responseTimes">> = {};
		const monthMap: Record<string, Omit<DayStat, "responseTimes">> = {};

		for (const d of daily) {
			// Week: get Monday of that week
			const dt = new Date(`${d.date}T00:00:00Z`);
			const day = dt.getUTCDay();
			const mondayOffset = day === 0 ? -6 : 1 - day;
			const monday = new Date(dt.getTime() + mondayOffset * 86400000);
			const weekKey = monday.toISOString().slice(0, 10);

			if (!weekMap[weekKey]) {
				weekMap[weekKey] = {
					date: weekKey,
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					messageCount: 0,
					avgResponseMs: 0,
				};
			}
			const w = weekMap[weekKey];
			w.inputTokens += d.inputTokens;
			w.outputTokens += d.outputTokens;
			w.totalTokens += d.totalTokens;
			w.messageCount += d.messageCount;

			// Month
			const monthKey = d.date.slice(0, 7);
			if (!monthMap[monthKey]) {
				monthMap[monthKey] = {
					date: monthKey,
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					messageCount: 0,
					avgResponseMs: 0,
				};
			}
			const m = monthMap[monthKey];
			m.inputTokens += d.inputTokens;
			m.outputTokens += d.outputTokens;
			m.totalTokens += d.totalTokens;
			m.messageCount += d.messageCount;
		}

		return NextResponse.json({
			agentId: agentId.value,
			daily,
			weekly: Object.values(weekMap).sort((a, b) =>
				a.date.localeCompare(b.date),
			),
			monthly: Object.values(monthMap).sort((a, b) =>
				a.date.localeCompare(b.date),
			),
		});
	} catch {
		return NextResponse.json(
			{ error: "Unable to load stats" },
			{ status: 500 },
		);
	}
}
