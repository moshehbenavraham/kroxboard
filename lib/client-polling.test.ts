import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientPoller } from "./client-polling";

function setVisibilityState(state: "visible" | "hidden"): void {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		value: state,
	});
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: state === "hidden",
	});
}

function createDeferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

describe("client-polling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setVisibilityState("visible");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		setVisibilityState("visible");
	});

	it("pauses while the document is hidden and resumes when visible again", async () => {
		setVisibilityState("hidden");
		const request = vi.fn(async () => "ok");
		const onSuccess = vi.fn();
		const poller = createClientPoller({
			intervalMs: 1_000,
			immediate: true,
			request,
			onSuccess,
		});

		poller.start();
		await vi.advanceTimersByTimeAsync(1_500);
		expect(request).not.toHaveBeenCalled();

		setVisibilityState("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);

		expect(request).toHaveBeenCalledTimes(1);
		expect(onSuccess).toHaveBeenCalledWith("ok", {
			cached: false,
			sharedKey: undefined,
		});

		poller.stop();
	});

	it("backs off after failures and resets to the base interval after recovery", async () => {
		const request = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error("down"))
			.mockResolvedValueOnce("recovered")
			.mockResolvedValue("steady");
		const poller = createClientPoller({
			intervalMs: 1_000,
			immediate: true,
			request,
		});

		poller.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(request).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_999);
		expect(request).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1);
		expect(request).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(999);
		expect(request).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(1);
		expect(request).toHaveBeenCalledTimes(3);

		poller.stop();
	});

	it("dedupes duplicate triggers while a request is already in flight", async () => {
		const deferred = createDeferred<string>();
		const request = vi.fn(() => deferred.promise);
		const poller = createClientPoller({
			intervalMs: 60_000,
			request,
		});

		poller.start();
		const first = poller.trigger();
		const second = poller.trigger();

		expect(request).toHaveBeenCalledTimes(1);
		expect(poller.isInFlight()).toBe(true);

		deferred.resolve("done");
		await Promise.all([first, second]);

		expect(poller.isInFlight()).toBe(false);
		poller.stop();
	});
});
