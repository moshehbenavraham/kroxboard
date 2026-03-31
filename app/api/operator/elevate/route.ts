import { NextResponse } from "next/server";
import {
	type DashboardAuthEnv,
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";
import {
	clearOperatorSessionCookie,
	createOperatorSession,
	isOperatorCodeValid,
	setOperatorSessionCookie,
} from "@/lib/security/operator-session";
import {
	createInvalidRequestResponse,
	validateOperatorCodeInput,
} from "@/lib/security/request-boundary";
import { requireSensitiveMutationAccess } from "@/lib/security/sensitive-mutation";
import {
	createOperatorAuthDeniedResponse,
	createOperatorConfigErrorResponse,
} from "@/lib/security/sensitive-route";

export async function POST(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		auth: "identity",
		allowedMethods: ["POST"],
	});
	if (!access.ok) return access.response;

	let env: DashboardAuthEnv;
	try {
		env = parseDashboardAuthEnv();
	} catch (error) {
		const message =
			error instanceof DashboardEnvError
				? "Operator auth is not configured"
				: "Operator auth is unavailable";
		return createOperatorConfigErrorResponse(message);
	}

	if (!env.operatorCodeRequired) {
		return createOperatorAuthDeniedResponse(
			request,
			"challenge_required",
			403,
			env.operatorCodeRequired,
			{ message: "Operator elevation is disabled" },
		);
	}

	const body = await request.json().catch(() => null);
	const input = validateOperatorCodeInput(body);
	if (!input.ok) return createInvalidRequestResponse(input.error);

	if (!isOperatorCodeValid(input.value.code, env)) {
		return NextResponse.json(
			{ ok: false, error: "Invalid operator code" },
			{ status: 401 },
		);
	}

	if (!access.identity) {
		return createOperatorConfigErrorResponse(
			"Operator identity is unavailable",
		);
	}

	const { token, expiresAt, session } = createOperatorSession(
		access.identity,
		env,
	);
	const response = NextResponse.json({ ok: true, session });
	setOperatorSessionCookie(response, request, token, expiresAt);
	return response;
}

export async function DELETE(request: Request) {
	const access = requireSensitiveMutationAccess(request, {
		auth: "none",
		allowedMethods: ["DELETE"],
	});
	if (!access.ok) return access.response;

	const response = NextResponse.json({ ok: true, cleared: true });
	clearOperatorSessionCookie(response, request);
	return response;
}
