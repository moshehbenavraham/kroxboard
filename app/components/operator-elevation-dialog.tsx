"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OperatorAuthDeniedState } from "@/lib/security/types";

interface OperatorElevationDialogProps {
	open: boolean;
	state: OperatorAuthDeniedState;
	pending: boolean;
	error: string | null;
	onCancel: () => void;
	onSubmit: (code: string) => Promise<void>;
}

function getDialogTitle(state: OperatorAuthDeniedState): string {
	if (state === "session_expired") return "Operator session expired";
	if (state === "identity_denied") return "Operator access denied";
	return "Operator elevation required";
}

function getDialogMessage(state: OperatorAuthDeniedState): string {
	if (state === "session_expired") {
		return "Enter the operator code to renew access for sensitive dashboard actions.";
	}
	if (state === "identity_denied") {
		return "This dashboard identity is not allowed to use elevated operator actions.";
	}
	return "Enter the operator code to unlock writes, provider probes, and diagnostics.";
}

export function OperatorElevationDialog({
	open,
	state,
	pending,
	error,
	onCancel,
	onSubmit,
}: OperatorElevationDialogProps) {
	const titleId = useId();
	const descriptionId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [code, setCode] = useState("");

	useEffect(() => {
		if (!open) {
			setCode("");
			return;
		}

		setCode("");
		const timer = window.setTimeout(() => {
			inputRef.current?.focus();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pending) {
				onCancel();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, pending, onCancel]);

	if (!open) return null;

	const disabled = pending || state === "identity_denied";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
			>
				<h2 id={titleId} className="text-lg font-semibold text-[var(--text)]">
					{getDialogTitle(state)}
				</h2>
				<p id={descriptionId} className="mt-2 text-sm text-[var(--text-muted)]">
					{getDialogMessage(state)}
				</p>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (disabled) return;
						await onSubmit(code);
					}}
				>
					<label className="block text-sm font-medium text-[var(--text)]">
						<span className="mb-2 block">Operator code</span>
						<input
							ref={inputRef}
							type="password"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							autoComplete="one-time-code"
							disabled={disabled}
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
						/>
					</label>
					{error && (
						<p role="alert" className="text-sm text-red-400">
							{error}
						</p>
					)}
					<div className="flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={onCancel}
							disabled={pending}
							className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={disabled || !code.trim()}
							className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{pending ? "Verifying..." : "Unlock access"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
