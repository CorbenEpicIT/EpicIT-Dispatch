import { describe, test, expect } from "vitest";
import { Prisma } from "../../../../generated/prisma/client.js";
import { mapInventoryItem } from "../inventory.js";
import type { inventory_item } from "../../../../generated/prisma/client.js";

const dec = (v: string | number) => new Prisma.Decimal(v);

// Minimal row — mapInventoryItem only reads the Decimal/Date fields, everything
// else is spread through, so the rest is filler to satisfy the model type.
const row = (over: Partial<inventory_item> = {}) =>
	({
		id: "item-1",
		organization_id: "org-1",
		name: "Copper Line Set",
		description: "",
		location: "Warehouse",
		quantity: dec("12.50"),
		low_stock_threshold: dec("15.00"),
		unit_price: dec("7.50"),
		cost: dec("3.80"),
		unit: "ft",
		created_at: new Date("2026-08-05T00:00:00.000Z"),
		updated_at: new Date("2026-08-05T00:00:00.000Z"),
		approved_at: null,
		...over,
	}) as unknown as inventory_item;

// Prisma Decimal serializes via JSON.stringify as a string ("12.5", not 12.5);
// client types expect number, so an unconverted field is a silent wire-contract break.
describe("mapInventoryItem", () => {
	test("converts quantity to a number", () => {
		const out = mapInventoryItem(row());
		expect(out.quantity).toBe(12.5);
		expect(typeof out.quantity).toBe("number");
	});

	test("converts low_stock_threshold to a number", () => {
		const out = mapInventoryItem(row());
		expect(out.low_stock_threshold).toBe(15);
		expect(typeof out.low_stock_threshold).toBe("number");
	});

	test("keeps a null low_stock_threshold null rather than coercing it to 0", () => {
		const out = mapInventoryItem(row({ low_stock_threshold: null }));
		expect(out.low_stock_threshold).toBeNull();
	});

	test("survives a JSON round trip with numbers intact", () => {
		const parsed = JSON.parse(JSON.stringify(mapInventoryItem(row())));
		expect(parsed.quantity).toBe(12.5);
		expect(parsed.low_stock_threshold).toBe(15);
		expect(parsed.unit_price).toBe(7.5);
	});

	test("still converts the money fields and dates it already owned", () => {
		const out = mapInventoryItem(row());
		expect(out.unit_price).toBe(7.5);
		expect(out.cost).toBe(3.8);
		expect(out.created_at).toBe("2026-08-05T00:00:00.000Z");
	});
});
