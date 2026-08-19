import { AlertTriangle, ChevronRight } from "lucide-react";
import { useItemForecastQuery } from "../../../hooks/useInventory";
import type { ReorderSeverity } from "../../../types/reports";
import { formatDate } from "../../../util/util";
import { unitLabel } from "../../../lib/units";
import { unitBreakShort } from "./chartNotes";

// The rail's reorder read: one verdict strip, not a card. Deliberately not the
// History tab's ReorderHealthCard — that one carries a quantity-scaled track, a
// reorder-point marker and its own empty states, all of which need the full
// column width.
//
// It dropped its Card wrapper because the wrapper cost more than the content: a
// title row plus body padding was ~89px of chrome around ~60px of text, and the
// title ("Reorder health") sat directly above a line that already said
// "Reorder now". The verdict word is the label. What the header row paid for is
// spent instead on the projected stockout date and the measured window, neither of
// which this showed before — smaller, and saying more.
//
// The whole strip is ONE control (a screen reader gets one name and one action), so
// the old footer link is gone too. Blue is this product's interaction colour, so it
// is NOT used here: severity owns the colour, and the affordance shows up as a
// border/background shift on hover and focus.
//
// `severity` is computed server-side and shared with the org-wide report so the
// two surfaces can't disagree about the same item. These maps are presentation
// only; nothing here re-derives the band.

const SEVERITY_DOT: Record<ReorderSeverity, string> = {
	critical: "bg-error",
	warning: "bg-warning",
	healthy: "bg-success",
	unknown: "bg-text-tertiary",
};

const SEVERITY_TEXT: Record<ReorderSeverity, string> = {
	critical: "text-error-text",
	warning: "text-warning-text",
	healthy: "text-success-text",
	unknown: "text-text-tertiary",
};

// Wording shared with the org-wide reorder report — the same band has to be called
// the same thing on both surfaces.
const SEVERITY_LABEL: Record<ReorderSeverity, string> = {
	critical: "Reorder now",
	warning: "Reorder soon",
	healthy: "Stocked",
	unknown: "No signal",
};

// `rounded-xl` and `border-border-subtle` are Card's own values (components/ui/
// Card.tsx) — this strip sits in the same rail as one, and a second radius in the
// same column is the kind of detail that reads as unfinished.
const SHELL = "rounded-xl border border-border-subtle bg-base px-3.5 py-3";

const STRIP = `group flex w-full items-center gap-3 text-left transition-colors hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${SHELL}`;

// A slow mover can carry four figures of runway. "1+ yr" is the honest read of a
// number that precise-looking; a dispatcher acts on the band, not on day 1,412.
//
// A null runway has TWO causes and they are not interchangeable: nothing was
// consumed (no rate to divide by), or consumption spans a unit change (a rate
// exists in the ledger but has no single denomination, so the server withholds it).
// "No runway yet" claims the first, and saying it about the second sends a
// dispatcher looking for usage that is already there.
function runwayLabel(daysOfStock: number | null, mixedUnits: boolean): string {
	if (daysOfStock == null) return mixedUnits ? "Runway unavailable" : "No runway yet";
	const days = Math.round(daysOfStock);
	if (days > 365) return "1+ yr left";
	return `${days} ${days === 1 ? "day" : "days"} left`;
}

export default function ReorderHealthMini({
	itemId,
	onViewHistory,
}: {
	itemId: string;
	onViewHistory: () => void;
}) {
	const { data, isLoading, isError, refetch } = useItemForecastQuery(itemId);

	// Line-for-line the geometry of the loaded strip, so the cards below it in the
	// rail don't jump when the forecast lands.
	if (isLoading) {
		return (
			<div className={SHELL}>
				<div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
				<div className="mt-1.5 flex items-center justify-between gap-2">
					<div className="h-4 w-20 animate-pulse rounded bg-surface-raised" />
					<div className="h-3 w-16 animate-pulse rounded bg-surface-raised" />
				</div>
				<div className="mt-1 h-3 w-32 animate-pulse rounded bg-surface-raised" />
			</div>
		);
	}

	// A failed read is neither "not forecast" nor "no signal" — both of those are
	// claims about the item. Same strip geometry, with a way back.
	if (isError) {
		return (
			<div className={SHELL}>
				<div className="flex items-center gap-2">
					<AlertTriangle size={12} className="shrink-0 text-text-tertiary" />
					<span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
						Reorder health unavailable
					</span>
				</div>
				<p className="mt-1.5 text-[11px] leading-relaxed text-text-faint">
					Couldn't load the forecast.{" "}
					<button
						type="button"
						onClick={() => refetch()}
						className="font-medium text-primary hover:underline"
					>
						Retry
					</button>
				</p>
			</div>
		);
	}

	const forecast = data?.forecast;

	// Two unrelated causes for a null forecast, and naming the wrong one is worse
	// than saying nothing: `inactive` means forecasting was skipped on purpose,
	// `no_forecast_row` means the item is live but has nothing to project from.
	// Kept in the strip's own shape rather than a differently-sized empty card, and
	// kept inert — there's no forecast to go and read.
	if (!forecast) {
		return (
			<div className={SHELL}>
				<div className="flex items-center gap-2">
					<span className="h-2 w-2 shrink-0 rounded-full bg-text-tertiary" />
					<span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
						{data?.reason === "inactive"
							? "Not forecast"
							: "No signal yet"}
					</span>
				</div>
				<p className="mt-1.5 text-[11px] leading-relaxed text-text-faint">
					{data?.reason === "inactive"
						? "Reorder forecasting only runs for active items."
						: "No recorded usage to project a runway from."}
				</p>
			</div>
		);
	}

	const {
		severity,
		daysOfStock,
		avgDailyUsage,
		observedDays,
		projectedStockoutDate,
		unit,
		consumptionBasis,
	} = forecast;
	const mixedUnits = unitBreakShort(consumptionBasis);
	const runway = runwayLabel(daysOfStock, !!mixedUnits);

	return (
		<button
			type="button"
			onClick={onViewHistory}
			className={STRIP}
		>
			{/* Content and chevron are SIBLINGS, not a chevron floated into the
			    first line: the arrow points at the whole strip, so it centers
			    against all three lines rather than aligning to the verdict. */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span
						className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`}
					/>
					<span
						className={`text-[11px] font-semibold uppercase tracking-wider ${SEVERITY_TEXT[severity]}`}
					>
						{SEVERITY_LABEL[severity]}
					</span>
				</div>

				{/* Runway left, stockout date right, on one baseline. Splitting
				    them across the strip's width gives the block a right edge to
				    align to and keeps either value from wrapping the line. */}
				<div className="mt-1.5 flex items-baseline justify-between gap-2">
					<span className="whitespace-nowrap text-sm font-semibold tabular-nums text-text-primary">
						{runway}
					</span>
					{projectedStockoutDate && (
						<span className="whitespace-nowrap text-[11px] tabular-nums text-text-muted">
							out ~{formatDate(projectedStockoutDate)}
						</span>
					)}
				</div>

				{/* Never `~0.00 each/day` on a withheld rate: this line is the only
				    place the strip states a number, and printing a zero here would
				    read as a measured idle item. */}
				<div className="mt-1 truncate text-[11px] text-text-faint">
					{mixedUnits
						? `${mixedUnits} — no daily rate`
						: avgDailyUsage != null && avgDailyUsage > 0
							? // Naming the measured span matters: a rate off 6 days of
								// history is not the 90-day average the band implies.
								`~${avgDailyUsage.toFixed(2)} ${unitLabel(unit, avgDailyUsage)}/day over ${Math.round(observedDays)}d`
							: "No measured usage in the last 90 days"}
				</div>
			</div>

			<ChevronRight
				size={16}
				className="shrink-0 text-text-faint transition-all group-hover:translate-x-0.5 group-hover:text-text-secondary"
			/>
		</button>
	);
}
