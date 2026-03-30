import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Simple in-memory rate limiting map for a single Edge isolate.
// In a distributed environment, use a real store like Redis.
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

export function middleware(request: NextRequest) {
	const response = NextResponse.next();

	// 1. Security Headers
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set("X-Frame-Options", "DENY");
	response.headers.set("X-XSS-Protection", "1; mode=block");
	response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

	// Basic Content Security Policy
	const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self' data:;
    connect-src 'self';
  `
		.replace(/\s{2,}/g, " ")
		.trim();
	response.headers.set("Content-Security-Policy", csp);

	// 2. Rate Limiting (Basic)
	// Using IP as the identifier. If behind Cloudflare, use CF-Connecting-IP
	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for") ??
		request.ip ??
		"127.0.0.1";

	const now = Date.now();
	const windowStart = now - (now % RATE_LIMIT_WINDOW_MS);

	let record = rateLimitMap.get(ip);
	if (!record || record.lastReset < windowStart) {
		record = { count: 0, lastReset: windowStart };
	}

	record.count += 1;
	rateLimitMap.set(ip, record);

	if (record.count > MAX_REQUESTS_PER_WINDOW) {
		return new NextResponse(
			JSON.stringify({ error: "Too many requests, please try again later." }),
			{
				status: 429,
				headers: {
					"Content-Type": "application/json",
					"Retry-After": "60",
					"X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(windowStart + RATE_LIMIT_WINDOW_MS),
				},
			},
		);
	}

	response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
	response.headers.set(
		"X-RateLimit-Remaining",
		String(Math.max(0, MAX_REQUESTS_PER_WINDOW - record.count)),
	);

	return response;
}

export const config = {
	matcher: [
		// Apply to all API routes and pages, exclude static files and images
		"/((?!_next/static|_next/image|favicon.ico|icon.png).*)",
	],
};
