import type { CreateRecurringPlanInput } from "../../src/types/recurringPlans";

export const mockClient = {
	id: "test-client-123",
	name: "Test Client Corp",
	email: "test@example.com",
	phone: "555-0100",
};

export const mockRecurringPlan: Omit<CreateRecurringPlanInput, "client_id"> = {
	name: "Test Weekly HVAC Maintenance",
	description: "Test recurring plan created by E2E test",
	address: "123 Test St, Madison, WI 53703",
	coords: {
		lat: 43.0731,
		lon: -89.4012,
	},
	priority: "Medium",
	starts_at: new Date("2025-02-01T00:00:00Z").toISOString(),
	timezone: "America/Chicago",
	generation_window_days: 90,
	min_advance_days: 14,
	billing_mode: "per_visit",
	invoice_timing: "on_completion",
	auto_invoice: false,
	rule: {
		frequency: "weekly",
		interval: 1,
		by_weekday: ["MO", "WE", "FR"],
		arrival_constraint: "between",
		finish_constraint: "when_done",
		arrival_window_start: "09:00",
		arrival_window_end: "11:00",
	},
	line_items: [
		{
			name: "HVAC Filter Replacement",
			description: "Replace all air filters",
			quantity: 1,
			unit_price: 150.0,
			item_type: "labor",
			sort_order: 0,
		},
	],
};

export function generateTestRecurringPlan(
	clientId: string,
	overrides?: Partial<CreateRecurringPlanInput>
): CreateRecurringPlanInput {
	return {
		...mockRecurringPlan,
		client_id: clientId,
		...overrides,
	} as CreateRecurringPlanInput;
}
