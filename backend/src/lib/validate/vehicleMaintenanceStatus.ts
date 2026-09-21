import type { Prisma } from "../../../generated/prisma/client.js";

// Backend port of frontend's `dueFor` classification (status only, no display
// strings). Keep DUE_SOON_DAYS/MILES in sync with the frontend copy by hand.

export type MaintenanceReminderStatus = "overdue" | "duesoon" | "upcoming" | "none";

type Reminder = Prisma.vehicle_maintenance_reminderGetPayload<{}>;
type Record_ = Prisma.vehicle_maintenance_recordGetPayload<{}>;

const DUE_SOON_DAYS = 7;
const DUE_SOON_MILES = 500;

function latestOf<T extends { performed_at: Date; created_at: Date }>(records: T[]): T | undefined {
	return [...records].sort((a, b) => b.performed_at.getTime() - a.performed_at.getTime() || b.created_at.getTime() - a.created_at.getTime())[0];
}

function addMonths(date: Date, months: number): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function addInterval(date: Date, unit: "days" | "weeks" | "months" | "years", count: number): Date {
	if (unit === "months") return addMonths(date, count);
	if (unit === "years") return addMonths(date, count * 12);
	const days = unit === "weeks" ? count * 7 : count;
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function daysUntil(date: Date): number {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Math.round((target - today) / DAY_MS);
}

// Latest odometer reading logged, any category — "current mileage" basis.
export function currentOdometerFor(records: Record_[]): number | null {
	return latestOf(records.filter((r) => r.odometer_mi != null))?.odometer_mi ?? null;
}

export interface DueTargets {
	dueAt: Date | null;
	dueMiles: number | null;
}

// Anchor logic shared by classifyReminder (status) and the alerts endpoint (display).
export function resolveDueTargets(reminder: Reminder, records: Record_[]): DueTargets {
	if (!reminder.repeats) {
		return { dueAt: reminder.due_at, dueMiles: reminder.due_odometer_mi };
	}

	// Compared by calendar day, not instant — performed_at is date-only but baseline_at has a time.
	const baselineDay = reminder.baseline_at
		? new Date(Date.UTC(reminder.baseline_at.getUTCFullYear(), reminder.baseline_at.getUTCMonth(), reminder.baseline_at.getUTCDate()))
		: null;
	const latest = latestOf(
		records.filter((r) => r.category === reminder.category && (!baselineDay || r.performed_at >= baselineDay)),
	);
	const anchorAt = latest?.performed_at ?? reminder.baseline_at;
	const anchorOdometerMi = latest?.odometer_mi ?? reminder.baseline_odometer_mi;

	let dueAt: Date | null = null;
	let dueMiles: number | null = null;
	if (anchorOdometerMi != null && reminder.interval_miles != null) {
		dueMiles = anchorOdometerMi + reminder.interval_miles;
	}
	if (anchorAt != null && reminder.interval_unit != null && reminder.interval_count != null) {
		dueAt = addInterval(anchorAt, reminder.interval_unit, reminder.interval_count);
	}
	return { dueAt, dueMiles };
}

export function classifyReminder(
	reminder: Reminder,
	records: Record_[],
	currentOdometerMi: number | null,
): MaintenanceReminderStatus {
	if (!reminder.repeats && reminder.completed_at != null) return "none";

	const { dueAt, dueMiles } = resolveDueTargets(reminder, records);

	const daysLeft = dueAt != null ? daysUntil(dueAt) : null;
	const milesLeft = dueMiles != null && currentOdometerMi != null ? dueMiles - currentOdometerMi : null;

	if (daysLeft == null && milesLeft == null) return "none";

	const urgency = Math.min(daysLeft ?? Infinity, milesLeft ?? Infinity);
	if (urgency < 0) return "overdue";
	if ((daysLeft != null && daysLeft <= DUE_SOON_DAYS) || (milesLeft != null && milesLeft <= DUE_SOON_MILES)) return "duesoon";
	return "upcoming";
}
