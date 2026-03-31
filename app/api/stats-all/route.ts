import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import {
	getCachedComputation,
	listBoundedDirectory,
	readBoundedTextFile,
} from "@/lib/openclaw-read-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";

const CACHE_KEY = "stats-all";
const CACHE_TTL_MS = 30_000;
const MAX_AGENT_COUNT = 128;
const MAX_SESSION_FILES_PER_AGENT = 256;
const MAX_SESSION_FILE_BYTES = 1_048_576;

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
	const sessionsDir = path.join(
		/*turbopackIgnore: true*/ OPENCLAW_HOME,
		`agents/${agentId}/sessions`,
	);
	const dayMap: Record<string, InternalDayStat> = {};

	const fileNames = await listBoundedDirectory(sessionsDir, {
		allowMissing: true,
		filter: (entry) =>
			entry.isFile() &&
			entry.name.endsWith(".jsonl") &&
			!entry.name.includes(".deleted."),
		maxEntries: MAX_SESSION_FILES_PER_AGENT,
	});

	for (const fileName of fileNames) {
		const content = await readBoundedTextFile(
			path.join(sessionsDir, fileName),
			{
				allowMissing: true,
				maxBytes: MAX_SESSION_FILE_BYTES,
			},
		);
		if (!content) continue;

		const lines = content.split("\n");
		const messages: { role: string; ts: string; stopReason?: string }[] = [];

		for (const line of lines) {
			if (!line.trim()) continue;

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

function aggregateToWeeklyMonthly(daily: DayStat[]): {
	monthly: DayStat[];
	weekly: DayStat[];
} {
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

async function buildStatsPayload(): Promise<{
	daily: DayStat[];
	monthly: DayStat[];
	weekly: DayStat[];
}> {
	const agentsDir = path.join(
		/*turbopackIgnore: true*/ OPENCLAW_HOME,
		"agents",
	);
	const agentIds = await listBoundedDirectory(agentsDir, {
		allowMissing: true,
		filter: (entry) => entry.isDirectory(),
		maxEntries: MAX_AGENT_COUNT,
	});

	const allAgentDays = await Promise.all(
		agentIds.map((agentId) => parseAgentSessions(agentId)),
	);

	const dayMap: Record<string, InternalDayStat> = {};
	for (const agentDays of allAgentDays) {
		for (const agentDay of agentDays) {
			if (!dayMap[agentDay.date]) {
				dayMap[agentDay.date] = {
					date: agentDay.date,
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					messageCount: 0,
					avgResponseMs: 0,
					responseTimes: [],
				};
			}
			const day = dayMap[agentDay.date];
			day.inputTokens += agentDay.inputTokens;
			day.outputTokens += agentDay.outputTokens;
			day.totalTokens += agentDay.totalTokens;
			day.messageCount += agentDay.messageCount;
			day.responseTimes.push(...agentDay.responseTimes);
		}
	}

	const daily = Object.values(dayMap)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map(({ responseTimes, ...rest }) => {
			if (responseTimes.length > 0) {
				rest.avgResponseMs = Math.round(
					responseTimes.reduce((sum, value) => sum + value, 0) /
						responseTimes.length,
				);
			}
			return rest;
		});
	const { weekly, monthly } = aggregateToWeeklyMonthly(daily);

	return { daily, weekly, monthly };
}

export async function GET(request: Request) {
	const rateLimit = enforceDiagnosticRateLimit(request, "stats_all");
	if (!rateLimit.ok) return rateLimit.response;

	try {
		const data = await getCachedComputation(CACHE_KEY, {
			ttlMs: CACHE_TTL_MS,
			load: buildStatsPayload,
		});
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(data),
			rateLimit.metadata,
		);
	} catch (error: unknown) {
		console.error("[stats-all] failed", error);
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ error: "Stats aggregation failed" }, { status: 500 }),
			rateLimit.metadata,
		);
	}
}
