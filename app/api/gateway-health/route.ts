import { NextResponse } from "next/server";
import { buildGatewayHomeLaunchPath } from "@/lib/gateway-launch";
import { readJsonFileSync } from "@/lib/json";
import {
	getOpenclawVersion as fetchOpenclawVersion,
	probeOpenclawGatewayStatus,
} from "@/lib/openclaw-cli";
import { resolveOpenclawConfigFile } from "@/lib/openclaw-paths";

const DEFAULT_GATEWAY_PORT = 18789;
const DEGRADED_LATENCY_MS = 1500;
const HEALTH_PROBE_TIMEOUT_MS = 5000;

interface GatewayRuntimeConfig {
	port: number;
	token: string;
}

let cachedOpenclawVersion: { value: string | null; expiresAt: number } | null =
	null;

function loadGatewayRuntimeConfig(): GatewayRuntimeConfig {
	const configPath = resolveOpenclawConfigFile();
	if (!configPath) {
		throw new Error("OpenClaw runtime config path is invalid");
	}

	const config = readJsonFileSync<any>(configPath);
	return {
		port:
			typeof config.gateway?.port === "number"
				? config.gateway.port
				: DEFAULT_GATEWAY_PORT,
		token:
			typeof config.gateway?.auth?.token === "string"
				? config.gateway.auth.token
				: "",
	};
}

function normalizeGatewayProbeError(error: unknown): string {
	const err = error as {
		cause?: { code?: string };
		name?: string;
	};

	if (err?.cause?.code === "ECONNREFUSED") {
		return "Gateway is not running";
	}
	if (err?.name === "AbortError") {
		return "Request timed out";
	}
	return "Gateway health probe failed";
}

async function probeGatewayViaWeb(
	port: number,
	token: string,
	timeoutMs = HEALTH_PROBE_TIMEOUT_MS,
): Promise<{ ok: boolean; error?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const resp = await fetch(
			`http://localhost:${port}/chat${token ? `?token=${encodeURIComponent(token)}` : ""}`,
			{ signal: controller.signal, cache: "no-store", redirect: "manual" },
		);
		return resp.status >= 200 && resp.status < 400
			? { ok: true }
			: { ok: false, error: `HTTP ${resp.status}` };
	} catch (error: unknown) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to probe gateway web UI",
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function getOpenclawVersion(): Promise<string | undefined> {
	const now = Date.now();
	if (cachedOpenclawVersion && cachedOpenclawVersion.expiresAt > now) {
		return cachedOpenclawVersion.value || undefined;
	}

	const version = await fetchOpenclawVersion();
	cachedOpenclawVersion = {
		value: version || null,
		expiresAt: now + (version ? 60 * 60 * 1000 : 60 * 1000),
	};
	return version;
}

export async function GET() {
	const startedAt = Date.now();
	const launchPath = buildGatewayHomeLaunchPath();
	let runtimeConfig: GatewayRuntimeConfig = {
		port: DEFAULT_GATEWAY_PORT,
		token: "",
	};

	try {
		const openclawVersion = await getOpenclawVersion();
		runtimeConfig = loadGatewayRuntimeConfig();

		const url = `http://localhost:${runtimeConfig.port}/api/health`;
		const headers: Record<string, string> = {};
		if (runtimeConfig.token) {
			headers.Authorization = `Bearer ${runtimeConfig.token}`;
		}

		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			HEALTH_PROBE_TIMEOUT_MS,
		);

		const resp = await fetch(url, {
			headers,
			signal: controller.signal,
			cache: "no-store",
		});
		clearTimeout(timeout);

		if (resp.ok) {
			const checkedAt = Date.now();
			const responseMs = checkedAt - startedAt;
			await resp.json().catch(() => null);
			return NextResponse.json({
				ok: true,
				openclawVersion,
				status: responseMs > DEGRADED_LATENCY_MS ? "degraded" : "healthy",
				checkedAt,
				responseMs,
				launchPath,
			});
		}

		const web = await probeGatewayViaWeb(
			runtimeConfig.port,
			runtimeConfig.token,
		);
		if (web.ok) {
			const checkedAt = Date.now();
			const responseMs = checkedAt - startedAt;
			return NextResponse.json({
				ok: true,
				openclawVersion,
				status: resp.status === 404 ? "healthy" : "degraded",
				checkedAt,
				responseMs,
				launchPath,
			});
		}

		const cli = await probeOpenclawGatewayStatus(
			runtimeConfig.token,
			HEALTH_PROBE_TIMEOUT_MS,
		);
		const checkedAt = Date.now();
		const responseMs = checkedAt - startedAt;
		if (cli.ok) {
			return NextResponse.json({
				ok: true,
				openclawVersion,
				status: "healthy",
				checkedAt,
				responseMs,
				launchPath,
			});
		}

		return NextResponse.json({
			ok: false,
			openclawVersion,
			error: cli.error || `HTTP ${resp.status}`,
			status: "down",
			checkedAt,
			responseMs,
		});
	} catch (error: unknown) {
		const openclawVersion = await getOpenclawVersion();
		const web = await probeGatewayViaWeb(
			runtimeConfig.port,
			runtimeConfig.token,
		);
		if (web.ok) {
			const checkedAt = Date.now();
			const responseMs = checkedAt - startedAt;
			return NextResponse.json({
				ok: true,
				openclawVersion,
				status: "degraded",
				checkedAt,
				responseMs,
				launchPath,
			});
		}

		const cli = await probeOpenclawGatewayStatus(
			runtimeConfig.token,
			HEALTH_PROBE_TIMEOUT_MS,
		);
		const checkedAt = Date.now();
		const responseMs = checkedAt - startedAt;
		if (cli.ok) {
			return NextResponse.json({
				ok: true,
				openclawVersion,
				status: "healthy",
				checkedAt,
				responseMs,
				launchPath,
			});
		}

		return NextResponse.json({
			ok: false,
			openclawVersion,
			error: cli.error || normalizeGatewayProbeError(error),
			status: "down",
			checkedAt,
			responseMs,
		});
	}
}
