import { describe, expect, it } from "vitest";
import {
	getPlatformDisplayName,
	shouldHidePlatformChannel,
} from "@/lib/platforms";

describe("shouldHidePlatformChannel", () => {
	it("hides wechat-access when wecom is present and enabled", () => {
		expect(
			shouldHidePlatformChannel("wechat-access", {
				wecom: { enabled: true },
			}),
		).toBe(true);
	});

	it("hides wechat-access when wecom exists without explicit enabled flag", () => {
		expect(shouldHidePlatformChannel("wechat-access", { wecom: {} })).toBe(
			true,
		);
	});

	it("does not hide wechat-access when wecom is explicitly disabled", () => {
		expect(
			shouldHidePlatformChannel("wechat-access", {
				wecom: { enabled: false },
			}),
		).toBe(false);
	});

	it("does not hide wechat-access when wecom is absent", () => {
		expect(shouldHidePlatformChannel("wechat-access", {})).toBe(false);
	});

	it("does not hide other channels", () => {
		expect(
			shouldHidePlatformChannel("discord", { wecom: { enabled: true } }),
		).toBe(false);
	});
});

describe("getPlatformDisplayName", () => {
	it("maps wechat-access to wecom", () => {
		expect(getPlatformDisplayName("wechat-access")).toBe("wecom");
	});

	it("returns the channel name unchanged for other channels", () => {
		expect(getPlatformDisplayName("discord")).toBe("discord");
		expect(getPlatformDisplayName("telegram")).toBe("telegram");
		expect(getPlatformDisplayName("feishu")).toBe("feishu");
	});
});
