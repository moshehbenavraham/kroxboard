"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OperatorActionBanner } from "@/app/components/operator-action-banner";
import { useOperatorElevation } from "@/app/components/operator-elevation-provider";
import { createClientPoller } from "@/lib/client-polling";
import { useI18n } from "@/lib/i18n";
import {
	createProtectedRequestBannerState,
	getDiagnosticMetadata,
	getProtectedRequestBannerState,
	getProtectedRequestError,
	type ProtectedRequestBannerState,
	parseProtectedResponse,
} from "@/lib/operator-elevation-client";

interface AlertRule {
	id: string;
	name: string;
	enabled: boolean;
	threshold?: number;
	targetAgents?: string[];
}

interface AlertConfig {
	enabled: boolean;
	receiveAgent: string;
	rules: AlertRule[];
	checkInterval?: number;
}

interface Agent {
	id: string;
	name: string;
	emoji: string;
}

interface AlertCheckNotification {
	agentId: string;
	mode: "dry_run" | "live_send";
	status: "dry_run" | "sent" | "failed";
	message: string;
	error?: string;
}

interface AlertCheckResponse {
	results?: string[];
	notifications?: AlertCheckNotification[];
}

type OperatorBannerError = Error & {
	banner?: ProtectedRequestBannerState;
};

const CRON_RULE_ID = "cron_continuous_failure";
const MANUAL_CHECK_PENDING_MESSAGE = "Running a manual alert check.";
const SCHEDULED_CHECK_PENDING_MESSAGE = "Running scheduled alert diagnostics.";

const RULE_DESCRIPTIONS: Record<string, string> = {
	model_unavailable: "Model Unavailable - Triggered when model testing fails",
	bot_no_response:
		"Bot Long Time No Response - Triggered when a bot stays inactive past the threshold",
	message_failure_rate:
		"Message Failure Rate High - Triggered when the failure rate exceeds the threshold",
	[CRON_RULE_ID]:
		"Cron Continuous Failure - Triggered when cron jobs fail multiple times in a row",
};

function createOperatorBannerError(
	banner: ProtectedRequestBannerState,
): OperatorBannerError {
	const error = new Error(banner.message) as OperatorBannerError;
	error.banner = banner;
	return error;
}

function getOperatorBannerFromError(
	error: unknown,
	fallbackMessage: string,
): ProtectedRequestBannerState {
	if (error && typeof error === "object" && "banner" in error) {
		const banner = (error as OperatorBannerError).banner;
		if (banner) return banner;
	}

	const message = error instanceof Error ? error.message : fallbackMessage;
	return createProtectedRequestBannerState("error", message);
}

export default function AlertsPage() {
	const { t, locale } = useI18n();
	const { runProtectedRequest, sessionState } = useOperatorElevation();
	const [config, setConfig] = useState<AlertConfig | null>(null);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [operatorBanner, setOperatorBanner] =
		useState<ProtectedRequestBannerState | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkResults, setCheckResults] = useState<string[]>([]);
	const [notificationResults, setNotificationResults] = useState<
		AlertCheckNotification[]
	>([]);
	const [lastCheckTime, setLastCheckTime] = useState<string>("");
	const [checkInterval, setCheckInterval] = useState(10);
	const checkInFlightRef = useRef(false);
	const hasElevatedSession = sessionState?.ok === true;

	// Load the configured alert interval.
	useEffect(() => {
		if (config?.checkInterval) {
			setCheckInterval(config.checkInterval);
		}
	}, [config?.checkInterval]);

	const ruleDescriptions = RULE_DESCRIPTIONS;
	const timeLocale = locale === "en" ? "en-US" : "en-US";
	const ui = {
		minutes5: "5 minutes",
		minutes10: "10 minutes",
		minutes30: "30 minutes",
		hour1: "1 hour",
		hours2: "2 hours",
		hours5: "5 hours",
		checking: "... Checking...",
		checkNow: "Refresh Check Now",
		alertsTriggered: "WARN Alerts Triggered",
		checkingAlerts: "... Checking alerts...",
		timeout: "Timeout (s):",
		failureRate: "Failure rate (%):",
		maxFailures: "Max failures:",
		threshold: "Threshold:",
		monitor: "Monitor bots:",
		emptyMeansAll: "(empty = all)",
		saved: "Saved",
	};

	const updateAlertConfig = async (
		body: Record<string, unknown>,
		actionId: string,
	): Promise<AlertConfig> => {
		const result = await runProtectedRequest<AlertConfig>({
			actionId,
			request: () =>
				fetch("/api/alerts", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
		});
		if (!result.ok) {
			const banner =
				getProtectedRequestBannerState(result) ??
				createProtectedRequestBannerState(
					"error",
					getProtectedRequestError(result) || "Alert update failed",
				);
			setOperatorBanner(banner);
			throw createOperatorBannerError(banner);
		}
		return result.data;
	};

	const runManualAlertCheck = async (
		actionId: string,
	): Promise<AlertCheckResponse> => {
		const result = await runProtectedRequest<AlertCheckResponse>({
			actionId,
			request: () => fetch("/api/alerts/check", { method: "POST" }),
		});
		if (!result.ok) {
			const banner =
				getProtectedRequestBannerState(result) ??
				createProtectedRequestBannerState(
					"error",
					getProtectedRequestError(result) || "Alert check failed",
				);
			setOperatorBanner(banner);
			throw createOperatorBannerError(banner);
		}
		return result.data;
	};

	const applyCheckResponse = useCallback(
		(data: AlertCheckResponse) => {
			const diagnostic = getDiagnosticMetadata(data);
			setCheckResults(data.results || []);
			setNotificationResults(data.notifications || []);
			if (
				(data.results?.length || 0) > 0 ||
				(data.notifications?.length || 0) > 0
			) {
				setLastCheckTime(new Date().toLocaleTimeString(timeLocale));
			}
			if (diagnostic?.mode === "dry_run") {
				setOperatorBanner(
					createProtectedRequestBannerState("info", diagnostic.message),
				);
				return;
			}
			setOperatorBanner(null);
		},
		[timeLocale],
	);

	const clearScheduledPendingBanner = useCallback(() => {
		setOperatorBanner((current) =>
			current?.message === SCHEDULED_CHECK_PENDING_MESSAGE ? null : current,
		);
	}, []);

	const beginCheck = useCallback((message: string) => {
		checkInFlightRef.current = true;
		setChecking(true);
		setOperatorBanner(createProtectedRequestBannerState("pending", message));
	}, []);

	const finishCheck = useCallback(() => {
		checkInFlightRef.current = false;
		setChecking(false);
	}, []);

	// Load config and agent data.
	useEffect(() => {
		Promise.all([
			fetch("/api/alerts").then((r) => r.json()),
			fetch("/api/config").then((r) => r.json()),
		])
			.then(([alertData, configData]) => {
				setConfig(alertData);
				setAgents(configData.agents || []);
			})
			.catch(console.error)
			.finally(() => setLoading(false));
	}, []);

	// Schedule alert checks without auto-running one on mount.
	useEffect(() => {
		if (!config?.enabled || !hasElevatedSession) return;

		const poller = createClientPoller<AlertCheckResponse>({
			intervalMs: checkInterval * 60 * 1000,
			sharedKey: "alerts:scheduled-check",
			reuseResultMs: 60_000,
			shouldPoll: () =>
				hasElevatedSession &&
				Boolean(config?.enabled) &&
				!checkInFlightRef.current,
			request: async (signal) => {
				beginCheck(SCHEDULED_CHECK_PENDING_MESSAGE);
				const response = await fetch("/api/alerts/check", {
					method: "POST",
					signal,
				});
				const result =
					await parseProtectedResponse<AlertCheckResponse>(response);
				if (!result.ok) {
					const banner =
						getProtectedRequestBannerState(result) ??
						createProtectedRequestBannerState(
							"error",
							getProtectedRequestError(result) || "Alert check failed",
						);
					throw createOperatorBannerError(banner);
				}
				return result.data;
			},
			onSuccess: (data) => {
				applyCheckResponse(data);
				finishCheck();
			},
			onError: (error) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert check failed"),
				);
				finishCheck();
			},
			onSkip: () => {
				finishCheck();
				clearScheduledPendingBanner();
			},
		});

		poller.start();
		return () => {
			poller.stop();
			finishCheck();
		};
	}, [
		applyCheckResponse,
		beginCheck,
		checkInterval,
		clearScheduledPendingBanner,
		config?.enabled,
		finishCheck,
		hasElevatedSession,
	]);

	const handleManualCheck = () => {
		beginCheck(MANUAL_CHECK_PENDING_MESSAGE);
		runManualAlertCheck("alerts:manual-check")
			.then((data) => {
				applyCheckResponse(data);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert check failed"),
				);
			})
			.finally(() => finishCheck());
	};

	const handleToggle = () => {
		if (!config) return;
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert configuration changes.",
			),
		);
		updateAlertConfig({ enabled: !config.enabled }, "alerts:toggle")
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	const handleAgentChange = (agentId: string) => {
		if (!config) return;
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert recipient changes.",
			),
		);
		updateAlertConfig(
			{ receiveAgent: agentId },
			`alerts:receive-agent:${agentId}`,
		)
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	const handleIntervalChange = (value: number) => {
		if (!config) return;
		setCheckInterval(value);
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert schedule changes.",
			),
		);
		updateAlertConfig({ checkInterval: value }, `alerts:interval:${value}`)
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	const handleRuleToggle = (ruleId: string) => {
		if (!config) return;
		const rules = config.rules.map((r) =>
			r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
		);
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert rule changes.",
			),
		);
		updateAlertConfig({ rules }, `alerts:rule-toggle:${ruleId}`)
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	const handleThresholdChange = (ruleId: string, value: number) => {
		if (!config) return;
		const rules = config.rules.map((r) =>
			r.id === ruleId ? { ...r, threshold: value } : r,
		);
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert threshold changes.",
			),
		);
		updateAlertConfig({ rules }, `alerts:threshold:${ruleId}`)
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	const handleTargetAgentsChange = (ruleId: string, targetAgents: string[]) => {
		if (!config) return;
		const rules = config.rules.map((rule) =>
			rule.id === ruleId ? { ...rule, targetAgents } : rule,
		);
		setSaving(true);
		setOperatorBanner(
			createProtectedRequestBannerState(
				"pending",
				"Saving alert target changes.",
			),
		);
		updateAlertConfig({ rules }, `alerts:targets:${ruleId}`)
			.then((newConfig) => {
				setOperatorBanner(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				setOperatorBanner(
					getOperatorBannerFromError(error, "Alert update failed"),
				);
			})
			.finally(() => setSaving(false));
	};

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-[var(--text-muted)]">{t("common.loading")}</p>
			</div>
		);
	}

	if (!config) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-red-400">{t("common.loadError")}</p>
			</div>
		);
	}

	return (
		<main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
			<div className="flex flex-col gap-3 mb-6 md:mb-8 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="text-2xl font-bold flex items-center gap-2">
						[Bell] {t("alerts.title") || "Alert Center"}
					</h1>
					<p className="text-[var(--text-muted)] text-sm mt-1">
						{t("alerts.subtitle") ||
							"Configure system alerts and notifications"}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					{/* Check interval */}
					{config.enabled && (
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs text-[var(--text-muted)]">
								{t("alerts.checkInterval") || "Check Interval"}:
							</span>
							<select
								value={checkInterval}
								onChange={(e) => handleIntervalChange(Number(e.target.value))}
								className="px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
							>
								<option value={5}>{ui.minutes5}</option>
								<option value={10}>{ui.minutes10}</option>
								<option value={30}>{ui.minutes30}</option>
								<option value={60}>{ui.hour1}</option>
								<option value={120}>{ui.hours2}</option>
								<option value={300}>{ui.hours5}</option>
							</select>
						</div>
					)}
					{/* Manual check button */}
					{config.enabled && (
						<button
							type="button"
							onClick={handleManualCheck}
							disabled={checking}
							className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition disabled:opacity-50"
						>
							{checking ? ui.checking : ui.checkNow}
						</button>
					)}
					<Link
						href="/"
						className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition"
					>
						{t("common.backHome") || "Back"}
					</Link>
				</div>
			</div>
			{operatorBanner && (
				<OperatorActionBanner
					tone={operatorBanner.tone}
					message={operatorBanner.message}
					className="mb-6"
				/>
			)}

			{/* Check results */}
			{config.enabled && checkResults.length > 0 && (
				<div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 mb-6">
					<div className="flex items-center justify-between mb-2">
						<h3 className="font-semibold text-yellow-400">
							{ui.alertsTriggered} ({checkResults.length})
						</h3>
						{lastCheckTime && (
							<span className="text-xs text-[var(--text-muted)]">
								{lastCheckTime}
							</span>
						)}
					</div>
					<ul className="space-y-1">
						{checkResults.map((result) => (
							<li key={result} className="text-sm text-yellow-300">
								- {result}
							</li>
						))}
					</ul>
				</div>
			)}

			{config.enabled && notificationResults.length > 0 && (
				<div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/10 mb-6">
					<div className="flex items-center justify-between mb-2">
						<h3 className="font-semibold text-sky-300">
							Alert notification results ({notificationResults.length})
						</h3>
						{lastCheckTime && (
							<span className="text-xs text-[var(--text-muted)]">
								{lastCheckTime}
							</span>
						)}
					</div>
					<div className="space-y-2">
						{notificationResults.map((notification, index) => (
							<div
								key={`${notification.agentId}-${notification.mode}-${index}`}
								className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
							>
								<div className="flex items-center gap-2">
									<span
										className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
											notification.status === "sent"
												? "bg-green-500/20 text-green-300"
												: notification.status === "dry_run"
													? "bg-sky-500/20 text-sky-300"
													: "bg-red-500/20 text-red-300"
										}`}
									>
										{notification.status}
									</span>
									<span className="text-[var(--text-muted)]">
										{notification.agentId}
									</span>
									<span className="text-[var(--text-muted)]">
										mode: {notification.mode}
									</span>
								</div>
								<div className="mt-1 break-words text-[var(--text)]">
									{notification.message}
								</div>
								{notification.error && (
									<div className="mt-1 break-words text-red-300">
										{notification.error}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{config.enabled && checking && (
				<div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6 text-center text-[var(--text-muted)]">
					{ui.checkingAlerts}
				</div>
			)}

			{/* Global alert toggle */}
			<div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold">
							{t("alerts.enableAlerts") || "Enable Alerts"}
						</h2>
						<p className="text-[var(--text-muted)] text-sm mt-1">
							{t("alerts.enableDesc") || "Turn on/off all alert notifications"}
						</p>
					</div>
					<button
						type="button"
						onClick={handleToggle}
						disabled={saving}
						className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
							config.enabled ? "bg-green-500" : "bg-gray-600"
						}`}
					>
						<span
							className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
								config.enabled ? "translate-x-7" : "translate-x-1"
							}`}
						/>
					</button>
				</div>
			</div>

			{/* Alert recipient agent */}
			<div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] mb-6">
				<h2 className="text-lg font-semibold mb-3">
					{t("alerts.receiveAgent") || "Receive Alert Agent"}
				</h2>
				<div className="flex flex-wrap gap-2">
					{agents.map((agent) => (
						<button
							type="button"
							key={agent.id}
							onClick={() => handleAgentChange(agent.id)}
							disabled={!config.enabled || saving}
							className={`px-4 py-2 rounded-lg border transition ${
								config.receiveAgent === agent.id
									? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
									: "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]"
							} ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
						>
							{agent.emoji} {agent.name}
						</button>
					))}
				</div>
			</div>

			{/* Alert rule list */}
			<div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
				<h2 className="text-lg font-semibold mb-3">
					{t("alerts.rules") || "Alert Rules"}
				</h2>
				<p className="text-[var(--text-muted)] text-sm mb-4">
					{t("alerts.rulesDesc") || "Configure which conditions trigger alerts"}
				</p>
				<div className="space-y-4">
					{config.rules.map((rule) => (
						<div
							key={rule.id}
							className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg)]"
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<button
										type="button"
										onClick={() => handleRuleToggle(rule.id)}
										disabled={!config.enabled || saving}
										className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
											rule.enabled ? "bg-green-500" : "bg-gray-600"
										} ${!config.enabled ? "opacity-50" : ""}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												rule.enabled ? "translate-x-5" : "translate-x-1"
											}`}
										/>
									</button>
									<div>
										<h3 className="font-medium">{rule.name}</h3>
										<p className="text-[var(--text-muted)] text-xs">
											{ruleDescriptions[rule.id] || rule.id}
										</p>
									</div>
								</div>
								{rule.threshold !== undefined &&
									rule.id !== "bot_no_response" && (
										<div className="flex items-center gap-2">
											<span className="text-xs text-[var(--text-muted)]">
												{rule.id === "bot_no_response"
													? ui.timeout
													: rule.id === "message_failure_rate"
														? ui.failureRate
														: rule.id === CRON_RULE_ID
															? ui.maxFailures
															: ui.threshold}
											</span>
											<input
												type="number"
												value={rule.threshold}
												onChange={(e) =>
													handleThresholdChange(rule.id, Number(e.target.value))
												}
												disabled={!config.enabled || !rule.enabled || saving}
												className="w-20 px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--card)] text-[var(--text)] disabled:opacity-50"
											/>
										</div>
									)}
								{rule.id === "bot_no_response" &&
									rule.threshold !== undefined && (
										<div className="flex items-center gap-2">
											<span className="text-xs text-[var(--text-muted)]">
												{ui.timeout}
											</span>
											<input
												type="number"
												value={rule.threshold}
												onChange={(e) =>
													handleThresholdChange(rule.id, Number(e.target.value))
												}
												disabled={!config.enabled || !rule.enabled || saving}
												className="w-20 px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--card)] text-[var(--text)] disabled:opacity-50"
											/>
										</div>
									)}
							</div>
							{/* bot_no_response rule: choose which agents to monitor */}
							{rule.id === "bot_no_response" && rule.enabled && (
								<div className="mt-3 pt-3 border-t border-[var(--border)]">
									<div className="flex flex-wrap gap-2 items-center">
										<span className="text-xs text-[var(--text-muted)]">
											{ui.monitor}
										</span>
										{agents.map((agent) => {
											const selected =
												rule.targetAgents?.includes(agent.id) ?? true;
											return (
												<button
													type="button"
													key={agent.id}
													onClick={() => {
														const currentAgents = rule.targetAgents || [];
														const newAgents = selected
															? currentAgents.filter((id) => id !== agent.id)
															: [...currentAgents, agent.id];
														const finalAgents =
															newAgents.length === 0 && !rule.targetAgents
																? agents.map((a) => a.id)
																: newAgents;
														handleTargetAgentsChange(rule.id, finalAgents);
													}}
													disabled={!config.enabled || saving}
													className={`px-2 py-1 text-xs rounded border transition ${
														selected
															? "bg-[var(--accent)] text-[var(--bg)] border-[var(--accent)]"
															: "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]"
													} disabled:opacity-50`}
												>
													{agent.emoji} {agent.name}
												</button>
											);
										})}
										<span className="text-xs text-[var(--text-muted)] ml-2">
											{ui.emptyMeansAll}
										</span>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Saved notice */}
			{saved && (
				<div className="fixed bottom-8 right-8 px-4 py-2 rounded-lg bg-green-500 text-white text-sm animate-fade-in">
					OK {ui.saved}
				</div>
			)}
		</main>
	);
}
