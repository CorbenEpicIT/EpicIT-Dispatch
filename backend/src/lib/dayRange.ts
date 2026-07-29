/**
 * UTC day range: midnight of `base`'s day (in `timezone`) to midnight `days` later.
 * Single source of truth for day-boundary math — pass the org timezone here to get
 * local-calendar days instead of UTC days.
 *
 * When `timezone` is omitted or "UTC" the behaviour is identical to the original
 * implementation (no breaking change to callers that don't need org-local days).
 */
export function utcDayRange(
	base: Date = new Date(),
	days = 1,
	timezone?: string,
): { start: Date; end: Date } {
	if (!timezone || timezone === "UTC") {
		const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
		const end = new Date(
			Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days),
		);
		return { start, end };
	}

	// Resolve the local calendar date in the org's IANA timezone using Intl.
	// formatToParts is the only reliable way to get year/month/day in an arbitrary tz.
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const parts = fmt.formatToParts(base);
	const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10);
	const year = get("year");
	const month = get("month") - 1; // Intl months are 1-based; Date.UTC expects 0-based
	const day = get("day");

	const start = new Date(Date.UTC(year, month, day));
	const end = new Date(Date.UTC(year, month, day + days));
	return { start, end };
}

/** Returns the YYYY-MM-DD string in the given timezone for `offsetDays` days from `base`. */
export function localDateString(
	base: Date = new Date(),
	timezone = "UTC",
	offsetDays = 0,
): string {
	const { start } = utcDayRange(base, 1, timezone);
	const offset = new Date(start.getTime() + offsetDays * 86_400_000);
	return offset.toISOString().slice(0, 10);
}
