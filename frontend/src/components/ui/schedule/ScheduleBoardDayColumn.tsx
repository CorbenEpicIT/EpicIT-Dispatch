import { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScheduleBoardCard, { type AssignedTech } from "./ScheduleBoardCard";
import VisitClickPopup from "./VisitClickPopup";
import OccurrenceClickPopup from "./OccurrenceClickPopup";
import ReschedulePopup from "./ReschedulePopup";
import OccurrenceReschedulePopup from "./OccurrenceReschedulePopup";
import {
	resolveOverlapLayout,
	calcCardTop,
	calcTopFromDatetime,
	calcCardHeight,
	visitStartLabel,
	visitEndLabel,
	visitConstraintTimeLabel,
	getPriorityColor,
	SLOT_H,
	DAY_START,
	DAY_END,
	LEFT_PAD,
	RIGHT_PAD,
} from "./scheduleBoardUtils";
import type { UpdateJobVisitInput } from "../../../types/jobs";
import type { Technician } from "../../../types/technicians";
import type { OccurrenceWithPlan, VisitWithJob } from "./dashboardCalendarUtils";
import type { RescheduleOccurrenceInput, VisitGenerationResult } from "../../../types/recurringPlans";

// Shared across all column instances — only one drag is ever active at a time.
let sharedDragOffsetY = 0;
export function setSharedDragOffset(v: number) { sharedDragOffsetY = v; }
let sharedDraggedVisit: VisitWithJob | null = null;
let sharedDraggedOccurrence: OccurrenceWithPlan | null = null;

// ── Pending drag confirmation state ──────────────────────────────────────────

interface PendingDrop {
	type: "visit" | "occurrence";
	id: string;
	jobId: string;
	isRecurring: boolean;
	entityName: string;
	oldTimeLabel: string;
	newTimeLabel: string;
	priorityColor: string;
	visitObj?: VisitWithJob;
	occurrenceObj?: OccurrenceWithPlan;
	updateData?: UpdateJobVisitInput;
	occurrenceInput?: RescheduleOccurrenceInput;
	clientX: number;
	clientY: number;
}

// ── Pending click-triggered reschedule state ──────────────────────────────────

interface PendingClickReschedule {
	type: "visit" | "occurrence";
	visit?: VisitWithJob;
	occurrence?: OccurrenceWithPlan;
	anchorRect: DOMRect;
}

// ─────────────────────────────────────────────────────────────────────────────

interface ScheduleBoardDayColumnProps {
	dateStr: string;
	dayIndex: number;
	isToday: boolean;
	visits: VisitWithJob[];
	occurrences: OccurrenceWithPlan[];
	showVisits: boolean;
	showOccurrences: boolean;
	technicians: Technician[];
	techColorMap: Map<string, string>;
	colWidth: number;
	selectedTechs: Set<string>;
	isAllSelected: boolean;
	updateVisit: (args: { id: string; data: UpdateJobVisitInput }) => Promise<unknown>;
	rescheduleOccurrence: (args: { occurrenceId: string; jobId: string; input: RescheduleOccurrenceInput }) => Promise<unknown>;
	generateVisitFromOccurrence: (args: { occurrenceId: string; jobId: string }) => Promise<VisitGenerationResult>;
	scrollTop: number;
	visibleHeight: number;
	onScrollToY: (y: number) => void;
	onDropHandled?: () => void;
	onRescheduleConfirmed?: () => void;
}

function snapTo15Min(totalMinutes: number): number {
	return Math.round(totalMinutes / 15) * 15;
}

/** "HH:MM" → total minutes from midnight, or null */
function hhmmToMins(hhmm: string | null | undefined): number | null {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	return h * 60 + m;
}

/** Total minutes from midnight → "HH:MM", clamped to [0, 23:59] */
function minsToHHMM(mins: number): string {
	const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59));
	return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function minutesToLabel(mins: number): string {
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	const period = h >= 12 ? "PM" : "AM";
	const displayH = h % 12 || 12;
	return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtTime(d: Date): string {
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** YYYY-MM-DD string for a given Date */
function toDateStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ScheduleBoardDayColumn({
	dateStr,
	dayIndex,
	isToday,
	visits,
	occurrences,
	showVisits,
	showOccurrences,
	technicians,
	techColorMap,
	colWidth,
	selectedTechs,
	isAllSelected,
	updateVisit,
	rescheduleOccurrence,
	generateVisitFromOccurrence,
	scrollTop,
	visibleHeight,
	onScrollToY,
	onDropHandled,
	onRescheduleConfirmed,
}: ScheduleBoardDayColumnProps) {
	const navigate = useNavigate();
	const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
	const [clickedCardId, setClickedCardId] = useState<string | null>(null);
	const [clickedCardRect, setClickedCardRect] = useState<DOMRect | null>(null);
	const [hoveredOccurrenceId, setHoveredOccurrenceId] = useState<string | null>(null);
	const [clickedOccurrenceId, setClickedOccurrenceId] = useState<string | null>(null);
	const [clickedOccurrenceRect, setClickedOccurrenceRect] = useState<DOMRect | null>(null);
	const [generatingVisitId, setGeneratingVisitId] = useState<string | null>(null);
	const [dragOverMinutes, setDragOverMinutes] = useState<number | null>(null);
	const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [pendingClickReschedule, setPendingClickReschedule] = useState<PendingClickReschedule | null>(null);

	const columnRef          = useRef<HTMLDivElement>(null);
	const popupRef           = useRef<HTMLDivElement>(null);
	const occurrencePopupRef = useRef<HTMLDivElement>(null);
	const dragOffsetY        = useRef(0);

	const totalSlots  = DAY_END - DAY_START;
	const columnHeight = totalSlots * SLOT_H;
	const halfSlotH   = SLOT_H / 2;

	// Close visit popup on outside click
	useEffect(() => {
		if (!clickedCardId) return;
		function handleClick(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				setClickedCardId(null);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [clickedCardId]);

	// Close occurrence popup on outside click
	useEffect(() => {
		if (!clickedOccurrenceId) return;
		function handleClick(e: MouseEvent) {
			if (occurrencePopupRef.current && !occurrencePopupRef.current.contains(e.target as Node)) {
				setClickedOccurrenceId(null);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [clickedOccurrenceId]);

	// ── Deduplicate visits (one card per visit ID) ────────────────────────────

	const uniqueVisits = (() => {
		const seen = new Set<string>();
		const out: VisitWithJob[] = [];
		for (const v of visits) {
			if (!seen.has(v.id)) {
				seen.add(v.id);
				out.push(v);
			}
		}
		return out;
	})();

	// Combined overlap layout — visits and occurrences compete for the same column space.
	// Occurrences use occurrence_start_at/end_at; map to the scheduled_* shape resolveOverlapLayout expects.
	const visitLayoutItems = showVisits ? uniqueVisits.map((v) => ({
		_kind: "visit" as const,
		id: v.id,
		arrival_constraint: v.arrival_constraint,
		finish_constraint: v.finish_constraint,
		arrival_time: v.arrival_time,
		arrival_window_start: v.arrival_window_start,
		arrival_window_end: v.arrival_window_end,
		scheduled_start_at: v.scheduled_start_at,
		scheduled_end_at: v.scheduled_end_at,
	})) : [];

	const occLayoutItems = showOccurrences ? occurrences.map((occ) => ({
		_kind: "occ" as const,
		id: occ.id,
		arrival_constraint: occ.arrival_constraint,
		finish_constraint: occ.finish_constraint,
		arrival_time: occ.arrival_time,
		arrival_window_start: occ.arrival_window_start,
		arrival_window_end: occ.arrival_window_end,
		scheduled_start_at: occ.occurrence_start_at,
		scheduled_end_at: occ.occurrence_end_at,
	})) : [];

	const combinedSlots = resolveOverlapLayout([...visitLayoutItems, ...occLayoutItems], colWidth);

	const visitPositions = new Map<string, { left: number; width: number }>();
	const occPositions   = new Map<string, { left: number; width: number }>();
	for (const { visit: item, left, width } of combinedSlots) {
		if (item._kind === "visit") visitPositions.set(item.id, { left, width });
		else occPositions.set(item.id, { left, width });
	}

	// ── Overflow pill counts ──────────────────────────────────────────────────
	const visibleBottom = scrollTop + visibleHeight;
	const aboveItems: number[] = [];
	const belowItems: number[] = [];

	if (showVisits && visibleHeight > 0) {
		for (const v of uniqueVisits) {
			const top = calcCardTop(v);
			if (top < scrollTop) aboveItems.push(top);
			else if (top >= visibleBottom) belowItems.push(top);
		}
	}
	if (showOccurrences && visibleHeight > 0) {
		for (const occ of occurrences) {
			const top = calcTopFromDatetime(occ.occurrence_start_at);
			if (top < scrollTop) aboveItems.push(top);
			else if (top >= visibleBottom) belowItems.push(top);
		}
	}

	const aboveCount = aboveItems.length;
	const belowCount = belowItems.length;
	const topmostAboveTop    = aboveCount > 0 ? Math.min(...aboveItems) : 0;
	const bottommostBelowTop = belowCount > 0 ? Math.max(...belowItems) : 0;

	// ── Drag handlers ─────────────────────────────────────────────────────────

	function handleDragStart(e: React.DragEvent, visit: VisitWithJob) {
		sharedDraggedVisit = visit;
		setDraggingId(visit.id);
		const el = e.currentTarget as HTMLElement;
		function onDragEnd() {
			el.removeEventListener("dragend", onDragEnd);
			sharedDraggedVisit = null;
			setDraggingId(null);
		}
		el.addEventListener("dragend", onDragEnd);

		const startMs = new Date(visit.scheduled_start_at).getTime();
		const endMs   = new Date(visit.scheduled_end_at).getTime();
		if (columnRef.current) {
			const columnTop = columnRef.current.getBoundingClientRect().top;
			const cardTop   = calcCardTop(visit);
			dragOffsetY.current = (e.clientY - columnTop) - cardTop;
			sharedDragOffsetY   = dragOffsetY.current;
		}
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: "visit",
				visitId: visit.id,
				jobId: visit.job_obj.id,
				durationMs: endMs - startMs,
				startMs,
				arrival_constraint: visit.arrival_constraint,
				arrival_time: visit.arrival_time ?? null,
				arrival_window_start: visit.arrival_window_start ?? null,
				arrival_window_end: visit.arrival_window_end ?? null,
				finish_constraint: visit.finish_constraint,
				finish_time: visit.finish_time ?? null,
				isRecurring: !!visit.job_obj?.recurring_plan,
				entityName: visit.job_obj?.name ?? "Visit",
			})
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleOccurrenceDragStart(e: React.DragEvent, occ: OccurrenceWithPlan) {
		sharedDraggedOccurrence = occ;
		setDraggingId(occ.id);
		const el = e.currentTarget as HTMLElement;
		function onDragEnd() {
			el.removeEventListener("dragend", onDragEnd);
			sharedDraggedOccurrence = null;
			setDraggingId(null);
		}
		el.addEventListener("dragend", onDragEnd);

		const startMs = new Date(occ.occurrence_start_at).getTime();
		const endMs   = new Date(occ.occurrence_end_at).getTime();
		if (columnRef.current) {
			const columnTop = columnRef.current.getBoundingClientRect().top;
			const cardTop   = calcTopFromDatetime(occ.occurrence_start_at);
			dragOffsetY.current = (e.clientY - columnTop) - cardTop;
			sharedDragOffsetY   = dragOffsetY.current;
		}
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: "occurrence",
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
				durationMs: endMs - startMs,
				startMs,
				entityName: occ.plan.name,
				arrival_constraint: occ.arrival_constraint,
				arrival_time: occ.arrival_time ?? null,
				arrival_window_start: occ.arrival_window_start ?? null,
				arrival_window_end: occ.arrival_window_end ?? null,
				finish_constraint: occ.finish_constraint,
				finish_time: occ.finish_time ?? null,
			})
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (!columnRef.current) return;
		const rect = columnRef.current.getBoundingClientRect();
		const y = e.clientY - rect.top - sharedDragOffsetY;
		setDragOverMinutes(snapTo15Min((y / SLOT_H) * 60));
	}

	function handleDragLeave() {
		setDragOverMinutes(null);
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragOverMinutes(null);
		setDraggingId(null);
		if (!columnRef.current) return;
		const raw = e.dataTransfer.getData("text/plain");
		if (!raw) return;

		const parsed = JSON.parse(raw) as {
			type?: string;
			visitId?: string;
			occurrenceId?: string;
			jobId?: string;
			durationMs: number;
			startMs: number;
			arrival_constraint?: string;
			arrival_time?: string | null;
			arrival_window_start?: string | null;
			arrival_window_end?: string | null;
			finish_constraint?: string;
			finish_time?: string | null;
			isRecurring?: boolean;
			entityName?: string;
		};

		const rect = columnRef.current.getBoundingClientRect();
		const y = e.clientY - rect.top - sharedDragOffsetY;
		const snappedMins = snapTo15Min((y / SLOT_H) * 60);
		const clampedMins = Math.max(0, Math.min(snappedMins, (DAY_END - DAY_START) * 60));
		const [year, month, day] = dateStr.split("-").map(Number);
		const newStart = new Date(year, month - 1, day, DAY_START + Math.floor(clampedMins / 60), clampedMins % 60, 0, 0);

		// ── No-op check: dropped in same position as origin ───────────────────
		const origDate    = new Date(parsed.startMs);
		const origDateStr = toDateStr(origDate);
		const origMinsFromDayStart = (origDate.getHours() - DAY_START) * 60 + origDate.getMinutes();
		const origSnappedMins = snapTo15Min(origMinsFromDayStart);
		if (dateStr === origDateStr && clampedMins === origSnappedMins) return;

		const newEnd = new Date(newStart.getTime() + parsed.durationMs);

		// Constraint-aware labels: use arrival/finish constraint fields if present,
		// falling back to raw scheduled times. "when_done" shows "· WD" instead of
		// a fabricated end time derived from card height.
		const finishConstraint = parsed.finish_constraint ?? "when_done";
		const oldTimeLabel = visitConstraintTimeLabel({
			arrival_constraint: parsed.arrival_constraint ?? "anytime",
			arrival_time: parsed.arrival_time,
			arrival_window_start: parsed.arrival_window_start,
			arrival_window_end: parsed.arrival_window_end,
			finish_constraint: finishConstraint,
			finish_time: parsed.finish_time,
			scheduled_start_at: origDate,
			scheduled_end_at: new Date(parsed.startMs + parsed.durationMs),
		});
		const newTimeLabel =
			finishConstraint === "when_done"
				? `${fmtTime(newStart)} · WD`
				: `${fmtTime(newStart)} – ${fmtTime(newEnd)}`;

		// ── Occurrence drag ───────────────────────────────────────────────────
		if (parsed.type === "occurrence") {
			const droppedOcc = sharedDraggedOccurrence ?? occurrences.find((o) => o.id === parsed.occurrenceId);
			sharedDraggedOccurrence = null;
			setPendingDrop({
				type: "occurrence",
				id: parsed.occurrenceId!,
				jobId: parsed.jobId!,
				isRecurring: true, // occurrences always belong to a recurring plan
				entityName: parsed.entityName ?? "Occurrence",
				oldTimeLabel,
				newTimeLabel,
				priorityColor: getPriorityColor(droppedOcc?.job_obj?.priority),
				occurrenceObj: droppedOcc ?? undefined,
				occurrenceInput: {
					new_start_at: newStart.toISOString(),
					new_end_at: newEnd.toISOString(),
				},
				clientX: e.clientX,
				clientY: e.clientY,
			});
			return;
		}

		// ── Visit drag ────────────────────────────────────────────────────────
		const { visitId, arrival_constraint, arrival_time, arrival_window_start, arrival_window_end } = parsed;
		const newHHMM = minsToHHMM(clampedMins);

		const data: UpdateJobVisitInput = {
			scheduled_start_at: newStart.toISOString(),
			scheduled_end_at: newEnd.toISOString(),
		};

		// Sync the constraint time field that controls visual card position
		if (arrival_constraint === "at") {
			data.arrival_time = newHHMM;
		} else if (arrival_constraint === "between") {
			const origStartMins = hhmmToMins(arrival_window_start);
			const origEndMins   = hhmmToMins(arrival_window_end);
			const windowDur     = origStartMins !== null && origEndMins !== null
				? origEndMins - origStartMins
				: 60;
			data.arrival_window_start = newHHMM;
			data.arrival_window_end   = minsToHHMM(clampedMins + windowDur);
		} else if (arrival_constraint === "by") {
			data.arrival_window_end = newHHMM;
		}
		if (arrival_constraint === "anytime") {
			data.arrival_constraint = "at";
			data.arrival_time = newHHMM;
			data.finish_constraint = "when_done";
			data.finish_time = null;
		}

		const droppedVisit = sharedDraggedVisit ?? uniqueVisits.find((v) => v.id === visitId);
		sharedDraggedVisit = null;
		setPendingDrop({
			type: "visit",
			id: visitId!,
			jobId: parsed.jobId!,
			isRecurring: parsed.isRecurring ?? false,
			entityName: parsed.entityName ?? "Visit",
			oldTimeLabel,
			newTimeLabel,
			priorityColor: getPriorityColor(droppedVisit?.job_obj?.priority),
			visitObj: droppedVisit ?? undefined,
			updateData: data,
			clientX: e.clientX,
			clientY: e.clientY,
		});
	}

	// ── Drag-triggered reschedule handlers ───────────────────────────────────

	async function handleDragRescheduleVisitSave(data: UpdateJobVisitInput) {
		if (!pendingDrop) return;
		onDropHandled?.();
		try {
			await updateVisit({ id: pendingDrop.id, data });
			onRescheduleConfirmed?.();
		} catch {
			// reverts via query invalidation
		}
		setPendingDrop(null);
	}

	async function handleDragRescheduleOccurrenceSave(
		input: RescheduleOccurrenceInput & { scope: "this" | "future" },
	) {
		if (!pendingDrop) return;
		onDropHandled?.();
		try {
			await rescheduleOccurrence({
				occurrenceId: pendingDrop.id,
				jobId: pendingDrop.jobId,
				input,
			});
			onRescheduleConfirmed?.();
		} catch {
			// reverts via query invalidation
		}
		setPendingDrop(null);
	}

	async function handleDragRescheduleOccurrenceGenerate(
		input: Omit<RescheduleOccurrenceInput, "scope">,
	) {
		if (!pendingDrop?.occurrenceObj) return;
		const occ = pendingDrop.occurrenceObj;
		onDropHandled?.();
		setGeneratingVisitId(pendingDrop.id);
		try {
			await rescheduleOccurrence({
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
				input: { ...input, scope: "this" },
			});
			await generateVisitFromOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id });
			onRescheduleConfirmed?.();
		} catch {
			// reverts via query invalidation
		}
		setGeneratingVisitId(null);
		setPendingDrop(null);
	}

	// ── Occurrence generate-visit handler ─────────────────────────────────────

	async function handleGenerateVisitFromOccurrence(occ: OccurrenceWithPlan) {
		setGeneratingVisitId(occ.id);
		setClickedOccurrenceId(null);
		try {
			await generateVisitFromOccurrence({
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
			});
		} catch {
			// failure — data reverts via query invalidation
		}
		setGeneratingVisitId(null);
	}

	// ── Clock-button reschedule handlers ─────────────────────────────────────

	function handleVisitRescheduleClick() {
		const visit = clickedVisit;
		if (!visit || !clickedCardRect) return;
		setClickedCardId(null);
		setPendingClickReschedule({ type: "visit", visit, anchorRect: clickedCardRect });
	}

	function handleOccurrenceRescheduleClick() {
		const occ = clickedOccurrence;
		if (!occ || !clickedOccurrenceRect) return;
		setClickedOccurrenceId(null);
		setPendingClickReschedule({ type: "occurrence", occurrence: occ, anchorRect: clickedOccurrenceRect });
	}

	async function handleClickRescheduleVisitSave(data: UpdateJobVisitInput) {
		if (!pendingClickReschedule?.visit) return;
		try {
			await updateVisit({ id: pendingClickReschedule.visit.id, data });
		} catch {
			// reverts via query invalidation
		}
		setPendingClickReschedule(null);
	}

	async function handleClickRescheduleOccurrenceSave(input: RescheduleOccurrenceInput & { scope: "this" | "future" }) {
		if (!pendingClickReschedule?.occurrence) return;
		const occ = pendingClickReschedule.occurrence;
		try {
			await rescheduleOccurrence({
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
				input,
			});
		} catch {
			// reverts via query invalidation
		}
		setPendingClickReschedule(null);
	}

	async function handleClickRescheduleOccurrenceGenerate(input: Omit<RescheduleOccurrenceInput, "scope">) {
		if (!pendingClickReschedule?.occurrence) return;
		const occ = pendingClickReschedule.occurrence;
		setGeneratingVisitId(occ.id);
		try {
			await rescheduleOccurrence({
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
				input: { ...input, scope: "this" },
			});
			await generateVisitFromOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id });
		} catch {
			// reverts via query invalidation
		}
		setGeneratingVisitId(null);
		setPendingClickReschedule(null);
	}

	// ── Popup derivations ─────────────────────────────────────────────────────

	const clickedVisit = clickedCardId
		? uniqueVisits.find((v) => v.id === clickedCardId) ?? null
		: null;

	const clickedOccurrence = clickedOccurrenceId
		? occurrences.find((o) => o.id === clickedOccurrenceId) ?? null
		: null;

	// Popup goes right for columns 0–3, left for columns 4–6
	const popupOnLeft = dayIndex >= 4;

	const dropIndicatorTop =
		dragOverMinutes !== null
			? Math.max(0, (dragOverMinutes / 60) * SLOT_H)
			: null;

	return (
		<>
			<div
				ref={columnRef}
				style={{
					position: "relative",
					height: columnHeight,
					backgroundColor: isToday ? "rgba(59,130,246,0.04)" : "transparent",
					borderLeft: "1px solid #3f3f46",
					borderBottom: "1px solid #3f3f46",
					overflow: "visible",
				}}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{/* Hour grid lines */}
				{Array.from({ length: totalSlots }, (_, i) => (
					<div
						key={i}
						style={{
							position: "absolute",
							top: i * SLOT_H,
							left: 0,
							right: 0,
							height: 1,
							backgroundColor: "#3f3f46",
						}}
					/>
				))}

				{/* Half-hour grid lines */}
				{Array.from({ length: totalSlots }, (_, i) => (
					<div
						key={`half-${i}`}
						style={{
							position: "absolute",
							top: i * SLOT_H + halfSlotH,
							left: 0,
							right: 0,
							height: 1,
							backgroundColor: "#27272a",
						}}
					/>
				))}

				{/* Drop indicator */}
				{dropIndicatorTop !== null && (
					<>
						<div
							style={{
								position: "absolute",
								top: dropIndicatorTop,
								left: LEFT_PAD,
								right: RIGHT_PAD,
								height: 2,
								backgroundColor: "#3b82f6",
								borderRadius: 1,
								zIndex: 50,
								pointerEvents: "none",
							}}
						/>
						<span
							style={{
								position: "absolute",
								top: dropIndicatorTop - 9,
								left: LEFT_PAD,
								fontSize: 8,
								fontWeight: 700,
								color: "#60a5fa",
								lineHeight: 1,
								pointerEvents: "none",
								zIndex: 51,
							}}
						>
							{minutesToLabel(dragOverMinutes!)}
						</span>
					</>
				)}

				{/* Visit cards */}
				{showVisits && uniqueVisits.map((visit) => {
					const { left, width } = visitPositions.get(visit.id) ?? { left: LEFT_PAD, width: colWidth - LEFT_PAD - RIGHT_PAD };
					const isHovered = hoveredCardId === visit.id;
					const openEnded = visit.finish_constraint === "when_done";
					const top    = calcCardTop(visit);
					const height = calcCardHeight(visit, openEnded);
					const zIndex = isHovered ? 30 : 1;

					const assignedTechs: AssignedTech[] = (visit.visit_techs ?? []).map((vt) => ({
						id: vt.tech_id,
						name: technicians.find((t) => t.id === vt.tech_id)?.name ?? vt.tech_id,
						color: techColorMap.get(vt.tech_id) ?? "#6b7280",
						inFilter: isAllSelected || selectedTechs.has(vt.tech_id),
					}));

					return (
						<ScheduleBoardCard
							key={visit.id}
							visitName={visit.job_obj?.name ?? "Visit"}
							startLabel={visitStartLabel(visit)}
							endLabel={openEnded ? null : visitEndLabel(visit)}
							openEnded={openEnded}
							priorityColor={getPriorityColor(visit.job_obj?.priority)}
							assignedTechs={assignedTechs}
							isHovered={isHovered}
							opacity={
								pendingDrop?.id === visit.id ? 0
								: draggingId === visit.id ? 0.35
								: 1
							}
							top={top}
							height={height}
							left={left}
							width={width}
							zIndex={zIndex}
							onClick={(e) => {
								setClickedOccurrenceId(null);
								setClickedOccurrenceRect(null);
								const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
								const next = clickedCardId === visit.id ? null : visit.id;
								setClickedCardId(next);
								setClickedCardRect(next ? rect : null);
							}}
							onMouseEnter={() => setHoveredCardId(visit.id)}
							onMouseLeave={(e) => {
								const related = e.relatedTarget as Node | null;
								const card = e.currentTarget as HTMLElement;
								if (!related || !card.contains(related)) setHoveredCardId(null);
							}}
							onDragStart={(e) => handleDragStart(e, visit)}
						/>
					);
				})}

				{/* Occurrence cards */}
				{showOccurrences && occurrences.map((occ) => {
					const top         = calcTopFromDatetime(occ.occurrence_start_at);
					const occOpenEnded = occ.finish_constraint === "when_done";
					const height = (() => {
						if (occOpenEnded) return Math.min(2 * SLOT_H, columnHeight - top);
						const s = new Date(occ.occurrence_start_at);
						const e = new Date(occ.occurrence_end_at);
						const durationHours = (e.getHours() + e.getMinutes() / 60) - (s.getHours() + s.getMinutes() / 60);
						const maxHours = (columnHeight - top) / SLOT_H;
						return Math.max(SLOT_H / 2, Math.min(durationHours, maxHours) * SLOT_H);
					})();
					const { left: occLeft, width: occWidth } = occPositions.get(occ.id) ?? { left: LEFT_PAD, width: colWidth - LEFT_PAD - RIGHT_PAD };
					const isHov    = hoveredOccurrenceId === occ.id;
					const isClicked = clickedOccurrenceId === occ.id;
					const isGenerating = generatingVisitId === occ.id;

					const startD = new Date(occ.occurrence_start_at);
					const endD   = new Date(occ.occurrence_end_at);
					const timeLabel = startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
						+ " – " + (occ.finish_constraint === "when_done"
							? "When Done"
							: endD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));

					const showOccTime      = height >= 40;
					const showOccRecurring = height >= 56;
					const occContentH      = height - 8;
					const optionalH        = (showOccTime ? 11 + 2 : 0) + (showOccRecurring ? 8 + 2 : 0);
					const occTitleLines    = Math.max(1, Math.floor((occContentH - optionalH) / 12));

					return (
						<div
							key={`occ-${occ.id}`}
							draggable
							onDragStart={(e) => handleOccurrenceDragStart(e, occ)}
							onClick={(e) => {
								setClickedCardId(null);
								setClickedCardRect(null);
								const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
								const next = isClicked ? null : occ.id;
								setClickedOccurrenceId(next);
								setClickedOccurrenceRect(next ? rect : null);
							}}
							onMouseEnter={() => setHoveredOccurrenceId(occ.id)}
							onMouseLeave={() => setHoveredOccurrenceId(null)}
							style={{
								position: "absolute",
								top,
								left: occLeft,
								width: occWidth,
								height,
								zIndex: isHov ? 30 : 1,
								backgroundColor: "#252838",
								borderRadius: 4,
								overflow: "hidden",
								boxSizing: "border-box",
								cursor: isGenerating ? "default" : "grab",
								display: "flex",
								opacity: pendingDrop?.id === occ.id ? 0
									: draggingId === occ.id ? 0.35
									: isGenerating ? 0.5
									: 1,
								pointerEvents: pendingDrop?.id === occ.id ? "none" : "auto",
								transition: "box-shadow 0.15s ease-out, transform 0.15s ease-out, opacity 0.1s ease-out",
								boxShadow: isHov
									? "0 0 0 1px rgba(167,139,250,0.2), 0 4px 16px rgba(0,0,0,0.5)"
									: "0 1px 3px rgba(0,0,0,0.3)",
								transform: isHov ? "translateY(-1px)" : "none",
							}}
						>
							{/* Priority strip */}
							<div style={{ width: 4, flexShrink: 0, backgroundColor: getPriorityColor(occ.job_obj?.priority) }} />

							{/* Body */}
							{height >= 20 && (
								<div style={{
									flex: 1,
									minWidth: 0,
									padding: occOpenEnded ? "4px 5px 10px 5px" : "4px 5px",
									display: "flex",
									flexDirection: "column",
									gap: 2,
									overflow: "hidden",
								}}>
									<span style={{
										fontSize: 10,
										fontWeight: 600,
										color: "#c4b5fd",
										fontStyle: "italic",
										lineHeight: 1.2,
										overflow: "hidden",
										display: "-webkit-box",
										WebkitBoxOrient: "vertical",
										WebkitLineClamp: occTitleLines,
									} as React.CSSProperties}>
										{occ.job_obj?.name}
									</span>
									{showOccTime && (
										<span style={{
											fontSize: 9,
											color: "rgba(196,181,253,0.55)",
											lineHeight: 1.2,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}>
											{timeLabel}
										</span>
									)}
									{showOccRecurring && (
										<span style={{
											fontSize: 8,
											fontWeight: 600,
											color: "rgba(167,139,250,0.5)",
											textTransform: "uppercase",
											letterSpacing: "0.06em",
											lineHeight: 1,
										}}>
											Recurring
										</span>
									)}
								</div>
							)}

							{/* Open-ended indicator — fade + dashed bottom edge */}
							{occOpenEnded && (
								<>
									<div style={{
										position: "absolute",
										bottom: 0, left: 0, right: 0,
										height: 20,
										background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.32))",
										pointerEvents: "none",
									}} />
									<div style={{
										position: "absolute",
										bottom: 0, left: 0, right: 0,
										height: 3,
										boxSizing: "border-box",
										borderBottom: "3px dashed rgba(255,255,255,0.38)",
										pointerEvents: "none",
									}} />
								</>
							)}
						</div>
					);
				})}

				{/* Visit click popup */}
				{clickedVisit && (
					<VisitClickPopup
						visit={clickedVisit}
						popupRef={popupRef}
						technicians={technicians}
						techColorMap={techColorMap}
						style={{
							position: "absolute",
							top: Math.min(calcCardTop(clickedVisit), columnHeight - 240),
							...(popupOnLeft
								? { right: colWidth + 4 }
								: { left: colWidth + 4 }),
						}}
						onClose={() => setClickedCardId(null)}
						onViewVisit={() => navigate(`/dispatch/jobs/${clickedVisit.job_obj.id}/visits/${clickedVisit.id}`)}
						onViewJob={() => navigate(`/dispatch/jobs/${clickedVisit.job_obj.id}`)}
						onRescheduleClick={handleVisitRescheduleClick}
					/>
				)}

				{/* Occurrence click popup */}
				{clickedOccurrence && (
					<OccurrenceClickPopup
						occurrence={clickedOccurrence}
						popupRef={occurrencePopupRef}
						isGenerating={generatingVisitId === clickedOccurrence.id}
						style={{
							position: "absolute",
							top: Math.min(calcTopFromDatetime(clickedOccurrence.occurrence_start_at), columnHeight - 260),
							...(popupOnLeft
								? { right: colWidth + 4 }
								: { left: colWidth + 4 }),
						}}
						onClose={() => setClickedOccurrenceId(null)}
						onViewPlan={() => navigate(`/dispatch/recurring-plans/${clickedOccurrence.plan.id}`)}
						onGenerate={() => handleGenerateVisitFromOccurrence(clickedOccurrence)}
						onRescheduleClick={handleOccurrenceRescheduleClick}
					/>
				)}

				{/* Above-fold overflow pill */}
				{aboveCount > 0 && visibleHeight > 0 && (
					<button
						onClick={() => onScrollToY(topmostAboveTop - 8)}
						style={{
							position: "absolute",
							left: "50%",
							transform: "translateX(-50%)",
							top: scrollTop + 4,
							zIndex: 50,
							display: "flex",
							alignItems: "center",
							gap: 3,
							height: 20,
							padding: "0 7px",
							background: "#1c1c1f",
							border: "1px solid #3f3f46",
							borderRadius: 999,
							fontSize: 10,
							fontWeight: 600,
							color: "#a1a1aa",
							cursor: "pointer",
							whiteSpace: "nowrap",
							boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
							fontFamily: "inherit",
						}}
					>
						<ChevronUp size={10} strokeWidth={2.5} />
						{aboveCount}
					</button>
				)}

				{/* Below-fold overflow pill */}
				{belowCount > 0 && visibleHeight > 0 && (
					<button
						onClick={() => onScrollToY(bottommostBelowTop - 8)}
						style={{
							position: "absolute",
							left: "50%",
							transform: "translateX(-50%)",
							top: scrollTop + visibleHeight - 28,
							zIndex: 50,
							display: "flex",
							alignItems: "center",
							gap: 3,
							height: 20,
							padding: "0 7px",
							background: "#1c1c1f",
							border: "1px solid #3f3f46",
							borderRadius: 999,
							fontSize: 10,
							fontWeight: 600,
							color: "#a1a1aa",
							cursor: "pointer",
							whiteSpace: "nowrap",
							boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
							fontFamily: "inherit",
						}}
					>
						<ChevronDown size={10} strokeWidth={2.5} />
						{belowCount}
					</button>
				)}

				{/* Ghost card at drop target position */}
				{pendingDrop && (() => {
					const ghostStart = pendingDrop.type === "visit"
						? pendingDrop.updateData?.scheduled_start_at
						: pendingDrop.occurrenceInput?.new_start_at;
					const ghostEnd = pendingDrop.type === "visit"
						? pendingDrop.updateData?.scheduled_end_at
						: pendingDrop.occurrenceInput?.new_end_at;
					if (!ghostStart) return null;

					const ghostTop = calcTopFromDatetime(ghostStart);

					// Match the sizing logic of the actual rendered cards exactly.
					let ghostHeight: number;
					if (pendingDrop.type === "visit" && pendingDrop.visitObj) {
						const ud = pendingDrop.updateData!;
						const vObj = pendingDrop.visitObj;
						const ghostVisit = {
							...vObj,
							scheduled_start_at: ghostStart,
							scheduled_end_at:   ghostEnd ?? vObj.scheduled_end_at,
							arrival_constraint: ud.arrival_constraint  ?? vObj.arrival_constraint,
							arrival_time:       ud.arrival_time !== undefined ? ud.arrival_time : vObj.arrival_time,
							arrival_window_start: ud.arrival_window_start !== undefined ? ud.arrival_window_start : vObj.arrival_window_start,
							arrival_window_end:   ud.arrival_window_end   !== undefined ? ud.arrival_window_end   : vObj.arrival_window_end,
							finish_constraint:  ud.finish_constraint ?? vObj.finish_constraint,
						};
						const openEnded = ghostVisit.finish_constraint === "when_done";
						ghostHeight = calcCardHeight(ghostVisit, openEnded);
					} else {
						// Occurrences: cap at 2 hours, same as the real occurrence card rendering
						ghostHeight = Math.min(2 * SLOT_H, columnHeight - ghostTop);
					}

					const origSlot = combinedSlots.find((s) => s.visit.id === pendingDrop.id);
					const ghostLeft = origSlot?.left ?? LEFT_PAD;
					const ghostWidth = origSlot?.width ?? (colWidth - LEFT_PAD - RIGHT_PAD);

					return (
						<div
							key="ghost-drop"
							style={{
								position: "absolute",
								top: ghostTop,
								left: pendingDrop.type === "occurrence" ? LEFT_PAD : ghostLeft,
								width: pendingDrop.type === "occurrence" ? colWidth - LEFT_PAD - RIGHT_PAD : ghostWidth,
								height: ghostHeight,
								opacity: 0.5,
								border: "1px dashed #3b82f6",
								borderRadius: 4,
								backgroundColor: pendingDrop.type === "occurrence" ? "#252838" : "#1e2433",
								boxShadow: "inset 0 0 0 999px rgba(59,130,246,0.08)",
								zIndex: 25,
								pointerEvents: "none",
								display: "flex",
								alignItems: "stretch",
								overflow: "hidden",
								boxSizing: "border-box",
							}}
						>
							{/* Priority strip */}
							<div style={{
								width: 4,
								flexShrink: 0,
								backgroundColor: pendingDrop.priorityColor,
								opacity: 0.7,
							}} />
							{/* Name + time */}
							<div style={{
								flex: 1,
								minWidth: 0,
								padding: "4px 6px",
								display: "flex",
								flexDirection: "column",
								gap: 2,
								overflow: "hidden",
							}}>
								<span style={{
									fontSize: 10,
									fontWeight: 600,
									color: pendingDrop.type === "occurrence" ? "#c4b5fd" : "#e4e4e7",
									fontStyle: pendingDrop.type === "occurrence" ? "italic" : "normal",
									overflow: "hidden",
									whiteSpace: "nowrap",
									textOverflow: "ellipsis",
									lineHeight: 1.2,
								}}>
									{pendingDrop.entityName}
								</span>
								{ghostHeight >= 34 && (
									<span style={{
										fontSize: 9,
										color: "#60a5fa",
										lineHeight: 1.2,
										whiteSpace: "nowrap",
									}}>
										{pendingDrop.newTimeLabel}
									</span>
								)}
							</div>
						</div>
					);
				})()}
			</div>

			{/* ── Fixed-position overlays (escape column bounds) ────────────────── */}

			{/* Drag-triggered visit reschedule */}
			{pendingDrop?.type === "visit" && pendingDrop.visitObj && (() => {
				const vObj = pendingDrop.visitObj!;
				const ud = pendingDrop.updateData!;
				const syntheticVisit: VisitWithJob = {
					...vObj,
					scheduled_start_at: ud.scheduled_start_at ?? vObj.scheduled_start_at,
					scheduled_end_at:   ud.scheduled_end_at   ?? vObj.scheduled_end_at,
					arrival_constraint: ud.arrival_constraint  ?? vObj.arrival_constraint,
					arrival_time:       ud.arrival_time !== undefined ? ud.arrival_time : vObj.arrival_time,
					arrival_window_start: ud.arrival_window_start !== undefined ? ud.arrival_window_start : vObj.arrival_window_start,
					arrival_window_end:   ud.arrival_window_end   !== undefined ? ud.arrival_window_end   : vObj.arrival_window_end,
					finish_constraint:  ud.finish_constraint ?? vObj.finish_constraint,
					finish_time:        ud.finish_time !== undefined ? ud.finish_time : vObj.finish_time,
				};
				const origDateStr = toDateStr(new Date(vObj.scheduled_start_at));
				const anchorRect = {
					top: pendingDrop.clientY - 20, bottom: pendingDrop.clientY + 20,
					left: pendingDrop.clientX, right: pendingDrop.clientX + 1,
					width: 1, height: 40, x: pendingDrop.clientX, y: pendingDrop.clientY - 20,
					toJSON: () => ({}),
				} as DOMRect;
				return (
					<ReschedulePopup
						visit={syntheticVisit}
						oldDateStr={origDateStr}
						newDateStr={dateStr}
						allVisitsOnNewDay={visits}
						technicians={technicians}
						techColorMap={techColorMap}
						anchorRect={anchorRect}
						fromLabel={pendingDrop.oldTimeLabel}
						toLabel={pendingDrop.newTimeLabel}
						onSave={handleDragRescheduleVisitSave}
						onUndo={() => setPendingDrop(null)}
					/>
				);
			})()}

			{/* Drag-triggered occurrence reschedule */}
			{pendingDrop?.type === "occurrence" && pendingDrop.occurrenceObj && (() => {
				const oObj = pendingDrop.occurrenceObj!;
				const oi = pendingDrop.occurrenceInput!;
				const syntheticOcc: OccurrenceWithPlan = (() => {
					const newStart     = new Date(oi.new_start_at ?? oObj.occurrence_start_at);
					const newEnd       = new Date(oi.new_end_at   ?? oObj.occurrence_end_at);
					const newStartMins = newStart.getHours() * 60 + newStart.getMinutes();
					const newEndMins   = newEnd.getHours()   * 60 + newEnd.getMinutes();
					const newHHMM      = minsToHHMM(newStartMins);

					// Shift arrival constraint fields to the new drop time, preserving window duration.
					// Mirrors the same logic applied to visit drags above.
					let arrival_time         = oObj.arrival_time;
					let arrival_window_start = oObj.arrival_window_start;
					let arrival_window_end   = oObj.arrival_window_end;
					let finish_time          = oObj.finish_time;

					if (oObj.arrival_constraint === "at") {
						arrival_time = newHHMM;
					} else if (oObj.arrival_constraint === "between") {
						const origStartMins = hhmmToMins(oObj.arrival_window_start);
						const origEndMins   = hhmmToMins(oObj.arrival_window_end);
						const windowDur     = origStartMins !== null && origEndMins !== null
							? origEndMins - origStartMins : 60;
						arrival_window_start = newHHMM;
						arrival_window_end   = minsToHHMM(newStartMins + windowDur);
					} else if (oObj.arrival_constraint === "by") {
						arrival_window_end = newHHMM;
					}

					if (oObj.finish_constraint === "at" || oObj.finish_constraint === "by") {
						finish_time = minsToHHMM(newEndMins);
					}

					return {
						...oObj,
						occurrence_start_at:  oi.new_start_at ?? oObj.occurrence_start_at,
						occurrence_end_at:    oi.new_end_at   ?? oObj.occurrence_end_at,
						arrival_time,
						arrival_window_start,
						arrival_window_end,
						finish_time,
					};
				})();
				const origDateStr = toDateStr(new Date(oObj.occurrence_start_at));
				const anchorRect = {
					top: pendingDrop.clientY - 20, bottom: pendingDrop.clientY + 20,
					left: pendingDrop.clientX, right: pendingDrop.clientX + 1,
					width: 1, height: 40, x: pendingDrop.clientX, y: pendingDrop.clientY - 20,
					toJSON: () => ({}),
				} as DOMRect;
				return (
					<OccurrenceReschedulePopup
						occurrence={syntheticOcc}
						oldDateStr={origDateStr}
						newDateStr={dateStr}
						allOccurrencesOnNewDay={occurrences}
						anchorRect={anchorRect}
						fromLabel={pendingDrop.oldTimeLabel}
						toLabel={pendingDrop.newTimeLabel}
						onReschedule={handleDragRescheduleOccurrenceSave}
						onGenerate={handleDragRescheduleOccurrenceGenerate}
						onCancel={() => setPendingDrop(null)}
						isGenerating={generatingVisitId === pendingDrop.id}
					/>
				);
			})()}

			{/* Clock-button triggered visit reschedule */}
			{pendingClickReschedule?.type === "visit" && pendingClickReschedule.visit && (
				<ReschedulePopup
					visit={pendingClickReschedule.visit}
					oldDateStr={dateStr}
					newDateStr={toDateStr(new Date(pendingClickReschedule.visit.scheduled_start_at))}
					allVisitsOnNewDay={visits}
					technicians={technicians}
					techColorMap={techColorMap}
					anchorRect={pendingClickReschedule.anchorRect}
					onSave={handleClickRescheduleVisitSave}
					onUndo={() => setPendingClickReschedule(null)}
				/>
			)}

			{/* Clock-button triggered occurrence reschedule */}
			{pendingClickReschedule?.type === "occurrence" && pendingClickReschedule.occurrence && (
				<OccurrenceReschedulePopup
					occurrence={pendingClickReschedule.occurrence}
					oldDateStr={dateStr}
					newDateStr={dateStr}
					anchorRect={pendingClickReschedule.anchorRect}
					onReschedule={handleClickRescheduleOccurrenceSave}
					onGenerate={handleClickRescheduleOccurrenceGenerate}
					onCancel={() => setPendingClickReschedule(null)}
					isGenerating={generatingVisitId === pendingClickReschedule.occurrence.id}
				/>
			)}
		</>
	);
}
