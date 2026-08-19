// Vertical drag offset shared across all ScheduleBoardDayColumn instances —
// only one drag is ever active at a time. Kept outside the column module so
// that file exports only components (React fast-refresh requirement).

let sharedDragOffsetY = 0;

export function setSharedDragOffset(v: number) {
	sharedDragOffsetY = v;
}

export function getSharedDragOffset(): number {
	return sharedDragOffsetY;
}
