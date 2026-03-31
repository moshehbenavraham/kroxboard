import { describe, expect, it } from "vitest";
import {
	createDiagnosticMetadata,
	createFeatureDisabledPayload,
	createFeatureDisabledResponse,
	getFeatureFlagState,
	requireFeatureFlag,
	resolveOutboundDiagnosticAccess,
} from "@/lib/security/feature-flags";

function asEnv(values: Record<string, string>): NodeJS.ProcessEnv {
	return values as NodeJS.ProcessEnv;
}

describe("getFeatureFlagState", () => {
	it("treats missing flags as disabled", () => {
		const state = getFeatureFlagState("ENABLE_MODEL_MUTATIONS", asEnv({}));
		expect(state.enabled).toBe(false);
		expect(state.reason).toBe("disabled");
		expect(state.capability).toBe("model_mutations");
	});

	it("parses true values", () => {
		const state = getFeatureFlagState(
			"ENABLE_PROVIDER_PROBES",
			asEnv({
				ENABLE_PROVIDER_PROBES: "true",
			}),
		);
		expect(state.enabled).toBe(true);
		expect(state.reason).toBe("enabled");
	});

	it("fails closed for invalid values", () => {
		const state = getFeatureFlagState(
			"ENABLE_PROVIDER_PROBES",
			asEnv({
				ENABLE_PROVIDER_PROBES: "yes",
			}),
		);
		expect(state.enabled).toBe(false);
		expect(state.reason).toBe("invalid");
		expect(state.message).toContain("must be");
	});
});

describe("feature-disabled helpers", () => {
	it("creates a typed disabled payload", () => {
		const payload = createFeatureDisabledPayload("ENABLE_ALERT_WRITES", {
			diagnosticMode: "disabled",
		});
		expect(payload.ok).toBe(false);
		expect(payload.feature.flag).toBe("ENABLE_ALERT_WRITES");
		expect(payload.feature.capability).toBe("alert_writes");
		expect(payload.feature.diagnosticMode).toBe("disabled");
	});

	it("creates a 403 disabled response by default", async () => {
		const response = createFeatureDisabledResponse(
			"ENABLE_PIXEL_OFFICE_WRITES",
		);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			ok: false,
			feature: {
				flag: "ENABLE_PIXEL_OFFICE_WRITES",
			},
		});
	});

	it("returns a failed guard result for disabled flags", async () => {
		const result = requireFeatureFlag("ENABLE_PROVIDER_PROBES", {
			source: asEnv({ ENABLE_PROVIDER_PROBES: "false" }),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.state.reason).toBe("disabled");
			await expect(result.response.json()).resolves.toMatchObject({
				feature: {
					flag: "ENABLE_PROVIDER_PROBES",
				},
			});
		}
	});

	it("returns a passing guard result for enabled flags", () => {
		const result = requireFeatureFlag("ENABLE_PROVIDER_PROBES", {
			source: asEnv({ ENABLE_PROVIDER_PROBES: "true" }),
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.state.enabled).toBe(true);
		}
	});
});

describe("createDiagnosticMetadata", () => {
	it("marks live-send metadata explicitly", () => {
		const diagnostic = createDiagnosticMetadata(
			"live_send",
			"Live-send diagnostics are enabled.",
		);
		expect(diagnostic.liveSendEnabled).toBe(true);
		expect(diagnostic.liveSendRequested).toBe(true);
	});

	it("marks dry-run metadata explicitly", () => {
		const diagnostic = createDiagnosticMetadata(
			"dry_run",
			"Live-send diagnostics are disabled.",
		);
		expect(diagnostic.liveSendEnabled).toBe(false);
		expect(diagnostic.liveSendRequested).toBe(false);
	});
});

describe("resolveOutboundDiagnosticAccess", () => {
	it("returns a disabled response when outbound tests are off", async () => {
		const result = resolveOutboundDiagnosticAccess(
			asEnv({
				ENABLE_OUTBOUND_TESTS: "false",
			}),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.mode).toBe("disabled");
			await expect(result.response.json()).resolves.toMatchObject({
				feature: {
					flag: "ENABLE_OUTBOUND_TESTS",
					diagnosticMode: "disabled",
				},
			});
		}
	});

	it("returns dry-run metadata when outbound tests are enabled but live send is off", () => {
		const result = resolveOutboundDiagnosticAccess(
			asEnv({
				ENABLE_OUTBOUND_TESTS: "true",
				ENABLE_LIVE_SEND_DIAGNOSTICS: "false",
			}),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.mode).toBe("dry_run");
			expect(result.diagnostic.liveSendEnabled).toBe(false);
		}
	});

	it("returns live-send metadata when both flags are enabled", () => {
		const result = resolveOutboundDiagnosticAccess(
			asEnv({
				ENABLE_OUTBOUND_TESTS: "true",
				ENABLE_LIVE_SEND_DIAGNOSTICS: "true",
			}),
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.mode).toBe("live_send");
			expect(result.diagnostic.liveSendEnabled).toBe(true);
		}
	});
});
