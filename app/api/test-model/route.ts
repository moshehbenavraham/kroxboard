import { NextResponse } from "next/server";
import { DEFAULT_MODEL_PROBE_TIMEOUT_MS, probeModel } from "@/lib/model-probe";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import {
	createInvalidRequestResponse,
	validateProviderProbeInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";

const PROBE_TIMEOUT_MS = DEFAULT_MODEL_PROBE_TIMEOUT_MS;

export async function POST(req: Request) {
	const access = requireSensitiveMutationAccess(req, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_PROVIDER_PROBES");
	if (!feature.ok) return feature.response;

	try {
		const body = await req.json().catch(() => null);
		const input = validateProviderProbeInput(body);
		if (!input.ok) {
			return createInvalidRequestResponse(input.error);
		}
		const { providerId, modelId } = input.value;
		const rateLimit = enforceDiagnosticRateLimit(req, "provider_probe");
		if (!rateLimit.ok) return rateLimit.response;

		const result = await probeModel({
			providerId,
			modelId,
			timeoutMs: PROBE_TIMEOUT_MS,
		});
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({
				ok: result.ok,
				elapsed: result.elapsed,
				model: result.model,
				mode: result.mode,
				status: result.status,
				error: result.error,
				text: result.text,
				precision: result.precision,
				source: result.source,
			}),
			rateLimit.metadata,
		);
	} catch (err: unknown) {
		console.error("[test-model] probe failed", err);
		return NextResponse.json(
			{
				ok: false,
				error: "Model probe failed",
				elapsed: 0,
			},
			{ status: 500 },
		);
	}
}
