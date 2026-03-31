import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { OPENCLAW_CONFIG_PATH, OPENCLAW_HOME } from "@/lib/openclaw-paths";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import {
	parseApiJsonSafely,
	shouldFallbackToCli,
	testSessionViaCli,
} from "@/lib/session-test-fallback";

const CONFIG_PATH = OPENCLAW_CONFIG_PATH;

function hasEmbeddedHttpError(reply: string): boolean {
	// Some providers return error text in content while gateway still returns HTTP 200.
	return /\bHTTP\s*(4\d{2}|5\d{2})\b/i.test(reply);
}

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;
	const feature = requireFeatureFlag("ENABLE_OUTBOUND_TESTS");
	if (!feature.ok) return feature.response;
	const rateLimit = enforceDiagnosticRateLimit(
		request,
		"session_diagnostic_batch",
	);
	if (!rateLimit.ok) return rateLimit.response;

	try {
		const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
		const config = JSON.parse(raw);
		const gatewayPort = config.gateway?.port || 18789;
		const gatewayToken = config.gateway?.auth?.token || "";

		let agentList = config.agents?.list || [];
		if (agentList.length === 0) {
			try {
				const agentsDir = path.join(OPENCLAW_HOME, "agents");
				const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
				agentList = dirs
					.filter((d: any) => d.isDirectory() && !d.name.startsWith("."))
					.map((d: any) => ({ id: d.name }));
			} catch {}
			if (agentList.length === 0) agentList = [{ id: "main" }];
		}

		const results = [];
		for (const agent of agentList) {
			const agentId = agent.id;
			const sessionKey = `agent:${agentId}:main`;
			const startTime = Date.now();
			try {
				const resp = await fetch(
					`http://127.0.0.1:${gatewayPort}/v1/chat/completions`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${gatewayToken}`,
							"x-openclaw-agent-id": agentId,
							"x-openclaw-session-key": sessionKey,
						},
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
						results.push(
							fallback.ok
								? {
										agentId,
										ok: true,
										reply: fallback.reply,
										elapsed: fallback.elapsed,
									}
								: {
										agentId,
										ok: false,
										error: fallback.error || "Gateway route not found",
										elapsed: fallback.elapsed,
									},
						);
					} else {
						results.push({
							agentId,
							ok: false,
							error: data?.error?.message || rawText || "API error",
							elapsed,
						});
					}
				} else {
					const reply = data.choices?.[0]?.message?.content || "";
					const clippedReply = reply.slice(0, 200) || "(no reply)";
					const embeddedHttpErr = hasEmbeddedHttpError(reply);
					if (embeddedHttpErr) {
						results.push({ agentId, ok: false, error: clippedReply, elapsed });
					} else {
						results.push({ agentId, ok: true, reply: clippedReply, elapsed });
					}
				}
			} catch (_err: any) {
				const elapsed = Date.now() - startTime;
				const isTimeout =
					_err.name === "TimeoutError" || _err.name === "AbortError";
				results.push({
					agentId,
					ok: false,
					error: isTimeout
						? "Timeout (100s)"
						: (_err.message || "Unknown error").slice(0, 300),
					elapsed,
				});
			}
		}

		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({ results }),
			rateLimit.metadata,
		);
	} catch (_err: any) {
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(
				{ error: "Session diagnostics failed" },
				{ status: 500 },
			),
			rateLimit.metadata,
		);
	}
}
