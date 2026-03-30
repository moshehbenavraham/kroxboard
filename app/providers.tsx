"use client";

import type { ReactNode } from "react";
import { OperatorElevationProvider } from "@/app/components/operator-elevation-provider";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<I18nProvider>
				<OperatorElevationProvider>{children}</OperatorElevationProvider>
			</I18nProvider>
		</ThemeProvider>
	);
}
