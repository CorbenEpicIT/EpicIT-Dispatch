// Warehouse:vehicle proportion, at a glance, regardless of tracking mode —
// the one visual every Stock Placement variant shares, including the
// Tracking tab's untracked-item panel (PlacementSummaryBody). `warehouse`/
// `vehicle` are the pair's own two numbers, not the item's overall quantity,
// so this stays meaningful even when it's a serial/lot count rather than a
// real quantity.
export default function ProportionBar({
	warehouse,
	vehicle,
}: {
	warehouse: number;
	vehicle: number;
}) {
	// Skipped when either side is 0, not just when both are: a full-width bar
	// would just restate the tile row above it in a different shape.
	if (warehouse <= 0 || vehicle <= 0) return null;
	const warehousePct = (warehouse / (warehouse + vehicle)) * 100;
	// Two shades of the same color read as "a proportion" but not "of what" —
	// native `title` is the one hint mechanism already in use elsewhere in
	// this app (no Tooltip component exists), and `role="img"` gives the bar
	// an accessible name instead of leaving it silent to a screen reader.
	const description = `Warehouse allotment: ${warehouse} in the warehouse, ${vehicle} on vehicles`;
	return (
		<div
			className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-raised"
			role="img"
			aria-label={description}
			title={description}
		>
			<div className="bg-primary/60" style={{ width: `${warehousePct}%` }} />
			<div className="flex-1 bg-primary/20" />
		</div>
	);
}
