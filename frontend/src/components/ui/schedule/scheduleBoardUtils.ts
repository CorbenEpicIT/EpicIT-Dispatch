import type { CSSProperties } from "react";
import type { Technician } from "../../../types/technicians";
import type { JobVisit } from "../../../types/jobs";

// ─── Shared constants (scroll zones) ─────────────────────────────────────────

export const SCROLL_ZONE_W = 40; // px — edge zone that triggers week/month scroll during drag
export const SCROLL_DELAY_MS = 1500; // ms — delay before auto-advancing on zone hold

// ─── Constants ────────────────────────────────────────────────────────────────

export const SLOT_H = 56; // px per hour
export const DAY_START = 0; // 12 AM (midnight)
export const DAY_END = 24; // 12 AM next day
export const CARD_W_VW = 0.068;
export const CARD_W_MIN = 72;
export const CARD_W_MAX = 96;
export const LEFT_PAD = 5;
export const RIGHT_PAD = 10;

const TECH_COLOR_PALETTE = [
	"#3b82f6", // blue-500
	"#10b981", // emerald-500
	"#f59e0b", // amber-500
	"#8b5cf6", // violet-500
	"#ef4444", // red-500
	"#06b6d4", // cyan-500
	"#f97316", // orange-500
	"#ec4899", // pink-500
	"#84cc16", // lime-500
	"#14b8a6", // teal-500
	"#a855f7", // purple-500
	"#eab308", // yellow-500
];

// ─── Priority color ───────────────────────────────────────────────────────────

export function getPriorityColor(priority?: string): string {
	switch (priority?.toLowerCase()) {
		case "emergency":
			return "#dc2626"; // red-600 — most severe
		case "urgent":
			return "#ea580c"; // orange-600
		case "high":
			return "#ef4444"; // red-500
		case "medium":
			return "#f59e0b"; // amber-500
		case "low":
			return "#10b981"; // emerald-500
		default:
			return "#3b82f6"; // blue-500
	}
}

// ─── Tech ordering ────────────────────────────────────────────────────────────

/** Stable global ordering: sort techs by id, return array of ids */
export function buildTechOrder(technicians: Technician[]): string[] {
	return [...technicians].sort((a, b) => a.id.localeCompare(b.id)).map((t) => t.id);
}

/** Filter globalOrder to only techs present in activeTechIds, preserving order */
export function dayTechOrder(globalOrder: string[], activeTechIds: Set<string>): string[] {
	return globalOrder.filter((id) => activeTechIds.has(id));
}

// ─── Card geometry ────────────────────────────────────────────────────────────

export function getCardW(viewportWidth: number): number {
	return Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, viewportWidth * CARD_W_VW));
}

// ─── Overlap collision layout ─────────────────────────────────────────────────

export interface OverlapSlot<T> {
	visit: T;
	left: number;
	width: number;
}

/**
 * Derive the visual end hour used for overlap detection.
 * For open-ended (when_done) visits, scheduled_end_at is arbitrary — use the
 * fixed 2-hour display window instead so overlap groups match what the user sees.
 */
function visitEndHours(visit: {
	finish_constraint?: string;
	arrival_constraint: string;
	arrival_time?: string | null;
	arrival_window_start?: string | null;
	arrival_window_end?: string | null;
	scheduled_start_at: string | Date;
	scheduled_end_at: string | Date;
}): number {
	if (visit.finish_constraint === "when_done") {
		return Math.min(visitStartHours(visit) + 2, DAY_END);
	}
	const e =
		typeof visit.scheduled_end_at === "string"
			? new Date(visit.scheduled_end_at)
			: visit.scheduled_end_at;
	return e.getHours() + e.getMinutes() / 60;
}

/**
 * Time-local overlap layout: assigns each visit a lane via greedy slot-packing,
 * then expands each visit rightward into lanes that are free during its time range.
 *
 * Algorithm:
 *   1. Assign lanes — each visit takes the lowest lane whose last occupant ended
 *      before this visit starts. This is independent per visit, not per group.
 *   2. Build direct-overlap adjacency — two visits overlap iff their time ranges
 *      intersect (start < other.end && other.start < end).
 *   3. Find connected components of the overlap graph — this is the true "cluster"
 *      even when visits are only indirectly connected through a long-spanning visit.
 *      The cluster's max lane + 1 is the width denominator for all members.
 *   4. Per visit, columnSpan = (next lane occupied by a direct overlap to its right)
 *      minus its own lane.  If no directly-overlapping visit sits to its right, it
 *      spans all the way to the end of the cluster — filling unused horizontal space.
 *
 * Example: A(7–17), B(8–10), C(9–10), D(14–15)
 *   Lanes:  A=0, B=1, C=2, D=1   (D reuses lane 1 after B ends at 10)
 *   Cluster max lane = 2  →  totalLanes = 3  (width denominator for all four)
 *   A: direct overlaps B(1),C(2),D(1) → next right = 1 → span=1 → 1/3 width
 *   B: direct overlaps A(0),C(2)      → next right = 2 → span=1 → 1/3 width
 *   C: direct overlaps A(0),B(1)      → no right    → span=1 → 1/3 width
 *   D: direct overlaps A(0) only      → no right    → span=2 → 2/3 width
 */
export function resolveOverlapLayout<
	T extends {
		id: string;
		finish_constraint?: string;
		arrival_constraint: string;
		arrival_time?: string | null;
		arrival_window_start?: string | null;
		arrival_window_end?: string | null;
		scheduled_start_at: string | Date;
		scheduled_end_at: string | Date;
	},
>(visits: T[], colWidth: number): OverlapSlot<T>[] {
	if (visits.length === 0) return [];

	const GAP = 2;
	const usableWidth = colWidth - LEFT_PAD - RIGHT_PAD;

	const sorted = [...visits].sort((a, b) => visitStartHours(a) - visitStartHours(b));
	const n = sorted.length;

	// ── Step 1: assign lanes ───────────────────────────────────────────────────
	// laneEnd[i] = the end-hour of the last visit placed in lane i.
	const laneEnd: number[] = [];
	const lane = new Map<string, number>();
	const sH: number[] = [];
	const eH: number[] = [];

	for (let i = 0; i < n; i++) {
		const s = visitStartHours(sorted[i]);
		const e = visitEndHours(sorted[i]);
		sH.push(s);
		eH.push(e);

		let assigned = -1;
		for (let l = 0; l < laneEnd.length; l++) {
			if (laneEnd[l] <= s) {
				laneEnd[l] = e;
				assigned = l;
				break;
			}
		}
		if (assigned === -1) {
			assigned = laneEnd.length;
			laneEnd.push(e);
		}
		lane.set(sorted[i].id, assigned);
	}

	// ── Step 2: direct-overlap adjacency ──────────────────────────────────────
	const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (sH[i] < eH[j] && sH[j] < eH[i]) {
				adj[i].add(j);
				adj[j].add(i);
			}
		}
	}

	// ── Step 3: connected components (BFS) ────────────────────────────────────
	const comp = new Int32Array(n).fill(-1);
	let numComp = 0;
	for (let i = 0; i < n; i++) {
		if (comp[i] !== -1) continue;
		const queue = [i];
		comp[i] = numComp;
		for (let qi = 0; qi < queue.length; qi++) {
			for (const nb of adj[queue[qi]]) {
				if (comp[nb] === -1) {
					comp[nb] = numComp;
					queue.push(nb);
				}
			}
		}
		numComp++;
	}

	// max lane per component → totalLanes per component
	const compMaxLane = new Int32Array(numComp).fill(0);
	for (let i = 0; i < n; i++) {
		const l = lane.get(sorted[i].id)!;
		if (l > compMaxLane[comp[i]]) compMaxLane[comp[i]] = l;
	}

	// ── Step 4: compute left + width per visit ─────────────────────────────────
	const result: OverlapSlot<T>[] = [];
	for (let i = 0; i < n; i++) {
		const visit = sorted[i];
		const myLane = lane.get(visit.id)!;
		const totalLanes = compMaxLane[comp[i]] + 1;

		// Find nearest directly-overlapping lane to the right of myLane
		let nextOccupied = totalLanes;
		for (const j of adj[i]) {
			const jl = lane.get(sorted[j].id)!;
			if (jl > myLane && jl < nextOccupied) nextOccupied = jl;
		}
		const span = nextOccupied - myLane;

		const slotW = (usableWidth - GAP * (totalLanes - 1)) / totalLanes;
		result.push({
			visit,
			left: LEFT_PAD + myLane * (slotW + GAP),
			width: slotW * span + GAP * (span - 1),
		});
	}
	return result;
}

/**
 * Parse an "HH:MM" constraint string to fractional hours. Returns null if invalid.
 */
function hhmmToHours(hhmm: string | null | undefined): number | null {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	return h + m / 60;
}

/**
 * Derive the display start hour for a visit from its arrival constraint fields
 * (timezone-independent HH:MM strings), falling back to scheduled_start_at local time.
 *
 * Uses the same priority as the detail page:
 *   "at"      → arrival_time
 *   "between" → arrival_window_start
 *   "by"      → arrival_window_end (best available; no dedicated start stored)
 *   "anytime" → scheduled_start_at
 */
export function visitStartHours(visit: {
	arrival_constraint: string;
	arrival_time?: string | null;
	arrival_window_start?: string | null;
	arrival_window_end?: string | null;
	scheduled_start_at: string | Date;
}): number {
	let h: number | null = null;
	if (visit.arrival_constraint === "at") {
		h = hhmmToHours(visit.arrival_time);
	} else if (visit.arrival_constraint === "between") {
		h = hhmmToHours(visit.arrival_window_start);
	} else if (visit.arrival_constraint === "by") {
		h = hhmmToHours(visit.arrival_window_end);
	}
	if (h !== null) return h;
	// Fallback: local time from scheduled_start_at
	const d =
		typeof visit.scheduled_start_at === "string"
			? new Date(visit.scheduled_start_at)
			: visit.scheduled_start_at;
	return d.getHours() + d.getMinutes() / 60;
}

/**
 * Top offset in px for a plain datetime (occurrences, popup anchoring).
 * Uses local browser time — appropriate when the datetime is already stored correctly.
 */
export function calcTopFromDatetime(at: string | Date): number {
	const d = typeof at === "string" ? new Date(at) : at;
	const hoursFromStart = d.getHours() + d.getMinutes() / 60 - DAY_START;
	return Math.max(0, hoursFromStart * SLOT_H);
}

/**
 * Top offset in px from the top of the time-grid, derived from visit constraint fields.
 */
export function calcCardTop(visit: {
	arrival_constraint: string;
	arrival_time?: string | null;
	arrival_window_start?: string | null;
	arrival_window_end?: string | null;
	scheduled_start_at: string | Date;
}): number {
	const hoursFromStart = visitStartHours(visit) - DAY_START;
	return Math.max(0, hoursFromStart * SLOT_H);
}

/** Format a visit's start time from constraint HH:MM fields (timezone-free), falling back to local time from scheduled_start_at. */
export function visitStartLabel(visit: {
	arrival_constraint: string;
	arrival_time?: string | null;
	arrival_window_start?: string | null;
	arrival_window_end?: string | null;
	scheduled_start_at: string | Date;
}): string {
	let hhmm: string | null | undefined = null;
	if (visit.arrival_constraint === "at") hhmm = visit.arrival_time;
	else if (visit.arrival_constraint === "between") hhmm = visit.arrival_window_start;
	else if (visit.arrival_constraint === "by") hhmm = visit.arrival_window_end;
	if (hhmm) {
		const [h, m] = hhmm.split(":").map(Number);
		const period = h >= 12 ? "PM" : "AM";
		const displayH = h % 12 || 12;
		return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
	}
	const d =
		typeof visit.scheduled_start_at === "string"
			? new Date(visit.scheduled_start_at)
			: visit.scheduled_start_at;
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Format a visit's end time from constraint HH:MM fields (timezone-free), falling back to local time from scheduled_end_at. */
export function visitEndLabel(visit: {
	finish_constraint: string;
	finish_time?: string | null;
	scheduled_end_at: string | Date;
}): string {
	if (
		(visit.finish_constraint === "at" || visit.finish_constraint === "by") &&
		visit.finish_time
	) {
		const [h, m] = visit.finish_time.split(":").map(Number);
		const period = h >= 12 ? "PM" : "AM";
		const displayH = h % 12 || 12;
		return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
	}
	const d =
		typeof visit.scheduled_end_at === "string"
			? new Date(visit.scheduled_end_at)
			: visit.scheduled_end_at;
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Formats a visit or occurrence as a single time-range string for compact chip display.
 * Uses constraint fields (arrival_constraint, finish_constraint) rather than raw scheduled times.
 * Returns e.g. "7:00 AM · WD" for when_done, "8:00 AM – 3:00 PM" for timed constraints.
 */
export function visitConstraintTimeLabel(visit: {
	arrival_constraint: string;
	arrival_time?: string | null;
	arrival_window_start?: string | null;
	arrival_window_end?: string | null;
	finish_constraint: string;
	finish_time?: string | null;
	scheduled_start_at: string | Date;
	scheduled_end_at: string | Date;
}): string {
	const start = visitStartLabel(visit);
	if (visit.finish_constraint === "when_done") return `${start} · WD`;
	return `${start} – ${visitEndLabel(visit)}`;
}

/** Height in px for a visit. Minimum is one half-slot (30 min = SLOT_H/2) for clean display.
 *  Uses constraint-derived start hours for the start anchor so height is consistent
 *  with calcCardTop. When openEnded (finish_constraint = "when_done"), caps at 4 hours.
 */
export function calcCardHeight(
	visit: {
		arrival_constraint: string;
		arrival_time?: string | null;
		arrival_window_start?: string | null;
		arrival_window_end?: string | null;
		scheduled_start_at: string | Date;
		scheduled_end_at: string | Date;
	},
	openEnded = false
): number {
	const startHours = visitStartHours(visit);
	const maxHours = DAY_END - startHours;

	// Open-ended visits have unknown duration — use a fixed 2-hour display height
	// so all "when_done" cards are visually consistent regardless of scheduled_end_at.
	if (openEnded) {
		return Math.min(2 * SLOT_H, maxHours * SLOT_H);
	}

	// Timed visits: derive height from scheduled duration (timezone-relative offset).
	const e =
		typeof visit.scheduled_end_at === "string"
			? new Date(visit.scheduled_end_at)
			: visit.scheduled_end_at;
	const s =
		typeof visit.scheduled_start_at === "string"
			? new Date(visit.scheduled_start_at)
			: visit.scheduled_start_at;
	const durationHours =
		e.getHours() + e.getMinutes() / 60 - (s.getHours() + s.getMinutes() / 60);
	return Math.max(SLOT_H / 2, Math.min(durationHours, maxHours) * SLOT_H);
}

// ─── Tech display ─────────────────────────────────────────────────────────────

export function getTechColor(globalIndex: number): string {
	return TECH_COLOR_PALETTE[globalIndex % TECH_COLOR_PALETTE.length];
}

export function getTechInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	if (words.length === 1) return name.slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ─── Data grouping ────────────────────────────────────────────────────────────

/** Group visits by their start date "YYYY-MM-DD". Generic so subtypes (VisitWithJob) are preserved. */
export function groupVisitsByDay<T extends JobVisit>(visits: T[]): Record<string, T[]> {
	return visits.reduce(
		(acc, visit) => {
			const dateStr = new Date(visit.scheduled_start_at)
				.toISOString()
				.split("T")[0];
			if (!acc[dateStr]) acc[dateStr] = [];
			acc[dateStr].push(visit);
			return acc;
		},
		{} as Record<string, T[]>
	);
}

/** Get the 7 ISO date strings (YYYY-MM-DD) for the week containing `date`, starting Monday */
export function getWeekDays(date: Date): string[] {
	const day = date.getDay(); // 0=Sun
	const monday = new Date(date);
	monday.setDate(date.getDate() - ((day + 6) % 7));
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		return d.toISOString().split("T")[0];
	});
}

// ─── Popup / reschedule helpers ───────────────────────────────────────────────

/** Format a "YYYY-MM-DD" string as a short display label, e.g. "Mon, Apr 7" */
export function formatDateDisplay(dateStr: string): string {
	const d = new Date(dateStr + "T12:00:00"); // noon avoids DST edge
	return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Date → "HH:MM" 24-hour string */
export function dateToHHMM(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM" → a Date set to that time (today's date; used for TimePicker). Returns null on bad input. */
export function hhmmToPickerDate(hhmm: string): Date | null {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	const d = new Date();
	d.setHours(h, m, 0, 0);
	return d;
}

/** Shared style for column-label headings inside reschedule popups */
export const POPUP_LABEL_STYLE: CSSProperties = {
	fontSize: 9,
	fontWeight: 700,
	color: "#a1a1aa",
	textTransform: "uppercase",
	letterSpacing: "0.06em",
};

/** Shared muted text style inside reschedule popups */
export const POPUP_MUTED_STYLE: CSSProperties = {
	fontSize: 9,
	color: "#a1a1aa",
};

/** Shared <select> style inside reschedule popups */
export const POPUP_SELECT_STYLE: CSSProperties = {
	background: "#27272a",
	border: "1px solid #3f3f46",
	borderRadius: 4,
	color: "#e4e4e7",
	fontSize: 10,
	padding: "4px 6px",
	cursor: "pointer",
	outline: "none",
	width: "100%",
	transition: "border-color 0.15s ease-out",
};

// ─── Day header ───────────────────────────────────────────────────────────────

/** Format a date string "YYYY-MM-DD" to display label */
export function formatDayHeader(dateStr: string): { weekday: string; day: string } {
	const d = new Date(dateStr + "T12:00:00"); // noon avoids DST edge
	return {
		weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
		day: String(d.getDate()),
	};
}
