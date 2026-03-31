import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";

// 30-second in-memory cache.
let statsCache: { data: unknown; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

interface DayStat {
	date: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	messageCount: number;
	avgResponseMs: number;
}

interface InternalDayStat extends DayStat {
	responseTimes: number[];
}

async function parseAgentSessions(agentId: string): Promise<InternalDayStat[]> {
	const sessionsDir = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions`);
	const dayMap: Record<string, InternalDayStat> = {};

	let fileNames: string[];
	try {
		fileNames = (await fs.promises.readdir(sessionsDir)).filter(
			(f) => f.endsWith(".jsonl") && !f.includes(".deleted."),
		);
	} catch {
		return [];
	}

	// Read all JSONL files in parallel.
	const fileContents = await Promise.all(
		fileNames.map(async (file) => {
			try {
				return await fs.promises.readFile(
					path.join(sessionsDir, file),
					"utf-8",
				);
			} catch {
				return null;
			}
		}),
	);

	for (const content of fileContents) {
		if (!content) continue;

		const lines = content.trim().split("\n");
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
			const date = ts.slice(0, 10);
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
				dayMap[date].inputTokens += msg.usage.input || 0;
				dayMap[date].outputTokens += msg.usage.output || 0;
				dayMap[date].totalTokens += msg.usage.totalTokens || 0;
				dayMap[date].messageCount += 1;
			}
		}

		// O(n) response-time calculation: pair each user message with the next assistant stop.
		let lastUserTs: string | null = null;
		for (const msg of messages) {
			if (msg.role === "user") {
				lastUserTs = msg.ts;
			} else if (
				msg.role === "assistant" &&
				msg.stopReason === "stop" &&
				lastUserTs
			) {
				const diffMs =
					new Date(msg.ts).getTime() - new Date(lastUserTs).getTime();
				if (diffMs > 0 && diffMs < 600000) {
					const date = lastUserTs.slice(0, 10);
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
				lastUserTs = null;
			}
		}
	}
	return Object.values(dayMap);
}

function aggregateToWeeklyMonthly(daily: DayStat[]) {
	const weekMap: Record<string, DayStat> = {};
	const monthMap: Record<string, DayStat> = {};

	for (const d of daily) {
		const dt = new Date(`${d.date}T00:00:00Z`);
		const day = dt.getUTCDay();
		const mondayOffset = day === 0 ? -6 : 1 - day;
		const monday = new Date(dt.getTime() + mondayOffset * 86400000);
		const weekKey = monday.toISOString().slice(0, 10);

		if (!weekMap[weekKey])
			weekMap[weekKey] = {
				date: weekKey,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				messageCount: 0,
				avgResponseMs: 0,
			};
		weekMap[weekKey].inputTokens += d.inputTokens;
		weekMap[weekKey].outputTokens += d.outputTokens;
		weekMap[weekKey].totalTokens += d.totalTokens;
		weekMap[weekKey].messageCount += d.messageCount;

		const monthKey = d.date.slice(0, 7);
		if (!monthMap[monthKey])
			monthMap[monthKey] = {
				date: monthKey,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
				messageCount: 0,
				avgResponseMs: 0,
			};
		monthMap[monthKey].inputTokens += d.inputTokens;
		monthMap[monthKey].outputTokens += d.outputTokens;
		monthMap[monthKey].totalTokens += d.totalTokens;
		monthMap[monthKey].messageCount += d.messageCount;
	}

	return {
		weekly: Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date)),
		monthly: Object.values(monthMap).sort((a, b) =>
			a.date.localeCompare(b.date),
		),
	};
}

export async function GET(request: Request) {
	const rateLimit = enforceDiagnosticRateLimit(request, "stats_all");
	if (!rateLimit.ok) return rateLimit.response;

	// Return cached data when available.
	if (statsCache && Date.now() - statsCache.ts < CACHE_TTL_MS) {
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(statsCache.data),
			rateLimit.metadata,
		);
	}

	try {
		const agentsDir = path.join(OPENCLAW_HOME, "agents");
		let agentIds: string[];
		try {
			agentIds = fs
				.readdirSync(agentsDir)
				.filter((f) => fs.statSync(path.join(agentsDir, f)).isDirectory());
		} catch {
			agentIds = [];
		}

		// Process all agents in parallel.
		const allAgentDays = await Promise.all(
			agentIds.map((id) => parseAgentSessions(id)),
		);

		const dayMap: Record<string, InternalDayStat> = {};
		for (const agentDays of allAgentDays) {
			for (const ad of agentDays) {
				if (!dayMap[ad.date]) {
					dayMap[ad.date] = {
						date: ad.date,
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
						messageCount: 0,
						avgResponseMs: 0,
						responseTimes: [],
					};
				}
				const d = dayMap[ad.date];
				d.inputTokens += ad.inputTokens;
				d.outputTokens += ad.outputTokens;
				d.totalTokens += ad.totalTokens;
				d.messageCount += ad.messageCount;
				d.responseTimes.push(...ad.responseTimes);
			}
		}

		const daily: DayStat[] = Object.values(dayMap)
			.sort((a, b) => a.date.localeCompare(b.date))
			.map(({ responseTimes, ...rest }) => {
				if (responseTimes.length > 0) {
					rest.avgResponseMs = Math.round(
						responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
					);
				}
				return rest;
			});

		const { weekly, monthly } = aggregateToWeeklyMonthly(daily);

		const data = { daily, weekly, monthly };
		statsCache = { data, ts: Date.now() };
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(data),
			rateLimit.metadata,
		);
	} catch (err: unknown) {
		console.error("[stats-all] failed", err);
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ error: "Stats aggregation failed" }, { status: 500 }),
			rateLimit.metadata,
		);
	}
}
