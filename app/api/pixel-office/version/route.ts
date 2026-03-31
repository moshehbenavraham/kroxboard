import { NextResponse } from "next/server";
import {
	applyDiagnosticRateLimitHeaders,
	enforceDiagnosticRateLimit,
} from "@/lib/security/diagnostic-rate-limit";

const REPO = process.env.OPENCLAW_REPO || "openclaw/openclaw";

// Server-side cache: 1h TTL
type ReleasePayload = {
	tag: string;
	name: string;
	publishedAt: string;
	body: string;
	htmlUrl: string;
};

let cache: { data: ReleasePayload; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;
const REVALIDATE_SECONDS = 60 * 60;

async function fetchLatestRelease(): Promise<ReleasePayload> {
	const res = await fetch(
		`https://api.github.com/repos/${REPO}/releases/latest`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
			next: { revalidate: REVALIDATE_SECONDS },
			signal: AbortSignal.timeout(10_000),
		},
	);
	if (!res.ok) throw new Error(`GitHub API ${res.status}`);
	const data = await res.json();
	return {
		tag: data.tag_name,
		name: data.name || data.tag_name,
		publishedAt: data.published_at,
		body: data.body || "",
		htmlUrl: data.html_url,
	};
}

export async function GET(request: Request) {
	const rateLimit = enforceDiagnosticRateLimit(request, "pixel_office_version");
	if (!rateLimit.ok) return rateLimit.response;

	const now = Date.now();
	try {
		if (cache && now - cache.ts < CACHE_TTL) {
			return applyDiagnosticRateLimitHeaders(
				NextResponse.json({
					...cache.data,
					cached: true,
					stale: false,
					checkedAt: new Date(cache.ts).toISOString(),
				}),
				rateLimit.metadata,
			);
		}

		const data = await fetchLatestRelease();
		cache = { data, ts: now };
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json({
				...data,
				cached: false,
				stale: false,
				checkedAt: new Date(now).toISOString(),
			}),
			rateLimit.metadata,
		);
	} catch (err: unknown) {
		console.error("[pixel-office/version] failed", err);
		if (cache) {
			return applyDiagnosticRateLimitHeaders(
				NextResponse.json({
					...cache.data,
					cached: true,
					stale: true,
					checkedAt: new Date(cache.ts).toISOString(),
				}),
				rateLimit.metadata,
			);
		}
		return applyDiagnosticRateLimitHeaders(
			NextResponse.json(
				{ error: "Release check unavailable" },
				{ status: 502 },
			),
			rateLimit.metadata,
		);
	}
}
