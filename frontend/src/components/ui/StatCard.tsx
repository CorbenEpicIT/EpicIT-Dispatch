export interface StatCardProps {
	label: string;
	value: string;
	hint?: string;
	tone?: "error" | "warning";
}

// Extracted from BatchDetailPage's local StatCard — same markup/tokens,
// reusable by any page that needs a compact metric tile.
export default function StatCard({ label, value, hint, tone }: StatCardProps) {
	return (
		<div className="p-4 bg-base border border-border-subtle rounded-lg">
			<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">{label}</p>
			<p
				className={`text-xl font-bold tabular-nums ${
					tone === "error"
						? "text-error-text"
						: tone === "warning"
						? "text-warning-text"
						: "text-text-primary"
				}`}
			>
				{value}
			</p>
			{hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
		</div>
	);
}
