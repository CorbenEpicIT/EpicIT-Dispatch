import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import type { InventoryItem } from "../../../types/inventory";
import { formatCurrency } from "../../../util/util";
import Card from "../../ui/Card";

function Metric({
	label,
	value,
	tone,
	hint,
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative";
	hint?: string;
}) {
	const valueColor =
		tone === "positive"
			? "text-success-text"
			: tone === "negative"
				? "text-error-text"
				: "text-text-primary";
	return (
		<div>
			<div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
				{label}
			</div>
			<div
				className={`mt-0.5 text-lg font-bold tabular-nums leading-tight ${valueColor}`}
			>
				{value}
			</div>
			{hint && <div className="text-[11px] text-text-muted mt-0.5">{hint}</div>}
		</div>
	);
}

// Cost & pricing SNAPSHOT for the item product page. Margin figures use
// current cost/price only — a point-in-time reading, not a realized-COGS
// ledger.
//
// The quantity-scaled figures multiply `item.quantity`, which is WAREHOUSE
// stock only — vehicle stock isn't included, so their hints name the basis.
//
// History lives elsewhere on purpose: CostPriceTrendChart (History tab) plots
// cost/price over time, including what was actually paid/charged.
// `onViewHistory` is the way there.
export default function CostPricingCard({
	item,
	onViewHistory,
}: {
	item: InventoryItem;
	// Jumps to the History tab, where these same numbers are charted over time.
	// Optional so the card stays usable anywhere there's no tab to switch to.
	onViewHistory?: () => void;
}) {
	// Coerced ONCE: Decimal columns arrive as strings on some paths, and
	// `"0" !== 0` let a zero price through to the division below as
	// "-Infinity% margin". Every figure after this line is arithmetic on numbers.
	const cost = item.cost != null ? Number(item.cost) : null;
	const price = item.unit_price != null ? Number(item.unit_price) : null;
	const quantity = Number(item.quantity);
	const hasBoth = cost != null && price != null;
	const unitMargin = hasBoth ? price - cost : null;
	const marginPct = hasBoth && price !== 0 ? (unitMargin! / price) * 100 : null;

	const valueAtCost = cost != null ? cost * quantity : null;
	const retailValue = price != null ? price * quantity : null;
	const totalMargin = hasBoth ? unitMargin! * quantity : null;

	const marginTone: "positive" | "negative" | undefined =
		unitMargin == null ? undefined : unitMargin >= 0 ? "positive" : "negative";
	const MarginIcon = unitMargin == null ? Minus : unitMargin >= 0 ? TrendingUp : TrendingDown;

	return (
		<Card
			title="Cost & Pricing"
			headerAction={
				<div className="flex items-center gap-3">
					<span
						className={`inline-flex items-center gap-1 text-xs font-semibold ${
							marginTone === "positive"
								? "text-success-text"
								: marginTone === "negative"
									? "text-error-text"
									: "text-text-muted"
						}`}
					>
						<MarginIcon size={13} />
						{marginPct != null
							? `${marginPct.toFixed(1)}% margin`
							: "Margin n/a"}
					</span>
					{onViewHistory && (
						<button
							type="button"
							onClick={onViewHistory}
							className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
						>
							History
							<ArrowRight size={12} />
						</button>
					)}
				</div>
			}
		>
			<div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
				<Metric
					label="Purchase Cost"
					value={cost != null ? formatCurrency(cost) : "—"}
					hint="per unit"
				/>
				<Metric
					label="Customer Price"
					value={price != null ? formatCurrency(price) : "—"}
					hint="per unit"
				/>
				<Metric
					label="Unit Margin"
					value={
						unitMargin != null
							? formatCurrency(unitMargin)
							: "—"
					}
					tone={marginTone}
					hint={
						marginPct != null
							? `${marginPct.toFixed(1)}%`
							: undefined
					}
				/>
				<Metric
					label="Value on Hand (Cost)"
					value={
						valueAtCost != null
							? formatCurrency(valueAtCost)
							: "—"
					}
					hint={`${quantity} warehouse × cost`}
				/>
				<Metric
					label="Retail Value"
					value={
						retailValue != null
							? formatCurrency(retailValue)
							: "—"
					}
					hint={`${quantity} warehouse × price`}
				/>
				<Metric
					label="Potential Margin"
					value={
						totalMargin != null
							? formatCurrency(totalMargin)
							: "—"
					}
					tone={marginTone}
					hint="warehouse total"
				/>
			</div>

			{!hasBoth && (
				<p className="mt-4 text-xs text-text-faint">
					Set both a purchase cost and a customer price to see margin
					analytics.
				</p>
			)}
		</Card>
	);
}
