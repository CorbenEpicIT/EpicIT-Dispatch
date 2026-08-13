// Recharts prop objects shared by the History tab's charts. Kept out of
// chartShared.tsx (which exports components) so Fast Refresh isn't broken.

/**
 * Fixed height for the two side-by-side chart cards' collapsed body, so they
 * match without `h-full` stretch. The expanded disclosure panel sits outside
 * it, letting one card grow without affecting its neighbour.
 */
export const CHART_BODY_H = "h-[300px]";

/** Axis tick typography — identical on every axis of every chart on this tab. */
export const CHART_TICK = { fill: "var(--color-chart-axis)", fontSize: 12 } as const;

/** Horizontal-only grid: the shared backdrop behind every plot on this tab. */
export const CHART_GRID = { stroke: "var(--color-border-subtle)", vertical: false } as const;

/**
 * Shared time X-axis config — all three charts plot the same `ts` key over
 * the same domain so they stay aligned. Returned as a plain object (not a
 * component) since Recharts only recognizes axes as direct JSX children.
 */
export const timeXAxis = (xDomain?: [number, number]) =>
	({
		dataKey: "ts",
		type: "number",
		scale: "time",
		domain: xDomain ?? ["dataMin", "dataMax"],
		axisLine: false,
		tickLine: false,
		tick: CHART_TICK,
		minTickGap: 40,
	}) as const;
