import type { DashboardAuthEnv } from "@/lib/security/dashboard-env";
import type { OperatorIdentity } from "@/lib/security/types";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type OperatorIdentityResolution =
	| {
			ok: true;
			identity: OperatorIdentity;
	  }
	| {
			ok: false;
			state: "identity_denied";
			message: string;
	  };

function stripPort(host: string): string {
	if (host.startsWith("[")) {
		const closingIndex = host.indexOf("]");
		return closingIndex >= 0 ? host.slice(0, closingIndex + 1) : host;
	}
	return host.split(":", 1)[0] || host;
}

function getRequestHost(request: Request): string {
	const forwardedHost = request.headers.get("x-forwarded-host");
	if (forwardedHost?.trim()) {
		return stripPort(forwardedHost.trim().split(",", 1)[0] || "");
	}

	const hostHeader = request.headers.get("host");
	if (hostHeader?.trim()) {
		return stripPort(hostHeader.trim());
	}

	try {
		return stripPort(new URL(request.url).host);
	} catch {
		return "";
	}
}

function normalizeEmail(value: string | null): string | null {
	const trimmed = value?.trim().toLowerCase();
	return trimmed || null;
}

function decodeJwtPayload(assertion: string): Record<string, unknown> | null {
	const parts = assertion.split(".");
	if (parts.length !== 3) return null;

	try {
		const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		const decoded = Buffer.from(padded, "base64").toString("utf8");
		const parsed = JSON.parse(decoded);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function audienceMatches(
	payload: Record<string, unknown>,
	expectedAudience: string,
): boolean {
	const { aud } = payload;
	if (typeof aud === "string") return aud === expectedAudience;
	if (Array.isArray(aud)) {
		return aud.some((value) => value === expectedAudience);
	}
	return false;
}

export function isLocalDashboardRequest(request: Request): boolean {
	return LOCAL_HOSTS.has(getRequestHost(request));
}

export function resolveOperatorIdentity(
	request: Request,
	env: DashboardAuthEnv,
): OperatorIdentityResolution {
	if (isLocalDashboardRequest(request)) {
		return {
			ok: true,
			identity: {
				mode: "localhost",
				subject: "localhost",
				email: null,
				isLocal: true,
			},
		};
	}

	if (!env.cfAccessEnabled) {
		return {
			ok: false,
			state: "identity_denied",
			message: "Remote operator access is disabled",
		};
	}

	const email = normalizeEmail(request.headers.get(env.cfAccessEmailHeader));
	if (!email) {
		return {
			ok: false,
			state: "identity_denied",
			message: "Cloudflare Access identity is missing",
		};
	}

	if (!env.allowedEmails.includes(email)) {
		return {
			ok: false,
			state: "identity_denied",
			message: "Operator access denied",
		};
	}

	if (env.cfAccessAud) {
		const assertion = request.headers.get(env.cfAccessJwtHeader);
		if (!assertion) {
			return {
				ok: false,
				state: "identity_denied",
				message: "Cloudflare Access assertion is missing",
			};
		}

		const payload = decodeJwtPayload(assertion);
		if (!payload || !audienceMatches(payload, env.cfAccessAud)) {
			return {
				ok: false,
				state: "identity_denied",
				message: "Cloudflare Access assertion is invalid",
			};
		}
	}

	return {
		ok: true,
		identity: {
			mode: "cloudflare_access",
			subject: email,
			email,
			isLocal: false,
		},
	};
}
