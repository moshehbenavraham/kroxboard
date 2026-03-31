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

interface SharedPollState<T> {
	promise: Promise<T> | null;
	value: T | null;
	resolvedAt: number;
}

const sharedPollState = new Map<string, SharedPollState<unknown>>();

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
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
		if (failureCount === 0) return options.intervalMs;
		return Math.min(
			options.intervalMs * backoffMultiplier ** failureCount,
			maxBackoffMs,
		);
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
