"use client";

import { useEffect, useState } from "react";
import { useOperatorElevation } from "@/app/components/operator-elevation-provider";
import { parseProtectedResponse } from "@/lib/operator-elevation-client";

// Background alert checker that starts automatically with the app.
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

		// Load config and start checking.
		fetch("/api/alerts")
			.then((r) => r.json())
			.then((config) => {
				if (cancelled) return;
				if (config.enabled) {
					setEnabled(true);
					// Alert check function.
					const checkAlerts = () => {
						fetch("/api/alerts/check", { method: "POST" })
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
							.catch(console.error);
					};

					// Run one immediate check.
					checkAlerts();

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
			if (timer) clearInterval(timer);
		};
	}, [hasElevatedSession]);

	// Render nothing; this runs only in the background.
	return null;
}
