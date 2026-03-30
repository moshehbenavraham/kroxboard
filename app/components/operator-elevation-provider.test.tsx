import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	OperatorElevationProvider,
	useOperatorElevation,
} from "@/app/components/operator-elevation-provider";
import { getProtectedRequestError } from "@/lib/operator-elevation-client";

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function authDeniedPayload(
	state: "challenge_required" | "session_expired" | "identity_denied",
	canChallenge = true,
) {
	return {
		ok: false,
		error:
			state === "session_expired"
				? "Operator session expired"
				: state === "identity_denied"
					? "Operator access denied"
					: "Operator elevation required",
		auth: {
			ok: false,
			type: "operator_auth" as const,
			state,
			message:
				state === "session_expired"
					? "Operator session expired"
					: state === "identity_denied"
						? "Operator access denied"
						: "Operator elevation required",
			canChallenge,
		},
	};
}

function TestClient() {
	const { runProtectedRequest } = useOperatorElevation();
	const [resultText, setResultText] = useState("idle");

	return (
		<div>
			<button
				type="button"
				onClick={async () => {
					const result = await runProtectedRequest<{ saved: boolean }>({
						actionId: "save-layout",
						request: () => fetch("/api/protected", { method: "POST" }),
					});
					setResultText(
						result.ok
							? String(result.data.saved)
							: getProtectedRequestError(result),
					);
				}}
			>
				Run protected action
			</button>
			<div data-testid="result">{resultText}</div>
		</div>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("OperatorElevationProvider", () => {
	it("retries a protected action once after successful elevation", async () => {
		let protectedAttempts = 0;
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "/api/operator/session") {
					return jsonResponse(authDeniedPayload("challenge_required"));
				}
				if (url === "/api/protected") {
					protectedAttempts += 1;
					if (protectedAttempts === 1) {
						return jsonResponse(authDeniedPayload("challenge_required"), 401);
					}
					return jsonResponse({ saved: true });
				}
				if (url === "/api/operator/elevate" && init?.method === "POST") {
					return jsonResponse({
						ok: true,
						session: {
							state: "elevated",
							mode: "localhost",
							email: null,
							issuedAt: "2026-03-31T00:00:00.000Z",
							expiresAt: "2026-03-31T12:00:00.000Z",
						},
					});
				}
				if (url === "/api/operator/elevate" && init?.method === "DELETE") {
					return jsonResponse({ ok: true, cleared: true });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		render(
			<OperatorElevationProvider>
				<TestClient />
			</OperatorElevationProvider>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Run protected action" }),
		);

		const input = await screen.findByLabelText("Operator code");
		fireEvent.change(input, {
			target: { value: "correct horse battery staple" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Unlock access" }));

		await waitFor(() => {
			expect(screen.getByTestId("result").textContent).toBe("true");
		});
		expect(protectedAttempts).toBe(2);
	});

	it("resets the dialog input when the challenge is reopened", async () => {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "/api/operator/session") {
					return jsonResponse(authDeniedPayload("challenge_required"));
				}
				if (url === "/api/protected") {
					return jsonResponse(authDeniedPayload("challenge_required"), 401);
				}
				if (url === "/api/operator/elevate" && init?.method === "DELETE") {
					return jsonResponse({ ok: true, cleared: true });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		render(
			<OperatorElevationProvider>
				<TestClient />
			</OperatorElevationProvider>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Run protected action" }),
		);

		const firstInput = await screen.findByLabelText("Operator code");
		fireEvent.change(firstInput, { target: { value: "stale-code" } });
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Run protected action" }),
		);
		const secondInput = await screen.findByLabelText("Operator code");

		expect((secondInput as HTMLInputElement).value).toBe("");
	});
});
