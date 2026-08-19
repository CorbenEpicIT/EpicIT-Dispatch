import { describe, it, expect, vi } from "vitest";
import { reorderSeverity, usageRate } from "../reportsController.js";

// reportsController pulls in the Prisma client at import time; the severity
// bands are pure math and need none of it.
vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = { $extends, $queryRaw: vi.fn() };
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

// The reorder verdict is the one thing three surfaces must agree on (report
// table, priority chart, item health card), so every band gets a case —
// including both routes to `unknown`, which is the band most easily mistaken
// for "healthy".
describe("reorderSeverity", () => {
	const cases: {
		name: string;
		input: Parameters<typeof reorderSeverity>[0];
		expected: ReturnType<typeof reorderSeverity>;
	}[] = [
		{
			name: "below reorder point wins over a comfortable runway",
			input: {
				belowReorderPoint: true,
				daysOfStock: 400,
				lowStockThreshold: 50,
				warehouseQuantity: 40,
			},
			expected: "critical",
		},
		{
			name: "runway inside 7 days is critical",
			input: {
				belowReorderPoint: false,
				daysOfStock: 6.9,
				lowStockThreshold: null,
				warehouseQuantity: 10,
			},
			expected: "critical",
		},
		{
			name: "exactly 7 days of runway is still critical",
			input: {
				belowReorderPoint: false,
				daysOfStock: 7,
				lowStockThreshold: null,
				warehouseQuantity: 10,
			},
			expected: "critical",
		},
		{
			name: "just past 7 days drops to warning",
			input: {
				belowReorderPoint: false,
				daysOfStock: 7.1,
				lowStockThreshold: null,
				warehouseQuantity: 10,
			},
			expected: "warning",
		},
		{
			name: "exactly 21 days of runway is still warning",
			input: {
				belowReorderPoint: false,
				daysOfStock: 21,
				lowStockThreshold: null,
				warehouseQuantity: 10,
			},
			expected: "warning",
		},
		{
			name: "past 21 days is healthy",
			input: {
				belowReorderPoint: false,
				daysOfStock: 21.1,
				lowStockThreshold: null,
				warehouseQuantity: 10,
			},
			expected: "healthy",
		},
		{
			name: "no usage but quantity within 25% of the threshold is a warning",
			input: {
				belowReorderPoint: false,
				daysOfStock: null,
				lowStockThreshold: 40,
				warehouseQuantity: 50, // exactly 1.25x
			},
			expected: "warning",
		},
		{
			name: "unknown: no usage and no threshold to judge against",
			input: {
				belowReorderPoint: false,
				daysOfStock: null,
				lowStockThreshold: null,
				warehouseQuantity: 500,
			},
			expected: "unknown",
		},
		{
			name: "unknown: threshold set, no usage, quantity past the 1.25x band",
			input: {
				belowReorderPoint: false,
				daysOfStock: null,
				lowStockThreshold: 40,
				warehouseQuantity: 51, // one past 1.25x — no evidence either way
			},
			expected: "unknown",
		},
		{
			name: "zero runway is critical, not unknown",
			input: {
				belowReorderPoint: false,
				daysOfStock: 0,
				lowStockThreshold: null,
				warehouseQuantity: 0,
			},
			expected: "critical",
		},
	];

	for (const { name, input, expected } of cases) {
		it(name, () => {
			expect(reorderSeverity(input)).toBe(expected);
		});
	}

	it("judges the near-threshold band on WAREHOUSE quantity, not org-wide on-hand", () => {
		// A van-heavy item can hold plenty org-wide while the warehouse shelf sits
		// at the reorder point. The threshold is a warehouse trigger, so the caller
		// passes warehouse qty here even though daysOfStock is org-wide.
		expect(
			reorderSeverity({
				belowReorderPoint: false,
				daysOfStock: null,
				lowStockThreshold: 40,
				warehouseQuantity: 45,
			}),
		).toBe("warning");
	});
});

// The rate denominator is the defect that made a 10-day-old item burning 3/day
// read as 0.33/day and land in the "healthy" band, so the observed-window logic
// gets its own cases rather than riding along with the severity bands.
describe("usageRate", () => {
	it("divides by the observed span, not the requested window", () => {
		const { avgDailyUsage, observedDays } = usageRate({
			qtyConsumed: 30,
			lookbackDays: 90,
			evidenceAgeDays: 10,
		});
		expect(observedDays).toBe(10);
		expect(avgDailyUsage).toBe(3);
	});

	it("uses the older evidence when consumption predates the item row", () => {
		// Backdated/imported movements against a row created today: anchoring on
		// the row would divide a full window of consumption by one day and report a
		// 90x rate. Callers pass the earlier of the two, so the window applies.
		const { avgDailyUsage, observedDays } = usageRate({
			qtyConsumed: 180,
			lookbackDays: 90,
			evidenceAgeDays: 90,
		});
		expect(observedDays).toBe(90);
		expect(avgDailyUsage).toBe(2);
	});

	it("caps the observed span at the requested window for an older item", () => {
		const { avgDailyUsage, observedDays } = usageRate({
			qtyConsumed: 90,
			lookbackDays: 90,
			evidenceAgeDays: 400,
		});
		expect(observedDays).toBe(90);
		expect(avgDailyUsage).toBe(1);
	});

	it("floors the span at one day so a same-day item can't divide by zero", () => {
		const { avgDailyUsage, observedDays } = usageRate({
			qtyConsumed: 4,
			lookbackDays: 90,
			evidenceAgeDays: 0.25,
		});
		expect(observedDays).toBe(1);
		expect(avgDailyUsage).toBe(4);
		expect(Number.isFinite(avgDailyUsage)).toBe(true);
	});

	it("clamps net-negative consumption to zero rather than a negative rate", () => {
		// Reversal netting can go negative when the reversal is inside the window
		// but the consumption it undoes is older than the cutoff.
		expect(usageRate({ qtyConsumed: -5, lookbackDays: 90, evidenceAgeDays: 90 })).toEqual({
			avgDailyUsage: 0,
			observedDays: 90,
		});
	});

	it("reports zero usage, not a null-ish rate, when nothing was consumed", () => {
		expect(
			usageRate({ qtyConsumed: 0, lookbackDays: 90, evidenceAgeDays: 45 }).avgDailyUsage,
		).toBe(0);
	});
});
