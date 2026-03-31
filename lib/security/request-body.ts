import type {
	InvalidRequest,
	InvalidRequestPayload,
} from "@/lib/security/types";

const DEFAULT_INVALID_JSON_MESSAGE = "Invalid JSON body";
const DEFAULT_TOO_LARGE_MESSAGE = "Request body too large";
const REQUEST_BODY_FIELD = "body";
const textEncoder = new TextEncoder();

export interface ReadBoundedJsonBodyOptions {
	maxBytes: number;
	invalidMessage?: string;
	tooLargeMessage?: string;
}

export type ReadBoundedJsonBodyResult =
	| {
			ok: true;
			value: unknown;
	  }
	| {
			ok: false;
			error: InvalidRequest;
	  };

function createBodyInvalidRequest(
	reason: InvalidRequest["reason"],
	message: string,
): InvalidRequest {
	return {
		ok: false,
		type: "invalid_request",
		field: REQUEST_BODY_FIELD,
		reason,
		message,
	};
}

function parseContentLength(request: Request): number | null {
	const headerValue = request.headers.get("content-length");
	if (!headerValue) return null;

	const trimmed = headerValue.trim();
	if (!/^\d+$/.test(trimmed)) return null;

	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < 0) return null;

	return parsed;
}

export async function readBoundedJsonBody(
	request: Request,
	options: ReadBoundedJsonBodyOptions,
): Promise<ReadBoundedJsonBodyResult> {
	const contentLength = parseContentLength(request);
	if (contentLength !== null && contentLength > options.maxBytes) {
		return {
			ok: false,
			error: createBodyInvalidRequest(
				"payload_too_large",
				options.tooLargeMessage ?? DEFAULT_TOO_LARGE_MESSAGE,
			),
		};
	}

	let text = "";
	try {
		text = await request.text();
	} catch {
		return {
			ok: false,
			error: createBodyInvalidRequest(
				"invalid_json",
				options.invalidMessage ?? DEFAULT_INVALID_JSON_MESSAGE,
			),
		};
	}

	if (textEncoder.encode(text).byteLength > options.maxBytes) {
		return {
			ok: false,
			error: createBodyInvalidRequest(
				"payload_too_large",
				options.tooLargeMessage ?? DEFAULT_TOO_LARGE_MESSAGE,
			),
		};
	}

	try {
		return {
			ok: true,
			value: JSON.parse(text) as unknown,
		};
	} catch {
		return {
			ok: false,
			error: createBodyInvalidRequest(
				"invalid_json",
				options.invalidMessage ?? DEFAULT_INVALID_JSON_MESSAGE,
			),
		};
	}
}

export function getInvalidRequestStatus(invalid: InvalidRequest): number {
	return invalid.reason === "payload_too_large" ? 413 : 400;
}

export type RequestBodyInvalidPayload = InvalidRequestPayload;
