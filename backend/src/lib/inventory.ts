export type StockStatus = "sufficient" | "low" | "out_of_stock" | null;

export function getStockStatus(quantity: number, threshold: number | null): StockStatus {
	if (threshold === null) return null;
	if (quantity === 0) return "out_of_stock";
	if (quantity < threshold) return "low";
	return "sufficient";
}

export function withStockStatus<T extends { quantity: number; low_stock_threshold: number | null }>(
	item: T,
): T & { stock_status: StockStatus } {
	return {
		...item,
		stock_status: getStockStatus(item.quantity, item.low_stock_threshold),
	};
}
