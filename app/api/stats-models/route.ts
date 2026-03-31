import path from "node:path";
import { NextResponse } from "next/server";
import { MAX_ANALYTICS_SESSION_FILE_BYTES } from "@/lib/openclaw-analytics";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";
import {
	getCachedComputation,
	listBoundedDirectory,
	readBoundedTextFile,
} from "@/lib/openclaw-read-paths";

const CACHE_KEY = "stats-models";
const CACHE_TTL_MS = 30_000;
const MAX_AGENT_COUNT = 128;
const MAX_SESSION_FILES_PER_AGENT = 256;

interface ModelStat {
	modelId: string;
	provider: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	messageCount: number;
	avgResponseMs: number;
}

interface InternalModelStat extends ModelStat {
	responseTimes: number[];
}

interface ParsedModelMessage {
	model?: string;
	provider: string;
	role: string;
	stopReason?: string;
	timestamp: string;
	usage?: {
		input?: number;
		output?: number;
		totalTokens?: number;
	};
}

async function buildModelStatsPayload(): Promise<{ models: ModelStat[] }> {
	const agentsDir = path.join(
		/*turbopackIgnore: true*/ OPENCLAW_HOME,
		"agents",
	);
	const agentIds = await listBoundedDirectory(agentsDir, {
		allowMissing: true,
		filter: (entry) => entry.isDirectory(),
		maxEntries: MAX_AGENT_COUNT,
	});

	const modelMap: Record<string, InternalModelStat> = {};

	await Promise.all(
		agentIds.map(async (agentId) => {
			const sessionsDir = path.join(agentsDir, agentId, "sessions");
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
						maxBytes: MAX_ANALYTICS_SESSION_FILE_BYTES,
					},
				);
				if (!content) {
					continue;
				}

				const messages: ParsedModelMessage[] = [];
				for (const line of content.split("\n")) {
					if (!line.trim()) continue;

					let entry: {
						type?: string;
						message?: {
							role?: string;
							stopReason?: string;
							usage?: {
								input?: number;
								output?: number;
								totalTokens?: number;
							};
							model?: string;
							provider?: string;
						};
						timestamp?: string;
					};
					try {
						entry = JSON.parse(line);
					} catch {
						continue;
					}
					if (entry.type !== "message" || !entry.message || !entry.timestamp) {
						continue;
					}

					const message = entry.message;
					if (!message.role) {
						continue;
					}

					messages.push({
						role: message.role,
						stopReason: message.stopReason,
						usage: message.usage,
						model: message.model,
						provider: message.provider || "unknown",
						timestamp: entry.timestamp,
					});
				}

				for (const message of messages) {
					if (message.role === "assistant" && message.usage && message.model) {
						const key = `${message.provider}/${message.model}`;
						if (!modelMap[key]) {
							modelMap[key] = {
								modelId: message.model,
								provider: message.provider,
								inputTokens: 0,
								outputTokens: 0,
								totalTokens: 0,
								messageCount: 0,
								avgResponseMs: 0,
								responseTimes: [],
							};
						}
						const modelStats = modelMap[key];
						modelStats.inputTokens += message.usage.input || 0;
						modelStats.outputTokens += message.usage.output || 0;
						modelStats.totalTokens += message.usage.totalTokens || 0;
						modelStats.messageCount += 1;
					}
				}

				let lastUserTimestamp: string | null = null;
				for (const message of messages) {
					if (message.role === "user") {
						lastUserTimestamp = message.timestamp;
						continue;
					}
					if (
						message.role === "assistant" &&
						message.stopReason === "stop" &&
						lastUserTimestamp &&
						message.model
					) {
						const diffMs =
							new Date(message.timestamp).getTime() -
							new Date(lastUserTimestamp).getTime();
						if (diffMs > 0 && diffMs < 600000) {
							const key = `${message.provider}/${message.model}`;
							if (modelMap[key]) {
								modelMap[key].responseTimes.push(diffMs);
							}
						}
						lastUserTimestamp = null;
					}
				}
			}
		}),
	);

	const models = Object.values(modelMap)
		.map(({ responseTimes, ...rest }) => {
			if (responseTimes.length > 0) {
				rest.avgResponseMs = Math.round(
					responseTimes.reduce((sum, value) => sum + value, 0) /
						responseTimes.length,
				);
			}
			return rest;
		})
		.sort((a, b) => {
			if (b.totalTokens !== a.totalTokens) {
				return b.totalTokens - a.totalTokens;
			}
			const providerCompare = a.provider.localeCompare(b.provider);
			if (providerCompare !== 0) {
				return providerCompare;
			}
			return a.modelId.localeCompare(b.modelId);
		});

	return { models };
}

export async function GET() {
	try {
		const data = await getCachedComputation(CACHE_KEY, {
			ttlMs: CACHE_TTL_MS,
			load: buildModelStatsPayload,
		});
		return NextResponse.json(data);
	} catch (error: unknown) {
		console.error("[stats-models] failed", error);
		return NextResponse.json(
			{ error: "Unable to load model stats" },
			{ status: 500 },
		);
	}
}
