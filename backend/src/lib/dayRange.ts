/**
 * UTC day range: midnight of `base`'s UTC day to midnight `days` later.
 * Single source of truth for day-boundary math — org-timezone support later
 * means changing only this function.
 */
export function utcDayRange(base: Date = new Date(), days = 1): { start: Date; end: Date } {
	const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
	const end = new Date(
		Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days),
	);
	return { start, end };
}
