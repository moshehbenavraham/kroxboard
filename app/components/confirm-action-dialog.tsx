"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmActionDialogProps {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel?: string;
	pending?: boolean;
	variant?: "default" | "danger";
	onConfirm: () => void;
	onCancel: () => void;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
	if (!container) return [];
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		),
	).filter((element) => !element.hasAttribute("disabled"));
}

export function ConfirmActionDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel = "Cancel",
	pending = false,
	variant = "default",
	onConfirm,
	onCancel,
}: ConfirmActionDialogProps) {
	const titleId = useId();
	const descriptionId = useId();
	const dialogRef = useRef<HTMLDivElement>(null);
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		previousFocusRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		queueMicrotask(() => {
			cancelButtonRef.current?.focus();
		});

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				if (!pending) {
					onCancel();
				}
				return;
			}
			if (event.key !== "Tab") return;

			const focusable = getFocusableElements(dialogRef.current);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;

			if (event.shiftKey && active === first) {
				event.preventDefault();
				last.focus();
				return;
			}
			if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			const previousFocus = previousFocusRef.current;
			queueMicrotask(() => {
				previousFocus?.focus();
			});
		};
	}, [open, pending, onCancel]);

	if (!open) return null;

	const confirmButtonClass =
		variant === "danger"
			? "border-red-400/70 bg-red-500/20 text-red-100 hover:bg-red-500/30"
			: "border-cyan-400/60 bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30";

	return (
		<div
			className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget && !pending) {
					onCancel();
				}
			}}
		>
			<div
				ref={dialogRef}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="w-full max-w-md rounded-2xl border border-white/12 bg-slate-950/95 p-5 shadow-2xl"
			>
				<h2 id={titleId} className="text-lg font-semibold text-white">
					{title}
				</h2>
				<p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-300">
					{description}
				</p>
				<div className="mt-5 flex items-center justify-end gap-3">
					<button
						ref={cancelButtonRef}
						type="button"
						onClick={onCancel}
						disabled={pending}
						className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={pending}
						className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClass}`}
					>
						{pending ? "Working..." : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
