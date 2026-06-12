import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type LightPalette } from "../../stores/themeStore";

interface PreferencesCardProps {
	onThemeChange: (theme: "dark" | "light" | "system") => void;
}

export default function PreferencesCard({ onThemeChange }: PreferencesCardProps) {
	const { theme, lightPalette, setLightPalette } = useThemeStore();

	return (
		<section>
			<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
				<p className="mb-2 text-xs font-medium text-text-tertiary">Theme</p>
				<div className="inline-flex rounded-md bg-surface-inset p-0.5">
					<button
						onClick={() => onThemeChange("system")}
						className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
							theme === "system"
								? "bg-surface text-text-primary shadow-sm"
								: "text-text-muted hover:text-text-secondary"
						}`}
					>
						<Monitor size={14} />
						System
					</button>
					<button
						onClick={() => onThemeChange("dark")}
						className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
							theme === "dark"
								? "bg-surface text-text-primary shadow-sm"
								: "text-text-muted hover:text-text-secondary"
						}`}
					>
						<Moon size={14} />
						Dark
					</button>
					<button
						onClick={() => onThemeChange("light")}
						className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
							theme === "light"
								? "bg-surface text-text-primary shadow-sm"
								: "text-text-muted hover:text-text-secondary"
						}`}
					>
						<Sun size={14} />
						Light
					</button>
				</div>

				{theme !== "dark" && (
					<div className="mt-4">
						<p className="mb-2 text-xs font-medium text-text-tertiary">Light mode style</p>
						<div className="inline-flex rounded-md bg-surface-inset p-0.5">
							{(
								[
									{ value: "blue", label: "Blue", swatch: "#dce2ed" },
									{ value: "warm", label: "Warm", swatch: "#e6dfd5" },
									{ value: "neutral", label: "Neutral", swatch: "#e0e0e0" },
								] as { value: LightPalette; label: string; swatch: string }[]
							).map(({ value, label, swatch }) => (
								<button
									key={value}
									onClick={() => setLightPalette(value)}
									className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
										lightPalette === value
											? "bg-surface text-text-primary shadow-sm"
											: "text-text-muted hover:text-text-secondary"
									}`}
								>
									<span
										className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
										style={{ backgroundColor: swatch }}
									/>
									{label}
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
