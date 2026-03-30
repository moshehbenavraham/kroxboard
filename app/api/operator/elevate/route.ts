import { NextResponse } from "next/server";
import {
	type DashboardAuthEnv,
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";
import { resolveOperatorIdentity } from "@/lib/security/operator-identity";
import {
	clearOperatorSessionCookie,
	createOperatorSession,
	isOperatorCodeValid,
	setOperatorSessionCookie,
} from "@/lib/security/operator-session";
import {
	createOperatorAuthDeniedResponse,
	createOperatorConfigErrorResponse,
} from "@/lib/security/sensitive-route";

export async function POST(request: Request) {
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

	const identityResolution = resolveOperatorIdentity(request, env);
	if (!identityResolution.ok) {
		return createOperatorAuthDeniedResponse(
			request,
			identityResolution.state,
			403,
			env.operatorCodeRequired,
			{ message: identityResolution.message },
		);
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
	const code = typeof body?.code === "string" ? body.code : "";
	if (!code.trim()) {
		return NextResponse.json(
			{ ok: false, error: "Operator code is required" },
			{ status: 400 },
		);
	}

	if (!isOperatorCodeValid(code, env)) {
		return NextResponse.json(
			{ ok: false, error: "Invalid operator code" },
			{ status: 401 },
		);
	}

	const { token, expiresAt, session } = createOperatorSession(
		identityResolution.identity,
		env,
	);
	const response = NextResponse.json({ ok: true, session });
	setOperatorSessionCookie(response, request, token, expiresAt);
	return response;
}

export async function DELETE(request: Request) {
	const response = NextResponse.json({ ok: true, cleared: true });
	clearOperatorSessionCookie(response, request);
	return response;
}
