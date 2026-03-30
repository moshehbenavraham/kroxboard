"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOperatorElevation } from "@/app/components/operator-elevation-provider";
import { useI18n } from "@/lib/i18n";
import {
	getProtectedRequestError,
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

const CRON_RULE_ID = "cron_continuous_failure";

const RULE_DESCRIPTIONS: Record<string, string> = {
	model_unavailable: "Model Unavailable - Triggered when model testing fails",
	bot_no_response:
		"Bot Long Time No Response - Triggered when a bot stays inactive past the threshold",
	message_failure_rate:
		"Message Failure Rate High - Triggered when the failure rate exceeds the threshold",
	[CRON_RULE_ID]:
		"Cron Continuous Failure - Triggered when cron jobs fail multiple times in a row",
};

export default function AlertsPage() {
	const { t, locale } = useI18n();
	const { runProtectedRequest, sessionState } = useOperatorElevation();
	const [config, setConfig] = useState<AlertConfig | null>(null);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [operatorMessage, setOperatorMessage] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkResults, setCheckResults] = useState<string[]>([]);
	const [lastCheckTime, setLastCheckTime] = useState<string>("");
	const [checkInterval, setCheckInterval] = useState(10);
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
			throw new Error(getProtectedRequestError(result));
		}
		return result.data;
	};

	const runManualAlertCheck = async (
		actionId: string,
	): Promise<{ results?: string[] }> => {
		const result = await runProtectedRequest<{ results?: string[] }>({
			actionId,
			request: () => fetch("/api/alerts/check", { method: "POST" }),
		});
		if (!result.ok) {
			throw new Error(getProtectedRequestError(result));
		}
		return result.data;
	};

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

		const checkAlerts = () => {
			setChecking(true);
			fetch("/api/alerts/check", { method: "POST" })
				.then((response) =>
					parseProtectedResponse<{ results?: string[] }>(response),
				)
				.then((result) => {
					if (!result.ok) {
						if ("auth" in result) {
							setOperatorMessage(result.auth.message);
							return;
						}
						setOperatorMessage(result.error);
						return;
					}
					setOperatorMessage(null);
					if (result.data.results && result.data.results.length > 0) {
						setCheckResults(result.data.results);
						setLastCheckTime(new Date().toLocaleTimeString(timeLocale));
					}
				})
				.catch((error: unknown) => {
					const message =
						error instanceof Error ? error.message : "Alert check failed";
					setOperatorMessage(message);
				})
				.finally(() => setChecking(false));
		};

		// Only set the timer here; do not run an immediate check.
		const timer = setInterval(checkAlerts, checkInterval * 60 * 1000);
		return () => clearInterval(timer);
	}, [config?.enabled, checkInterval, hasElevatedSession, timeLocale]);

	const handleManualCheck = () => {
		setChecking(true);
		runManualAlertCheck("alerts:manual-check")
			.then((data) => {
				setOperatorMessage(null);
				if (data.results && data.results.length > 0) {
					setCheckResults(data.results);
					setLastCheckTime(new Date().toLocaleTimeString(timeLocale));
				}
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert check failed";
				setOperatorMessage(message);
			})
			.finally(() => setChecking(false));
	};

	const handleToggle = () => {
		if (!config) return;
		setSaving(true);
		updateAlertConfig({ enabled: !config.enabled }, "alerts:toggle")
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
			})
			.finally(() => setSaving(false));
	};

	const handleAgentChange = (agentId: string) => {
		if (!config) return;
		setSaving(true);
		updateAlertConfig(
			{ receiveAgent: agentId },
			`alerts:receive-agent:${agentId}`,
		)
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
			})
			.finally(() => setSaving(false));
	};

	const handleIntervalChange = (value: number) => {
		if (!config) return;
		setCheckInterval(value);
		setSaving(true);
		updateAlertConfig({ checkInterval: value }, `alerts:interval:${value}`)
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
			})
			.finally(() => setSaving(false));
	};

	const handleRuleToggle = (ruleId: string) => {
		if (!config) return;
		const rules = config.rules.map((r) =>
			r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
		);
		setSaving(true);
		updateAlertConfig({ rules }, `alerts:rule-toggle:${ruleId}`)
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
			})
			.finally(() => setSaving(false));
	};

	const handleThresholdChange = (ruleId: string, value: number) => {
		if (!config) return;
		const rules = config.rules.map((r) =>
			r.id === ruleId ? { ...r, threshold: value } : r,
		);
		setSaving(true);
		updateAlertConfig({ rules }, `alerts:threshold:${ruleId}`)
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
			})
			.finally(() => setSaving(false));
	};

	const handleTargetAgentsChange = (ruleId: string, targetAgents: string[]) => {
		if (!config) return;
		const rules = config.rules.map((rule) =>
			rule.id === ruleId ? { ...rule, targetAgents } : rule,
		);
		setSaving(true);
		updateAlertConfig({ rules }, `alerts:targets:${ruleId}`)
			.then((newConfig) => {
				setOperatorMessage(null);
				setConfig(newConfig);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			})
			.catch((error: unknown) => {
				const message =
					error instanceof Error ? error.message : "Alert update failed";
				setOperatorMessage(message);
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
			{operatorMessage && (
				<div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
					{operatorMessage}
				</div>
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
