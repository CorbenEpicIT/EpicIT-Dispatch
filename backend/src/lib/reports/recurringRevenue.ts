

export type ScheduleFrequency =
	| "weekly"
	| "biweekly"
	| "monthly"
	| "quarterly"
	| "on_visit_completion";

export type BillingBasis = "fixed_amount" | "plan_line_items" | "visit_actuals" | "invoice";

export interface PlanLineItemLike {
	quantity: number;
	unit_price: number;
}

export interface PlanMonetizationInput {
	billing_basis: BillingBasis | null;
	fixed_amount: number | null;
	line_items: PlanLineItemLike[];
}

// How many billing periods occur in an average month

const PERIODS_PER_MONTH: Record<ScheduleFrequency, number> = {
	weekly: 52 / 12,
	biweekly: 26 / 12,
	monthly: 1,
	quarterly: 1 / 3,
	on_visit_completion: 1,
};

export function periodsPerMonth(freq: ScheduleFrequency): number {
	return PERIODS_PER_MONTH[freq] ?? 1;
}

// Normalize a per-period amount to a monthly run-rate
export function normalizedMonthly(perPeriod: number, freq: ScheduleFrequency): number {
	return perPeriod * periodsPerMonth(freq);
}

export function planPerPeriodAmount(plan: PlanMonetizationInput): number | null {
	if (plan.billing_basis === "fixed_amount") {
		return plan.fixed_amount != null ? Number(plan.fixed_amount) : 0;
	}
	if (plan.billing_basis === "plan_line_items") {
		return plan.line_items.reduce(
			(sum, li) => sum + Number(li.quantity) * Number(li.unit_price),
			0,
		);
	}
	return null;
}
