import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveOpenclawConfigFileOrThrow } from "@/lib/openclaw-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import {
	createInvalidRequestBoundaryResponse,
	validateSessionDiagnosticInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import {
	parseApiJsonSafely,
	shouldFallbackToCli,
	testSessionViaCli,
} from "@/lib/session-test-fallback";

export async function POST(req: Request) {
	const access = requireSensitiveMutationAccess(req, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_OUTBOUND_TESTS");
	if (!feature.ok) return feature.response;

	try {
		const body = await req.json().catch(() => null);
		const input = validateSessionDiagnosticInput(body);
		if (!input.ok) {
			return createInvalidRequestBoundaryResponse(input.error);
		}
		const { sessionKey, agentId } = input.value;
		const rateLimit = enforceDiagnosticRateLimit(req, "session_diagnostic");
		if (!rateLimit.ok) return rateLimit.response;

		// Read gateway config
		const raw = fs.readFileSync(resolveOpenclawConfigFileOrThrow(), "utf-8");
		const config = JSON.parse(raw);
		const gatewayPort = config.gateway?.port || 18789;
		const gatewayToken = config.gateway?.auth?.token || "";

		const startTime = Date.now();

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${gatewayToken}`,
				"x-openclaw-agent-id": agentId,
				"x-openclaw-session-key": sessionKey,
			};

			const resp = await fetch(
				`http://127.0.0.1:${gatewayPort}/v1/chat/completions`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						model: `openclaw:${agentId}`,
						messages: [
							{ role: "user", content: "Health check: reply with OK" },
						],
						max_tokens: 64,
					}),
					signal: AbortSignal.timeout(100000),
				},
			);
			const rawText = await resp.text();
			const data = parseApiJsonSafely(rawText);
			const elapsed = Date.now() - startTime;

			if (!resp.ok) {
				if (shouldFallbackToCli(resp, rawText)) {
					const fallback = await testSessionViaCli(agentId);
					return applyDiagnosticRateLimitHeaders(
						NextResponse.json({
							status: fallback.ok ? "ok" : "error",
							sessionKey,
							elapsed: fallback.elapsed,
							reply: fallback.reply,
							error: fallback.error,
						}),
						rateLimit.metadata,
					);
				}
				return applyDiagnosticRateLimitHeaders(
					NextResponse.json({
						status: "error",
						sessionKey,
						elapsed,
						error: data?.error?.message || rawText || JSON.stringify(data),
					}),
					rateLimit.metadata,
				);
			}

			const reply = data.choices?.[0]?.message?.content || "";
			return applyDiagnosticRateLimitHeaders(
				NextResponse.json({
					status: "ok",
					sessionKey,
					elapsed,
					reply: reply.slice(0, 200) || "(no reply)",
				}),
				rateLimit.metadata,
			);
		} catch (err: unknown) {
			const elapsed = Date.now() - startTime;
			const isTimeout =
				err instanceof Error &&
				(err.name === "TimeoutError" || err.name === "AbortError");
			return applyDiagnosticRateLimitHeaders(
				NextResponse.json({
					status: "error",
					sessionKey,
					elapsed,
					error: isTimeout
						? "Timeout: agent not responding (100s)"
						: (err instanceof Error ? err.message : "Unknown error").slice(
								0,
								300,
							),
				}),
				rateLimit.metadata,
			);
		}
	} catch {
		return NextResponse.json(
			{
				status: "error",
				error: "Session diagnostic failed",
			},
			{ status: 500 },
		);
	}
}
