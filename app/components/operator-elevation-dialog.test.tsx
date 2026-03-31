import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperatorElevationDialog } from "@/app/components/operator-elevation-dialog";

afterEach(() => {
	cleanup();
});

describe("OperatorElevationDialog", () => {
	it("renders the session-expired copy, submits the code, and allows escape cancel", async () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn(async () => undefined);

		render(
			<OperatorElevationDialog
				open
				state="session_expired"
				pending={false}
				error="Renew access"
				onCancel={onCancel}
				onSubmit={onSubmit}
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Operator session expired" }),
		).toBeTruthy();
		expect(
			screen.getByText(
				"Enter the operator code to renew access for sensitive dashboard actions.",
			),
		).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain("Renew access");

		const input = screen.getByLabelText("Operator code") as HTMLInputElement;
		await waitFor(() => {
			expect(document.activeElement).toBe(input);
		});

		fireEvent.change(input, { target: { value: "renewed-access" } });
		fireEvent.submit(input.closest("form") as HTMLFormElement);

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith("renewed-access");
		});

		fireEvent.keyDown(window, { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("disables the dialog for identity-denied challenges and ignores submit", () => {
		const onCancel = vi.fn();
		const onSubmit = vi.fn(async () => undefined);

		render(
			<OperatorElevationDialog
				open
				state="identity_denied"
				pending={false}
				error={null}
				onCancel={onCancel}
				onSubmit={onSubmit}
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Operator access denied" }),
		).toBeTruthy();
		expect(
			screen.getByText(
				"This dashboard identity is not allowed to use elevated operator actions.",
			),
		).toBeTruthy();

		const input = screen.getByLabelText("Operator code") as HTMLInputElement;
		expect(input.disabled).toBe(true);

		fireEvent.submit(input.closest("form") as HTMLFormElement);
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("shows the pending state and ignores escape while verification is in progress", () => {
		const onCancel = vi.fn();

		render(
			<OperatorElevationDialog
				open
				state="challenge_required"
				pending
				error={null}
				onCancel={onCancel}
				onSubmit={vi.fn(async () => undefined)}
			/>,
		);

		expect(screen.getByRole("button", { name: "Verifying..." })).toBeTruthy();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(onCancel).not.toHaveBeenCalled();
	});
});
