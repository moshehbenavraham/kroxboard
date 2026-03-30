const DEFAULT_CF_ACCESS_EMAIL_HEADER = "CF-Access-Authenticated-User-Email";
const DEFAULT_CF_ACCESS_JWT_HEADER = "CF-Access-Jwt-Assertion";
const MAX_OPERATOR_SESSION_HOURS = 12;
const MIN_SESSION_HOURS = 1;

export interface DashboardAuthEnv {
	dashboardHost: string | null;
	allowedEmails: string[];
	cfAccessEnabled: boolean;
	cfAccessOtpPrimary: boolean;
	cfAccessSessionHours: number;
	cfAccessAud: string | null;
	cfAccessEmailHeader: string;
	cfAccessJwtHeader: string;
	operatorCodeRequired: boolean;
	operatorCode: string;
	operatorCookieSecret: string;
	operatorSessionHours: number;
}

export class DashboardEnvError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DashboardEnvError";
	}
}

function parseBooleanEnv(key: string, value: string | undefined): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new DashboardEnvError(`${key} must be "true" or "false"`);
}

function parseHoursEnv(
	key: string,
	value: string | undefined,
	maxHours: number,
): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		throw new DashboardEnvError(`${key} must be an integer number of hours`);
	}
	if (parsed < MIN_SESSION_HOURS || parsed > maxHours) {
		throw new DashboardEnvError(
			`${key} must be between ${MIN_SESSION_HOURS} and ${maxHours} hours`,
		);
	}
	return parsed;
}

function parseAllowedEmails(value: string | undefined): string[] {
	if (!value?.trim()) {
		throw new DashboardEnvError(
			"DASHBOARD_ALLOWED_EMAILS must list at least one operator email",
		);
	}

	const normalized = Array.from(
		new Set(
			value
				.split(",")
				.map((entry) => entry.trim().toLowerCase())
				.filter(Boolean),
		),
	);

	if (normalized.length === 0) {
		throw new DashboardEnvError(
			"DASHBOARD_ALLOWED_EMAILS must list at least one operator email",
		);
	}

	return normalized;
}

function parseOptionalString(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function parseRequiredSecret(
	key: string,
	value: string | undefined,
	minLength: number,
): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new DashboardEnvError(`${key} is required`);
	}
	if (trimmed.length < minLength) {
		throw new DashboardEnvError(
			`${key} must be at least ${minLength} characters`,
		);
	}
	return trimmed;
}

export function parseDashboardAuthEnv(
	source: NodeJS.ProcessEnv = process.env,
): DashboardAuthEnv {
	const cfAccessEnabled = parseBooleanEnv(
		"DASHBOARD_CF_ACCESS_ENABLED",
		source.DASHBOARD_CF_ACCESS_ENABLED,
	);
	const operatorCodeRequired = parseBooleanEnv(
		"DASHBOARD_OPERATOR_CODE_REQUIRED",
		source.DASHBOARD_OPERATOR_CODE_REQUIRED,
	);

	return {
		dashboardHost: parseOptionalString(source.DASHBOARD_HOST),
		allowedEmails: parseAllowedEmails(source.DASHBOARD_ALLOWED_EMAILS),
		cfAccessEnabled,
		cfAccessOtpPrimary: parseBooleanEnv(
			"DASHBOARD_CF_ACCESS_OTP_PRIMARY",
			source.DASHBOARD_CF_ACCESS_OTP_PRIMARY,
		),
		cfAccessSessionHours: parseHoursEnv(
			"DASHBOARD_CF_ACCESS_SESSION_HOURS",
			source.DASHBOARD_CF_ACCESS_SESSION_HOURS,
			24,
		),
		cfAccessAud: parseOptionalString(source.DASHBOARD_CF_ACCESS_AUD),
		cfAccessEmailHeader:
			parseOptionalString(source.DASHBOARD_CF_ACCESS_EMAIL_HEADER) ||
			DEFAULT_CF_ACCESS_EMAIL_HEADER,
		cfAccessJwtHeader:
			parseOptionalString(source.DASHBOARD_CF_ACCESS_JWT_HEADER) ||
			DEFAULT_CF_ACCESS_JWT_HEADER,
		operatorCodeRequired,
		operatorCode: operatorCodeRequired
			? parseRequiredSecret(
					"DASHBOARD_OPERATOR_CODE",
					source.DASHBOARD_OPERATOR_CODE,
					8,
				)
			: "",
		operatorCookieSecret: operatorCodeRequired
			? parseRequiredSecret(
					"DASHBOARD_OPERATOR_COOKIE_SECRET",
					source.DASHBOARD_OPERATOR_COOKIE_SECRET,
					32,
				)
			: "",
		operatorSessionHours: parseHoursEnv(
			"DASHBOARD_OPERATOR_SESSION_HOURS",
			source.DASHBOARD_OPERATOR_SESSION_HOURS,
			MAX_OPERATOR_SESSION_HOURS,
		),
	};
}
