"use client";

import { useEffect, useRef } from "react";
import type { ProtectedRequestBannerTone } from "@/lib/operator-elevation-client";

const BANNER_STYLE: Record<ProtectedRequestBannerTone, string> = {
	denied: "border-rose-500/40 bg-rose-500/10 text-rose-100",
	disabled: "border-amber-500/40 bg-amber-500/10 text-amber-100",
	invalid: "border-orange-500/40 bg-orange-500/10 text-orange-100",
	limited: "border-sky-400/40 bg-sky-500/10 text-sky-100",
	pending: "border-sky-500/40 bg-sky-500/10 text-sky-100",
	info: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
	error: "border-red-500/40 bg-red-500/10 text-red-100",
};

const BANNER_TITLE: Record<ProtectedRequestBannerTone, string> = {
	denied: "Access denied",
	disabled: "Action disabled",
	invalid: "Invalid request",
	limited: "Rate limited",
	pending: "Retry pending",
	info: "Dry-run mode",
	error: "Action failed",
};

export interface OperatorActionBannerProps {
	tone: ProtectedRequestBannerTone;
	message: string;
	title?: string;
	className?: string;
}

export function OperatorActionBanner({
	tone,
	message,
	title,
	className = "",
}: OperatorActionBannerProps) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		ref.current?.focus();
	}, []);

	const role =
		tone === "pending" || tone === "info" || tone === "limited"
			? "status"
			: "alert";

	return (
		<div
			ref={ref}
			role={role}
			tabIndex={-1}
			aria-live={role === "alert" ? "assertive" : "polite"}
			className={`rounded-lg border px-4 py-3 text-sm shadow-sm outline-none ${BANNER_STYLE[tone]} ${className}`.trim()}
		>
			<p className="font-semibold">{title ?? BANNER_TITLE[tone]}</p>
			<p className="mt-1">{message}</p>
		</div>
	);
}
