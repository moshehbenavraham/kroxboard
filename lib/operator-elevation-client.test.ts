import { describe, expect, it } from "vitest";
import {
	getDiagnosticMetadata,
	getDryRunDiagnosticMessage,
	getProtectedRequestError,
	getProtectedRequestFailureKind,
	isFeatureDisabledPayload,
	isInvalidRequestPayload,
	isOperatorAuthDeniedPayload,
	isOperatorSessionStatePayload,
	isSensitiveMutationDeniedPayload,
	parseProtectedResponse,
	readJsonResponse,
} from "@/lib/operator-elevation-client";
import type {
	InvalidRequestPayload,
	OperatorAuthDeniedPayload,
	SensitiveFeatureFlag,
	SensitiveMutationDeniedState,
} from "@/lib/security/types";

function authDenied(
	state: "challenge_required" | "session_expired" | "identity_denied",
	canChallenge = true,
): OperatorAuthDeniedPayload {
	return {
		ok: false as const,
		error: "denied",
		auth: {
			ok: false as const,
			type: "operator_auth" as const,
			state,
			message: "Access denied",
			canChallenge,
		},
	};
}

function featureDisabled(
	flag: SensitiveFeatureFlag = "ENABLE_PROVIDER_PROBES",
) {
	return {
		ok: false as const,
		error: "Provider probes are disabled",
		feature: {
			ok: false as const,
			type: "feature_disabled" as const,
			flag,
			capability: "provider_probes" as const,
			message: "Provider probes are disabled",
			diagnosticMode: "disabled" as const,
		},
	};
}

function invalidRequest(): InvalidRequestPayload {
	return {
		ok: false as const,
		error: "Missing modelId",
		invalid: {
			ok: false as const,
			type: "invalid_request" as const,
			field: "modelId" as const,
			reason: "missing" as const,
			message: "Missing modelId",
		},
	};
}

function sensitiveMutationDenied(
	state: SensitiveMutationDeniedState = "origin_denied",
) {
	return {
		ok: false as const,
		error: "Cross-origin dashboard writes are not allowed.",
		mutation: {
			ok: false as const,
			type: "sensitive_mutation" as const,
			state,
			message: "Cross-origin dashboard writes are not allowed.",
		},
	};
}

describe("isOperatorAuthDeniedPayload", () => {
	it("returns true for a valid auth denied payload", () => {
		expect(isOperatorAuthDeniedPayload(authDenied("challenge_required"))).toBe(
			true,
		);
	});

	it("returns true for identity_denied state", () => {
		expect(
			isOperatorAuthDeniedPayload(authDenied("identity_denied", false)),
		).toBe(true);
	});

	it("returns false for null", () => {
		expect(isOperatorAuthDeniedPayload(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isOperatorAuthDeniedPayload(undefined)).toBe(false);
	});

	it("returns false for a non-object", () => {
		expect(isOperatorAuthDeniedPayload("string")).toBe(false);
	});

	it("returns false when ok is true", () => {
		expect(
			isOperatorAuthDeniedPayload({
				ok: true,
				auth: {
					ok: false,
					type: "operator_auth",
					state: "challenge_required",
					message: "x",
					canChallenge: true,
				},
			}),
		).toBe(false);
	});

	it("returns false when auth.type is wrong", () => {
		expect(
			isOperatorAuthDeniedPayload({
				ok: false,
				auth: {
					ok: false,
					type: "other",
					state: "challenge_required",
					message: "x",
					canChallenge: true,
				},
			}),
		).toBe(false);
	});

	it("returns false when auth is missing", () => {
		expect(isOperatorAuthDeniedPayload({ ok: false })).toBe(false);
	});
});

describe("isOperatorSessionStatePayload", () => {
	it("returns true for an auth denied payload", () => {
		expect(
			isOperatorSessionStatePayload(authDenied("challenge_required")),
		).toBe(true);
	});

	it("returns true for a successful elevated session", () => {
		expect(
			isOperatorSessionStatePayload({
				ok: true,
				session: { state: "elevated" },
			}),
		).toBe(true);
	});

	it("returns false for null", () => {
		expect(isOperatorSessionStatePayload(null)).toBe(false);
	});

	it("returns false for a success without session", () => {
		expect(isOperatorSessionStatePayload({ ok: true })).toBe(false);
	});
});

describe("isFeatureDisabledPayload", () => {
	it("returns true for a valid feature-disabled payload", () => {
		expect(isFeatureDisabledPayload(featureDisabled())).toBe(true);
	});

	it("returns false when the feature payload is missing", () => {
		expect(isFeatureDisabledPayload({ ok: false })).toBe(false);
	});
});

describe("typed protected failure payloads", () => {
	it("returns true for valid invalid-request payloads", () => {
		expect(isInvalidRequestPayload(invalidRequest())).toBe(true);
	});

	it("returns true for valid sensitive-mutation payloads", () => {
		expect(isSensitiveMutationDeniedPayload(sensitiveMutationDenied())).toBe(
			true,
		);
	});
});

describe("readJsonResponse", () => {
	it("parses a JSON response", async () => {
		const response = new Response('{"data":1}', {
			headers: { "Content-Type": "application/json" },
		});
		const result = await readJsonResponse(response);
		expect(result.value).toEqual({ data: 1 });
		expect(result.text).toBe('{"data":1}');
	});

	it("returns null value for empty body", async () => {
		const response = new Response("", { status: 200 });
		const result = await readJsonResponse(response);
		expect(result.value).toBeNull();
		expect(result.text).toBe("");
	});

	it("returns null value for non-JSON text", async () => {
		const response = new Response("not json");
		const result = await readJsonResponse(response);
		expect(result.value).toBeNull();
		expect(result.text).toBe("not json");
	});
});

describe("diagnostic metadata helpers", () => {
	it("returns diagnostic metadata for dry-run payloads", () => {
		expect(
			getDiagnosticMetadata({
				diagnostic: {
					mode: "dry_run",
					message: "Dry-run only",
					liveSendEnabled: false,
					liveSendRequested: false,
				},
			}),
		).toEqual({
			mode: "dry_run",
			message: "Dry-run only",
			liveSendEnabled: false,
			liveSendRequested: false,
		});
	});

	it("returns a dry-run message only for dry-run payloads", () => {
		expect(
			getDryRunDiagnosticMessage({
				diagnostic: {
					mode: "dry_run",
					message: "Dry-run only",
					liveSendEnabled: false,
					liveSendRequested: false,
				},
			}),
		).toBe("Dry-run only");
		expect(
			getDryRunDiagnosticMessage({
				diagnostic: {
					mode: "live_send",
					message: "Live-send enabled",
					liveSendEnabled: true,
					liveSendRequested: true,
				},
			}),
		).toBe("");
	});
});

describe("parseProtectedResponse", () => {
	it("returns auth failure for auth denied responses", async () => {
		const payload = authDenied("challenge_required");
		const response = new Response(JSON.stringify(payload), { status: 401 });
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("auth" in result && result.auth.state).toBe("challenge_required");
	});

	it("returns success for OK responses", async () => {
		const response = new Response(JSON.stringify({ data: "hello" }), {
			status: 200,
		});
		const result = await parseProtectedResponse<{ data: string }>(response);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({ data: "hello" });
		}
	});

	it("returns feature failure for feature-disabled responses", async () => {
		const payload = featureDisabled();
		const response = new Response(JSON.stringify(payload), { status: 403 });
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("feature" in result && result.feature.flag).toBe(
			"ENABLE_PROVIDER_PROBES",
		);
	});

	it("returns error for non-OK non-auth responses", async () => {
		const response = new Response(JSON.stringify({ error: "bad input" }), {
			status: 400,
		});
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("error" in result && result.error).toBe("bad input");
	});

	it("uses HTTP status as fallback error message", async () => {
		const response = new Response("", { status: 500 });
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("error" in result && result.error).toBe("HTTP 500");
	});

	it("returns invalid failure for typed invalid-request payloads", async () => {
		const response = new Response(JSON.stringify(invalidRequest()), {
			status: 400,
		});
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("invalid" in result && result.invalid.field).toBe("modelId");
	});

	it("normalizes legacy invalid-request-boundary payloads", async () => {
		const response = new Response(
			JSON.stringify({
				ok: false,
				error: "Invalid agentId",
				boundary: {
					ok: false,
					type: "invalid_request_boundary",
					field: "agentId",
					reason: "invalid_format",
					message: "Invalid agentId",
				},
			}),
			{ status: 400 },
		);
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("invalid" in result && result.invalid.field).toBe("agentId");
	});

	it("returns mutation failure for sensitive-mutation payloads", async () => {
		const response = new Response(JSON.stringify(sensitiveMutationDenied()), {
			status: 403,
		});
		const result = await parseProtectedResponse(response);
		expect(result.ok).toBe(false);
		expect("mutation" in result && result.mutation.state).toBe("origin_denied");
	});
});

describe("getProtectedRequestError", () => {
	it("returns empty string for success", () => {
		expect(getProtectedRequestError({ ok: true, data: {}, status: 200 })).toBe(
			"",
		);
	});

	it("returns auth message for auth failure", () => {
		expect(
			getProtectedRequestError({
				ok: false,
				auth: {
					ok: false,
					type: "operator_auth",
					state: "challenge_required",
					message: "Please elevate",
					canChallenge: true,
				},
				status: 401,
			}),
		).toBe("Please elevate");
	});

	it("returns error string for generic failure", () => {
		expect(
			getProtectedRequestError({
				ok: false,
				error: "Something went wrong",
				status: 500,
			}),
		).toBe("Something went wrong");
	});

	it("returns feature message for feature-disabled failure", () => {
		expect(
			getProtectedRequestError({
				ok: false,
				feature: {
					ok: false,
					type: "feature_disabled",
					flag: "ENABLE_PROVIDER_PROBES",
					capability: "provider_probes",
					message: "Provider probes are disabled",
					diagnosticMode: "disabled",
				},
				status: 403,
			}),
		).toBe("Provider probes are disabled");
	});

	it("returns invalid-request messages for invalid failures", () => {
		expect(
			getProtectedRequestError({
				ok: false,
				invalid: invalidRequest().invalid,
				status: 400,
			}),
		).toBe("Missing modelId");
	});

	it("returns mutation messages for same-origin failures", () => {
		expect(
			getProtectedRequestError({
				ok: false,
				mutation: sensitiveMutationDenied().mutation,
				status: 403,
			}),
		).toBe("Cross-origin dashboard writes are not allowed.");
	});
});

describe("getProtectedRequestFailureKind", () => {
	it("classifies auth failures as denied", () => {
		expect(
			getProtectedRequestFailureKind({
				ok: false,
				auth: authDenied("challenge_required").auth,
				status: 401,
			}),
		).toBe("denied");
	});

	it("classifies feature failures as disabled", () => {
		expect(
			getProtectedRequestFailureKind({
				ok: false,
				feature: featureDisabled().feature,
				status: 403,
			}),
		).toBe("disabled");
	});

	it("classifies invalid-request failures as invalid", () => {
		expect(
			getProtectedRequestFailureKind({
				ok: false,
				invalid: invalidRequest().invalid,
				status: 400,
			}),
		).toBe("invalid");
	});

	it("classifies generic failures as error", () => {
		expect(
			getProtectedRequestFailureKind({
				ok: false,
				error: "boom",
				status: 500,
			}),
		).toBe("error");
	});
});
