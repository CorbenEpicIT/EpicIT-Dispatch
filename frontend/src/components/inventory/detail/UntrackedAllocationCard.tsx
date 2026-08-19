import { useItemForecastQuery } from "../../../hooks/useInventory";
import type { InventoryItem } from "../../../types/inventory";
import Card from "../../ui/Card";
import PlacementSummaryBody from "./PlacementSummaryBody";

// The Tracking tab's answer to "where is this stock" for an item that isn't
// serialized or batch-tracked — full-width twin of StockPlacementCard's
// untracked branch (same PlacementSummaryBody, same numbers, same
// per-vehicle drill-in), sized for this tab's own width instead of the
// Overview rail's. `archived` is always false here: an item with archived
// serial/lot history takes the tracked-history branch on this tab instead
// (see InventoryItemDetailPage), so this component never needs that case.
export default function UntrackedAllocationCard({ item }: { item: InventoryItem }) {
	const { data: forecastResult, isLoading } = useItemForecastQuery(item.id);

	if (isLoading) {
		return (
			<Card title="Quantity Tracking">
				<div className="h-10 animate-pulse rounded bg-surface-raised" />
			</Card>
		);
	}

	const forecast = forecastResult?.forecast;
	return (
		<Card title="Quantity Tracking">
			<PlacementSummaryBody
				itemId={item.id}
				unit={forecast?.unit ?? item.unit}
				warehouseQuantity={forecast?.warehouseQuantity ?? item.quantity}
				vehicleQuantity={forecast?.vehicleQuantity ?? null}
				totalQuantity={forecast?.currentQuantity ?? item.quantity}
				forecastReason={forecastResult?.reason}
				archived={false}
				archivedUnits={0}
				archivedLots={0}
			/>
		</Card>
	);
}
