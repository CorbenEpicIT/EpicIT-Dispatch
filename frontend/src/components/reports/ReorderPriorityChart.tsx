import { useMemo, useState } from "react";
import {
	BarChart,
	Bar,
	Cell,
	LabelList,
	XAxis,
	YAxis,
	CartesianGrid,
	ReferenceLine,
	Tooltip,
	ResponsiveContainer,
	Text,
	type YAxisTickContentProps,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card";
import type { ReorderForecastRow } from "../../types/reports";
import { REORDER_FORECAST_WINDOW_DAYS } from "../../types/reports";
import { unitLabel } from "../../lib/units";
import {
	buildRunwayRows,
	offChartBreakdown,
	PLOT_WINDOW_DAYS,
	REORDER_BAND_DAYS,
	RUNWAY_PAGE_SIZE,
	type RunwayRow,
	type RunwaySeverity,
} from "../../lib/reorderChart";

interface ReorderPriorityChartProps {
	data: ReorderForecastRow[];
}

/** The page datum: a ranked row plus the string its bar-end label renders. */
type RunwayDatum = RunwayRow & { daysLabel: string };

// Guide lines at the shared band days, so these marks and the item detail card's
// runway meter can never disagree about where a band starts.
const BAND_LINES = [REORDER_BAND_DAYS.critical, REORDER_BAND_DAYS.warning].map((days) => ({
	days,
	label: `${days}d`,
}));

// Severity comes from the server-computed field, not a local day cutoff, so this
// chart can't disagree with the item detail page. `unknown` has no bar by type.
const SEVERITY_FILL: Record<RunwaySeverity, string> = {
	critical: "var(--color-chart-error)",
	warning: "var(--color-chart-warning)",
	healthy: "var(--color-chart-success)",
};

const SEVERITY_LABEL: Record<RunwaySeverity, string> = {
	critical: "Reorder now",
	warning: "Watch",
	healthy: "Healthy",
};

const SEVERITY_TEXT: Record<RunwaySeverity, string> = {
	critical: "text-error-text",
	warning: "text-warning-text",
	healthy: "text-success-text",
};

const LEGEND: RunwaySeverity[] = ["critical", "warning", "healthy"];

// Fixed-width so long names can't squeeze the bars; the tooltip carries the
// untruncated name.
const NAME_AXIS_WIDTH = 150;
// Wrapping stops short of the axis edge so a name never touches the plot.
const NAME_WRAP_WIDTH = NAME_AXIS_WIDTH - 8;
const NAME_MAX_LINES = 2;
// fontSize must be in `style`, not just the SVG attribute: recharts measures wraps
// via a hidden span styled from `style` alone, so attribute-only size wraps early.
const NAME_TICK_STYLE = { fontSize: 11 } as const;

/**
 * Category tick using recharts' Text, wrapping/truncating at measured width
 * rather than character count so both lines fill.
 *
 * Props are read individually, never spread — the axis's own `width` (150)
 * would otherwise override the wrap width above.
 */
function renderNameTick({ x, y, payload, textAnchor, verticalAnchor }: YAxisTickContentProps) {
	return (
		<Text
			x={x}
			y={y}
			textAnchor={textAnchor}
			verticalAnchor={verticalAnchor}
			width={NAME_WRAP_WIDTH}
			maxLines={NAME_MAX_LINES}
			style={NAME_TICK_STYLE}
			fontSize={NAME_TICK_STYLE.fontSize}
			fill="var(--color-chart-axis)"
		>
			{String(payload?.value ?? "")}
		</Text>
	);
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: RunwayDatum }[];
}) {
	if (!active || !payload?.length) return null;
	const d = payload[0].payload;
	if (!d?.name) return null;

	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-sm font-semibold text-text-primary">{d.name}</p>
			<p className={`text-xs font-medium ${SEVERITY_TEXT[d.severity]}`}>
				{SEVERITY_LABEL[d.severity]}
			</p>
			{/* "Est. out ~" not "Out by": this is on-hand ÷ average burn, not a date
			    anything is scheduled for. */}
			<p className="mt-1 text-sm font-semibold text-primary">
				Est. out ~{format(new Date(d.stockoutDate), "MMM d, yyyy")}
			</p>
			<p className="text-xs text-text-tertiary">
				{fmtQty(d.qty)} {unitLabel(d.unit, d.qty)} on hand (org-wide) ·{" "}
				{d.usage.toFixed(2)}/day
			</p>
			{/* Explains a red bar right of the 21d marker: severity also fires below
			    the warehouse reorder point, independent of runway. */}
			{d.belowReorderPoint && (
				<p className="mt-1 text-xs text-error-text">Below reorder point</p>
			)}
		</div>
	);
}

export default function ReorderPriorityChart({ data }: ReorderPriorityChartProps) {
	const navigate = useNavigate();

	const rows = useMemo(() => buildRunwayRows(data), [data]);
	// Plotting needs a usage rate + runway inside the window; the verdict doesn't.
	// Anything flagged but undrawable is named in the footer instead.
	const offChart = useMemo(() => offChartBreakdown(data), [data]);

	const [page, setPage] = useState(0);
	// Clamped on read rather than reset in an effect: a refetch that shrinks the
	// set must not leave the card on a blank page.
	const maxPage = Math.max(0, Math.ceil(rows.length / RUNWAY_PAGE_SIZE) - 1);
	const safePage = Math.min(page, maxPage);
	const start = safePage * RUNWAY_PAGE_SIZE;

	const pageData: RunwayDatum[] = useMemo(
		() =>
			rows
				.slice(start, start + RUNWAY_PAGE_SIZE)
				.map((r) => ({ ...r, daysLabel: `${r.days}d` })),
		[rows, start],
	);

	const offChartNote = [
		// Separate from "no usage rate": these were consumed but the tracked unit
		// changed mid-window, so the server withholds a rate rather than mixing units.
		offChart.mixedUnits > 0 &&
			`+${offChart.mixedUnits} need attention but span a unit change, so no rate can be measured`,
		offChart.noRate > 0 && `+${offChart.noRate} need attention with no usage rate`,
		offChart.beyondWindow > 0 &&
			`+${offChart.beyondWindow} below reorder point with more than ${PLOT_WINDOW_DAYS} days of stock`,
	]
		.filter(Boolean)
		.join(" · ");

	const showPager = rows.length > RUNWAY_PAGE_SIZE;

	return (
		<Card
			className="h-full"
			title="Reorder Priority"
			headerAction={
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						{LEGEND.map((severity) => (
							<span
								key={severity}
								className="inline-flex items-center gap-1 text-xs text-text-tertiary"
							>
								<span
									className="w-2 h-2 rounded-full"
									style={{ background: SEVERITY_FILL[severity] }}
								/>
								{SEVERITY_LABEL[severity]}
							</span>
						))}
					</div>
					{/* Legend describes exactly what's plotted — "N need attention" would be
					    wrong since healthy items inside the window are shown too. */}
					{showPager && (
						<div className="flex items-center gap-1">
							<button
								type="button"
								aria-label="Previous items"
								disabled={safePage === 0}
								onClick={() => setPage(safePage - 1)}
								className="p-0.5 rounded text-text-muted transition-colors hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted"
							>
								<ChevronLeft size={14} />
							</button>
							<span className="text-xs text-text-tertiary tabular-nums">
								{start + 1}–{start + pageData.length} of {rows.length}
							</span>
							<button
								type="button"
								aria-label="Next items"
								disabled={safePage >= maxPage}
								onClick={() => setPage(safePage + 1)}
								className="p-0.5 rounded text-text-muted transition-colors hover:text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted"
							>
								<ChevronRight size={14} />
							</button>
						</div>
					)}
				</div>
			}
		>
			{/* Column layout so the footer keeps its own band instead of being pushed
			    outside the card by a height:100% chart. */}
			<div className="flex-1 min-h-0 flex flex-col">
				{pageData.length === 0 ? (
					<div className="flex-1 min-h-0 flex items-center justify-center">
						<p className="text-sm text-text-muted">
							No items projected to stock out within {PLOT_WINDOW_DAYS} days
						</p>
					</div>
				) : (
					<div className="flex-1 min-h-0 cursor-pointer">
						<ResponsiveContainer width="100%" height="100%" minWidth={0}>
							<BarChart
								data={pageData}
								layout="vertical"
								// 20px top margin (not 8) so the 7d/21d marker labels don't
								// clip above the plot.
								margin={{ top: 20, right: 44, bottom: 24, left: 8 }}
								// Click anywhere in the row band, not just on a 14px
								// bar — the same drill-through the table rows have.
								onClick={(state: unknown) => {
									const id = (
										state as {
											activePayload?: { payload?: RunwayDatum }[];
										}
									)?.activePayload?.[0]?.payload?.itemId;
									if (id)
										navigate(
											`/dispatch/inventory/items/${id}?tab=history`,
										);
								}}
							>
								<CartesianGrid
									horizontal={false}
									stroke="var(--color-border-subtle)"
								/>
								{/* Fixed 0–window domain so bar length means the same thing on
								    every page and the 21d marker can't clip out of an auto-fit domain. */}
								<XAxis
									type="number"
									domain={[0, PLOT_WINDOW_DAYS]}
									ticks={[0, 7, 14, 21, PLOT_WINDOW_DAYS]}
									axisLine={false}
									tickLine={false}
									tick={{ fill: "var(--color-chart-axis)", fontSize: 11 }}
									tickFormatter={(v: number) => `${v}d`}
									label={{
										value: "Days of stock",
										position: "insideBottom",
										offset: -14,
										fill: "var(--color-chart-axis)",
										fontSize: 11,
									}}
								/>
								<YAxis
									type="category"
									dataKey="name"
									axisLine={false}
									tickLine={false}
									tick={renderNameTick}
									width={NAME_AXIS_WIDTH}
								/>
								{BAND_LINES.map((b) => (
									<ReferenceLine
										key={b.days}
										x={b.days}
										stroke="var(--color-border)"
										strokeDasharray="4 4"
										label={{
											value: b.label,
											position: "top",
											fill: "var(--color-chart-axis)",
											fontSize: 11,
										}}
									/>
								))}
								<Tooltip
									content={<CustomTooltip />}
									// Row-band highlight: the hit target is the whole
									// row, not the bar's 14px.
									cursor={{
										fill: "var(--color-surface-raised)",
										fillOpacity: 0.35,
									}}
								/>
								{/* Disabled: recharts' default 1500ms bar grow is far past
								    the ≤200ms the rest of the UI moves in. */}
								<Bar
									dataKey="days"
									radius={[0, 4, 4, 0]}
									maxBarSize={14}
									isAnimationActive={false}
								>
									{pageData.map((d) => (
										<Cell
											key={d.itemId}
											fill={SEVERITY_FILL[d.severity]}
										/>
									))}
									{/* The runway is readable without hovering — a
									    tooltip is never the only path to a value. */}
									<LabelList
										dataKey="daysLabel"
										position="right"
										fill="var(--color-chart-axis)"
										fontSize={11}
									/>
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>
				)}

				<div className="shrink-0 mt-1 pt-3 border-t border-border-subtle space-y-0.5">
					<p className="text-[11px] text-text-faint">
						Days of stock = org-wide on hand ÷ avg daily use over the last{" "}
						{REORDER_FORECAST_WINDOW_DAYS} days.
					</p>
					{offChartNote && (
						<p className="text-xs text-warning-text">
							{offChartNote} — listed in the table below
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}
