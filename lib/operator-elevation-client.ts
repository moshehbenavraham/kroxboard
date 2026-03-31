import type {
	DiagnosticMetadata,
	DiagnosticRateLimitDeniedPayload,
	FeatureDisabledPayload,
	InvalidRequest,
	InvalidRequestPayload,
	OperatorAuthDeniedPayload,
	OperatorSessionStatePayload,
	SensitiveMutationDeniedPayload,
} from "@/lib/security/types";

export interface ProtectedRequestOptions {
	actionId: string;
	request: () => Promise<Response>;
}

export interface ProtectedRequestSuccess<T> {
	ok: true;
	data: T;
	status: number;
}

export interface ProtectedRequestAuthFailure {
	ok: false;
	auth: OperatorAuthDeniedPayload["auth"];
	status: number;
}

export interface ProtectedRequestFeatureFailure {
	ok: false;
	feature: FeatureDisabledPayload["feature"];
	status: number;
}

export interface ProtectedRequestInvalidFailure {
	ok: false;
	invalid: InvalidRequest;
	status: number;
}

export interface ProtectedRequestMutationFailure {
	ok: false;
	mutation: SensitiveMutationDeniedPayload["mutation"];
	status: number;
}

export interface ProtectedRequestRateLimitFailure {
	ok: false;
	rateLimit: DiagnosticRateLimitDeniedPayload["rateLimit"];
	status: number;
}

export interface ProtectedRequestFailure {
	ok: false;
	error: string;
	status: number;
}

export type ProtectedRequestBannerTone =
	| "denied"
	| "disabled"
	| "invalid"
	| "limited"
	| "pending"
	| "info"
	| "error";

export interface ProtectedRequestBannerState {
	tone: ProtectedRequestBannerTone;
	message: string;
}

export type ProtectedRequestResult<T> =
	| ProtectedRequestSuccess<T>
	| ProtectedRequestAuthFailure
	| ProtectedRequestFeatureFailure
	| ProtectedRequestInvalidFailure
	| ProtectedRequestMutationFailure
	| ProtectedRequestRateLimitFailure
	| ProtectedRequestFailure;

export type ProtectedRequestRunner = <T>(
	options: ProtectedRequestOptions,
) => Promise<ProtectedRequestResult<T>>;

export function isOperatorAuthDeniedPayload(
	value: unknown,
): value is OperatorAuthDeniedPayload {
	if (!value || typeof value !== "object") return false;
	const auth = (value as OperatorAuthDeniedPayload).auth;
	return (
		(value as OperatorAuthDeniedPayload).ok === false &&
		Boolean(auth) &&
		auth.ok === false &&
		auth.type === "operator_auth" &&
		typeof auth.state === "string" &&
		typeof auth.message === "string" &&
		typeof auth.canChallenge === "boolean"
	);
}

export function isOperatorSessionStatePayload(
	value: unknown,
): value is OperatorSessionStatePayload {
	if (isOperatorAuthDeniedPayload(value)) return true;
	if (!value || typeof value !== "object") return false;
	const session = (value as { session?: { state?: string } }).session;
	return (
		(value as { ok?: boolean }).ok === true &&
		Boolean(session) &&
		session?.state === "elevated"
	);
}

export function isFeatureDisabledPayload(
	value: unknown,
): value is FeatureDisabledPayload {
	if (!value || typeof value !== "object") return false;
	const feature = (value as FeatureDisabledPayload).feature;
	return (
		(value as FeatureDisabledPayload).ok === false &&
		Boolean(feature) &&
		feature.ok === false &&
		feature.type === "feature_disabled" &&
		typeof feature.flag === "string" &&
		typeof feature.capability === "string" &&
		typeof feature.message === "string"
	);
}

export function isInvalidRequestPayload(
	value: unknown,
): value is InvalidRequestPayload {
	if (!value || typeof value !== "object") return false;
	const invalid = (value as InvalidRequestPayload).invalid;
	return (
		(value as InvalidRequestPayload).ok === false &&
		Boolean(invalid) &&
		invalid.ok === false &&
		invalid.type === "invalid_request" &&
		typeof invalid.field === "string" &&
		typeof invalid.reason === "string" &&
		typeof invalid.message === "string"
	);
}

export function isSensitiveMutationDeniedPayload(
	value: unknown,
): value is SensitiveMutationDeniedPayload {
	if (!value || typeof value !== "object") return false;
	const mutation = (value as SensitiveMutationDeniedPayload).mutation;
	return (
		(value as SensitiveMutationDeniedPayload).ok === false &&
		Boolean(mutation) &&
		mutation.ok === false &&
		mutation.type === "sensitive_mutation" &&
		typeof mutation.state === "string" &&
		typeof mutation.message === "string"
	);
}

export function isDiagnosticRateLimitDeniedPayload(
	value: unknown,
): value is DiagnosticRateLimitDeniedPayload {
	if (!value || typeof value !== "object") return false;
	const rateLimit = (value as DiagnosticRateLimitDeniedPayload).rateLimit;
	return (
		(value as DiagnosticRateLimitDeniedPayload).ok === false &&
		Boolean(rateLimit) &&
		rateLimit.ok === false &&
		rateLimit.type === "diagnostic_rate_limit" &&
		typeof rateLimit.capability === "string" &&
		typeof rateLimit.message === "string"
	);
}

function getLegacyInvalidRequestBoundary(
	value: unknown,
): InvalidRequest | null {
	if (!value || typeof value !== "object") return null;
	const boundary = (value as { boundary?: unknown }).boundary;
	if (!boundary || typeof boundary !== "object") return null;
	if (
		(boundary as { ok?: boolean }).ok !== false ||
		(boundary as { type?: unknown }).type !== "invalid_request_boundary" ||
		typeof (boundary as { field?: unknown }).field !== "string" ||
		typeof (boundary as { reason?: unknown }).reason !== "string" ||
		typeof (boundary as { message?: unknown }).message !== "string"
	) {
		return null;
	}

	return {
		ok: false,
		type: "invalid_request",
		field: (boundary as { field: InvalidRequest["field"] }).field,
		reason: (boundary as { reason: InvalidRequest["reason"] }).reason,
		message: (boundary as { message: string }).message,
	};
}

export function getDiagnosticMetadata(
	value: unknown,
): DiagnosticMetadata | null {
	if (!value || typeof value !== "object") return null;
	const diagnostic = (value as { diagnostic?: unknown }).diagnostic;
	if (!diagnostic || typeof diagnostic !== "object") return null;
	const mode = (diagnostic as { mode?: unknown }).mode;
	const message = (diagnostic as { message?: unknown }).message;
	const liveSendEnabled = (diagnostic as { liveSendEnabled?: unknown })
		.liveSendEnabled;
	const liveSendRequested = (diagnostic as { liveSendRequested?: unknown })
		.liveSendRequested;

	if (
		(mode === "dry_run" || mode === "live_send") &&
		typeof message === "string" &&
		typeof liveSendEnabled === "boolean" &&
		typeof liveSendRequested === "boolean"
	) {
		return {
			mode,
			message,
			liveSendEnabled,
			liveSendRequested,
		};
	}

	return null;
}

export function getDryRunDiagnosticMessage(value: unknown): string {
	const diagnostic = getDiagnosticMetadata(value);
	return diagnostic?.mode === "dry_run" ? diagnostic.message : "";
}

export async function readJsonResponse(response: Response): Promise<{
	text: string;
	value: unknown;
}> {
	const text = await response.text();
	if (!text) {
		return { text: "", value: null };
	}

	try {
		return {
			text,
			value: JSON.parse(text),
		};
	} catch {
		return {
			text,
			value: null,
		};
	}
}

export async function parseProtectedResponse<T>(
	response: Response,
): Promise<ProtectedRequestResult<T>> {
	const { text, value } = await readJsonResponse(response);

	if (isOperatorAuthDeniedPayload(value)) {
		return {
			ok: false,
			auth: value.auth,
			status: response.status,
		};
	}

	if (isFeatureDisabledPayload(value)) {
		return {
			ok: false,
			feature: value.feature,
			status: response.status,
		};
	}

	if (isInvalidRequestPayload(value)) {
		return {
			ok: false,
			invalid: value.invalid,
			status: response.status,
		};
	}

	const legacyInvalid = getLegacyInvalidRequestBoundary(value);
	if (legacyInvalid) {
		return {
			ok: false,
			invalid: legacyInvalid,
			status: response.status,
		};
	}

	if (isSensitiveMutationDeniedPayload(value)) {
		return {
			ok: false,
			mutation: value.mutation,
			status: response.status,
		};
	}

	if (isDiagnosticRateLimitDeniedPayload(value)) {
		return {
			ok: false,
			rateLimit: value.rateLimit,
			status: response.status,
		};
	}

	if (response.ok) {
		return {
			ok: true,
			data: value as T,
			status: response.status,
		};
	}

	const error =
		value &&
		typeof value === "object" &&
		typeof (value as { error?: unknown }).error === "string"
			? (value as { error: string }).error
			: text || `HTTP ${response.status}`;

	return {
		ok: false,
		error,
		status: response.status,
	};
}

export function getProtectedRequestError(
	result: ProtectedRequestResult<unknown>,
): string {
	if (result.ok) return "";
	if ("auth" in result) return result.auth.message;
	if ("feature" in result) return result.feature.message;
	if ("invalid" in result) return result.invalid.message;
	if ("mutation" in result) return result.mutation.message;
	if ("rateLimit" in result) return result.rateLimit.message;
	return result.error;
}

export function getProtectedRequestFailureKind(
	result: ProtectedRequestResult<unknown>,
): "denied" | "disabled" | "invalid" | "limited" | "error" | null {
	if (result.ok) return null;
	if ("auth" in result || "mutation" in result) return "denied";
	if ("feature" in result) return "disabled";
	if ("invalid" in result) return "invalid";
	if ("rateLimit" in result) return "limited";
	return "error";
}

export function getProtectedRequestBannerState(
	result: ProtectedRequestResult<unknown>,
): ProtectedRequestBannerState | null {
	const kind = getProtectedRequestFailureKind(result);
	if (!kind) return null;
	return {
		tone: kind,
		message: getProtectedRequestError(result),
	};
}

export function createProtectedRequestBannerState(
	tone: ProtectedRequestBannerTone,
	message: string,
): ProtectedRequestBannerState {
	return { tone, message };
}
