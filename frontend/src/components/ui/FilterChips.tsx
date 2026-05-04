import { X } from "lucide-react";

export type ChipColor = "purple" | "blue" | "green" | "orange";

export interface FilterChip {
	label: string;
	color: ChipColor;
	onRemove: () => void;
}

interface FilterChipsProps {
	filters: (FilterChip | null | undefined)[];
	resultCount: number;
	onClearAll: () => void;
}

const COLOR_STYLES: Record<ChipColor, { bg: string; border: string; text: string }> = {
	purple: { bg: "bg-purple-600/20", border: "border-purple-500/30", text: "text-purple-300" },
	blue:   { bg: "bg-blue-600/20",   border: "border-blue-500/30",   text: "text-blue-300" },
	green:  { bg: "bg-green-600/20",  border: "border-green-500/30",  text: "text-green-300" },
	orange: { bg: "bg-orange-600/20", border: "border-orange-500/30", text: "text-orange-300" },
};

export default function FilterChips({ filters: rawFilters, resultCount, onClearAll }: FilterChipsProps) {
	const filters = rawFilters.filter((f): f is FilterChip => f != null);
	if (filters.length === 0) return null;

	return (
		<div className="mb-3 p-2.5 bg-zinc-800/60 rounded-md border border-zinc-700/60">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-sm text-zinc-400">Active filters:</span>
					{filters.map((chip) => {
						const { bg, border, text } = COLOR_STYLES[chip.color];
						return (
							<div
								key={chip.label}
								className={`flex items-center gap-2 px-3 py-1.5 ${bg} border ${border} rounded-md`}
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
					<span className="text-sm text-zinc-500">
						• {resultCount} {resultCount === 1 ? "result" : "results"}
					</span>
				</div>
				{filters.length > 1 && (
					<button
						onClick={onClearAll}
						className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-700/50 rounded-md transition-colors"
					>
						Clear All
						<X size={14} />
					</button>
				)}
			</div>
		</div>
	);
}
