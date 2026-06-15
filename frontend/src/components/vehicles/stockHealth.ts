import type { Vehicle, StockHealthStatus } from "../../types/vehicles";

export function getStockCounts(vehicle: Vehicle) {
	const items = vehicle.stock_items ?? [];
	let out = 0;
	let low = 0;
	let ok = 0;
	for (const i of items) {
		const onHand = Number(i.qty_on_hand);
		const min = Number(i.qty_min);
		if (onHand === 0 && min > 0) out++;
		else if (onHand < min) low++;
		else ok++;
	}
	return { out, low, ok, total: items.length };
}

export function getStockHealth(vehicle: Vehicle): StockHealthStatus {
	const { out, low } = getStockCounts(vehicle);
	if (out > 0) return "out";
	if (low > 0) return "low";
	return "ok";
}
