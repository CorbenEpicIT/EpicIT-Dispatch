export interface StatCardProps {
	label: string;
	value: string;
	hint?: string;
	tone?: "error" | "warning";
	/**
	 * Half the height, same facts: the hint moves onto the value's line instead of
	 * claiming a third row. Every row the strip takes is a row the work below loses.
	 */
	dense?: boolean;
}

// Extracted from BatchDetailPage's local StatCard — same markup/tokens,
// reusable by any page that needs a compact metric tile.
export default function StatCard({ label, value, hint, tone, dense }: StatCardProps) {
	const valueTone =
		tone === "error"
			? "text-error-text"
			: tone === "warning"
				? "text-warning-text"
				: "text-text-primary";

	if (dense) {
		return (
			<div className="px-3 py-2 bg-base border border-border-subtle rounded-lg">
				<p className="text-[10px] text-text-muted uppercase tracking-wide font-semibold">{label}</p>
				<p className="flex items-baseline gap-1.5 min-w-0">
					<span className={`text-lg font-bold tabular-nums ${valueTone}`}>{value}</span>
					{hint && <span className="text-[11px] text-text-muted truncate">{hint}</span>}
				</p>
			</div>
		);
	}

	return (
		<div className="p-4 bg-base border border-border-subtle rounded-lg">
			<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">{label}</p>
			<p className={`text-xl font-bold tabular-nums ${valueTone}`}>{value}</p>
			{hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
		</div>
	);
}
