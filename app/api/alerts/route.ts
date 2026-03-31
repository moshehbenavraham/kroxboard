import { NextResponse } from "next/server";
import { loadAlertConfig, updateAlertConfig } from "@/lib/alert-config";
import { requireFeatureFlag } from "@/lib/security/feature-flags";
import {
	getInvalidRequestStatus,
	readBoundedJsonBody,
} from "@/lib/security/request-body";
import {
	createInvalidRequestResponse,
	validateAlertWriteInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";

const ALERT_WRITE_BODY_MAX_BYTES = 4096;

async function handleAlertWrite(request: Request): Promise<NextResponse> {
	const access = requireSensitiveMutationAccess(request, {
		allowedMethods: ["POST", "PUT"],
	});
	if (!access.ok) return access.response;

	const feature = requireFeatureFlag("ENABLE_ALERT_WRITES");
	if (!feature.ok) return feature.response;

	const parsedBody = await readBoundedJsonBody(request, {
		maxBytes: ALERT_WRITE_BODY_MAX_BYTES,
	});
	if (!parsedBody.ok) {
		return createInvalidRequestResponse(
			parsedBody.error,
			getInvalidRequestStatus(parsedBody.error),
		);
	}

	try {
		const update = validateAlertWriteInput(parsedBody.value);
		if (!update.ok) {
			return createInvalidRequestResponse(update.error);
		}

		const config = await updateAlertConfig((draft) => {
			if (update.value.enabled !== undefined) {
				draft.enabled = update.value.enabled;
			}
			if (update.value.receiveAgent) {
				draft.receiveAgent = update.value.receiveAgent;
			}
			if (update.value.checkInterval !== undefined) {
				draft.checkInterval = update.value.checkInterval;
			}
			if (update.value.rules) {
				for (const newRule of update.value.rules) {
					const existingRule = draft.rules.find(
						(rule) => rule.id === newRule.id,
					);
					if (!existingRule) continue;
					if (newRule.enabled !== undefined) {
						existingRule.enabled = newRule.enabled;
					}
					if (newRule.threshold !== undefined) {
						existingRule.threshold = newRule.threshold;
					}
					if (newRule.targetAgents !== undefined) {
						existingRule.targetAgents = newRule.targetAgents;
					}
				}
			}
			return draft;
		});

		return NextResponse.json(config);
	} catch {
		return NextResponse.json(
			{ error: "Alert configuration update failed" },
			{ status: 500 },
		);
	}
}

export async function GET() {
	try {
		const config = await loadAlertConfig();
		return NextResponse.json(config);
	} catch {
		return NextResponse.json(
			{ error: "Alert configuration unavailable" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	return handleAlertWrite(request);
}

export async function PUT(request: Request) {
	return handleAlertWrite(request);
}
