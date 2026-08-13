import type { ReorderForecastRow, ReorderSeverity } from "../types/reports";

// The reorder priority chart's plotting rules, kept out of the component file so
// both the chart and the page that decides whether to render it read the same
// definition. (It can't be a named export from the component itself —
// react-refresh/only-export-components reserves those files for components.)

/** Rows further out than this aren't plotted; the chart is about what's imminent. */
export const PLOT_WINDOW_DAYS = 30;

/**
 * Runway thresholds the plots draw guide marks at. Mirrors the SERVER's
 * REORDER_CRITICAL_DAYS / REORDER_WARNING_DAYS (reportsController) — the verdict
 * itself stays server-side, this is only where the marks go. Shared so the
 * org-wide priority bars and the item detail card's runway meter can't mark
 * different days for the same band.
 */
export const REORDER_BAND_DAYS = { critical: 7, warning: 21 } as const;

/**
 * Bars per page. The card's height is fixed, so the set is paged rather than
 * scrolled — a nested scroll would clip the chart's own footer out of the
 * card's `overflow-hidden` frame.
 */
export const RUNWAY_PAGE_SIZE = 10;

/**
 * A plotted row always has a runway, and a runway is exactly what `unknown`
 * lacks — so the band a bar can carry is narrower than the report's verdict.
 */
export type RunwaySeverity = Exclude<ReorderSeverity, "unknown">;

/** One bar: the ranked runway plus everything its tooltip has to explain. */
export interface RunwayRow {
	itemId: string;
	name: string;
	/** Whole days of stock left — the bar's length and its end label. */
	days: number;
	usage: number;
	qty: number;
	unit: string | null;
	severity: RunwaySeverity;
	stockoutDate: string;
	/**
	 * Carried because it's the one reason a `critical` bar can sit to the RIGHT
	 * of the 21d marker: the verdict also fires on a warehouse quantity under
	 * the reorder point, independent of the runway. Without saying so the colour
	 * looks like a bug.
	 */
	belowReorderPoint: boolean;
}

/**
 * A row the filter below has already established every plotting fact for. Declaring
 * it lets `isPlottable` narrow, which is why nothing downstream needs an assertion:
 * `usage` stays a plain `number` on RunwayRow because a row that reached the mapper
 * provably has one, not because a null was asserted away or defaulted to zero.
 */
type PlottableRow = ReorderForecastRow & {
	avgDailyUsage: number;
	daysOfStock: number;
	projectedStockoutDate: string;
	severity: RunwaySeverity;
};

/**
 * Plottable = has a measured rate, a runway, a projected date, an actual band,
 * and lands inside the window. `severity !== "unknown"` is redundant with
 * `daysOfStock != null` server-side but is asserted here so `RunwaySeverity`
 * narrows without a lie.
 *
 * `avgDailyUsage != null` is a THIRD condition, not a rewrite of `> 0`: null means
 * the consumption behind the rate spans a unit change and the server withheld it,
 * which is a different fact from a measured zero. Both end up unplottable — a bar
 * whose length is units/day can't be drawn without a unit — but they're counted
 * apart in offChartBreakdown, and `> 0` alone on a null would coerce to false and
 * bury the distinction.
 */
const isPlottable = (r: ReorderForecastRow): r is PlottableRow =>
	r.daysOfStock != null &&
	r.projectedStockoutDate != null &&
	r.avgDailyUsage != null &&
	r.avgDailyUsage > 0 &&
	r.severity !== "unknown" &&
	Math.round(r.daysOfStock) <= PLOT_WINDOW_DAYS;

const isAtRisk = (r: ReorderForecastRow): boolean =>
	r.severity === "critical" || r.severity === "warning";

/**
 * The chart's rows, worst runway first. Ties break on name so a refetch can't
 * reshuffle two items with the same runway between pages.
 */
export function buildRunwayRows(rows: ReorderForecastRow[]): RunwayRow[] {
	return rows
		.filter(isPlottable)
		.map((r) => ({
			itemId: r.itemId,
			name: r.itemName,
			// Rounded: a runway off a 90-day average rate doesn't carry decimal
			// precision, and the axis is in whole days.
			days: Math.round(r.daysOfStock),
			usage: r.avgDailyUsage,
			qty: r.currentQuantity,
			unit: r.unit,
			severity: r.severity,
			stockoutDate: r.projectedStockoutDate,
			belowReorderPoint: r.belowReorderPoint,
		}))
		.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/**
 * At-risk items the chart can't draw, split by WHY — the reasons need different
 * wording in the footer:
 *  - `mixedUnits`: consumption spans a unit change, so the server withheld the rate.
 *    Counted apart from `noRate` because the two lead somewhere different: "no
 *    measured usage" tells a dispatcher to wait for consumption that has in fact
 *    already happened, when the actual fix is that the item's unit changed
 *    mid-history. Checked FIRST, since a withheld rate also has a null runway and
 *    would otherwise be swallowed by the `noRate` test below.
 *  - `noRate`: no measured usage, so no runway and no projected stockout.
 *  - `beyondWindow`: a runway, but past PLOT_WINDOW_DAYS — a below-reorder-point
 *    item with 45 days of stock is `critical` and would otherwise vanish.
 */
export function offChartBreakdown(rows: ReorderForecastRow[]): {
	mixedUnits: number;
	noRate: number;
	beyondWindow: number;
} {
	let mixedUnits = 0;
	let noRate = 0;
	let beyondWindow = 0;
	for (const r of rows) {
		if (!isAtRisk(r) || isPlottable(r)) continue;
		if (r.consumptionBasis.mixed || r.avgDailyUsage == null) mixedUnits++;
		else if (r.avgDailyUsage <= 0 || r.daysOfStock == null || r.projectedStockoutDate == null)
			noRate++;
		else beyondWindow++;
	}
	return { mixedUnits, noRate, beyondWindow };
}

/**
 * Would the chart say anything at all for these rows — either a bar or an
 * off-chart note? Lets the page skip the block and its reserved height instead
 * of framing a panel whose only content is "nothing to show".
 */
export function hasReorderChartContent(rows: ReorderForecastRow[]): boolean {
	// Nothing plots, but an at-risk item the chart can't place still needs the
	// off-chart callout the empty state renders.
	return rows.some(isPlottable) || rows.some(isAtRisk);
}
