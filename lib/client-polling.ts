export type PollSkipReason = "disabled" | "hidden";

export interface ClientPollerSuccessContext {
	cached: boolean;
	sharedKey?: string;
}

export interface ClientPollerOptions<T> {
	intervalMs: number;
	request: (signal: AbortSignal) => Promise<T>;
	onSuccess?: (value: T, context: ClientPollerSuccessContext) => void;
	onError?: (error: unknown) => void;
	onSkip?: (reason: PollSkipReason) => void;
	shouldPoll?: () => boolean;
	pauseWhenHidden?: boolean;
	immediate?: boolean;
	backoffMultiplier?: number;
	maxBackoffMs?: number;
	sharedKey?: string;
	reuseResultMs?: number;
	visibilityDocument?: Pick<
		Document,
		"hidden" | "visibilityState" | "addEventListener" | "removeEventListener"
	> | null;
}

export interface ClientPoller<_T> {
	start(): void;
	stop(): void;
	trigger(): Promise<void>;
	isInFlight(): boolean;
}

export interface PollResponseError extends Error {
	status: number;
	retryAfterMs: number | null;
}

interface SharedPollState<T> {
	promise: Promise<T> | null;
	value: T | null;
	resolvedAt: number;
}

const sharedPollState = new Map<string, SharedPollState<unknown>>();

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
	if (!retryAfterHeader) return null;

	const retryAfterSeconds = Number(retryAfterHeader);
	if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
		return retryAfterSeconds * 1000;
	}

	const retryAt = Date.parse(retryAfterHeader);
	if (!Number.isFinite(retryAt)) return null;
	return Math.max(0, retryAt - Date.now());
}

function getRetryAfterMs(error: unknown): number | null {
	if (!error || typeof error !== "object") return null;
	if (!("retryAfterMs" in error)) return null;
	const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
	return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
		? retryAfterMs
		: null;
}

export async function readPollJsonResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const error = new Error(
			response.statusText || `HTTP ${response.status}`,
		) as PollResponseError;
		error.name = "PollResponseError";
		error.status = response.status;
		error.retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
		throw error;
	}

	return (await response.json()) as T;
}

async function runSharedRequest<T>(
	sharedKey: string | undefined,
	reuseResultMs: number,
	request: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
	if (!sharedKey) {
		return { value: await request(), cached: false };
	}

	const existing = sharedPollState.get(sharedKey) as
		| SharedPollState<T>
		| undefined;
	const now = Date.now();
	if (existing?.promise) {
		return { value: await existing.promise, cached: true };
	}
	if (
		existing &&
		existing.value !== null &&
		reuseResultMs > 0 &&
		now - existing.resolvedAt <= reuseResultMs
	) {
		return { value: existing.value, cached: true };
	}

	const promise = request();
	sharedPollState.set(sharedKey, {
		promise,
		value: existing?.value ?? null,
		resolvedAt: existing?.resolvedAt ?? 0,
	});

	try {
		const value = await promise;
		sharedPollState.set(sharedKey, {
			promise: null,
			value,
			resolvedAt: Date.now(),
		});
		return { value, cached: false };
	} catch (error) {
		sharedPollState.delete(sharedKey);
		throw error;
	}
}

function getVisibilityDocument(
	visibilityDocument?: ClientPollerOptions<unknown>["visibilityDocument"],
): ClientPollerOptions<unknown>["visibilityDocument"] {
	if (visibilityDocument !== undefined) return visibilityDocument;
	if (typeof document === "undefined") return null;
	return document;
}

function isVisible(
	visibilityDocument: ClientPollerOptions<unknown>["visibilityDocument"],
): boolean {
	if (!visibilityDocument) return true;
	if (visibilityDocument.hidden) return false;
	return visibilityDocument.visibilityState !== "hidden";
}

export function createClientPoller<T>(
	options: ClientPollerOptions<T>,
): ClientPoller<T> {
	const visibilityDocument = getVisibilityDocument(options.visibilityDocument);
	const pauseWhenHidden = options.pauseWhenHidden ?? true;
	const backoffMultiplier = options.backoffMultiplier ?? 2;
	const maxBackoffMs = options.maxBackoffMs ?? options.intervalMs * 4;
	const reuseResultMs = options.reuseResultMs ?? 0;

	let started = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let abortController: AbortController | null = null;
	let inFlight: Promise<void> | null = null;
	let failureCount = 0;
	let retryAfterMs: number | null = null;

	const clearTimer = () => {
		if (!timer) return;
		clearTimeout(timer);
		timer = null;
	};

	const stopActiveRequest = () => {
		if (!abortController) return;
		abortController.abort();
		abortController = null;
	};

	const canPoll = (): PollSkipReason | null => {
		if (options.shouldPoll && !options.shouldPoll()) {
			return "disabled";
		}
		if (pauseWhenHidden && !isVisible(visibilityDocument)) {
			return "hidden";
		}
		return null;
	};

	const schedule = (delayMs: number) => {
		clearTimer();
		if (!started) return;
		const skipReason = canPoll();
		if (skipReason) {
			options.onSkip?.(skipReason);
			return;
		}
		timer = setTimeout(
			() => {
				void poll();
			},
			Math.max(0, delayMs),
		);
	};

	const getNextDelay = () => {
		const defaultDelay =
			failureCount === 0
				? options.intervalMs
				: Math.min(
						options.intervalMs * backoffMultiplier ** failureCount,
						maxBackoffMs,
					);
		if (retryAfterMs === null) return defaultDelay;
		const nextDelay = Math.max(defaultDelay, retryAfterMs);
		retryAfterMs = null;
		return nextDelay;
	};

	const poll = (): Promise<void> => {
		clearTimer();
		if (!started) return Promise.resolve();

		const skipReason = canPoll();
		if (skipReason) {
			options.onSkip?.(skipReason);
			return Promise.resolve();
		}

		if (inFlight) {
			return inFlight;
		}

		const controller = new AbortController();
		abortController = controller;

		inFlight = runSharedRequest(options.sharedKey, reuseResultMs, () =>
			options.request(controller.signal),
		)
			.then(({ value, cached }) => {
				failureCount = 0;
				retryAfterMs = null;
				options.onSuccess?.(value, {
					cached,
					sharedKey: options.sharedKey,
				});
			})
			.catch((error) => {
				if (controller.signal.aborted || isAbortError(error)) {
					return;
				}
				failureCount += 1;
				retryAfterMs = getRetryAfterMs(error);
				options.onError?.(error);
			})
			.finally(() => {
				if (abortController === controller) {
					abortController = null;
				}
				inFlight = null;
				if (started) {
					schedule(getNextDelay());
				}
			});

		return inFlight;
	};

	const handleVisibilityChange = () => {
		if (!started || !pauseWhenHidden) return;
		if (!isVisible(visibilityDocument)) {
			clearTimer();
			stopActiveRequest();
			options.onSkip?.("hidden");
			return;
		}
		if (!inFlight) {
			schedule(0);
		}
	};

	return {
		start() {
			if (started) return;
			started = true;
			if (pauseWhenHidden && visibilityDocument) {
				visibilityDocument.addEventListener(
					"visibilitychange",
					handleVisibilityChange,
				);
			}
			schedule(options.immediate ? 0 : options.intervalMs);
		},
		stop() {
			if (!started) return;
			started = false;
			clearTimer();
			stopActiveRequest();
			if (pauseWhenHidden && visibilityDocument) {
				visibilityDocument.removeEventListener(
					"visibilitychange",
					handleVisibilityChange,
				);
			}
		},
		trigger() {
			return poll();
		},
		isInFlight() {
			return inFlight !== null;
		},
	};
}
