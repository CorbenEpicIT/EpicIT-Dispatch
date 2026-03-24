/**
 * Utilities for computing invoice schedule dates.
 *
 * `calculateNextInvoiceAt` returns the date on which an invoice should be
 * *generated* (not the billing/due date).  When `generateDaysBefore > 0` the
 * generation date is shifted earlier so the invoice is ready in advance of the
 * billing date.
 *
 * Supported frequencies: weekly | biweekly | monthly | quarterly
 *
 * Day anchoring:
 *   - weekly / biweekly  → dayOfWeek (ISO weekday: 1=Mon … 7=Sun)
 *   - monthly / quarterly → dayOfMonth (1–28, clamped to avoid month-end issues)
 */

export type ScheduleFrequency = "weekly" | "biweekly" | "monthly" | "quarterly";

const WEEKDAY_NAMES: Record<string, number> = {
	MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7,
};

/**
 * Returns the next invoice *generation* date after `from`.
 *
 * @param frequency      Recurrence cadence
 * @param dayOfMonth     1–28; used for monthly/quarterly (null → 1)
 * @param dayOfWeek      Two-letter weekday code "MO"–"SU"; used for weekly/biweekly (null → "MO")
 * @param generateDaysBefore  Shift generation this many days before the billing date
 * @param from           Reference date (defaults to now)
 */
export function calculateNextInvoiceAt(
	frequency: ScheduleFrequency,
	dayOfMonth: number | null,
	dayOfWeek: string | null,
	generateDaysBefore: number,
	from: Date = new Date(),
): Date {
	const billingDate = nextBillingDate(frequency, dayOfMonth, dayOfWeek, from);
	const generationDate = new Date(billingDate);
	generationDate.setDate(generationDate.getDate() - (generateDaysBefore ?? 0));
	return generationDate;
}

/**
 * Advance `next_invoice_at` to the period *after* the one that was just invoiced.
 */
export function advanceNextInvoiceAt(
	frequency: ScheduleFrequency,
	dayOfMonth: number | null,
	dayOfWeek: string | null,
	generateDaysBefore: number,
	currentNextAt: Date,
): Date {
	// Advance the billing anchor by one period from currentNextAt
	const billingDate = nextBillingDate(
		frequency,
		dayOfMonth,
		dayOfWeek,
		currentNextAt,
	);
	const generationDate = new Date(billingDate);
	generationDate.setDate(generationDate.getDate() - (generateDaysBefore ?? 0));
	return generationDate;
}

// ============================================================================
// Internal helpers
// ============================================================================

function nextBillingDate(
	frequency: ScheduleFrequency,
	dayOfMonth: number | null,
	dayOfWeek: string | null,
	from: Date,
): Date {
	switch (frequency) {
		case "weekly":
			return nextWeekday(dayOfWeek, from, 1);
		case "biweekly":
			return nextWeekday(dayOfWeek, from, 2);
		case "monthly":
			return nextMonthDay(dayOfMonth ?? 1, from, 1);
		case "quarterly":
			return nextMonthDay(dayOfMonth ?? 1, from, 3);
	}
}

/** Returns the next occurrence of `dayOfWeek` strictly after `from`, then
 *  advances by `intervalWeeks - 1` additional weeks for biweekly. */
function nextWeekday(
	dayOfWeek: string | null,
	from: Date,
	intervalWeeks: number,
): Date {
	const targetDow = WEEKDAY_NAMES[dayOfWeek ?? "MO"] ?? 1; // 1=Mon
	const date = new Date(from);
	date.setHours(0, 0, 0, 0);
	// JS getDay: 0=Sun,1=Mon…6=Sat → convert to ISO 1=Mon
	const currentDow = date.getDay() === 0 ? 7 : date.getDay();
	let daysUntil = targetDow - currentDow;
	if (daysUntil <= 0) daysUntil += 7;
	date.setDate(date.getDate() + daysUntil + (intervalWeeks - 1) * 7);
	return date;
}

/** Returns the next occurrence of `targetDay` of the month strictly after
 *  `from`, advancing `intervalMonths` months if needed. */
function nextMonthDay(
	targetDay: number,
	from: Date,
	intervalMonths: number,
): Date {
	const day = Math.min(Math.max(1, targetDay), 28); // clamp to 1–28
	const date = new Date(from);
	date.setHours(0, 0, 0, 0);

	// Try the target day in the current month first
	date.setDate(day);
	if (date <= from) {
		// Already passed — advance by intervalMonths
		date.setMonth(date.getMonth() + intervalMonths);
	}
	return date;
}
