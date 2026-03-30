import { NextResponse } from "next/server";
import {
	type DashboardAuthEnv,
	DashboardEnvError,
	parseDashboardAuthEnv,
} from "@/lib/security/dashboard-env";
import { resolveOperatorIdentity } from "@/lib/security/operator-identity";
import {
	clearOperatorSessionCookie,
	readOperatorSessionToken,
	verifyOperatorSessionToken,
} from "@/lib/security/operator-session";
import {
	createOperatorAuthDeniedPayload,
	createOperatorConfigErrorResponse,
} from "@/lib/security/sensitive-route";

export async function GET(request: Request) {
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
		return NextResponse.json(
			createOperatorAuthDeniedPayload(
				identityResolution.state,
				env.operatorCodeRequired,
				identityResolution.message,
			),
		);
	}

	const sessionResult = verifyOperatorSessionToken(
		readOperatorSessionToken(request),
		identityResolution.identity,
		env,
	);
	if (!sessionResult.ok) {
		const response = NextResponse.json(
			createOperatorAuthDeniedPayload(
				sessionResult.state,
				env.operatorCodeRequired,
			),
		);
		if (sessionResult.shouldClear) {
			clearOperatorSessionCookie(response, request);
		}
		return response;
	}

	return NextResponse.json({ ok: true, session: sessionResult.session });
}
