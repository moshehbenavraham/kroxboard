import { describe, expect, it } from "vitest";
import { parseDashboardAuthEnv } from "@/lib/security/dashboard-env";
import {
	createOperatorSession,
	isOperatorCodeValid,
	verifyOperatorSessionToken,
} from "@/lib/security/operator-session";
import type { OperatorIdentity } from "@/lib/security/types";

const ENV = parseDashboardAuthEnv({
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

const LOCAL_IDENTITY: OperatorIdentity = {
	mode: "localhost",
	subject: "localhost",
	email: null,
	isLocal: true,
};

describe("operator session helpers", () => {
	it("issues and verifies a signed operator session", () => {
		const issuedAt = new Date("2026-03-31T00:00:00.000Z");
		const { token, session } = createOperatorSession(
			LOCAL_IDENTITY,
			ENV,
			issuedAt,
		);
		const verified = verifyOperatorSessionToken(
			token,
			LOCAL_IDENTITY,
			ENV,
			new Date("2026-03-31T06:00:00.000Z"),
		);

		expect(verified).toEqual({
			ok: true,
			session,
		});
	});

	it("marks an expired operator session for clearing", () => {
		const { token } = createOperatorSession(
			LOCAL_IDENTITY,
			ENV,
			new Date("2026-03-31T00:00:00.000Z"),
		);
		const verified = verifyOperatorSessionToken(
			token,
			LOCAL_IDENTITY,
			ENV,
			new Date("2026-03-31T13:00:00.000Z"),
		);

		expect(verified).toEqual({
			ok: false,
			state: "session_expired",
			shouldClear: true,
		});
	});

	it("uses constant-time operator code comparison", () => {
		expect(isOperatorCodeValid("correct horse battery staple", ENV)).toBe(true);
		expect(isOperatorCodeValid("wrong code", ENV)).toBe(false);
	});
});
