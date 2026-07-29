import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LightPalette = "blue" | "warm" | "neutral";

interface ThemeState {
	theme: "dark" | "light" | "system";
	lightPalette: LightPalette;
	setTheme: (theme: "dark" | "light" | "system") => void;
	setLightPalette: (palette: LightPalette) => void;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme: "system",
			lightPalette: "blue",
			setTheme: (theme) => set({ theme }),
			setLightPalette: (lightPalette) => set({ lightPalette }),
		}),
		{ name: "theme-preference" }
	)
);
