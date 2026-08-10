import { describe, test, expect } from "vitest";
import {
	adjustStockSchema,
	createInventoryItemSchema,
	updateInventoryItemSchema,
	updateThresholdSchema,
} from "../inventory.js";
import { receiveInventorySchema } from "../inventoryTracking.js";

// A minimally valid create body. Quantity/threshold are overridden per test;
// everything else is either required (name, location) or defaulted by the schema.
function createBody(over: Record<string, unknown> = {}) {
	return { name: "Line set", location: "Aisle 3", ...over };
}

describe("fractional stock quantities", () => {
	test("create accepts a fractional quantity for a measured unit", () => {
		const parsed = createInventoryItemSchema.parse(createBody({ quantity: 12.5, unit: "ft" }));
		expect(parsed.quantity).toBe(12.5);
	});

	test("create rejects a quantity with more than two decimal places", () => {
		const result = createInventoryItemSchema.safeParse(createBody({ quantity: 0.005 }));
		expect(result.success).toBe(false);
	});

	test("create rejects a quantity beyond what numeric(10,2) can hold", () => {
		const result = createInventoryItemSchema.safeParse(createBody({ quantity: 100_000_000 }));
		expect(result.success).toBe(false);
	});

	test("create still rejects a negative quantity", () => {
		const result = createInventoryItemSchema.safeParse(createBody({ quantity: -1 }));
		expect(result.success).toBe(false);
	});

	test("create accepts a fractional low_stock_threshold", () => {
		const parsed = createInventoryItemSchema.parse(createBody({ low_stock_threshold: 2.5 }));
		expect(parsed.low_stock_threshold).toBe(2.5);
	});

	test("create rejects a low_stock_threshold with more than two decimal places", () => {
		const result = createInventoryItemSchema.safeParse(createBody({ low_stock_threshold: 2.555 }));
		expect(result.success).toBe(false);
	});

	test("update accepts a fractional low_stock_threshold", () => {
		const parsed = updateInventoryItemSchema.parse({ low_stock_threshold: 0.5 });
		expect(parsed.low_stock_threshold).toBe(0.5);
	});

	test("threshold-only endpoint accepts a fractional threshold", () => {
		const parsed = updateThresholdSchema.parse({ low_stock_threshold: 7.25 });
		expect(parsed.low_stock_threshold).toBe(7.25);
	});

	test("threshold-only endpoint rejects more than two decimal places", () => {
		const result = updateThresholdSchema.safeParse({ low_stock_threshold: 7.255 });
		expect(result.success).toBe(false);
	});
});

describe("fractional stock adjustments", () => {
	test("accepts a fractional negative delta", () => {
		const parsed = adjustStockSchema.parse({ delta: -0.5 });
		expect(parsed.delta).toBe(-0.5);
	});

	test("accepts a fractional positive delta", () => {
		const parsed = adjustStockSchema.parse({ delta: 2.25 });
		expect(parsed.delta).toBe(2.25);
	});

	test("rejects a delta with more than two decimal places", () => {
		const result = adjustStockSchema.safeParse({ delta: 1.005 });
		expect(result.success).toBe(false);
	});

	test("still rejects a zero delta", () => {
		const result = adjustStockSchema.safeParse({ delta: 0 });
		expect(result.success).toBe(false);
	});

	test("rejects a batch pick qty with more than two decimal places", () => {
		const result = adjustStockSchema.safeParse({
			delta: -1,
			batch_picks: [{ batch_id: "11111111-1111-4111-8111-111111111111", qty: 0.333 }],
		});
		expect(result.success).toBe(false);
	});
});

describe("receive quantity precision", () => {
	// Guards numeric(10,2) rounding from desyncing cached on-hand from its movement.
	test("accepts a fractional qty", () => {
		const parsed = receiveInventorySchema.parse({ qty: 2.5 });
		expect(parsed.qty).toBe(2.5);
	});

	test("rejects a qty with more than two decimal places", () => {
		const result = receiveInventorySchema.safeParse({ qty: 2.555 });
		expect(result.success).toBe(false);
	});

	test("rejects a qty beyond what numeric(10,2) can hold", () => {
		const result = receiveInventorySchema.safeParse({ qty: 100_000_000 });
		expect(result.success).toBe(false);
	});
});

describe("tracked-item quantity guards (regression — must survive the Int→Decimal change)", () => {
	// These already hold today. They are asserted here because relaxing the
	// integer constraint on quantity/delta is exactly what could break them:
	// a serial unit is one indivisible physical item.
	test("create still rejects a serialized item with opening stock", () => {
		const result = createInventoryItemSchema.safeParse(
			createBody({ is_serialized: true, quantity: 1 }),
		);
		expect(result.success).toBe(false);
	});

	test("create still rejects a batch-tracked item with opening stock", () => {
		const result = createInventoryItemSchema.safeParse(
			createBody({ is_batch_tracked: true, quantity: 2.5 }),
		);
		expect(result.success).toBe(false);
	});
});
