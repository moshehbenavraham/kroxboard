import type {
	OperatorAuthDeniedPayload,
	OperatorSessionStatePayload,
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

export interface ProtectedRequestFailure {
	ok: false;
	error: string;
	status: number;
}

export type ProtectedRequestResult<T> =
	| ProtectedRequestSuccess<T>
	| ProtectedRequestAuthFailure
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
	return result.error;
}
