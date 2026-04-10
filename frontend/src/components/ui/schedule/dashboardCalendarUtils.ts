import { Temporal } from "temporal-polyfill";
import type { Job, JobVisit } from "../../../types/jobs";
import type { RecurringOccurrence, RecurringPlan } from "../../../types/recurringPlans";
import { visitStartLabel, getPriorityColor } from "./scheduleBoardUtils";

export interface VisitWithJob extends JobVisit {
	job_obj: Job;
}

export interface OccurrenceWithPlan extends RecurringOccurrence {
	plan: RecurringPlan;
	job_obj: Job;
}

export function getStatusColor(status: string): string {
	switch (status) {
		case "Scheduled":  return "#3b82f6";
		case "InProgress": return "#f59e0b";
		case "Completed":  return "#10b981";
		case "Cancelled":  return "#ef4444";
		default:           return "#6b7280";
	}
}

export function formatTime(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Convert a Date/string to a Temporal.ZonedDateTime in the local timezone (required by @schedule-x v4) */
export function toZonedDateTime(date: Date | string): Temporal.ZonedDateTime {
	const d = typeof date === "string" ? new Date(date) : date;
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(tz);
}

/** Convert a "YYYY-MM-DD" string to a Temporal.PlainDate (for all-day events) */
export function toPlainDate(dateStr: string): Temporal.PlainDate {
	return Temporal.PlainDate.from(dateStr);
}

export function extractVisits(jobs: Job[]): VisitWithJob[] {
	return jobs.flatMap((job_obj) =>
		(job_obj.visits ?? []).map((visit) => ({ ...visit, job_obj }))
	);
}

export function extractOccurrences(jobs: Job[]): OccurrenceWithPlan[] {
	const now = new Date();
	return jobs.flatMap((job_obj) => {
		const plan = job_obj.recurring_plan as RecurringPlan | undefined | null;
		if (!plan?.occurrences?.length) return [];
		return plan.occurrences
			.filter((occ) => {
				if (occ.job_visit_id) return false;
				if (new Date(occ.occurrence_start_at) < now) return false;
				if (occ.status === "skipped" || occ.status === "cancelled") return false;
				return occ.status === "planned";
			})
			.map((occ) => ({ ...occ, plan, job_obj }));
	});
}

const MAX_OPEN_ENDED_HOURS = 4;

// ─── Calendar event types ─────────────────────────────────────────────────────

export interface VisitCalendarEvent {
	id: string;
	title: string;
	start: Temporal.ZonedDateTime;
	end: Temporal.ZonedDateTime;
	_type: "visit";
	_data: VisitWithJob;
	calendarId: string;
	style: string;
}

export interface OccurrenceCalendarEvent {
	id: string;
	title: string;
	start: Temporal.ZonedDateTime;
	end: Temporal.ZonedDateTime;
	_type: "occurrence";
	_data: OccurrenceWithPlan;
	calendarId: string;
	style: string;
}

export interface BadgeCalendarEvent {
	id: string;
	title: string;
	start: Temporal.PlainDate;
	end: Temporal.PlainDate;
	_type: "occurrence-badge";
	_count: number;
	calendarId: string;
}

export type CalendarEvent = VisitCalendarEvent | OccurrenceCalendarEvent | BadgeCalendarEvent;

/** Build schedule-x CalendarEvent objects from visits */
export function buildVisitEvents(jobs: Job[], showVisits: boolean): VisitCalendarEvent[] {
	if (!showVisits) return [];
	return extractVisits(jobs).map((visit) => {
		const openEnded = visit.finish_constraint === "when_done";
		const startZdt = toZonedDateTime(visit.scheduled_start_at);
		let endZdt = toZonedDateTime(visit.scheduled_end_at);

		if (openEnded) {
			const startMs = new Date(visit.scheduled_start_at).getTime();
			const endMs   = new Date(visit.scheduled_end_at).getTime();
			const capMs   = startMs + MAX_OPEN_ENDED_HOURS * 3_600_000;
			if (endMs > capMs) endZdt = toZonedDateTime(new Date(capMs));
		}

		const constraint = visit.arrival_constraint;
		const timePrefix = constraint === "anytime" ? null : visitStartLabel(visit);
		const label = visit.name || visit.job_obj.name;
		const title = timePrefix
			? (openEnded ? `${timePrefix} ${label}` : `${timePrefix}–${formatTime(visit.scheduled_end_at)} ${label}`)
			: label;

		return {
			id: `visit-${visit.id}`,
			title,
			start: startZdt,
			end: endZdt,
			_type: "visit" as const,
			_data: visit,
			calendarId: "visits",
			style: `background:${getStatusColor(visit.status)};border-left:3px solid ${getPriorityColor(visit.job_obj.priority)}${openEnded ? ";border-bottom:2px dashed rgba(255,255,255,0.35)" : ""}`,
		};
	});
}

/** Build schedule-x CalendarEvent objects from occurrences */
export function buildOccurrenceEvents(jobs: Job[], showOccurrences: boolean): OccurrenceCalendarEvent[] {
	if (!showOccurrences) return [];
	return extractOccurrences(jobs).map((occ) => ({
		id: `occurrence-${occ.id}`,
		title: `${formatTime(occ.occurrence_start_at)} ${occ.job_obj.name} (recurring)`,
		start: toZonedDateTime(occ.occurrence_start_at),
		end: toZonedDateTime(occ.occurrence_start_at),
		_type: "occurrence" as const,
		_data: occ,
		calendarId: "occurrences",
		style: `background:#6b7280;border-left:3px solid ${getPriorityColor(occ.job_obj.priority)}`,
	}));
}

/** Build occurrence badge events (one per day with count ≥ 1) */
export function buildOccurrenceBadgeEvents(jobs: Job[], showOccurrences: boolean): BadgeCalendarEvent[] {
	if (!showOccurrences) return [];
	const counts = countOccurrencesByDay(extractOccurrences(jobs));
	return Object.entries(counts).map(([dateStr, count]) => ({
		id: `badge-${dateStr}`,
		title: `${count}`,
		start: toPlainDate(dateStr),
		end: toPlainDate(dateStr),
		_type: "occurrence-badge" as const,
		_count: count,
		calendarId: "badges",
	}));
}

export function countOccurrencesByDay(
	occurrences: Array<{ occurrence_start_at: string | Date }>
): Record<string, number> {
	return occurrences.reduce(
		(acc, occ) => {
			const dateStr = new Date(occ.occurrence_start_at).toISOString().split("T")[0];
			acc[dateStr] = (acc[dateStr] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);
}
