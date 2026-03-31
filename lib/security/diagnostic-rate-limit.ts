import { NextResponse } from "next/server";
import type {
	DiagnosticRateLimitCapability,
	DiagnosticRateLimitDeniedPayload,
	DiagnosticRateLimitMetadata,
} from "@/lib/security/types";

type DiagnosticRateLimitBudget = {
	label: string;
	limit: number;
	windowMs: number;
};

type DiagnosticRateLimitRecord = {
	count: number;
	windowStartedAt: number;
	lastSeenAt: number;
};

export interface DiagnosticRateLimitAllowed {
	ok: true;
	metadata: DiagnosticRateLimitMetadata;
	headers: Headers;
	key: string;
}

export interface DiagnosticRateLimitDenied {
	ok: false;
	metadata: DiagnosticRateLimitMetadata;
	headers: Headers;
	key: string;
	response: Response;
}

export type DiagnosticRateLimitResult =
	| DiagnosticRateLimitAllowed
	| DiagnosticRateLimitDenied;

const DIAGNOSTIC_RATE_LIMITS: Record<
	DiagnosticRateLimitCapability,
	DiagnosticRateLimitBudget
> = {
	provider_probe: {
		label: "Provider probes",
		limit: 6,
		windowMs: 60_000,
	},
	provider_probe_batch: {
		label: "Batch provider probes",
		limit: 4,
		windowMs: 60_000,
	},
	session_diagnostic: {
		label: "Session diagnostics",
		limit: 6,
		windowMs: 60_000,
	},
	session_diagnostic_batch: {
		label: "Batch session diagnostics",
		limit: 4,
		windowMs: 60_000,
	},
	dm_session_diagnostic_batch: {
		label: "Direct-message diagnostics",
		limit: 4,
		windowMs: 60_000,
	},
	platform_diagnostics: {
		label: "Platform diagnostics",
		limit: 2,
		windowMs: 60_000,
	},
	alert_diagnostics: {
		label: "Alert diagnostics",
		limit: 4,
		windowMs: 10 * 60_000,
	},
	stats_all: {
		label: "Stats-all analytics reads",
		limit: 12,
		windowMs: 60_000,
	},
	activity_heatmap: {
		label: "Activity heatmap reads",
		limit: 12,
		windowMs: 60_000,
	},
	pixel_office_version: {
		label: "Pixel-office release checks",
		limit: 6,
		windowMs: 60 * 60_000,
	},
};

const diagnosticRateLimitStore = new Map<string, DiagnosticRateLimitRecord>();
const DIAGNOSTIC_RATE_LIMIT_POLICY = "local_process";
const STORE_RETENTION_MULTIPLIER = 2;
const MAX_WINDOW_MS = Math.max(
	...Object.values(DIAGNOSTIC_RATE_LIMITS).map((budget) => budget.windowMs),
);

function pruneExpiredRecords(now: number): void {
	for (const [key, record] of diagnosticRateLimitStore.entries()) {
		if (now - record.lastSeenAt > MAX_WINDOW_MS * STORE_RETENTION_MULTIPLIER) {
			diagnosticRateLimitStore.delete(key);
		}
	}
}

function resolveRateLimitIdentity(request: Request): string {
	const forwardedFor = request.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	const candidate =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-real-ip") ??
		forwardedFor ??
		"127.0.0.1";

	return candidate || "127.0.0.1";
}

function buildStoreKey(
	request: Request,
	capability: DiagnosticRateLimitCapability,
): string {
	return `${capability}:${resolveRateLimitIdentity(request)}`;
}

function buildMetadata(
	capability: DiagnosticRateLimitCapability,
	budget: DiagnosticRateLimitBudget,
	count: number,
	now: number,
	windowStartedAt: number,
): DiagnosticRateLimitMetadata {
	const resetAt = windowStartedAt + budget.windowMs;
	const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

	return {
		capability,
		limit: budget.limit,
		remaining: Math.max(0, budget.limit - count),
		windowMs: budget.windowMs,
		windowStartedAt,
		resetAt,
		retryAfterSeconds,
		policy: DIAGNOSTIC_RATE_LIMIT_POLICY,
	};
}

function buildHeaders(
	metadata: DiagnosticRateLimitMetadata,
	includeRetryAfter = false,
): Headers {
	const headers = new Headers();
	if (includeRetryAfter) {
		headers.set("Retry-After", String(metadata.retryAfterSeconds));
	}
	headers.set("X-Diagnostic-RateLimit-Capability", metadata.capability);
	headers.set("X-Diagnostic-RateLimit-Limit", String(metadata.limit));
	headers.set("X-Diagnostic-RateLimit-Remaining", String(metadata.remaining));
	headers.set("X-Diagnostic-RateLimit-Reset", String(metadata.resetAt));
	headers.set("X-Diagnostic-RateLimit-Window", String(metadata.windowMs));
	headers.set("X-Diagnostic-RateLimit-Policy", metadata.policy);
	return headers;
}

function createDeniedPayload(
	capability: DiagnosticRateLimitCapability,
	metadata: DiagnosticRateLimitMetadata,
): DiagnosticRateLimitDeniedPayload {
	const label = DIAGNOSTIC_RATE_LIMITS[capability].label;
	const message = `${label} are temporarily rate limited. Retry in ${metadata.retryAfterSeconds} seconds.`;

	return {
		ok: false,
		error: message,
		rateLimit: {
			ok: false,
			type: "diagnostic_rate_limit",
			capability,
			message,
			metadata,
		},
	};
}

export function applyDiagnosticRateLimitHeaders(
	response: Response,
	metadata: DiagnosticRateLimitMetadata,
): Response {
	const headers = buildHeaders(metadata);
	for (const [name, value] of headers.entries()) {
		response.headers.set(name, value);
	}
	return response;
}

export function enforceDiagnosticRateLimit(
	request: Request,
	capability: DiagnosticRateLimitCapability,
): DiagnosticRateLimitResult {
	const budget = DIAGNOSTIC_RATE_LIMITS[capability];
	const now = Date.now();
	const windowStartedAt = now - (now % budget.windowMs);
	const key = buildStoreKey(request, capability);

	pruneExpiredRecords(now);

	let record = diagnosticRateLimitStore.get(key);
	if (!record || record.windowStartedAt !== windowStartedAt) {
		record = {
			count: 0,
			windowStartedAt,
			lastSeenAt: now,
		};
	}

	record.count += 1;
	record.lastSeenAt = now;
	diagnosticRateLimitStore.set(key, record);

	const metadata = buildMetadata(
		capability,
		budget,
		record.count,
		now,
		windowStartedAt,
	);
	const headers = buildHeaders(metadata);

	if (record.count > budget.limit) {
		const payload = createDeniedPayload(capability, metadata);
		const deniedHeaders = buildHeaders(metadata, true);
		return {
			ok: false,
			key,
			metadata,
			headers: deniedHeaders,
			response: NextResponse.json(payload, {
				status: 429,
				headers: deniedHeaders,
			}),
		};
	}

	return {
		ok: true,
		key,
		metadata,
		headers,
	};
}

export function resetDiagnosticRateLimitStore(): void {
	diagnosticRateLimitStore.clear();
}
