import type { LucideIcon } from "lucide-react";

// Plain (non-interactive) twin of VehicleAllotmentDropdown's tile shape, for
// figures that never have a per-location breakdown to drill into (Warehouse,
// in every Stock Placement variant). Same visual language as
// ItemStatRow/TrackingSummaryStats' Tile. Its own file — not local to
// StockPlacementCard — because PlacementSummaryBody (the Tracking tab's
// untracked-item panel) needs the identical shape too.
export default function PlacementTile({
	icon: Icon,
	label,
	value,
	suffix,
}: {
	icon: LucideIcon;
	label: string;
	value: number;
	suffix?: string;
}) {
	return (
		<div className="flex-1 min-w-[140px] rounded-lg border border-border-subtle bg-base px-4 py-3 text-left">
			<div className="flex items-center gap-1.5 text-text-muted">
				<Icon size={13} className="shrink-0" />
				<span className="text-[10px] font-semibold uppercase tracking-wider">
					{label}
				</span>
			</div>
			<div className="mt-1 text-xl font-bold tabular-nums leading-tight text-text-primary">
				{value}
				{suffix && (
					<span className="ml-1 text-xs font-normal text-text-faint">{suffix}</span>
				)}
			</div>
		</div>
	);
}
