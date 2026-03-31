"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useOperatorElevation } from "@/app/components/operator-elevation-provider";
import { createClientPoller } from "@/lib/client-polling";
import { parseProtectedResponse } from "@/lib/operator-elevation-client";

// Background alert checker that schedules future checks without running one on mount.
export function AlertMonitor() {
	const pathname = usePathname();
	const { sessionState } = useOperatorElevation();
	const [config, setConfig] = useState<{
		enabled: boolean;
		checkInterval: number;
	} | null>(null);
	const hasElevatedSession = sessionState?.ok === true;
	const alertsPageVisible = pathname === "/alerts";

	useEffect(() => {
		if (!hasElevatedSession || alertsPageVisible) {
			setConfig(null);
			return;
		}

		const controller = new AbortController();
		fetch("/api/alerts", { signal: controller.signal })
			.then((r) => r.json())
			.then((nextConfig) => {
				if (!nextConfig?.enabled) {
					setConfig({ enabled: false, checkInterval: 10 });
					return;
				}
				setConfig({
					enabled: true,
					checkInterval:
						typeof nextConfig.checkInterval === "number"
							? nextConfig.checkInterval
							: 10,
				});
			})
			.catch((error: unknown) => {
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}
				setConfig(null);
			});

		return () => {
			controller.abort();
		};
	}, [alertsPageVisible, hasElevatedSession]);

	useEffect(() => {
		if (!hasElevatedSession || alertsPageVisible || !config?.enabled) {
			return;
		}

		const poller = createClientPoller<{ results?: string[] }>({
			intervalMs: config.checkInterval * 60 * 1000,
			sharedKey: "alerts:scheduled-check",
			reuseResultMs: 60_000,
			shouldPoll: () => hasElevatedSession && pathname !== "/alerts",
			request: async (signal) => {
				const response = await fetch("/api/alerts/check", {
					method: "POST",
					signal,
				});
				const result = await parseProtectedResponse<{ results?: string[] }>(
					response,
				);
				return result.ok ? result.data : { results: [] };
			},
		});

		poller.start();
		return () => {
			poller.stop();
		};
	}, [alertsPageVisible, config, hasElevatedSession, pathname]);

	// Render nothing; this runs only in the background.
	return null;
}
