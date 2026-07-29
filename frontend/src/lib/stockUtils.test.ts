import { describe, it, expect } from "vitest";
import { getStockHealth, resolveItemName, formatRestockDate } from "./stockUtils";
import type { VehicleStockItem } from "../types/vehicles";

function makeItem(overrides: Partial<VehicleStockItem> = {}): VehicleStockItem {
	return {
		id: "stock-1",
		vehicle_id: "vehicle-1",
		inventory_item_id: "inv-1",
		qty_on_hand: 5,
		qty_min: 2,
		qty_standard: null,
		updated_at: new Date().toISOString(),
		created_at: new Date().toISOString(),
		inventory_item: {
			id: "inv-1",
			name: "Filter",
			unit: "each",
			quantity: 10,
			sku: null,
			unit_price: null,
			cost: null,
			category: null,
			is_active: true,
			low_stock_threshold: null,
		},
		...overrides,
	} as VehicleStockItem;
}

describe("getStockHealth", () => {
	it('returns "ok" when qty_on_hand >= qty_min', () => {
		expect(getStockHealth(makeItem({ qty_on_hand: 5, qty_min: 2 }))).toBe("ok");
	});

	it('returns "ok" when qty_on_hand equals qty_min', () => {
		expect(getStockHealth(makeItem({ qty_on_hand: 2, qty_min: 2 }))).toBe("ok");
	});

	it('returns "low" when qty_on_hand > 0 but below qty_min', () => {
		expect(getStockHealth(makeItem({ qty_on_hand: 1, qty_min: 2 }))).toBe("low");
	});

	it('returns "out" when qty_on_hand is 0 and qty_min > 0', () => {
		expect(getStockHealth(makeItem({ qty_on_hand: 0, qty_min: 1 }))).toBe("out");
	});

	it('returns "ok" when qty_on_hand is 0 and qty_min is also 0', () => {
		expect(getStockHealth(makeItem({ qty_on_hand: 0, qty_min: 0 }))).toBe("ok");
	});
});

describe("resolveItemName", () => {
	it("returns item name when stock item is found", () => {
		const items = [makeItem({ id: "stock-1" })];
		expect(resolveItemName("stock-1", items)).toBe("Filter");
	});

	it("returns the stockItemId as fallback when not found", () => {
		expect(resolveItemName("missing-id", [])).toBe("missing-id");
	});
});

describe("formatRestockDate", () => {
	it("returns a non-empty string for a valid ISO date", () => {
		const result = formatRestockDate("2026-06-29T14:30:00.000Z");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("includes the year", () => {
		const result = formatRestockDate("2026-06-29T14:30:00.000Z");
		expect(result).toContain("2026");
	});
});
