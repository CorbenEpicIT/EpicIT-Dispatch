import { describe, it, expect } from "vitest";
import {
	normalizedMonthly,
	periodsPerMonth,
	planPerPeriodAmount,
} from "../recurringRevenue.js";

describe("periodsPerMonth", () => {
	it("maps each cadence to its share of an average month", () => {
		expect(periodsPerMonth("weekly")).toBeCloseTo(52 / 12, 10);
		expect(periodsPerMonth("biweekly")).toBeCloseTo(26 / 12, 10);
		expect(periodsPerMonth("monthly")).toBe(1);
		expect(periodsPerMonth("quarterly")).toBeCloseTo(1 / 3, 10);
	});

	it("treats on_visit_completion as one period a month (callers bypass it anyway)", () => {
		expect(periodsPerMonth("on_visit_completion")).toBe(1);
	});
});

describe("normalizedMonthly", () => {
	it("scales a per-period amount by the cadence", () => {
		expect(normalizedMonthly(100, "monthly")).toBe(100);
		expect(normalizedMonthly(300, "quarterly")).toBeCloseTo(100, 10);
		expect(normalizedMonthly(12, "weekly")).toBeCloseTo(52, 10);
		expect(normalizedMonthly(12, "biweekly")).toBeCloseTo(26, 10);
	});
});

describe("planPerPeriodAmount", () => {
	it("returns the configured fixed amount", () => {
		expect(
			planPerPeriodAmount({ billing_basis: "fixed_amount", fixed_amount: 250, line_items: [] }),
		).toBe(250);
	});

	it("returns null (not $0) for a fixed_amount plan with no amount, so trailing actuals apply", () => {
		// Review 02-F9: a missing amount is "unknown", and $0 would zero the plan's MRR.
		expect(
			planPerPeriodAmount({ billing_basis: "fixed_amount", fixed_amount: null, line_items: [] }),
		).toBeNull();
	});

	it("sums quantity × unit price for plan_line_items", () => {
		expect(
			planPerPeriodAmount({
				billing_basis: "plan_line_items",
				fixed_amount: null,
				line_items: [
					{ quantity: 2, unit_price: 40 },
					{ quantity: 1, unit_price: 19.5 },
				],
			}),
		).toBeCloseTo(99.5, 10);
	});

	it("is $0 for plan_line_items with no lines (a real, deterministic zero)", () => {
		expect(
			planPerPeriodAmount({ billing_basis: "plan_line_items", fixed_amount: null, line_items: [] }),
		).toBe(0);
	});

	it("returns null for variable bases and for no basis at all", () => {
		for (const basis of ["visit_actuals", "invoice", null] as const) {
			expect(
				planPerPeriodAmount({ billing_basis: basis, fixed_amount: 100, line_items: [] }),
			).toBeNull();
		}
	});
});
