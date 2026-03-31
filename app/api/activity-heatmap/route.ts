import path from "node:path";
import { NextResponse } from "next/server";
import { MAX_ANALYTICS_SESSION_FILE_BYTES } from "@/lib/openclaw-analytics";
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

const CACHE_KEY = "activity-heatmap";
const CACHE_TTL = 5 * 60 * 1000;
const MAX_AGENT_COUNT = 128;
const MAX_SESSION_FILES_PER_AGENT = 256;

async function buildHeatmapData(): Promise<{
	agents: { agentId: string; grid: number[][] }[];
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

	const result: { agentId: string; grid: number[][] }[] = [];

	for (const agentId of agentIds) {
		const grid: number[][] = Array.from({ length: 7 }, () =>
			new Array(24).fill(0),
		);
		const sessionsDir = path.join(agentsDir, agentId, "sessions");
		const files = await listBoundedDirectory(sessionsDir, {
			allowMissing: true,
			filter: (entry) =>
				entry.isFile() &&
				entry.name.endsWith(".jsonl") &&
				!entry.name.includes(".deleted."),
			maxEntries: MAX_SESSION_FILES_PER_AGENT,
		});

		for (const file of files) {
			const content = await readBoundedTextFile(path.join(sessionsDir, file), {
				allowMissing: true,
				maxBytes: MAX_ANALYTICS_SESSION_FILE_BYTES,
			});
			if (!content) {
				continue;
			}

			for (const line of content.split("\n")) {
				if (!line.trim()) continue;

				let entry: {
					type?: string;
					message?: { role?: string };
					timestamp?: string | number;
				};
				try {
					entry = JSON.parse(line);
				} catch {
					continue;
				}
				if (entry.type !== "message" || !entry.message || !entry.timestamp)
					continue;
				if (entry.message.role !== "assistant") continue;

				const dt = new Date(entry.timestamp);
				const shanghai = new Date(
					dt.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }),
				);
				const hour = shanghai.getHours();
				const jsDay = shanghai.getDay(); // 0=Sun
				const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon ... 6=Sun
				grid[dayOfWeek][hour]++;
			}
		}

		result.push({ agentId, grid });
	}

	return { agents: result };
}

/**
 * Per-agent message activity grids: 7x24 (dayOfWeek x hour).
 * dayOfWeek: 0=Monday ... 6=Sunday, hour: 0-23 in Asia/Shanghai timezone.
 * Cached for 5 minutes server-side.
 */
export async function GET(request: Request) {
	const rateLimit = enforceDiagnosticRateLimit(request, "activity_heatmap");
	if (!rateLimit.ok) return rateLimit.response;

	try {
		const data = await getCachedComputation(CACHE_KEY, {
			ttlMs: CACHE_TTL,
			load: buildHeatmapData,
		});
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(data),
			rateLimit.metadata,
		);
	} catch (error: unknown) {
		console.error("[activity-heatmap] failed", error);
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(
				{ error: "Activity heatmap generation failed" },
				{ status: 500 },
			),
			rateLimit.metadata,
		);
	}
}
