export type OperatorIdentityMode = "localhost" | "cloudflare_access";
export type SensitiveFeatureFlag =
	| "ENABLE_MODEL_MUTATIONS"
	| "ENABLE_ALERT_WRITES"
	| "ENABLE_PIXEL_OFFICE_WRITES"
	| "ENABLE_PROVIDER_PROBES"
	| "ENABLE_OUTBOUND_TESTS"
	| "ENABLE_LIVE_SEND_DIAGNOSTICS";
export type SensitiveFeatureCapability =
	| "model_mutations"
	| "alert_writes"
	| "pixel_office_writes"
	| "provider_probes"
	| "outbound_tests"
	| "live_send_diagnostics";
export type DiagnosticMode = "disabled" | "dry_run" | "live_send";
export type DiagnosticRateLimitCapability =
	| "provider_probe"
	| "provider_probe_batch"
	| "session_diagnostic"
	| "session_diagnostic_batch"
	| "dm_session_diagnostic_batch"
	| "platform_diagnostics"
	| "alert_diagnostics"
	| "stats_all"
	| "activity_heatmap"
	| "pixel_office_version";

export type OperatorAuthDeniedState =
	| "challenge_required"
	| "session_expired"
	| "identity_denied";

export type OperatorAuthState = "elevated" | OperatorAuthDeniedState;

export interface OperatorIdentity {
	mode: OperatorIdentityMode;
	subject: string;
	email: string | null;
	isLocal: boolean;
}

export interface OperatorSessionSummary {
	state: "elevated";
	mode: OperatorIdentityMode;
	email: string | null;
	issuedAt: string;
	expiresAt: string;
}

export interface OperatorAuthDenied {
	ok: false;
	type: "operator_auth";
	state: OperatorAuthDeniedState;
	message: string;
	canChallenge: boolean;
}

export interface OperatorAuthDeniedPayload {
	ok: false;
	error: string;
	auth: OperatorAuthDenied;
}

export interface FeatureDisabled {
	ok: false;
	type: "feature_disabled";
	flag: SensitiveFeatureFlag;
	capability: SensitiveFeatureCapability;
	message: string;
	diagnosticMode?: DiagnosticMode;
}

export interface FeatureDisabledPayload {
	ok: false;
	error: string;
	feature: FeatureDisabled;
}

export type SensitiveMutationDeniedState =
	| "method_not_allowed"
	| "origin_required"
	| "origin_invalid"
	| "origin_denied";

export interface SensitiveMutationDenied {
	ok: false;
	type: "sensitive_mutation";
	state: SensitiveMutationDeniedState;
	message: string;
}

export interface SensitiveMutationDeniedPayload {
	ok: false;
	error: string;
	mutation: SensitiveMutationDenied;
}

export type InvalidRequestField =
	| "body"
	| "agentId"
	| "sessionKey"
	| "code"
	| "model"
	| "provider"
	| "modelId"
	| "enabled"
	| "receiveAgent"
	| "checkInterval"
	| "rules"
	| "threshold"
	| "targetAgents"
	| "layout"
	| "version"
	| "cols"
	| "rows"
	| "tiles"
	| "furniture";

export type InvalidRequestReason =
	| "missing"
	| "invalid_format"
	| "invalid_value"
	| "invalid_json"
	| "payload_too_large"
	| "agent_mismatch";

export interface InvalidRequest {
	ok: false;
	type: "invalid_request";
	field: InvalidRequestField;
	reason: InvalidRequestReason;
	message: string;
}

export interface InvalidRequestPayload {
	ok: false;
	error: string;
	invalid: InvalidRequest;
}

export interface DiagnosticMetadata {
	mode: Exclude<DiagnosticMode, "disabled">;
	liveSendEnabled: boolean;
	liveSendRequested: boolean;
	message: string;
}

export interface DiagnosticRateLimitMetadata {
	capability: DiagnosticRateLimitCapability;
	limit: number;
	remaining: number;
	windowMs: number;
	windowStartedAt: number;
	resetAt: number;
	retryAfterSeconds: number;
	policy: "local_process";
}

export interface DiagnosticRateLimitDenied {
	ok: false;
	type: "diagnostic_rate_limit";
	capability: DiagnosticRateLimitCapability;
	message: string;
	metadata: DiagnosticRateLimitMetadata;
}

export interface DiagnosticRateLimitDeniedPayload {
	ok: false;
	error: string;
	rateLimit: DiagnosticRateLimitDenied;
}

export interface OperatorSessionStatusPayload {
	ok: true;
	session: OperatorSessionSummary;
}

export type OperatorSessionStatePayload =
	| OperatorSessionStatusPayload
	| OperatorAuthDeniedPayload;
