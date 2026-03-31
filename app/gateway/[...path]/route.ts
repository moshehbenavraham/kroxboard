import { NextResponse } from "next/server";
import {
	decodeGatewayLaunchTarget,
	getGatewayLaunchParamName,
	validateGatewayProxyPath,
} from "@/lib/gateway-launch";
import { resolveGatewayLaunchSessionKey } from "@/lib/gateway-launch-server";
import { readJsonFileSync } from "@/lib/json";
import { logger } from "@/lib/logger";
import { OPENCLAW_CONFIG_PATH } from "@/lib/openclaw-paths";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import { requireSensitiveRouteAccess } from "@/lib/security/sensitive-route";

export const runtime = "nodejs";

const GATEWAY_PROXY_TIMEOUT_MS = 15_000;
const GATEWAY_PROXY_RETRY_DELAY_MS = 150;

type GatewayRouteContext = {
	params: Promise<{ path: string[] }> | { path: string[] };
};

type GatewayRuntimeConfig = {
	port: number;
	token: string;
};

function readGatewayRuntimeConfig(): GatewayRuntimeConfig {
	const config = readJsonFileSync<any>(OPENCLAW_CONFIG_PATH);
	const port =
		typeof config?.gateway?.port === "number" ? config.gateway.port : 18789;
	const token =
		typeof config?.gateway?.auth?.token === "string"
			? config.gateway.auth.token
			: "";
	return { port, token };
}

function createGatewayErrorResponse(
	status: number,
	message: string,
	acceptHeader: string | null,
): NextResponse {
	if (acceptHeader?.includes("application/json")) {
		return NextResponse.json({ ok: false, error: message }, { status });
	}
	return new NextResponse(message, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}

function sanitizeGatewayFailure(status: number): string {
	if (status === 404) return "Gateway launch target is unavailable";
	if (status === 400) return "Invalid gateway launch target";
	return "Gateway is unavailable";
}

function buildGatewayUpstreamUrl(
	port: number,
	pathSegments: string[],
	searchParams: URLSearchParams,
): URL {
	const upstreamPath = pathSegments.map(encodeURIComponent).join("/");
	const url = new URL(`http://127.0.0.1:${port}/${upstreamPath}`);
	const query = searchParams.toString();
	if (query) url.search = query;
	return url;
}

function copyGatewayHeaders(request: Request, token: string): Headers {
	const headers = new Headers();
	const passthroughHeaderNames = [
		"accept",
		"accept-language",
		"cache-control",
		"content-type",
		"if-match",
		"if-none-match",
		"if-modified-since",
		"range",
		"user-agent",
		"x-requested-with",
	];
	for (const headerName of passthroughHeaderNames) {
		const value = request.headers.get(headerName);
		if (value) headers.set(headerName, value);
	}
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	return headers;
}

function rewriteGatewayHtml(html: string): string {
	return html
		.replace(/(href|src|action|content)=("\/)/g, '$1="/gateway/')
		.replace(/(href|src|action|content)=('\/)/g, "$1='/gateway/")
		.replace(/url\(\//g, "url(/gateway/")
		.replace(/fetch\("\//g, 'fetch("/gateway/')
		.replace(/fetch\('\//g, "fetch('/gateway/")
		.replace(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\//g, "/gateway/");
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGatewayResponse(
	url: URL,
	request: Request,
	token: string,
): Promise<Response> {
	const method = request.method.toUpperCase();
	const body =
		method === "GET" || method === "HEAD"
			? undefined
			: await request.arrayBuffer();

	for (let attempt = 0; attempt < 2; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			GATEWAY_PROXY_TIMEOUT_MS,
		);
		try {
			const response = await fetch(url, {
				method,
				headers: copyGatewayHeaders(request, token),
				body,
				cache: "no-store",
				redirect: "follow",
				signal: controller.signal,
			});
			if (
				attempt === 0 &&
				(method === "GET" || method === "HEAD") &&
				response.status >= 500
			) {
				await response.body?.cancel();
				await delay(GATEWAY_PROXY_RETRY_DELAY_MS);
				continue;
			}
			return response;
		} catch (error) {
			if (attempt === 1 || (method !== "GET" && method !== "HEAD")) {
				throw error;
			}
			await delay(GATEWAY_PROXY_RETRY_DELAY_MS);
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error("Gateway request failed");
}

async function proxyGatewayRequest(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	const method = request.method.toUpperCase();
	const access =
		method === "GET" || method === "HEAD"
			? requireSensitiveRouteAccess(request)
			: requireSensitiveMutationAccess(request, {
					allowedMethods: ["POST", "PUT", "PATCH", "DELETE"],
				});
	if (!access.ok) return access.response;

	const acceptHeader = request.headers.get("accept");
	const { path } = await Promise.resolve(context.params);
	const validatedPath = validateGatewayProxyPath(path);
	if (!validatedPath) {
		return createGatewayErrorResponse(
			400,
			"Invalid gateway path",
			acceptHeader,
		);
	}

	const requestUrl = new URL(request.url);
	const searchParams = new URLSearchParams(requestUrl.searchParams);
	const launchParam = searchParams.get(getGatewayLaunchParamName());
	if (launchParam) {
		searchParams.delete(getGatewayLaunchParamName());
		const launchTarget = decodeGatewayLaunchTarget(launchParam);
		if (!launchTarget) {
			return createGatewayErrorResponse(
				400,
				"Invalid gateway launch target",
				acceptHeader,
			);
		}
		const sessionKey = resolveGatewayLaunchSessionKey(launchTarget);
		if (!sessionKey) {
			return createGatewayErrorResponse(
				404,
				"Gateway launch target is unavailable",
				acceptHeader,
			);
		}
		searchParams.set("session", sessionKey);
	}

	try {
		const { port, token } = readGatewayRuntimeConfig();
		if (token) {
			searchParams.set("token", token);
		}
		const upstreamUrl = buildGatewayUpstreamUrl(
			port,
			validatedPath,
			searchParams,
		);
		const upstreamResponse = await fetchGatewayResponse(
			upstreamUrl,
			request,
			token,
		);
		if (!upstreamResponse.ok) {
			logger.warn(
				{ status: upstreamResponse.status, path: validatedPath.join("/") },
				"Gateway proxy returned non-success status",
			);
			return createGatewayErrorResponse(
				upstreamResponse.status,
				sanitizeGatewayFailure(upstreamResponse.status),
				acceptHeader,
			);
		}

		const headers = new Headers(upstreamResponse.headers);
		headers.set("Cache-Control", "no-store");
		headers.delete("Content-Length");

		const contentType = headers.get("content-type") || "";
		if (contentType.includes("text/html")) {
			const html = await upstreamResponse.text();
			return new NextResponse(rewriteGatewayHtml(html), {
				status: upstreamResponse.status,
				headers,
			});
		}

		return new NextResponse(upstreamResponse.body, {
			status: upstreamResponse.status,
			headers,
		});
	} catch (error) {
		logger.error(
			{
				err: error,
				path: validatedPath.join("/"),
			},
			"Gateway proxy request failed",
		);
		return createGatewayErrorResponse(
			503,
			"Gateway is unavailable",
			acceptHeader,
		);
	}
}

export async function GET(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}

export async function HEAD(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}

export async function POST(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}

export async function PUT(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}

export async function PATCH(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}

export async function DELETE(
	request: Request,
	context: GatewayRouteContext,
): Promise<Response> {
	return proxyGatewayRequest(request, context);
}
