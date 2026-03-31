import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockPino = vi.fn((config: unknown) => ({ config }));

vi.mock("node:fs", () => {
	const fsMock = {
		existsSync: (...args: unknown[]) => mockExistsSync(...args),
		mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
		writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
	};
	return {
		...fsMock,
		default: fsMock,
	};
});

vi.mock("pino", () => ({
	default: (config: unknown) => mockPino(config),
}));

describe("logger", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.resetModules();
		mockExistsSync.mockReset();
		mockMkdirSync.mockReset();
		mockWriteFileSync.mockReset();
		mockPino.mockClear();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	it("creates the logs directory and writes normalized error payloads with the default level", async () => {
		mockExistsSync.mockReturnValue(false);
		delete process.env.LOG_LEVEL;

		await import("@/lib/logger");

		expect(mockMkdirSync).toHaveBeenCalled();
		expect(mockPino).toHaveBeenCalled();

		const [{ hooks, level }] = mockPino.mock.calls[0] as [
			{ hooks: any; level: string },
		];
		expect(level).toBe("info");

		const method = vi.fn();
		const errorLike = { name: "", message: "", stack: "" };
		hooks.logMethod([errorLike, "Boom"], method, 50);

		expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
		const [, payload] = mockWriteFileSync.mock.calls[0] as [string, string];
		const parsed = JSON.parse(payload);
		expect(parsed.error).toEqual({
			type: "Error",
			message: "[object Object]",
			stack: "",
		});
		expect(method).toHaveBeenCalled();
	});

	it("uses the configured log level and reports write failures without an error object", async () => {
		mockExistsSync.mockReturnValue(true);
		mockWriteFileSync.mockImplementation(() => {
			throw new Error("disk full");
		});
		process.env.LOG_LEVEL = "debug";
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await import("@/lib/logger");

		const [{ hooks, level }] = mockPino.mock.calls[0] as [
			{ hooks: any; level: string },
		];
		expect(level).toBe("debug");

		const method = vi.fn();
		hooks.logMethod(["Plain failure"], method, 50);

		expect(consoleErrorSpy).toHaveBeenCalled();
		expect(method).toHaveBeenCalled();
	});
});
