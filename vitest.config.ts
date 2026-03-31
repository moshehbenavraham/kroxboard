import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		include: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
		exclude: ["node_modules", ".next", "tests/**/*"],
		coverage: {
			provider: "v8",
			include: [
				"lib/**/*.ts",
				"app/api/health/**/*.ts",
				"app/api/alerts/route.ts",
				"app/api/config/agent-model/**/*.ts",
				"app/api/operator/**/*.ts",
				"app/api/skills/**/*.ts",
				"app/components/operator-elevation-provider.tsx",
				"app/components/operator-elevation-dialog.tsx",
				"middleware.ts",
			],
			exclude: [
				"**/*.test.{ts,tsx}",
				"**/*.spec.{ts,tsx}",
				"lib/pixel-office/**",
				"lib/i18n.tsx",
				"lib/theme.tsx",
				"lib/security/types.ts",
			],
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./"),
		},
	},
});
