import { describe, expect, it } from "vitest";
import {
	createInvalidRequestBoundaryResponse,
	createInvalidRequestResponse,
	validateAgentId,
	validateAlertWriteInput,
	validateModelMutationInput,
	validateOperatorCodeInput,
	validatePixelOfficeLayoutInput,
	validateProviderProbeInput,
	validateSessionDiagnosticInput,
	validateSessionKey,
} from "@/lib/security/request-boundary";

describe("request-boundary", () => {
	it("accepts a valid agentId", () => {
		expect(validateAgentId("main")).toEqual({ ok: true, value: "main" });
	});

	it("rejects traversal-shaped agent identifiers", () => {
		expect(validateAgentId("../main")).toMatchObject({
			ok: false,
			error: {
				field: "agentId",
				reason: "invalid_format",
			},
		});
	});

	it("accepts a sessionKey that matches the validated agent", () => {
		expect(
			validateSessionKey("agent:main:discord:direct:12345", "main"),
		).toEqual({
			ok: true,
			value: "agent:main:discord:direct:12345",
		});
	});

	it("rejects a sessionKey that targets a different agent", () => {
		expect(
			validateSessionKey("agent:helper:discord:direct:12345", "main"),
		).toMatchObject({
			ok: false,
			error: {
				field: "sessionKey",
				reason: "agent_mismatch",
			},
		});
	});

	it("rejects a sessionKey with path separators", () => {
		expect(
			validateSessionKey("agent:main:discord:direct:../../etc", "main"),
		).toMatchObject({
			ok: false,
			error: {
				field: "sessionKey",
				reason: "invalid_format",
			},
		});
	});

	it("validates diagnostic request bodies and returns a typed response payload", async () => {
		const parsed = validateSessionDiagnosticInput({
			agentId: "main",
			sessionKey: "agent:main:main",
		});
		expect(parsed).toEqual({
			ok: true,
			value: {
				agentId: "main",
				sessionKey: "agent:main:main",
			},
		});

		const invalid = validateSessionDiagnosticInput({
			agentId: "main",
			sessionKey: "agent:helper:main",
		});
		expect(invalid.ok).toBe(false);
		if (invalid.ok) {
			throw new Error("Expected invalid request boundary result");
		}

		const response = createInvalidRequestBoundaryResponse(invalid.error);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			ok: false,
			error: "sessionKey does not match agentId",
			boundary: {
				field: "sessionKey",
				reason: "agent_mismatch",
			},
		});
	});
});

describe("extended request payload validators", () => {
	it("accepts operator code input with internal spaces", () => {
		expect(
			validateOperatorCodeInput({
				code: "correct horse battery staple",
			}),
		).toEqual({
			ok: true,
			value: {
				code: "correct horse battery staple",
			},
		});
	});

	it("validates model mutation input", () => {
		expect(
			validateModelMutationInput({
				agentId: "main",
				model: "provider/model-one",
			}),
		).toEqual({
			ok: true,
			value: {
				agentId: "main",
				model: "provider/model-one",
			},
		});
	});

	it("rejects invalid provider probe payloads with typed invalid-request responses", async () => {
		const invalid = validateProviderProbeInput({
			provider: "openai",
			modelId: "   ",
		});
		expect(invalid.ok).toBe(false);
		if (invalid.ok) {
			throw new Error("Expected invalid provider probe payload");
		}

		const response = createInvalidRequestResponse(invalid.error);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			ok: false,
			error: "Missing modelId",
			invalid: {
				field: "modelId",
				reason: "missing",
			},
		});
	});

	it("validates alert-write payloads", () => {
		expect(
			validateAlertWriteInput({
				enabled: true,
				receiveAgent: "main",
				checkInterval: 10,
				rules: [
					{
						id: "bot_no_response",
						enabled: true,
						threshold: 300,
						targetAgents: ["main", "helper"],
					},
				],
			}),
		).toEqual({
			ok: true,
			value: {
				enabled: true,
				receiveAgent: "main",
				checkInterval: 10,
				rules: [
					{
						id: "bot_no_response",
						enabled: true,
						threshold: 300,
						targetAgents: ["main", "helper"],
					},
				],
			},
		});
	});

	it("rejects unknown alert rules", () => {
		expect(
			validateAlertWriteInput({
				rules: [{ id: "unknown_rule", enabled: true }],
			}),
		).toMatchObject({
			ok: false,
			error: {
				field: "rules",
				reason: "invalid_value",
			},
		});
	});

	it("rejects duplicate alert rule updates", () => {
		expect(
			validateAlertWriteInput({
				rules: [
					{ id: "model_unavailable", enabled: true },
					{ id: "model_unavailable", enabled: false },
				],
			}),
		).toMatchObject({
			ok: false,
			error: {
				field: "rules",
				reason: "invalid_value",
			},
		});
	});

	it("validates pixel-office layout payloads", () => {
		expect(
			validatePixelOfficeLayoutInput({
				layout: {
					version: 1,
					cols: 2,
					rows: 2,
					tiles: [1, 1, 1, 1],
					furniture: [
						{
							uid: "desk-1",
							type: "desk",
							col: 0,
							row: 0,
						},
					],
				},
			}),
		).toEqual({
			ok: true,
			value: {
				layout: {
					version: 1,
					cols: 2,
					rows: 2,
					tiles: [1, 1, 1, 1],
					furniture: [
						{
							uid: "desk-1",
							type: "desk",
							col: 0,
							row: 0,
						},
					],
				},
			},
		});
	});

	it("rejects invalid pixel-office layouts", () => {
		expect(
			validatePixelOfficeLayoutInput({
				layout: {
					version: 1,
					cols: 2,
					rows: 2,
					tiles: [1],
					furniture: [],
				},
			}),
		).toMatchObject({
			ok: false,
			error: {
				field: "tiles",
				reason: "invalid_value",
			},
		});
	});

	it("rejects furniture entries outside layout bounds", () => {
		expect(
			validatePixelOfficeLayoutInput({
				layout: {
					version: 1,
					cols: 2,
					rows: 2,
					tiles: [1, 1, 1, 1],
					furniture: [
						{
							uid: "desk-1",
							type: "desk",
							col: 2,
							row: 0,
						},
					],
				},
			}),
		).toMatchObject({
			ok: false,
			error: {
				field: "furniture",
				reason: "invalid_value",
			},
		});
	});

	it("rejects duplicate furniture identifiers", () => {
		expect(
			validatePixelOfficeLayoutInput({
				layout: {
					version: 1,
					cols: 2,
					rows: 2,
					tiles: [1, 1, 1, 1],
					furniture: [
						{
							uid: "desk-1",
							type: "desk",
							col: 0,
							row: 0,
						},
						{
							uid: "desk-1",
							type: "chair",
							col: 1,
							row: 1,
						},
					],
				},
			}),
		).toMatchObject({
			ok: false,
			error: {
				field: "furniture",
				reason: "invalid_value",
			},
		});
	});
});
