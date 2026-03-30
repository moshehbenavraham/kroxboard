export type OperatorIdentityMode = "localhost" | "cloudflare_access";

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

export interface OperatorSessionStatusPayload {
	ok: true;
	session: OperatorSessionSummary;
}

export type OperatorSessionStatePayload =
	| OperatorSessionStatusPayload
	| OperatorAuthDeniedPayload;
