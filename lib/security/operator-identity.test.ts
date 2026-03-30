import { describe, expect, it } from "vitest";
import { parseDashboardAuthEnv } from "@/lib/security/dashboard-env";
import { resolveOperatorIdentity } from "@/lib/security/operator-identity";

const BASE_ENV = parseDashboardAuthEnv({
	NODE_ENV: "test",
	DASHBOARD_HOST: "board.example.com",
	DASHBOARD_ALLOWED_EMAILS: "operator@example.com",
	DASHBOARD_CF_ACCESS_ENABLED: "true",
	DASHBOARD_CF_ACCESS_OTP_PRIMARY: "true",
	DASHBOARD_CF_ACCESS_SESSION_HOURS: "24",
	DASHBOARD_CF_ACCESS_AUD: "cf-aud",
	DASHBOARD_CF_ACCESS_EMAIL_HEADER: "CF-Access-Authenticated-User-Email",
	DASHBOARD_CF_ACCESS_JWT_HEADER: "CF-Access-Jwt-Assertion",
	DASHBOARD_OPERATOR_CODE_REQUIRED: "true",
	DASHBOARD_OPERATOR_CODE: "correct horse battery staple",
	DASHBOARD_OPERATOR_COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
	DASHBOARD_OPERATOR_SESSION_HOURS: "12",
} as NodeJS.ProcessEnv);

function createAccessJwt(payload: Record<string, unknown>): string {
	const header = Buffer.from(
		JSON.stringify({ alg: "none", typ: "JWT" }),
	).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${header}.${body}.signature`;
}

describe("resolveOperatorIdentity", () => {
	it("trusts localhost requests without Cloudflare headers", () => {
		const result = resolveOperatorIdentity(
			new Request("http://localhost:3000/api/test-model"),
			BASE_ENV,
		);

		expect(result).toEqual({
			ok: true,
			identity: {
				mode: "localhost",
				subject: "localhost",
				email: null,
				isLocal: true,
			},
		});
	});

	it("accepts an allowed Cloudflare operator with a matching audience", () => {
		const result = resolveOperatorIdentity(
			new Request("https://board.example.com/api/test-model", {
				headers: {
					host: "board.example.com",
					"CF-Access-Authenticated-User-Email": "Operator@example.com",
					"CF-Access-Jwt-Assertion": createAccessJwt({ aud: "cf-aud" }),
				},
			}),
			BASE_ENV,
		);

		expect(result).toEqual({
			ok: true,
			identity: {
				mode: "cloudflare_access",
				subject: "operator@example.com",
				email: "operator@example.com",
				isLocal: false,
			},
		});
	});

	it("denies a remote operator when the audience does not match", () => {
		const result = resolveOperatorIdentity(
			new Request("https://board.example.com/api/test-model", {
				headers: {
					host: "board.example.com",
					"CF-Access-Authenticated-User-Email": "operator@example.com",
					"CF-Access-Jwt-Assertion": createAccessJwt({ aud: "wrong-aud" }),
				},
			}),
			BASE_ENV,
		);

		expect(result).toEqual({
			ok: false,
			state: "identity_denied",
			message: "Cloudflare Access assertion is invalid",
		});
	});
});
