import { X } from "lucide-react";

export type ChipColor = "purple" | "blue" | "green" | "orange";

export interface FilterChip {
	label: string;
	color: ChipColor;
	onRemove: () => void;
	highlighted?: boolean;
}

interface FilterChipsProps {
	filters: (FilterChip | null | undefined)[];
	resultCount: number;
	onClearAll: () => void;
}

const COLOR_STYLES: Record<ChipColor, { bg: string; border: string; text: string; ring: string }> = {
	purple: { bg: "bg-purple-600/20", border: "border-reviewing/30", text: "text-purple-300", ring: "ring-purple-400" },
	blue:   { bg: "bg-primary-hover/20",   border: "border-primary/30",   text: "text-primary-text",   ring: "ring-blue-400" },
	green:  { bg: "bg-green-600/20",  border: "border-success/30",  text: "text-green-300",  ring: "ring-green-400" },
	orange: { bg: "bg-orange-600/20", border: "border-orange-500/30", text: "text-orange-300", ring: "ring-orange-400" },
};

export default function FilterChips({ filters: rawFilters, resultCount, onClearAll }: FilterChipsProps) {
	const filters = rawFilters.filter((f): f is FilterChip => f != null);
	if (filters.length === 0) return null;

	return (
		<div className="mb-3 p-2.5 bg-surface/60 rounded-md border border-border/60">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-sm text-text-tertiary">Active filters:</span>
					{filters.map((chip) => {
						const { bg, border, text, ring } = COLOR_STYLES[chip.color];
						return (
							<div
								key={chip.label}
								className={`flex items-center gap-2 px-3 py-1.5 ${bg} border ${border} rounded-md transition-shadow ${chip.highlighted ? `ring-2 ${ring}` : ""}`}
							>
								<span className={`text-sm ${text}`}>{chip.label}</span>
								<button
									onClick={chip.onRemove}
									className={`p-1 -m-1 ${text} hover:text-white transition-colors`}
									aria-label={`Remove ${chip.label} filter`}
								>
									<X size={14} />
								</button>
							</div>
						);
					})}
					<span className="text-sm text-text-muted">
						• {resultCount} {resultCount === 1 ? "result" : "results"}
					</span>
				</div>
				<button
					onClick={onClearAll}
					className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-error-text hover:text-error-text hover:bg-surface-raised/50 rounded-md transition-colors"
				>
					Clear All
					<X size={14} />
				</button>
			</div>
		</div>
	);
}
