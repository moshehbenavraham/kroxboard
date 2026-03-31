import { describe, expect, it } from "vitest";
import {
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";

const BASE_ENV = {
	NODE_ENV: "test",
	DASHBOARD_HOST: "board.example.com",
	DASHBOARD_ALLOWED_EMAILS: "operator@example.com,Operator@example.com",
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
};

describe("parseDashboardAuthEnv", () => {
	it("parses the documented operator auth contract", () => {
		const parsed = parseDashboardAuthEnv(BASE_ENV as NodeJS.ProcessEnv);

		expect(parsed.allowedEmails).toEqual(["operator@example.com"]);
		expect(parsed.cfAccessEnabled).toBe(true);
		expect(parsed.cfAccessAud).toBe("cf-aud");
		expect(parsed.operatorSessionHours).toBe(12);
		expect(parsed.operatorCookieSecret).toHaveLength(32);
	});

	it("rejects operator sessions longer than twelve hours", () => {
		expect(() =>
			parseDashboardAuthEnv({
				...BASE_ENV,
				DASHBOARD_OPERATOR_SESSION_HOURS: "13",
			} as NodeJS.ProcessEnv),
		).toThrow(DashboardEnvError);
	});

	it("throws for non-integer session hours", () => {
		expect(() =>
			parseDashboardAuthEnv({
				...BASE_ENV,
				DASHBOARD_CF_ACCESS_SESSION_HOURS: "2.5",
			} as NodeJS.ProcessEnv),
		).toThrow(DashboardEnvError);
	});

	it("throws when operator cookie secret is too short", () => {
		expect(() =>
			parseDashboardAuthEnv({
				...BASE_ENV,
				DASHBOARD_OPERATOR_COOKIE_SECRET: "short",
			} as NodeJS.ProcessEnv),
		).toThrow(DashboardEnvError);
	});

	it("throws when allowed emails is empty after filtering", () => {
		expect(() =>
			parseDashboardAuthEnv({
				...BASE_ENV,
				DASHBOARD_ALLOWED_EMAILS: ",,,",
			} as NodeJS.ProcessEnv),
		).toThrow(DashboardEnvError);
	});

	it("skips operator secrets when code is not required", () => {
		const parsed = parseDashboardAuthEnv({
			...BASE_ENV,
			DASHBOARD_OPERATOR_CODE_REQUIRED: "false",
			DASHBOARD_OPERATOR_CODE: "",
			DASHBOARD_OPERATOR_COOKIE_SECRET: "",
		} as NodeJS.ProcessEnv);
		expect(parsed.operatorCodeRequired).toBe(false);
		expect(parsed.operatorCode).toBe("");
	});

	it("uses default header names when none are provided", () => {
		const env = { ...BASE_ENV };
		delete (env as any).DASHBOARD_CF_ACCESS_EMAIL_HEADER;
		delete (env as any).DASHBOARD_CF_ACCESS_JWT_HEADER;
		const parsed = parseDashboardAuthEnv(env as NodeJS.ProcessEnv);
		expect(parsed.cfAccessEmailHeader).toBe(
			"CF-Access-Authenticated-User-Email",
		);
		expect(parsed.cfAccessJwtHeader).toBe("CF-Access-Jwt-Assertion");
	});

	it("returns null dashboardHost when not provided", () => {
		const env = { ...BASE_ENV };
		delete (env as any).DASHBOARD_HOST;
		const parsed = parseDashboardAuthEnv(env as NodeJS.ProcessEnv);
		expect(parsed.dashboardHost).toBeNull();
	});

	it("throws for invalid boolean env values", () => {
		expect(() =>
			parseDashboardAuthEnv({
				...BASE_ENV,
				DASHBOARD_CF_ACCESS_ENABLED: "yes",
			} as NodeJS.ProcessEnv),
		).toThrow(DashboardEnvError);
	});
});
