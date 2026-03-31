import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	DEFAULT_MODEL_PROBE_TIMEOUT_MS,
	parseModelRef,
	probeModel,
} from "@/lib/model-probe";
import {
	OPENCLAW_HOME,
	resolveOpenclawConfigFileOrThrow,
} from "@/lib/openclaw-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";

const PROBE_TIMEOUT_MS = DEFAULT_MODEL_PROBE_TIMEOUT_MS;

type AgentConfig = {
	id: string;
	model?: string;
};

function loadAgentList(config: any): AgentConfig[] {
	let agentList: AgentConfig[] = config?.agents?.list || [];
	if (agentList.length > 0) return agentList;

	try {
		const agentsDir = path.join(
			/*turbopackIgnore: true*/ OPENCLAW_HOME,
			"agents",
		);
		const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
		agentList = dirs
			.filter((d) => d.isDirectory() && !d.name.startsWith("."))
			.map((d) => ({ id: d.name }));
	} catch {}

	if (agentList.length === 0) return [{ id: "main" }];
	return agentList;
}

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_PROVIDER_PROBES");
	if (!feature.ok) return feature.response;
	const rateLimit = enforceDiagnosticRateLimit(request, "provider_probe_batch");
	if (!rateLimit.ok) return rateLimit.response;

	try {
		const raw = fs.readFileSync(resolveOpenclawConfigFileOrThrow(), "utf-8");
		const config = JSON.parse(raw);
		const defaults = config?.agents?.defaults || {};
		const defaultModel =
			typeof defaults.model === "string"
				? defaults.model
				: defaults.model?.primary || "unknown";

		const agentList = loadAgentList(config);
		const modelProbeTasks = new Map<
			string,
			Promise<Awaited<ReturnType<typeof probeModel>>>
		>();

		for (const agent of agentList) {
			const modelStr = agent.model || defaultModel;
			const { providerId, modelId } = parseModelRef(modelStr);
			const key = `${providerId}/${modelId}`;
			if (!modelProbeTasks.has(key)) {
				modelProbeTasks.set(
					key,
					probeModel({ providerId, modelId, timeoutMs: PROBE_TIMEOUT_MS }),
				);
			}
		}

		const modelProbeResults = new Map<
			string,
			Awaited<ReturnType<typeof probeModel>>
		>();
		for (const [key, task] of modelProbeTasks.entries()) {
			modelProbeResults.set(key, await task);
		}

		const results = agentList.map((agent) => {
			const modelStr = agent.model || defaultModel;
			const { providerId, modelId } = parseModelRef(modelStr);
			const key = `${providerId}/${modelId}`;
			const probe = modelProbeResults.get(key);
			if (!probe) {
				return {
					agentId: agent.id,
					model: modelStr,
					ok: false,
					error: `No probe result for model ${key}`,
					elapsed: 0,
					status: "unknown",
					mode: "unknown",
					precision: "provider",
					source: "openclaw_provider_probe",
				};
			}
			return {
				agentId: agent.id,
				model: modelStr,
				ok: probe.ok,
				text: probe.text,
				error: probe.error,
				elapsed: probe.elapsed,
				status: probe.status,
				mode: probe.mode,
				precision: probe.precision,
				source: probe.source,
			};
		});

		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ results }),
			rateLimit.metadata,
		);
	} catch (_err: unknown) {
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(
				{ error: "Bound model diagnostics failed" },
				{ status: 500 },
			),
			rateLimit.metadata,
		);
	}
}
