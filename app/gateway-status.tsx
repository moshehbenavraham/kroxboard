"use client";

import { useEffect, useState } from "react";
import { createClientPoller } from "@/lib/client-polling";
import { useI18n } from "@/lib/i18n";

interface HealthResult {
	ok: boolean;
	error?: string;
	data?: any;
	launchPath?: string;
	openclawVersion?: string;
}

interface GatewayStatusProps {
	compact?: boolean;
	className?: string;
	hideIconOnMobile?: boolean;
}

export function GatewayStatus({
	compact = false,
	className = "",
	hideIconOnMobile = false,
}: GatewayStatusProps) {
	const { t } = useI18n();
	const [health, setHealth] = useState<HealthResult | null>(null);
	const [showError, setShowError] = useState(false);
	const [showVersionTip, setShowVersionTip] = useState(false);

	useEffect(() => {
		const poller = createClientPoller<HealthResult>({
			intervalMs: 10_000,
			immediate: true,
			sharedKey: "gateway-health",
			reuseResultMs: 5_000,
			request: async (signal) => {
				const response = await fetch("/api/gateway-health", { signal });
				return response.json();
			},
			onSuccess: (result) => {
				setHealth(result);
			},
			onError: () => {
				setHealth({ ok: false, error: t("gateway.fetchError") });
			},
		});

		poller.start();
		return () => {
			poller.stop();
		};
	}, [t]);

	const gatewayTitle = health?.openclawVersion
		? `OpenClaw ${health.openclawVersion}`
		: "OpenClaw";

	return (
		<div
			className={`relative inline-flex items-center gap-1.5 ${className}`.trim()}
		>
			{health?.ok && health.launchPath ? (
				<a
					href={health.launchPath}
					target="_blank"
					rel="noopener noreferrer"
					title={gatewayTitle}
					onMouseEnter={() => setShowVersionTip(true)}
					onMouseLeave={() => setShowVersionTip(false)}
					onFocus={() => setShowVersionTip(true)}
					onBlur={() => setShowVersionTip(false)}
					className={`inline-flex items-center rounded-full font-medium border hover:bg-cyan-500/30 transition-colors cursor-pointer ${
						compact ? "px-2 py-1 text-[10px]" : "px-2 py-0.5 text-xs"
					} ${
						health.ok
							? "bg-cyan-500/25 text-cyan-200 border-cyan-400/45 animate-pulse"
							: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
					}`}
				>
					{compact ? (
						"GW"
					) : hideIconOnMobile ? (
						<>
							<span className="md:hidden">Gateway</span>
							<span className="hidden md:inline">Gateway</span>
						</>
					) : (
						"Gateway"
					)}
					<span className="opacity-50 text-[10px]">-&gt;</span>
				</a>
			) : (
				<span
					title={gatewayTitle}
					onMouseEnter={() => setShowVersionTip(true)}
					onMouseLeave={() => setShowVersionTip(false)}
					className={`inline-flex items-center rounded-full font-medium border ${
						compact ? "px-2 py-1 text-[10px]" : "px-2 py-0.5 text-xs"
					} bg-cyan-500/10 text-cyan-300/70 border-cyan-500/20`}
				>
					{compact ? (
						"GW"
					) : hideIconOnMobile ? (
						<>
							<span className="md:hidden">Gateway</span>
							<span className="hidden md:inline">Gateway</span>
						</>
					) : (
						"Gateway"
					)}
					<span className="opacity-60 text-[10px]">n/a</span>
				</span>
			)}
			{showVersionTip && (
				<div className="absolute top-full left-0 mt-1 z-50 px-2 py-1 rounded-md bg-black/80 border border-white/10 text-white text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
					{gatewayTitle}
				</div>
			)}
			{!health ? (
				<span
					className={
						compact
							? "text-[10px] text-[var(--text-muted)]"
							: "text-xs text-[var(--text-muted)]"
					}
				>
					--
				</span>
			) : health.ok ? (
				<span
					className={
						compact
							? "text-green-400 text-xs cursor-help"
							: "text-green-400 text-sm cursor-help"
					}
					title={
						health.launchPath
							? t("gateway.healthy")
							: "Gateway launch unavailable"
					}
				>
					OK
				</span>
			) : (
				<span
					className={
						compact
							? "text-red-400 text-xs cursor-pointer"
							: "text-red-400 text-sm cursor-pointer"
					}
					title={health.error || t("gateway.unhealthy")}
					onClick={() => setShowError((v) => !v)}
				>
					ERR
				</span>
			)}
			{showError && health && !health.ok && health.error && (
				<div className="absolute top-full left-0 mt-1 z-50 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs max-w-64 whitespace-pre-wrap shadow-lg">
					{health.error}
				</div>
			)}
		</div>
	);
}
