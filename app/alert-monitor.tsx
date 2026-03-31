"use client";

import { useEffect, useState } from "react";
import { useOperatorElevation } from "@/app/components/operator-elevation-provider";
import { parseProtectedResponse } from "@/lib/operator-elevation-client";

// Background alert checker that schedules future checks without running one on mount.
export function AlertMonitor() {
	const { sessionState } = useOperatorElevation();
	const [_enabled, setEnabled] = useState(false);
	const [_checkInterval, _setCheckInterval] = useState(10);
	const [_lastResults, setLastResults] = useState<string[]>([]);
	const hasElevatedSession = sessionState?.ok === true;

	useEffect(() => {
		if (!hasElevatedSession) {
			setEnabled(false);
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setInterval> | null = null;
		let checkInFlight = false;
		const controller = new AbortController();

		// Load config and schedule checks only after mount.
		fetch("/api/alerts", { signal: controller.signal })
			.then((r) => r.json())
			.then((config) => {
				if (cancelled) return;
				if (config.enabled) {
					setEnabled(true);
					const checkAlerts = () => {
						if (cancelled || checkInFlight) return;
						checkInFlight = true;
						fetch("/api/alerts/check", {
							method: "POST",
							signal: controller.signal,
						})
							.then((response) =>
								parseProtectedResponse<{ results?: string[] }>(response),
							)
							.then((result) => {
								if (!result.ok) return;
								if (result.data.results && result.data.results.length > 0) {
									setLastResults(result.data.results);
									console.log(
										"[AlertMonitor] Alerts triggered:",
										result.data.results,
									);
								}
							})
							.catch((error: unknown) => {
								if (error instanceof Error && error.name === "AbortError") {
									return;
								}
								console.error(error);
							})
							.finally(() => {
								checkInFlight = false;
							});
					};

					// Start the interval timer.
					timer = setInterval(
						checkAlerts,
						(config.checkInterval || 10) * 60 * 1000,
					);
					return;
				}
				setEnabled(false);
			})
			.catch(console.error);

		return () => {
			cancelled = true;
			controller.abort();
			if (timer) clearInterval(timer);
		};
	}, [hasElevatedSession]);

	// Render nothing; this runs only in the background.
	return null;
}
