import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function applyBaseEnv(): void {
	process.env.DASHBOARD_HOST = "board.example.com";
	process.env.DASHBOARD_ALLOWED_EMAILS = "operator@example.com";
	process.env.DASHBOARD_CF_ACCESS_ENABLED = "true";
	process.env.DASHBOARD_CF_ACCESS_OTP_PRIMARY = "true";
	process.env.DASHBOARD_CF_ACCESS_SESSION_HOURS = "24";
	process.env.DASHBOARD_CF_ACCESS_AUD = "cf-aud";
	process.env.DASHBOARD_CF_ACCESS_EMAIL_HEADER =
		"CF-Access-Authenticated-User-Email";
	process.env.DASHBOARD_CF_ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
	process.env.DASHBOARD_OPERATOR_CODE_REQUIRED = "true";
	process.env.DASHBOARD_OPERATOR_CODE = "correct horse battery staple";
	process.env.DASHBOARD_OPERATOR_COOKIE_SECRET =
		"0123456789abcdef0123456789abcdef";
	process.env.DASHBOARD_OPERATOR_SESSION_HOURS = "12";
}

function encodeJson(value: unknown): string {
	return Buffer.from(JSON.stringify(value))
		.toString("base64url")
		.replace(/=/g, "");
}

function createAssertion(aud: string): string {
	return `${encodeJson({ alg: "none", typ: "JWT" })}.${encodeJson({ aud })}.sig`;
}

async function makeSessionCookie(identity: {
	mode: "localhost" | "cloudflare_access";
	subject: string;
	email: string | null;
	isLocal: boolean;
}): Promise<string> {
	const { parseDashboardAuthEnv } = await import(
		"@/lib/security/dashboard-env"
	);
	const { createOperatorSession, OPERATOR_SESSION_COOKIE_NAME } = await import(
		"@/lib/security/operator-session"
	);
	const env = parseDashboardAuthEnv(process.env);
	const { token } = createOperatorSession(identity, env, new Date());
	return `${OPERATOR_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

describe("requireSensitiveMutationAccess", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.assign(process.env, ORIGINAL_ENV);
		applyBaseEnv();
	});

	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("accepts a same-origin localhost mutation with a valid operator session", async () => {
		const { requireSensitiveMutationAccess } = await import(
			"@/lib/security/sensitive-mutation"
		);
		const cookie = await makeSessionCookie({
			mode: "localhost",
			subject: "localhost",
			email: null,
			isLocal: true,
		});

		const result = requireSensitiveMutationAccess(
			new Request("http://localhost:3000/api/protected", {
				method: "POST",
				headers: {
					origin: "http://localhost:3000",
					cookie,
				},
			}),
		);

		expect(result.ok).toBe(true);
	});

	it("accepts a trusted remote same-origin mutation with Cloudflare identity", async () => {
		const { requireSensitiveMutationAccess } = await import(
			"@/lib/security/sensitive-mutation"
		);
		const cookie = await makeSessionCookie({
			mode: "cloudflare_access",
			subject: "operator@example.com",
			email: "operator@example.com",
			isLocal: false,
		});

		const result = requireSensitiveMutationAccess(
			new Request("https://board.example.com/api/protected", {
				method: "POST",
				headers: {
					host: "board.example.com",
					origin: "https://board.example.com",
					cookie,
					"CF-Access-Authenticated-User-Email": "operator@example.com",
					"CF-Access-Jwt-Assertion": createAssertion("cf-aud"),
				},
			}),
		);

		expect(result.ok).toBe(true);
	});

	it("rejects a sensitive mutation when origin metadata is missing", async () => {
		const { requireSensitiveMutationAccess } = await import(
			"@/lib/security/sensitive-mutation"
		);
		const cookie = await makeSessionCookie({
			mode: "localhost",
			subject: "localhost",
			email: null,
			isLocal: true,
		});

		const result = requireSensitiveMutationAccess(
			new Request("http://localhost:3000/api/protected", {
				method: "POST",
				headers: {
					cookie,
				},
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("Expected origin rejection");
		}
		expect(result.response.status).toBe(403);
		await expect(result.response.json()).resolves.toMatchObject({
			mutation: {
				state: "origin_required",
			},
		});
	});

	it("rejects a cross-origin mutation before privileged work begins", async () => {
		const { requireSensitiveMutationAccess } = await import(
			"@/lib/security/sensitive-mutation"
		);
		const cookie = await makeSessionCookie({
			mode: "localhost",
			subject: "localhost",
			email: null,
			isLocal: true,
		});

		const result = requireSensitiveMutationAccess(
			new Request("http://localhost:3000/api/protected", {
				method: "POST",
				headers: {
					origin: "https://evil.example.com",
					cookie,
				},
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("Expected cross-origin rejection");
		}
		expect(result.response.status).toBe(403);
		await expect(result.response.json()).resolves.toMatchObject({
			mutation: {
				state: "origin_denied",
			},
		});
	});
});
