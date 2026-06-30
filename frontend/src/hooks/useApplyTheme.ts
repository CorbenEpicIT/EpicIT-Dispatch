import { useEffect, useState } from "react";
import { useThemeStore } from "../stores/themeStore";

export function useApplyTheme() {
	const theme = useThemeStore((s) => s.theme);
	const lightPalette = useThemeStore((s) => s.lightPalette);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");

		const apply = (prefersDark: boolean) => {
			const effective = prefersDark ? "dark" : "light";
			document.documentElement.dataset.theme = effective;
			if (effective === "light" && lightPalette !== "blue") {
				document.documentElement.dataset.palette = lightPalette;
			} else {
				delete document.documentElement.dataset.palette;
			}
		};

		if (theme === "system") {
			apply(mq.matches);
			const handler = (e: MediaQueryListEvent) => apply(e.matches);
			mq.addEventListener("change", handler);
			return () => mq.removeEventListener("change", handler);
		} else {
			const isDark = theme === "dark";
			document.documentElement.dataset.theme = theme;
			if (!isDark && lightPalette !== "blue") {
				document.documentElement.dataset.palette = lightPalette;
			} else {
				delete document.documentElement.dataset.palette;
			}
		}
	}, [theme, lightPalette]);
}

export function useResolvedTheme(): "dark" | "light" {
	const theme = useThemeStore((s) => s.theme);
	const [systemDark, setSystemDark] = useState(
		() => window.matchMedia("(prefers-color-scheme: dark)").matches,
	);

	useEffect(() => {
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
		setSystemDark(mq.matches);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);

	if (theme === "dark") return "dark";
	if (theme === "light") return "light";
	return systemDark ? "dark" : "light";
}
