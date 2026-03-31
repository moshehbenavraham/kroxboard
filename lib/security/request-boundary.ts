import { NextResponse } from "next/server";
import { isValidOpenclawAgentId } from "@/lib/openclaw-paths";
import {
	type FloorColor,
	MAX_COLS,
	MAX_ROWS,
	type OfficeLayout,
	type PlacedFurniture,
	TileType,
} from "@/lib/pixel-office/types";
import type {
	InvalidRequest,
	InvalidRequestField,
	InvalidRequestPayload,
	InvalidRequestReason,
} from "@/lib/security/types";

const MAX_SESSION_KEY_LENGTH = 256;
const MAX_OPERATOR_CODE_LENGTH = 512;
const MAX_MODEL_REF_LENGTH = 256;
const MAX_PROVIDER_ID_LENGTH = 128;
const MAX_MODEL_ID_LENGTH = 160;
const MAX_ALERT_RULE_UPDATES = 8;
const MAX_TARGET_AGENTS = 32;
const MAX_FURNITURE_ITEMS = 512;
const MAX_TILE_COUNT = MAX_COLS * MAX_ROWS;
const VALID_TILE_VALUES = new Set<number>(Object.values(TileType));
const VALID_LAYOUT_ROTATIONS = new Set([0, 90, 180, 270]);
const VALID_ALERT_RULE_IDS = new Set([
	"model_unavailable",
	"bot_no_response",
	"message_failure_rate",
	"cron_continuous_failure",
]);

function hasControlCharacters(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

function hasControlOrWhitespace(value: string): boolean {
	return hasControlCharacters(value) || /\s/.test(value);
}

function hasControlOrPathSeparator(value: string): boolean {
	return (
		hasControlOrWhitespace(value) || value.includes("/") || value.includes("\\")
	);
}

export type RequestBoundaryField = Extract<
	InvalidRequestField,
	"agentId" | "sessionKey"
>;
export type RequestBoundaryReason = Extract<
	InvalidRequestReason,
	"missing" | "invalid_format" | "agent_mismatch"
>;

export interface InvalidRequestBoundary {
	ok: false;
	type: "invalid_request_boundary";
	field: RequestBoundaryField;
	reason: RequestBoundaryReason;
	message: string;
}

export interface InvalidRequestBoundaryPayload {
	ok: false;
	error: string;
	boundary: InvalidRequestBoundary;
}

export type ValidationResult<T, E extends { ok: false }> =
	| {
			ok: true;
			value: T;
	  }
	| {
			ok: false;
			error: E;
	  };

export type RequestBoundaryResult<T> = ValidationResult<
	T,
	InvalidRequestBoundary
>;
export type InvalidRequestResult<T> = ValidationResult<T, InvalidRequest>;

export interface OperatorCodeInput {
	code: string;
}

export interface ModelMutationInput {
	agentId: string;
	model: string;
}

export interface ProviderProbeInput {
	providerId: string;
	modelId: string;
}

export interface AlertRuleUpdateInput {
	id: string;
	enabled?: boolean;
	threshold?: number;
	targetAgents?: string[];
}

export interface AlertWriteInput {
	enabled?: boolean;
	receiveAgent?: string;
	checkInterval?: number;
	rules?: AlertRuleUpdateInput[];
}

export interface PixelOfficeLayoutInput {
	layout: OfficeLayout;
}

function invalidBoundary(
	field: RequestBoundaryField,
	reason: RequestBoundaryReason,
	message: string,
): RequestBoundaryResult<never> {
	return {
		ok: false,
		error: {
			ok: false,
			type: "invalid_request_boundary",
			field,
			reason,
			message,
		},
	};
}

function invalidRequest(
	field: InvalidRequestField,
	reason: InvalidRequestReason,
	message: string,
): InvalidRequestResult<never> {
	return {
		ok: false,
		error: {
			ok: false,
			type: "invalid_request",
			field,
			reason,
			message,
		},
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJsonObject(
	value: unknown,
	message = "Invalid JSON body",
): InvalidRequestResult<Record<string, unknown>> {
	if (!isPlainObject(value)) {
		return invalidRequest("body", "invalid_json", message);
	}
	return { ok: true, value };
}

function validateStringField(
	value: unknown,
	field: RequestBoundaryField,
): RequestBoundaryResult<string> {
	if (typeof value !== "string") {
		return invalidBoundary(field, "missing", `Missing ${field}`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return invalidBoundary(field, "missing", `Missing ${field}`);
	}

	return { ok: true, value: trimmed };
}

function validateRequiredString(
	value: unknown,
	field: InvalidRequestField,
	options: {
		maxLength: number;
		messagePrefix?: string;
		allowSlashes?: boolean;
	} = {
		maxLength: MAX_MODEL_ID_LENGTH,
	},
): InvalidRequestResult<string> {
	const prefix = options.messagePrefix ?? field;
	if (typeof value !== "string") {
		return invalidRequest(field, "missing", `Missing ${prefix}`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return invalidRequest(field, "missing", `Missing ${prefix}`);
	}

	if (trimmed.length > options.maxLength) {
		return invalidRequest(field, "invalid_format", `Invalid ${prefix}`);
	}

	const unsafePattern = options.allowSlashes
		? hasControlOrWhitespace(trimmed)
		: hasControlOrPathSeparator(trimmed);
	if (unsafePattern) {
		return invalidRequest(field, "invalid_format", `Invalid ${prefix}`);
	}

	return { ok: true, value: trimmed };
}

function validateInteger(
	value: unknown,
	field: InvalidRequestField,
	options: {
		min: number;
		max: number;
		label: string;
	} = {
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
		label: "value",
	},
): InvalidRequestResult<number> {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return invalidRequest(field, "invalid_value", `Invalid ${options.label}`);
	}

	if (value < options.min || value > options.max) {
		return invalidRequest(field, "invalid_value", `Invalid ${options.label}`);
	}

	return { ok: true, value };
}

function validateBoolean(
	value: unknown,
	field: InvalidRequestField,
	label: string,
): InvalidRequestResult<boolean> {
	if (typeof value !== "boolean") {
		return invalidRequest(field, "invalid_value", `Invalid ${label}`);
	}
	return { ok: true, value };
}

function isSafeSessionKeySegment(segment: string): boolean {
	return (
		Boolean(segment) &&
		segment !== "." &&
		segment !== ".." &&
		!hasControlOrPathSeparator(segment)
	);
}

function validateModelRef(value: unknown): InvalidRequestResult<string> {
	const parsed = validateRequiredString(value, "model", {
		maxLength: MAX_MODEL_REF_LENGTH,
		messagePrefix: "model",
		allowSlashes: true,
	});
	if (!parsed.ok) return parsed;

	const [providerId, ...modelParts] = parsed.value.split("/");
	const modelId = modelParts.join("/");
	if (
		!providerId ||
		!modelId ||
		hasControlOrWhitespace(providerId) ||
		hasControlOrWhitespace(modelId)
	) {
		return invalidRequest("model", "invalid_format", "Invalid model");
	}

	return parsed;
}

function validateFloorColor(value: unknown): value is FloorColor {
	if (!isPlainObject(value)) return false;
	const { h, s, b, c, colorize } = value;
	return (
		typeof h === "number" &&
		Number.isFinite(h) &&
		typeof s === "number" &&
		Number.isFinite(s) &&
		typeof b === "number" &&
		Number.isFinite(b) &&
		typeof c === "number" &&
		Number.isFinite(c) &&
		(colorize === undefined || typeof colorize === "boolean")
	);
}

function validatePlacedFurniture(value: unknown): value is PlacedFurniture {
	if (!isPlainObject(value)) return false;
	if (
		typeof value.uid !== "string" ||
		!value.uid.trim() ||
		hasControlOrWhitespace(value.uid)
	) {
		return false;
	}
	if (
		typeof value.type !== "string" ||
		!value.type.trim() ||
		hasControlOrWhitespace(value.type)
	) {
		return false;
	}
	if (!Number.isInteger(value.col) || !Number.isInteger(value.row)) {
		return false;
	}
	if (
		value.rotation !== undefined &&
		(typeof value.rotation !== "number" ||
			!Number.isInteger(value.rotation) ||
			!VALID_LAYOUT_ROTATIONS.has(value.rotation))
	) {
		return false;
	}
	return value.color === undefined || validateFloorColor(value.color);
}

export function createInvalidRequestBoundaryResponse(
	boundary: InvalidRequestBoundary,
	status = 400,
): NextResponse<InvalidRequestBoundaryPayload> {
	return NextResponse.json(
		{
			ok: false,
			error: boundary.message,
			boundary,
		},
		{ status },
	);
}

export function createInvalidRequestResponse(
	invalid: InvalidRequest,
	status = 400,
): NextResponse<InvalidRequestPayload> {
	return NextResponse.json(
		{
			ok: false,
			error: invalid.message,
			invalid,
		},
		{ status },
	);
}

export function validateAgentId(value: unknown): RequestBoundaryResult<string> {
	const parsed = validateStringField(value, "agentId");
	if (!parsed.ok) return parsed;

	if (!isValidOpenclawAgentId(parsed.value)) {
		return invalidBoundary("agentId", "invalid_format", "Invalid agentId");
	}

	return parsed;
}

export function validateSessionKey(
	value: unknown,
	agentId: string,
): RequestBoundaryResult<string> {
	const parsed = validateStringField(value, "sessionKey");
	if (!parsed.ok) return parsed;

	if (parsed.value.length > MAX_SESSION_KEY_LENGTH) {
		return invalidBoundary(
			"sessionKey",
			"invalid_format",
			"Invalid sessionKey",
		);
	}

	const segments = parsed.value.split(":");
	if (
		segments.length < 3 ||
		segments[0] !== "agent" ||
		!segments.every(isSafeSessionKeySegment)
	) {
		return invalidBoundary(
			"sessionKey",
			"invalid_format",
			"Invalid sessionKey",
		);
	}

	if (segments[1] !== agentId) {
		return invalidBoundary(
			"sessionKey",
			"agent_mismatch",
			"sessionKey does not match agentId",
		);
	}

	return parsed;
}

export function validateSessionDiagnosticInput(
	body: unknown,
): RequestBoundaryResult<{ agentId: string; sessionKey: string }> {
	const agentId = validateAgentId((body as { agentId?: unknown })?.agentId);
	if (!agentId.ok) return agentId;

	const sessionKey = validateSessionKey(
		(body as { sessionKey?: unknown })?.sessionKey,
		agentId.value,
	);
	if (!sessionKey.ok) return sessionKey;

	return {
		ok: true,
		value: {
			agentId: agentId.value,
			sessionKey: sessionKey.value,
		},
	};
}

export function validateOperatorCodeInput(
	body: unknown,
): InvalidRequestResult<OperatorCodeInput> {
	const parsedBody = validateJsonObject(body);
	if (!parsedBody.ok) return parsedBody;

	if (typeof parsedBody.value.code !== "string") {
		return invalidRequest("code", "missing", "Operator code is required");
	}
	const code = parsedBody.value.code.trim();
	if (!code) {
		return invalidRequest("code", "missing", "Operator code is required");
	}
	if (code.length > MAX_OPERATOR_CODE_LENGTH) {
		return invalidRequest("code", "invalid_format", "Invalid operator code");
	}
	if (hasControlCharacters(code)) {
		return invalidRequest("code", "invalid_format", "Invalid operator code");
	}

	return {
		ok: true,
		value: {
			code,
		},
	};
}

export function validateModelMutationInput(
	body: unknown,
): InvalidRequestResult<ModelMutationInput> {
	const parsedBody = validateJsonObject(body);
	if (!parsedBody.ok) return parsedBody;

	const agentId = validateAgentId(parsedBody.value.agentId);
	if (!agentId.ok) {
		return invalidRequest(
			agentId.error.field,
			agentId.error.reason,
			agentId.error.message,
		);
	}

	const model = validateModelRef(parsedBody.value.model);
	if (!model.ok) return model;

	return {
		ok: true,
		value: {
			agentId: agentId.value,
			model: model.value,
		},
	};
}

export function validateProviderProbeInput(
	body: unknown,
): InvalidRequestResult<ProviderProbeInput> {
	const parsedBody = validateJsonObject(body);
	if (!parsedBody.ok) return parsedBody;

	const providerId = validateRequiredString(
		parsedBody.value.provider,
		"provider",
		{
			maxLength: MAX_PROVIDER_ID_LENGTH,
			messagePrefix: "provider",
		},
	);
	if (!providerId.ok) return providerId;

	const modelId = validateRequiredString(parsedBody.value.modelId, "modelId", {
		maxLength: MAX_MODEL_ID_LENGTH,
		messagePrefix: "modelId",
		allowSlashes: true,
	});
	if (!modelId.ok) return modelId;

	return {
		ok: true,
		value: {
			providerId: providerId.value,
			modelId: modelId.value,
		},
	};
}

function validateAlertRuleUpdate(
	value: unknown,
): InvalidRequestResult<AlertRuleUpdateInput> {
	if (!isPlainObject(value)) {
		return invalidRequest("rules", "invalid_value", "Invalid rules");
	}

	const id = validateRequiredString(value.id, "rules", {
		maxLength: 64,
		messagePrefix: "rule id",
	});
	if (!id.ok) return id;
	if (!VALID_ALERT_RULE_IDS.has(id.value)) {
		return invalidRequest("rules", "invalid_value", "Invalid rules");
	}

	const update: AlertRuleUpdateInput = { id: id.value };
	if (value.enabled !== undefined) {
		const enabled = validateBoolean(value.enabled, "enabled", "enabled");
		if (!enabled.ok) return enabled;
		update.enabled = enabled.value;
	}

	if (value.threshold !== undefined) {
		const threshold = validateInteger(value.threshold, "threshold", {
			min: 0,
			max: 86_400,
			label: "threshold",
		});
		if (!threshold.ok) return threshold;
		update.threshold = threshold.value;
	}

	if (value.targetAgents !== undefined) {
		if (!Array.isArray(value.targetAgents)) {
			return invalidRequest(
				"targetAgents",
				"invalid_value",
				"Invalid targetAgents",
			);
		}
		if (value.targetAgents.length > MAX_TARGET_AGENTS) {
			return invalidRequest(
				"targetAgents",
				"invalid_value",
				"Invalid targetAgents",
			);
		}
		const targetAgents: string[] = [];
		for (const agentIdValue of value.targetAgents) {
			const agentId = validateAgentId(agentIdValue);
			if (!agentId.ok) {
				return invalidRequest(
					"targetAgents",
					agentId.error.reason,
					"Invalid targetAgents",
				);
			}
			targetAgents.push(agentId.value);
		}
		update.targetAgents = Array.from(new Set(targetAgents));
	}

	if (
		update.enabled === undefined &&
		update.threshold === undefined &&
		update.targetAgents === undefined
	) {
		return invalidRequest("rules", "invalid_value", "Invalid rules");
	}

	return { ok: true, value: update };
}

export function validateAlertWriteInput(
	body: unknown,
): InvalidRequestResult<AlertWriteInput> {
	const parsedBody = validateJsonObject(body);
	if (!parsedBody.ok) return parsedBody;

	const update: AlertWriteInput = {};
	let fieldCount = 0;

	if (parsedBody.value.enabled !== undefined) {
		const enabled = validateBoolean(
			parsedBody.value.enabled,
			"enabled",
			"enabled",
		);
		if (!enabled.ok) return enabled;
		update.enabled = enabled.value;
		fieldCount += 1;
	}

	if (parsedBody.value.receiveAgent !== undefined) {
		const receiveAgent = validateAgentId(parsedBody.value.receiveAgent);
		if (!receiveAgent.ok) {
			return invalidRequest(
				"receiveAgent",
				receiveAgent.error.reason,
				"Invalid receiveAgent",
			);
		}
		update.receiveAgent = receiveAgent.value;
		fieldCount += 1;
	}

	if (parsedBody.value.checkInterval !== undefined) {
		const checkInterval = validateInteger(
			parsedBody.value.checkInterval,
			"checkInterval",
			{
				min: 1,
				max: 1_440,
				label: "checkInterval",
			},
		);
		if (!checkInterval.ok) return checkInterval;
		update.checkInterval = checkInterval.value;
		fieldCount += 1;
	}

	if (parsedBody.value.rules !== undefined) {
		if (!Array.isArray(parsedBody.value.rules)) {
			return invalidRequest("rules", "invalid_value", "Invalid rules");
		}
		if (
			parsedBody.value.rules.length === 0 ||
			parsedBody.value.rules.length > MAX_ALERT_RULE_UPDATES
		) {
			return invalidRequest("rules", "invalid_value", "Invalid rules");
		}
		const rules: AlertRuleUpdateInput[] = [];
		const seenRuleIds = new Set<string>();
		for (const rule of parsedBody.value.rules) {
			const parsedRule = validateAlertRuleUpdate(rule);
			if (!parsedRule.ok) return parsedRule;
			if (seenRuleIds.has(parsedRule.value.id)) {
				return invalidRequest("rules", "invalid_value", "Invalid rules");
			}
			seenRuleIds.add(parsedRule.value.id);
			rules.push(parsedRule.value);
		}
		update.rules = rules;
		fieldCount += 1;
	}

	if (fieldCount === 0) {
		return invalidRequest("body", "invalid_value", "Empty alert update");
	}

	return { ok: true, value: update };
}

export function validatePixelOfficeLayoutInput(
	body: unknown,
): InvalidRequestResult<PixelOfficeLayoutInput> {
	const parsedBody = validateJsonObject(body);
	if (!parsedBody.ok) return parsedBody;
	if (!isPlainObject(parsedBody.value.layout)) {
		return invalidRequest("layout", "missing", "Missing layout");
	}

	const layout = parsedBody.value.layout;
	if (layout.version !== 1) {
		return invalidRequest("version", "invalid_value", "Invalid layout");
	}

	const cols = validateInteger(layout.cols, "cols", {
		min: 1,
		max: MAX_COLS,
		label: "layout",
	});
	if (!cols.ok) return cols;

	const rows = validateInteger(layout.rows, "rows", {
		min: 1,
		max: MAX_ROWS,
		label: "layout",
	});
	if (!rows.ok) return rows;

	if (!Array.isArray(layout.tiles) || layout.tiles.length === 0) {
		return invalidRequest("tiles", "invalid_value", "Invalid layout");
	}
	if (
		layout.tiles.length > MAX_TILE_COUNT ||
		layout.tiles.length !== cols.value * rows.value
	) {
		return invalidRequest("tiles", "invalid_value", "Invalid layout");
	}
	if (
		!layout.tiles.every(
			(tile): tile is number =>
				Number.isInteger(tile) && VALID_TILE_VALUES.has(tile),
		)
	) {
		return invalidRequest("tiles", "invalid_value", "Invalid layout");
	}

	if (!Array.isArray(layout.furniture)) {
		return invalidRequest("furniture", "invalid_value", "Invalid layout");
	}
	if (layout.furniture.length > MAX_FURNITURE_ITEMS) {
		return invalidRequest("furniture", "invalid_value", "Invalid layout");
	}
	const seenFurnitureIds = new Set<string>();
	for (const furniture of layout.furniture) {
		if (!validatePlacedFurniture(furniture)) {
			return invalidRequest("furniture", "invalid_value", "Invalid layout");
		}
		if (
			furniture.col < 0 ||
			furniture.col >= cols.value ||
			furniture.row < 0 ||
			furniture.row >= rows.value ||
			seenFurnitureIds.has(furniture.uid)
		) {
			return invalidRequest("furniture", "invalid_value", "Invalid layout");
		}
		seenFurnitureIds.add(furniture.uid);
	}

	if (layout.tileColors !== undefined) {
		if (
			!Array.isArray(layout.tileColors) ||
			layout.tileColors.length !== layout.tiles.length ||
			!layout.tileColors.every(
				(color) => color === null || validateFloorColor(color),
			)
		) {
			return invalidRequest("layout", "invalid_value", "Invalid layout");
		}
	}

	return {
		ok: true,
		value: {
			layout: layout as unknown as OfficeLayout,
		},
	};
}
