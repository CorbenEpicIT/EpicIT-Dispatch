import type { ReactNode } from "react";
import { Boxes, DollarSign, Tag, Repeat } from "lucide-react";
import type { InventoryItem } from "../../../types/inventory";
import {
	formatCurrency,
	getItemStockStatus,
	getStatusLabel,
	getStatusBadgeClass,
} from "../../../util/util";
import { unitLabel } from "../../../lib/units";

function Tile({
	icon,
	label,
	value,
	sub,
}: {
	icon: ReactNode;
	label: string;
	value: ReactNode;
	sub?: ReactNode;
}) {
	return (
		<div className="flex-1 min-w-[140px] bg-base border border-border-subtle rounded-lg px-4 py-3">
			<div className="flex items-center gap-1.5 text-text-muted">
				{icon}
				<span className="text-[10px] font-semibold uppercase tracking-wider">
					{label}
				</span>
			</div>
			<div className="mt-1 text-xl font-bold tabular-nums text-text-primary leading-tight">
				{value}
			</div>
			{sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
		</div>
	);
}

// Headline KPIs for the item product page. Cost-derived values collapse to
// "—" when the item has no cost/price set. Deeper cost analytics live in
// CostPricingCard; tracking rollups live in the Serials & Batches block.
//
// The first tile says "In Warehouse", not "On Hand": `item.quantity` counts
// warehouse stock only, matching the reorder-threshold badge beside it.
// Org-wide (warehouse + vehicle) readings live on StockPlacementCard and
// ReorderHealthCard instead.
export default function ItemStatRow({ item }: { item: InventoryItem }) {
	const status = getItemStockStatus(item);
	const valueAtCost = item.cost != null ? item.cost * item.quantity : null;
	const retailValue = item.unit_price != null ? item.unit_price * item.quantity : null;
	const timesUsed = item._count?.visit_line_items ?? 0;

	return (
		<div className="flex flex-wrap gap-3">
			<Tile
				icon={<Boxes size={13} />}
				label="In Warehouse"
				value={
					<span>
						{item.quantity}
						{/* Number and unit are styled separately, so this takes
						    unitLabel rather than formatQty — the tile's type
						    hierarchy is the point. */}
						<span className="ml-1 text-sm font-medium text-text-muted">
							{unitLabel(item.unit, item.quantity)}
						</span>
					</span>
				}
				sub={
					<span
						className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeClass(status)}`}
					>
						{getStatusLabel(status)}
					</span>
				}
			/>
			<Tile
				icon={<DollarSign size={13} />}
				label="Value on Hand"
				value={valueAtCost != null ? formatCurrency(valueAtCost) : "—"}
				sub={
					item.cost != null
						? `@ ${formatCurrency(item.cost)} cost`
						: "No cost set"
				}
			/>
			<Tile
				icon={<Tag size={13} />}
				label="Retail Value"
				value={retailValue != null ? formatCurrency(retailValue) : "—"}
				sub={
					item.unit_price != null
						? `@ ${formatCurrency(item.unit_price)} price`
						: "No price set"
				}
			/>
			<Tile
				icon={<Repeat size={13} />}
				label="Times Used"
				value={timesUsed}
				sub={timesUsed === 1 ? "job visit line" : "job visit lines"}
			/>
		</div>
	);
}
