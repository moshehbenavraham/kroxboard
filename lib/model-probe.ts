import { exec, execFile } from "node:child_process";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { readJsonFileSync } from "@/lib/json";
import { OPENCLAW_HOME } from "@/lib/openclaw-paths";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export const DEFAULT_MODEL_PROBE_TIMEOUT_MS = 15000;
const DIRECT_PROBE_RETRY_DELAYS_MS = [250];

type ProviderApiType = "anthropic-messages" | "openai-completions" | string;

interface ProviderConfig {
	baseUrl?: string;
	apiKey?: string;
	api?: ProviderApiType;
	authHeader?: boolean | string;
	headers?: Record<string, string>;
}

interface ProbeResult {
	provider?: string;
	model?: string;
	mode?: "api_key" | "oauth" | string;
	status?: "ok" | "error" | "unknown" | string;
	error?: string;
	latencyMs?: number;
}

interface DirectProbeResult {
	ok: boolean;
	elapsed: number;
	status: string;
	error?: string;
	mode: "api_key";
	source: "direct_model_probe";
	precision: "model";
	text?: string;
}

export interface ModelProbeOutcome {
	ok: boolean;
	elapsed: number;
	model: string;
	mode: "api_key" | "oauth" | "unknown" | string;
	status: string;
	error?: string;
	text?: string;
	source: "direct_model_probe" | "openclaw_provider_probe";
	precision: "model" | "provider";
}

interface ProbeModelParams {
	providerId: string;
	modelId: string;
	timeoutMs?: number;
}

const MODELS_PATH = path.join(
	OPENCLAW_HOME,
	"agents",
	"main",
	"agent",
	"models.json",
);

function quoteShellArg(arg: string): string {
	if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) return arg;
	return `"${arg.replace(/"/g, '""')}"`;
}

async function execOpenclaw(
	args: string[],
): Promise<{ stdout: string; stderr: string }> {
	const env = { ...process.env, FORCE_COLOR: "0" };

	if (process.platform !== "win32") {
		return execFileAsync("openclaw", args, {
			maxBuffer: 10 * 1024 * 1024,
			env,
		});
	}

	const command = `openclaw ${args.map(quoteShellArg).join(" ")}`;
	return execAsync(command, {
		maxBuffer: 10 * 1024 * 1024,
		env,
		shell: "cmd.exe",
	});
}

function parseJsonFromMixedOutput(output: string): any {
	for (let i = 0; i < output.length; i++) {
		if (output[i] !== "{") continue;
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let j = i; j < output.length; j++) {
			const ch = output[j];
			if (inString) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) {
					const candidate = output.slice(i, j + 1).trim();
					try {
						const parsed = JSON.parse(candidate);
						if (parsed && typeof parsed === "object") return parsed;
					} catch {}
					break;
				}
			}
		}
	}
	throw new Error(
		"Failed to parse JSON output from openclaw models status --probe --json",
	);
}

function loadProviderConfig(providerId: string): ProviderConfig | null {
	try {
		const parsed = readJsonFileSync<any>(MODELS_PATH);
		const providers = parsed?.providers;
		if (!providers || typeof providers !== "object") return null;
		const exact = providers[providerId];
		if (exact && typeof exact === "object") return exact as ProviderConfig;
		const normalizedTarget = providerId.toLowerCase();
		for (const [key, value] of Object.entries(providers)) {
			if (
				key.toLowerCase() === normalizedTarget &&
				value &&
				typeof value === "object"
			) {
				return value as ProviderConfig;
			}
		}
		return null;
	} catch {
		return null;
	}
}

function pickAuthHeader(
	providerCfg: ProviderConfig,
	apiKey: string,
): Record<string, string> {
	const out: Record<string, string> = {};
	const authHeader = providerCfg.authHeader;
	const api = providerCfg.api;

	if (typeof authHeader === "string" && authHeader.trim()) {
		out[authHeader.trim()] = apiKey;
		return out;
	}

	if (authHeader === false) {
		out["x-api-key"] = apiKey;
		return out;
	}

	if (api === "anthropic-messages") {
		out["x-api-key"] = apiKey;
		out.Authorization = `Bearer ${apiKey}`;
		return out;
	}

	out.Authorization = `Bearer ${apiKey}`;
	return out;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
			cache: "no-store",
		});
	} finally {
		clearTimeout(timer);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnsafeIpv4(host: string): boolean {
	const parts = host.split(".").map((segment) => Number(segment));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
		return true;
	}

	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	return false;
}

function isUnsafeIpv6(host: string): boolean {
	const normalized = host.toLowerCase();
	if (normalized === "::1") return true;
	if (normalized.startsWith("fe80:")) return true;
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
	return false;
}

function isUnsafeIpAddress(host: string): boolean {
	const ipType = net.isIP(host);
	if (ipType === 4) return isUnsafeIpv4(host);
	if (ipType === 6) return isUnsafeIpv6(host);
	return false;
}

async function resolveSafeBaseUrl(baseUrl: string): Promise<string | null> {
	let parsed: URL;
	try {
		parsed = new URL(baseUrl);
	} catch {
		return null;
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return null;
	}
	if (!parsed.hostname || parsed.username || parsed.password) {
		return null;
	}

	const hostname = parsed.hostname.toLowerCase();
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		isUnsafeIpAddress(hostname)
	) {
		return null;
	}

	try {
		const records = await dns.lookup(hostname, { all: true });
		if (
			records.length === 0 ||
			records.some((record) => isUnsafeIpAddress(record.address))
		) {
			return null;
		}
	} catch {
		return null;
	}

	return parsed.toString().replace(/\/+$/, "");
}

function shouldRetryDirectProbeResponse(response: Response): boolean {
	return response.status === 429 || response.status >= 500;
}

function shouldRetryDirectProbeError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.toLowerCase().includes("fetch failed") ||
			error.message.toLowerCase().includes("econn") ||
			error.message.toLowerCase().includes("timeout"))
	);
}

async function fetchWithTimeoutAndRetry(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	for (
		let attempt = 0;
		attempt <= DIRECT_PROBE_RETRY_DELAYS_MS.length;
		attempt++
	) {
		try {
			const response = await fetchWithTimeout(url, init, timeoutMs);
			if (
				shouldRetryDirectProbeResponse(response) &&
				attempt < DIRECT_PROBE_RETRY_DELAYS_MS.length
			) {
				await sleep(DIRECT_PROBE_RETRY_DELAYS_MS[attempt]);
				continue;
			}
			return response;
		} catch (error) {
			if (
				!shouldRetryDirectProbeError(error) ||
				attempt >= DIRECT_PROBE_RETRY_DELAYS_MS.length
			) {
				throw error;
			}
			await sleep(DIRECT_PROBE_RETRY_DELAYS_MS[attempt]);
		}
	}

	throw new Error("Direct probe retry budget exhausted");
}

function classifyErrorStatus(httpStatus: number, errorText: string): string {
	const normalized = errorText.toLowerCase();
	if (normalized.includes("timed out")) return "timeout";
	if (normalized.includes("model_not_supported")) return "model_not_supported";
	if (
		httpStatus === 401 ||
		httpStatus === 403 ||
		normalized.includes("unauthorized")
	)
		return "auth";
	if (httpStatus === 429 || normalized.includes("rate limit"))
		return "rate_limit";
	if (httpStatus === 402 || normalized.includes("billing")) return "billing";
	return "error";
}

function extractErrorMessage(payload: any, fallback: string): string {
	const direct = payload?.error?.message || payload?.message || payload?.error;
	if (typeof direct === "string" && direct.trim()) return direct.trim();
	return fallback;
}

async function probeModelDirect(
	params: ProbeModelParams,
): Promise<DirectProbeResult | null> {
	const providerCfg = loadProviderConfig(params.providerId);
	if (!providerCfg?.baseUrl || !providerCfg.api || !providerCfg.apiKey)
		return null;
	const safeBaseUrl = await resolveSafeBaseUrl(providerCfg.baseUrl);
	if (!safeBaseUrl) return null;

	const timeoutMs = params.timeoutMs ?? DEFAULT_MODEL_PROBE_TIMEOUT_MS;
	// Kimi providers require temperature=1
	const isKimiProvider =
		params.providerId === "kimi-coding" || params.providerId === "moonshot";
	const temperature = isKimiProvider ? 1 : 0;

	const headers: Record<string, string> = {
		"content-type": "application/json",
		...(providerCfg.headers || {}),
		...pickAuthHeader(providerCfg, providerCfg.apiKey),
	};

	if (providerCfg.api === "anthropic-messages") {
		if (!headers["anthropic-version"])
			headers["anthropic-version"] = "2023-06-01";
		const url = `${safeBaseUrl}/v1/messages`;
		const body = {
			model: params.modelId,
			max_tokens: 8,
			messages: [{ role: "user", content: "Reply with OK." }],
			temperature,
		};
		const start = Date.now();
		try {
			const resp = await fetchWithTimeoutAndRetry(
				url,
				{ method: "POST", headers, body: JSON.stringify(body) },
				timeoutMs,
			);
			const elapsed = Date.now() - start;
			if (resp.ok) {
				return {
					ok: true,
					elapsed,
					status: "ok",
					mode: "api_key",
					source: "direct_model_probe",
					precision: "model",
					text: "OK (direct model probe)",
				};
			}
			let payload: any = null;
			try {
				payload = await resp.json();
			} catch {}
			const error = extractErrorMessage(payload, `HTTP ${resp.status}`);
			return {
				ok: false,
				elapsed,
				status: classifyErrorStatus(resp.status, error),
				error,
				mode: "api_key",
				source: "direct_model_probe",
				precision: "model",
			};
		} catch (err: any) {
			const elapsed = Date.now() - start;
			const isTimeout = err?.name === "AbortError";
			return {
				ok: false,
				elapsed,
				status: isTimeout ? "timeout" : "network",
				error: isTimeout
					? "LLM request timed out."
					: err?.message || "Network error",
				mode: "api_key",
				source: "direct_model_probe",
				precision: "model",
			};
		}
	}

	if (providerCfg.api === "openai-completions") {
		const url = `${safeBaseUrl}/chat/completions`;
		const body = {
			model: params.modelId,
			messages: [{ role: "user", content: "Reply with OK." }],
			max_tokens: 8,
			temperature,
		};
		const start = Date.now();
		try {
			const resp = await fetchWithTimeoutAndRetry(
				url,
				{ method: "POST", headers, body: JSON.stringify(body) },
				timeoutMs,
			);
			const elapsed = Date.now() - start;
			if (resp.ok) {
				return {
					ok: true,
					elapsed,
					status: "ok",
					mode: "api_key",
					source: "direct_model_probe",
					precision: "model",
					text: "OK (direct model probe)",
				};
			}
			let payload: any = null;
			try {
				payload = await resp.json();
			} catch {}
			const error = extractErrorMessage(payload, `HTTP ${resp.status}`);
			return {
				ok: false,
				elapsed,
				status: classifyErrorStatus(resp.status, error),
				error,
				mode: "api_key",
				source: "direct_model_probe",
				precision: "model",
			};
		} catch (err: any) {
			const elapsed = Date.now() - start;
			const isTimeout = err?.name === "AbortError";
			return {
				ok: false,
				elapsed,
				status: isTimeout ? "timeout" : "network",
				error: isTimeout
					? "LLM request timed out."
					: err?.message || "Network error",
				mode: "api_key",
				source: "direct_model_probe",
				precision: "model",
			};
		}
	}

	return null;
}

async function probeProviderViaOpenclaw(
	params: ProbeModelParams,
): Promise<ModelProbeOutcome> {
	const timeoutMs = params.timeoutMs ?? DEFAULT_MODEL_PROBE_TIMEOUT_MS;
	const startedAt = Date.now();
	const { stdout, stderr } = await execOpenclaw([
		"models",
		"status",
		"--probe",
		"--json",
		"--probe-timeout",
		String(timeoutMs),
		"--probe-provider",
		String(params.providerId),
	]);
	const parsed = parseJsonFromMixedOutput(`${stdout}\n${stderr || ""}`);
	const results: ProbeResult[] = parsed?.auth?.probes?.results || [];
	const fullModel = `${params.providerId}/${params.modelId}`;

	const exact =
		results.find(
			(r) => r.provider === params.providerId && r.model === fullModel,
		) ||
		results.find(
			(r) =>
				r.provider === params.providerId &&
				typeof r.model === "string" &&
				r.model.endsWith(`/${params.modelId}`),
		);
	const matched =
		exact || results.find((r) => r.provider === params.providerId);

	if (!matched) {
		return {
			ok: false,
			elapsed: Date.now() - startedAt,
			model: fullModel,
			mode: "unknown",
			status: "unknown",
			error: `No probe result for provider ${params.providerId}`,
			precision: "provider",
			source: "openclaw_provider_probe",
		};
	}

	const ok = matched.status === "ok";
	return {
		ok,
		elapsed: matched.latencyMs ?? Date.now() - startedAt,
		model: matched.model || fullModel,
		mode: matched.mode || "unknown",
		status: matched.status || "unknown",
		error: ok
			? undefined
			: matched.error || `Probe status: ${matched.status || "unknown"}`,
		precision: exact ? "model" : "provider",
		source: "openclaw_provider_probe",
		text: ok
			? `OK (${exact ? "model-level" : "provider-level"} openclaw probe)`
			: undefined,
	};
}

export function parseModelRef(modelStr: string): {
	providerId: string;
	modelId: string;
} {
	const [providerId, ...rest] = modelStr.split("/");
	return {
		providerId: providerId || "",
		modelId: rest.join("/") || providerId || "",
	};
}

export async function probeModel(
	params: ProbeModelParams,
): Promise<ModelProbeOutcome> {
	const direct = await probeModelDirect(params);
	if (direct) {
		return {
			...direct,
			model: `${params.providerId}/${params.modelId}`,
		};
	}
	return probeProviderViaOpenclaw(params);
}
