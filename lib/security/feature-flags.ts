import { NextResponse } from "next/server";
import type {
	DiagnosticMetadata,
	DiagnosticMode,
	FeatureDisabledPayload,
	SensitiveFeatureCapability,
	SensitiveFeatureFlag,
} from "@/lib/security/types";

type FeatureFlagReason = "enabled" | "disabled" | "invalid";

interface FeatureFlagDefinition {
	capability: SensitiveFeatureCapability;
	disabledMessage: string;
	invalidMessage: string;
}

export interface FeatureFlagState {
	flag: SensitiveFeatureFlag;
	capability: SensitiveFeatureCapability;
	enabled: boolean;
	reason: FeatureFlagReason;
	message: string;
}

const FEATURE_FLAG_DEFINITIONS: Record<
	SensitiveFeatureFlag,
	FeatureFlagDefinition
> = {
	ENABLE_MODEL_MUTATIONS: {
		capability: "model_mutations",
		disabledMessage:
			"Model mutations are disabled. Set ENABLE_MODEL_MUTATIONS=true on the server to enable them.",
		invalidMessage:
			'Model mutations are disabled because ENABLE_MODEL_MUTATIONS must be "true" or "false".',
	},
	ENABLE_ALERT_WRITES: {
		capability: "alert_writes",
		disabledMessage:
			"Alert writes are disabled. Set ENABLE_ALERT_WRITES=true on the server to enable them.",
		invalidMessage:
			'Alert writes are disabled because ENABLE_ALERT_WRITES must be "true" or "false".',
	},
	ENABLE_PIXEL_OFFICE_WRITES: {
		capability: "pixel_office_writes",
		disabledMessage:
			"Pixel office layout writes are disabled. Set ENABLE_PIXEL_OFFICE_WRITES=true on the server to enable them.",
		invalidMessage:
			'Pixel office layout writes are disabled because ENABLE_PIXEL_OFFICE_WRITES must be "true" or "false".',
	},
	ENABLE_PROVIDER_PROBES: {
		capability: "provider_probes",
		disabledMessage:
			"Provider probes are disabled. Set ENABLE_PROVIDER_PROBES=true on the server to enable them.",
		invalidMessage:
			'Provider probes are disabled because ENABLE_PROVIDER_PROBES must be "true" or "false".',
	},
	ENABLE_OUTBOUND_TESTS: {
		capability: "outbound_tests",
		disabledMessage:
			"Outbound diagnostics are disabled. Set ENABLE_OUTBOUND_TESTS=true on the server to enable them.",
		invalidMessage:
			'Outbound diagnostics are disabled because ENABLE_OUTBOUND_TESTS must be "true" or "false".',
	},
	ENABLE_LIVE_SEND_DIAGNOSTICS: {
		capability: "live_send_diagnostics",
		disabledMessage:
			"Live-send diagnostics are disabled. Running dry-run checks only until ENABLE_LIVE_SEND_DIAGNOSTICS=true.",
		invalidMessage:
			'Live-send diagnostics are disabled because ENABLE_LIVE_SEND_DIAGNOSTICS must be "true" or "false". Running dry-run checks only.',
	},
};

function parseFeatureFlagValue(value: string | undefined): {
	enabled: boolean;
	reason: FeatureFlagReason;
} {
	const trimmed = value?.trim();
	if (!trimmed) {
		return { enabled: false, reason: "disabled" };
	}
	if (trimmed === "true") {
		return { enabled: true, reason: "enabled" };
	}
	if (trimmed === "false") {
		return { enabled: false, reason: "disabled" };
	}
	return { enabled: false, reason: "invalid" };
}

export function getFeatureFlagState(
	flag: SensitiveFeatureFlag,
	source: NodeJS.ProcessEnv = process.env,
): FeatureFlagState {
	const definition = FEATURE_FLAG_DEFINITIONS[flag];
	const parsed = parseFeatureFlagValue(source[flag]);

	return {
		flag,
		capability: definition.capability,
		enabled: parsed.enabled,
		reason: parsed.reason,
		message:
			parsed.reason === "invalid"
				? definition.invalidMessage
				: definition.disabledMessage,
	};
}

export function createFeatureDisabledPayload(
	flag: SensitiveFeatureFlag,
	options: {
		source?: NodeJS.ProcessEnv;
		message?: string;
		diagnosticMode?: DiagnosticMode;
	} = {},
): FeatureDisabledPayload {
	const state = getFeatureFlagState(flag, options.source);
	const message = options.message ?? state.message;

	return {
		ok: false,
		error: message,
		feature: {
			ok: false,
			type: "feature_disabled",
			flag,
			capability: state.capability,
			message,
			...(options.diagnosticMode
				? { diagnosticMode: options.diagnosticMode }
				: {}),
		},
	};
}

export function createFeatureDisabledResponse(
	flag: SensitiveFeatureFlag,
	options: {
		source?: NodeJS.ProcessEnv;
		message?: string;
		status?: number;
		diagnosticMode?: DiagnosticMode;
	} = {},
): NextResponse {
	return NextResponse.json(createFeatureDisabledPayload(flag, options), {
		status: options.status ?? 403,
	});
}

export type RequireFeatureFlagResult =
	| {
			ok: true;
			state: FeatureFlagState;
	  }
	| {
			ok: false;
			state: FeatureFlagState;
			response: NextResponse;
	  };

export function requireFeatureFlag(
	flag: SensitiveFeatureFlag,
	options: {
		source?: NodeJS.ProcessEnv;
		message?: string;
		status?: number;
		diagnosticMode?: DiagnosticMode;
	} = {},
): RequireFeatureFlagResult {
	const state = getFeatureFlagState(flag, options.source);
	if (state.enabled) {
		return { ok: true, state };
	}

	return {
		ok: false,
		state,
		response: createFeatureDisabledResponse(flag, {
			source: options.source,
			message: options.message ?? state.message,
			status: options.status,
			diagnosticMode: options.diagnosticMode,
		}),
	};
}

export function createDiagnosticMetadata(
	mode: DiagnosticMetadata["mode"],
	message: string,
): DiagnosticMetadata {
	const liveSendEnabled = mode === "live_send";

	return {
		mode,
		liveSendEnabled,
		liveSendRequested: liveSendEnabled,
		message,
	};
}

export type OutboundDiagnosticAccessResult =
	| {
			ok: true;
			mode: DiagnosticMetadata["mode"];
			outboundTests: FeatureFlagState;
			liveSend: FeatureFlagState;
			diagnostic: DiagnosticMetadata;
	  }
	| {
			ok: false;
			mode: "disabled";
			outboundTests: FeatureFlagState;
			liveSend: FeatureFlagState;
			response: NextResponse;
	  };

export function resolveOutboundDiagnosticAccess(
	source: NodeJS.ProcessEnv = process.env,
): OutboundDiagnosticAccessResult {
	const outboundTests = getFeatureFlagState("ENABLE_OUTBOUND_TESTS", source);
	const liveSend = getFeatureFlagState("ENABLE_LIVE_SEND_DIAGNOSTICS", source);

	if (!outboundTests.enabled) {
		return {
			ok: false,
			mode: "disabled",
			outboundTests,
			liveSend,
			response: createFeatureDisabledResponse("ENABLE_OUTBOUND_TESTS", {
				source,
				message: outboundTests.message,
				diagnosticMode: "disabled",
			}),
		};
	}

	if (liveSend.enabled) {
		return {
			ok: true,
			mode: "live_send",
			outboundTests,
			liveSend,
			diagnostic: createDiagnosticMetadata(
				"live_send",
				"Live-send diagnostics are enabled. Real platform messages may be sent.",
			),
		};
	}

	return {
		ok: true,
		mode: "dry_run",
		outboundTests,
		liveSend,
		diagnostic: createDiagnosticMetadata("dry_run", liveSend.message),
	};
}
