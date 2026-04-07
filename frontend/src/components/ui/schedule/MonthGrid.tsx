import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MonthMiniCard from "./MonthMiniCard";
import ReschedulePopup from "./ReschedulePopup";
import OccurrenceReschedulePopup from "./OccurrenceReschedulePopup";
import { visitStartLabel, visitEndLabel, getPriorityColor, SCROLL_ZONE_W, SCROLL_DELAY_MS } from "./scheduleBoardUtils";
import { formatTime } from "./dashboardCalendarUtils";
import type { UpdateJobVisitInput } from "../../../types/jobs";
import type { Technician } from "../../../types/technicians";
import type { OccurrenceWithPlan, VisitWithJob } from "./dashboardCalendarUtils";
import type { RescheduleOccurrenceInput, VisitGenerationResult } from "../../../types/recurringPlans";

type DayItem =
	| { type: "visit"; item: VisitWithJob }
	| { type: "occ"; item: OccurrenceWithPlan };

interface PendingDrop {
	visit: VisitWithJob;
	oldDateStr: string;
	newDateStr: string;
	anchorRect: DOMRect;
}

interface PendingOccurrenceDrop {
	occurrence: OccurrenceWithPlan;
	fromDateStr: string;
	newDateStr: string;
	anchorRect: DOMRect;
}

interface ClickedOccurrence {
	occ: OccurrenceWithPlan;
	rect: DOMRect;
}

interface MonthGridProps {
	year: number;
	month: number;
	todayStr: string;
	visitsByDay: Record<string, VisitWithJob[]>;
	occurrencesByDay: Record<string, OccurrenceWithPlan[]>;
	showVisits: boolean;
	showOccurrences: boolean;
	technicians: Technician[];
	techColorMap: Map<string, string>;
	selectedTechs: Set<string>;
	isAllSelected: boolean;
	updateVisit: (args: { id: string; data: UpdateJobVisitInput }) => Promise<unknown>;
	rescheduleOccurrence: (args: { occurrenceId: string; jobId: string; input: RescheduleOccurrenceInput }) => Promise<unknown>;
	generateVisitFromOccurrence: (args: { occurrenceId: string; jobId: string }) => Promise<VisitGenerationResult>;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	currentMonthYear: { year: number; month: number };
	onRestoreMonthYear: (my: { year: number; month: number }) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Card geometry constants (must match MonthMiniCard)
const CARD_MIN_H  = 28;  // fixed card height: 2 × (9px × 1.3) + 4px padding ≈ 28px
const CARD_GAP    = 2;
const DAY_NUM_H   = 23;  // day-number circle (20px) + bottom margin (3px)
const MORE_BTN_H  = 16;  // "+N more" button height
const CELL_PAD    = 8;   // 4px top + 4px bottom cell padding

function getCalendarWeeks(year: number, month: number): string[][] {
	const pad = (n: number) => String(n).padStart(2, "0");
	const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
	const lastDateOfMonth = new Date(year, month + 1, 0).getDate();

	// Previous month info (for leading padding)
	const prevYear  = month === 0 ? year - 1 : year;
	const prevMonth = month === 0 ? 11 : month - 1;
	const lastDateOfPrev = new Date(prevYear, prevMonth + 1, 0).getDate();

	// Next month info (for trailing padding)
	const nextYear  = month === 11 ? year + 1 : year;
	const nextMonth = month === 11 ? 0 : month + 1;

	const weeks: string[][] = [];
	let week: string[] = [];

	// Leading cells from previous month
	for (let i = firstDayOfWeek - 1; i >= 0; i--) {
		week.push(`${prevYear}-${pad(prevMonth + 1)}-${pad(lastDateOfPrev - i)}`);
	}

	// Current month days
	for (let d = 1; d <= lastDateOfMonth; d++) {
		week.push(`${year}-${pad(month + 1)}-${pad(d)}`);
		if (week.length === 7) { weeks.push(week); week = []; }
	}

	// Trailing cells from next month
	let nextDay = 1;
	while (week.length > 0 && week.length < 7) {
		week.push(`${nextYear}-${pad(nextMonth + 1)}-${pad(nextDay++)}`);
	}
	if (week.length > 0) weeks.push(week);

	return weeks;
}

/** Look up a visit by ID across all days (avoids UTC/local date grouping mismatch). */
function findVisitById(
	visitsByDay: Record<string, VisitWithJob[]>,
	id: string
): VisitWithJob | undefined {
	for (const dayVisits of Object.values(visitsByDay)) {
		const found = dayVisits.find((v) => v.id === id);
		if (found) return found;
	}
	return undefined;
}

/** Look up an occurrence by ID across all days. */
function findOccurrenceById(
	occurrencesByDay: Record<string, OccurrenceWithPlan[]>,
	id: string
): OccurrenceWithPlan | undefined {
	for (const occs of Object.values(occurrencesByDay)) {
		const found = occs.find((o) => o.id === id);
		if (found) return found;
	}
	return undefined;
}

interface ClickedVisit {
	visit: VisitWithJob;
	rect: DOMRect;
}

const POPUP_W = 224;

function getPopupPos(rect: DOMRect): { top: number; left: number } {
	const vp = { w: window.innerWidth, h: window.innerHeight };
	const PAD = 8;
	const spaceRight = vp.w - rect.right - PAD;
	const left = spaceRight >= POPUP_W
		? rect.right + 4
		: Math.max(PAD, rect.left - POPUP_W - 4);
	const top = Math.max(PAD, Math.min(rect.top, vp.h - 260 - PAD));
	return { top, left };
}

export default function MonthGrid({
	year,
	month,
	todayStr,
	visitsByDay,
	occurrencesByDay,
	showVisits,
	showOccurrences,
	technicians,
	techColorMap,
	updateVisit,
	rescheduleOccurrence,
	generateVisitFromOccurrence,
	onPrevMonth,
	onNextMonth,
	currentMonthYear,
	onRestoreMonthYear,
}: MonthGridProps) {
	const navigate = useNavigate();
	const [dragOverDate, setDragOverDate] = useState<string | null>(null);
	const [draggingVisitId, setDraggingVisitId] = useState<string | null>(null);
	const [draggingOccurrenceId, setDraggingOccurrenceId] = useState<string | null>(null);
	const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
	const [pendingOccurrenceDrop, setPendingOccurrenceDrop] = useState<PendingOccurrenceDrop | null>(null);
	const [expandedDay, setExpandedDay] = useState<string | null>(null);
	const [clickedVisit, setClickedVisit] = useState<ClickedVisit | null>(null);
	const [clickedOccurrence, setClickedOccurrence] = useState<ClickedOccurrence | null>(null);
	const [generatingVisitId, setGeneratingVisitId] = useState<string | null>(null);
	const expandedRef = useRef<HTMLDivElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);
	const occurrencePopupRef = useRef<HTMLDivElement>(null);
	const gridContainerRef = useRef<HTMLDivElement>(null);
	const [gridHeight, setGridHeight] = useState(0);

	// ── Scroll zone state/refs ────────────────────────────────────────────────
	const [monthScrollZone, setMonthScrollZone]         = useState<"left" | "right" | null>(null);
	const [monthScrollProgress, setMonthScrollProgress] = useState(0);
	const monthScrollZoneRef      = useRef<"left" | "right" | null>(null);
	const monthScrollEnterTimeRef = useRef<number | null>(null);
	const monthScrollRafRef       = useRef<number | null>(null);
	const monthDragOriginRef      = useRef<{ year: number; month: number } | null>(null);
	const monthHasPendingPopupRef = useRef(false);

	// Optimistic maps: while a drop is pending, show the card at its new date
	const effectiveVisitsByDay = useMemo(() => {
		if (!pendingDrop) return visitsByDay;
		const result: Record<string, VisitWithJob[]> = { ...visitsByDay };
		result[pendingDrop.oldDateStr] = (result[pendingDrop.oldDateStr] ?? []).filter(
			(v) => v.id !== pendingDrop.visit.id
		);
		result[pendingDrop.newDateStr] = [
			...(result[pendingDrop.newDateStr] ?? []),
			pendingDrop.visit,
		];
		return result;
	}, [visitsByDay, pendingDrop]);

	const effectiveOccurrencesByDay = useMemo(() => {
		if (!pendingOccurrenceDrop) return occurrencesByDay;
		const result: Record<string, OccurrenceWithPlan[]> = { ...occurrencesByDay };
		result[pendingOccurrenceDrop.fromDateStr] = (result[pendingOccurrenceDrop.fromDateStr] ?? []).filter(
			(o) => o.id !== pendingOccurrenceDrop.occurrence.id
		);
		result[pendingOccurrenceDrop.newDateStr] = [
			...(result[pendingOccurrenceDrop.newDateStr] ?? []),
			pendingOccurrenceDrop.occurrence,
		];
		return result;
	}, [occurrencesByDay, pendingOccurrenceDrop]);

	const weeks = getCalendarWeeks(year, month);

	// Measure grid container height for dynamic card limit
	useEffect(() => {
		const el = gridContainerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => setGridHeight(entry.contentRect.height));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Per-cell dynamic visible limit
	const cellHeight = weeks.length > 0 && gridHeight > 0 ? gridHeight / weeks.length : 80;
	// Max cards that fit without a "+more" button
	const limitWithout = Math.max(1, Math.floor((cellHeight - DAY_NUM_H - CELL_PAD) / (CARD_MIN_H + CARD_GAP)));
	// Max cards that fit when reserving space for the "+more" button
	const limitWith = Math.max(1, Math.floor((cellHeight - DAY_NUM_H - CELL_PAD - MORE_BTN_H) / (CARD_MIN_H + CARD_GAP)));

	// Close expanded overlay on outside click
	useEffect(() => {
		if (!expandedDay) return;
		function handleClick(e: MouseEvent) {
			if (expandedRef.current && !expandedRef.current.contains(e.target as Node)) {
				setExpandedDay(null);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [expandedDay]);

	// Close visit popup on outside click
	useEffect(() => {
		if (!clickedVisit) return;
		function handleClick(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				setClickedVisit(null);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [clickedVisit]);

	// Close occurrence popup on outside click
	useEffect(() => {
		if (!clickedOccurrence) return;
		function handleClick(e: MouseEvent) {
			if (occurrencePopupRef.current && !occurrencePopupRef.current.contains(e.target as Node)) {
				setClickedOccurrence(null);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [clickedOccurrence]);

	// Cleanup RAF on unmount
	useEffect(() => {
		return () => { if (monthScrollRafRef.current) cancelAnimationFrame(monthScrollRafRef.current); };
	}, []);

	const isDragging = draggingVisitId !== null || draggingOccurrenceId !== null;

	// ── Scroll zone RAF helpers ───────────────────────────────────────────────

	function startMonthScrollRaf() {
		if (monthScrollRafRef.current) return;
		function tick() {
			const enterTime = monthScrollEnterTimeRef.current;
			const zone = monthScrollZoneRef.current;
			if (!enterTime || !zone) { monthScrollRafRef.current = null; return; }
			const progress = Math.min(1, (Date.now() - enterTime) / SCROLL_DELAY_MS);
			setMonthScrollProgress(progress);
			if (progress >= 1) {
				if (zone === "left") onPrevMonth(); else onNextMonth();
				monthScrollEnterTimeRef.current = Date.now();
			}
			monthScrollRafRef.current = requestAnimationFrame(tick);
		}
		monthScrollRafRef.current = requestAnimationFrame(tick);
	}

	function stopMonthScrollRaf() {
		if (monthScrollRafRef.current) { cancelAnimationFrame(monthScrollRafRef.current); monthScrollRafRef.current = null; }
	}

	function clearMonthScrollZone() {
		setMonthScrollZone(null);
		monthScrollZoneRef.current = null;
		monthScrollEnterTimeRef.current = null;
		stopMonthScrollRaf();
		setMonthScrollProgress(0);
	}

	function restoreOriginMonth() {
		if (monthDragOriginRef.current) onRestoreMonthYear(monthDragOriginRef.current);
		monthDragOriginRef.current = null;
		monthHasPendingPopupRef.current = false;
	}

	function handleMonthGridDragOver(e: React.DragEvent<HTMLDivElement>) {
		const rect = gridContainerRef.current?.getBoundingClientRect();
		if (!rect || !isDragging) return;
		const x = e.clientX - rect.left;
		const newZone: "left" | "right" | null =
			x < SCROLL_ZONE_W ? "left" : x > rect.width - SCROLL_ZONE_W ? "right" : null;
		if (newZone !== monthScrollZoneRef.current) {
			monthScrollZoneRef.current = newZone;
			setMonthScrollZone(newZone);
			if (newZone) {
				monthScrollEnterTimeRef.current = Date.now();
				startMonthScrollRaf();
			} else {
				monthScrollEnterTimeRef.current = null;
				stopMonthScrollRaf();
				setMonthScrollProgress(0);
			}
		}
	}

	function handleMonthGridDragLeave(e: React.DragEvent<HTMLDivElement>) {
		const rect = gridContainerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const { clientX: x, clientY: y } = e;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) clearMonthScrollZone();
	}

	function handleDragStart(e: React.DragEvent, visit: VisitWithJob, fromDateStr: string) {
		monthDragOriginRef.current = currentMonthYear;
		setDraggingVisitId(visit.id);
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({ type: "visit", visitId: visit.id, fromDateStr })
		);
		e.dataTransfer.effectAllowed = "move";

		const el = e.currentTarget as HTMLElement;
		function onNativeDragEnd() {
			el.removeEventListener("dragend", onNativeDragEnd);
			setDragOverDate(null);
			setDraggingVisitId(null);
			setDraggingOccurrenceId(null);
			clearMonthScrollZone();
			if (!monthHasPendingPopupRef.current) restoreOriginMonth();
		}
		el.addEventListener("dragend", onNativeDragEnd);
	}

	function handleOccurrenceDragStart(e: React.DragEvent, occ: OccurrenceWithPlan, fromDateStr: string) {
		monthDragOriginRef.current = currentMonthYear;
		setDraggingOccurrenceId(occ.id);
		const startMs = new Date(occ.occurrence_start_at).getTime();
		const endMs   = new Date(occ.occurrence_end_at).getTime();
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({ type: "occurrence", occurrenceId: occ.id, jobId: occ.job_obj.id, durationMs: endMs - startMs, fromDateStr })
		);
		e.dataTransfer.effectAllowed = "move";

		const el = e.currentTarget as HTMLElement;
		function onNativeDragEnd() {
			el.removeEventListener("dragend", onNativeDragEnd);
			setDragOverDate(null);
			setDraggingVisitId(null);
			setDraggingOccurrenceId(null);
			clearMonthScrollZone();
			if (!monthHasPendingPopupRef.current) restoreOriginMonth();
		}
		el.addEventListener("dragend", onNativeDragEnd);
	}

	function handleDragEnd() {
		setDragOverDate(null);
		setDraggingVisitId(null);
		setDraggingOccurrenceId(null);
		clearMonthScrollZone();
		if (!monthHasPendingPopupRef.current) restoreOriginMonth();
	}

	function handleDragOver(e: React.DragEvent, dateStr: string) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOverDate(dateStr);
	}

	function handleDragLeave(e: React.DragEvent) {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			setDragOverDate(null);
		}
	}

	function handleDrop(e: React.DragEvent, toDateStr: string) {
		e.preventDefault();
		setDragOverDate(null);
		setDraggingVisitId(null);
		setDraggingOccurrenceId(null);

		const raw = e.dataTransfer.getData("text/plain");
		if (!raw) return;

		const parsed = JSON.parse(raw) as {
			type?: string;
			visitId?: string;
			occurrenceId?: string;
			jobId?: string;
			durationMs?: number;
			fromDateStr: string;
		};

		const fromDateStr = parsed.fromDateStr;
		if (fromDateStr === toDateStr) { restoreOriginMonth(); return; } // no-op: same day

		const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();

		if (parsed.type === "occurrence") {
			const occ = findOccurrenceById(occurrencesByDay, parsed.occurrenceId!);
			if (!occ) return;
			monthHasPendingPopupRef.current = true;
			setPendingOccurrenceDrop({ occurrence: occ, fromDateStr, newDateStr: toDateStr, anchorRect });
			return;
		}

		// Visit drop (type === "visit" or legacy without type)
		const visit = findVisitById(visitsByDay, parsed.visitId!);
		if (!visit) return;
		monthHasPendingPopupRef.current = true;
		setPendingDrop({ visit, oldDateStr: fromDateStr, newDateStr: toDateStr, anchorRect });
	}

	async function handleSave(visitId: string, data: UpdateJobVisitInput) {
		try {
			await updateVisit({ id: visitId, data });
			monthDragOriginRef.current = null;
			monthHasPendingPopupRef.current = false;
		} catch {
			// failure reverts via query invalidation
		}
		setPendingDrop(null);
	}

	async function handleOccurrenceSave(newStartAt: string, newEndAt: string | undefined) {
		if (!pendingOccurrenceDrop) return;
		const { occurrence } = pendingOccurrenceDrop;
		try {
			await rescheduleOccurrence({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
				input: { new_start_at: newStartAt, new_end_at: newEndAt },
			});
			monthDragOriginRef.current = null;
			monthHasPendingPopupRef.current = false;
		} catch {
			// failure reverts via query invalidation
		}
		setPendingOccurrenceDrop(null);
	}

	async function handleOccurrenceGenerate(newStartAt: string, newEndAt: string | undefined) {
		if (!pendingOccurrenceDrop) return;
		const { occurrence } = pendingOccurrenceDrop;
		setGeneratingVisitId(occurrence.id);
		setPendingOccurrenceDrop(null);
		try {
			await rescheduleOccurrence({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
				input: { new_start_at: newStartAt, new_end_at: newEndAt },
			});
			await generateVisitFromOccurrence({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
			});
			monthDragOriginRef.current = null;
			monthHasPendingPopupRef.current = false;
		} catch {
			// failure — data reverts via query invalidation
		}
		setGeneratingVisitId(null);
	}

	async function handleGenerateVisitFromClickedOccurrence() {
		if (!clickedOccurrence) return;
		const { occ } = clickedOccurrence;
		setGeneratingVisitId(occ.id);
		setClickedOccurrence(null);
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

	function renderMiniCard(dayItem: DayItem, dateStr: string) {
		if (dayItem.type === "visit") {
			const v = dayItem.item;
			const openEnded = v.finish_constraint === "when_done";
			const timeLabel =
				visitStartLabel(v) + (openEnded ? "" : `–${visitEndLabel(v)}`);
			const techs = (v.visit_techs ?? []).map((vt) => ({
				id: vt.tech_id,
				color: techColorMap.get(vt.tech_id) ?? "#6b7280",
			}));
			return (
				<MonthMiniCard
					key={v.id}
					visitName={v.job_obj?.name ?? "Visit"}
					priorityColor={getPriorityColor(v.job_obj?.priority)}
					timeLabel={timeLabel}
					techs={techs}
					isDragging={draggingVisitId === v.id || pendingDrop?.visit.id === v.id}
					onDragStart={(e) => handleDragStart(e, v, dateStr)}
					onDragEnd={handleDragEnd}
					onClick={(e) => {
						e.stopPropagation();
						setClickedOccurrence(null);
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						setClickedVisit((prev) =>
							prev?.visit.id === v.id ? null : { visit: v, rect }
						);
					}}
				/>
			);
		} else {
			const occ = dayItem.item;
			const isGenerating = generatingVisitId === occ.id;
			return (
				<MonthMiniCard
					key={occ.id}
					visitName={occ.job_obj?.name ?? "Recurring"}
					priorityColor={getPriorityColor(occ.job_obj?.priority)}
					timeLabel={formatTime(occ.occurrence_start_at)}
					techs={[]}
					isOccurrence
					isDragging={draggingOccurrenceId === occ.id || isGenerating || pendingOccurrenceDrop?.occurrence.id === occ.id}
					onDragStart={(e) => handleOccurrenceDragStart(e, occ, dateStr)}
					onDragEnd={handleDragEnd}
					onClick={(e) => {
						e.stopPropagation();
						setClickedVisit(null);
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						setClickedOccurrence((prev) =>
							prev?.occ.id === occ.id ? null : { occ, rect }
						);
					}}
				/>
			);
		}
	}

	// Day-number label style (reused in normal cell and expanded overlay)
	const dayNumStyle = (isToday: boolean): React.CSSProperties => ({
		fontSize: 11,
		fontWeight: isToday ? 700 : 400,
		color: isToday ? "#3b82f6" : "#71717a",
		width: 20,
		height: 20,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "50%",
		backgroundColor: isToday ? "rgba(59,130,246,0.15)" : "transparent",
	});

	const otherMonthDayNumStyle: React.CSSProperties = {
		fontSize: 11,
		fontWeight: 400,
		color: "#3f3f46",
		width: 20,
		height: 20,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "50%",
		backgroundColor: "transparent",
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
			{/* Weekday header — issue 2: borderRight on each cell so columns align with grid */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
					borderBottom: "1px solid #27272a",
					flexShrink: 0,
				}}
			>
				{WEEKDAYS.map((wd, i) => (
					<div
						key={wd}
						style={{
							textAlign: "center",
							padding: "6px 0",
							fontSize: 11,
							fontWeight: 600,
							color: "#71717a",
							textTransform: "uppercase",
							letterSpacing: "0.05em",
							borderRight: i < 6 ? "1px solid #27272a" : "none",
						}}
					>
						{wd}
					</div>
				))}
			</div>

			{/* Calendar grid — issue 3: ref for height measurement */}
			<div
				ref={gridContainerRef}
				style={{
					flex: 1,
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
					gridTemplateRows: `repeat(${weeks.length}, 1fr)`,
					position: "relative",
				}}
				onDragOver={handleMonthGridDragOver}
				onDragLeave={handleMonthGridDragLeave}
			>
				{weeks.flat().map((dateStr, flatIdx) => {
					const di        = flatIdx % 7;
					const wi        = Math.floor(flatIdx / 7);
					const isLastRow = wi === weeks.length - 1;

					const [dY, dM] = dateStr.split("-").map(Number);
					const isOtherMonth = dY !== year || dM !== month + 1;
					const isToday      = dateStr === todayStr;
					const isDragOver   = dragOverDate === dateStr;
					const dayVisits    = showVisits      ? (effectiveVisitsByDay[dateStr]      ?? []) : [];
					const dayOccs      = showOccurrences ? (effectiveOccurrencesByDay[dateStr] ?? []) : [];

					const allItems: DayItem[] = [
						...dayVisits.map((v): DayItem => ({ type: "visit", item: v })),
						...dayOccs.map((o): DayItem => ({ type: "occ", item: o })),
					];

					const totalCount   = allItems.length;
					const visibleLimit = totalCount <= limitWithout ? limitWithout : limitWith;
					const visibleItems = allItems.slice(0, visibleLimit);
					const hiddenCount  = Math.max(0, totalCount - visibleLimit);

					const dayNum     = parseInt(dateStr.split("-")[2]);
					const isExpanded = expandedDay === dateStr;

					return (
						<div
							key={dateStr}
							style={{
								borderRight: di < 6 ? "1px solid #27272a" : "none",
								borderBottom: "1px solid #27272a",
								padding: 4,
								boxSizing: "border-box",
								position: "relative",
								backgroundColor: isDragOver
									? "rgba(59,130,246,0.1)"
									: isToday
									? "rgba(59,130,246,0.04)"
									: isOtherMonth
									? "rgba(0,0,0,0.12)"
									: "transparent",
								outline: isDragOver ? "2px inset rgba(59,130,246,0.6)" : "none",
								transition: "background-color 0.1s",
							}}
							onDragOver={(e) => handleDragOver(e, dateStr)}
							onDragLeave={handleDragLeave}
							onDrop={(e) => handleDrop(e, dateStr)}
						>
							{/* Day number */}
							<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3 }}>
								<span style={isOtherMonth ? otherMonthDayNumStyle : dayNumStyle(isToday)}>{dayNum}</span>
							</div>

							{/* Mini-cards (clipped to dynamic limit) */}
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								{visibleItems.map((dayItem) => renderMiniCard(dayItem, dateStr))}
							</div>

							{/* +N more */}
							{hiddenCount > 0 && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										setExpandedDay(isExpanded ? null : dateStr);
									}}
									style={{
										marginTop: 2,
										fontSize: 9,
										color: "#71717a",
										background: "none",
										border: "none",
										cursor: "pointer",
										padding: "1px 0",
										display: "block",
										width: "100%",
										textAlign: "left",
										fontFamily: "inherit",
									}}
								>
									+{hiddenCount} more
								</button>
							)}

							{/* Expanded cell overlay — ~2× cell height, flips upward on last row */}
							{isExpanded && (
								<div
									ref={expandedRef}
									style={{
										position: "absolute",
										left: 0,
										width: "100%",
										...(isLastRow
											? { bottom: 0 }
											: { top: 0 }),
										height: Math.round(cellHeight * 2),
										zIndex: 200,
										backgroundColor: "#1a1a1e",
										border: "1px solid #3f3f46",
										borderRadius: 6,
										padding: 4,
										boxShadow: "0 8px 24px rgba(0,0,0,0.65)",
										display: "flex",
										flexDirection: "column",
										boxSizing: "border-box",
									}}
								>
									{/* Day number header inside overlay */}
									<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3, flexShrink: 0 }}>
										<span style={dayNumStyle(isToday)}>{dayNum}</span>
									</div>
									{/* Scrollable full card list */}
									<div style={{
										flex: 1,
										overflowY: "auto",
										display: "flex",
										flexDirection: "column",
										gap: 2,
									}}>
										{allItems.map((dayItem) => renderMiniCard(dayItem, dateStr))}
									</div>
								</div>
							)}
						</div>
					);
				})}

				{/* Left month scroll zone */}
				<div aria-hidden style={{
					position: "absolute", left: 0, top: 0, bottom: 0, width: SCROLL_ZONE_W,
					pointerEvents: "none", opacity: isDragging ? 1 : 0, transition: "opacity 0.3s ease",
					overflow: "hidden", zIndex: 10,
				}}>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(59,130,246,0.22), transparent)" }} />
					{monthScrollZone === "left" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${monthScrollProgress * 100}%`,
							background: "linear-gradient(to right, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)" }} />
					)}
					{monthScrollZone === "left" && monthScrollProgress > 0 && (
						<div style={{ position: "absolute", top: 0, bottom: 0,
							left: `calc(${monthScrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.7)" }} />
					)}
					{monthScrollZone === "left" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 1, background: "rgba(59,130,246,0.55)" }} />
					)}
					<div style={{ position: "absolute", top: "50%", left: 6, transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (monthScrollZone === "left" ? monthScrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none" }}>‹</div>
				</div>

				{/* Right month scroll zone */}
				<div aria-hidden style={{
					position: "absolute", right: 0, top: 0, bottom: 0, width: SCROLL_ZONE_W,
					pointerEvents: "none", opacity: isDragging ? 1 : 0, transition: "opacity 0.3s ease",
					overflow: "hidden", zIndex: 10,
				}}>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to left, rgba(59,130,246,0.22), transparent)" }} />
					{monthScrollZone === "right" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${monthScrollProgress * 100}%`,
							background: "linear-gradient(to left, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)" }} />
					)}
					{monthScrollZone === "right" && monthScrollProgress > 0 && (
						<div style={{ position: "absolute", top: 0, bottom: 0,
							right: `calc(${monthScrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.7)" }} />
					)}
					{monthScrollZone === "right" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, background: "rgba(59,130,246,0.55)" }} />
					)}
					<div style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (monthScrollZone === "right" ? monthScrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none" }}>›</div>
				</div>
			</div>

			{/* Visit detail popup — fixed so it clears any overflow:hidden ancestors */}
			{clickedVisit && (() => {
				const v   = clickedVisit.visit;
				const pos = getPopupPos(clickedVisit.rect);
				return (
					<div
						ref={popupRef}
						style={{
							position: "fixed",
							top: pos.top,
							left: pos.left,
							width: POPUP_W,
							zIndex: 1000,
							backgroundColor: "#18181b",
							border: "1px solid #3f3f46",
							borderRadius: 8,
							boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
							padding: "10px 12px",
							fontFamily: "inherit",
						}}
					>
						{/* Header */}
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
							<span style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5", lineHeight: 1.3, flex: 1 }}>
								{v.job_obj?.name}
							</span>
							<button
								onClick={() => setClickedVisit(null)}
								style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
								onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
								onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
							>
								×
							</button>
						</div>

						{/* Status badge */}
						<span style={{
							display: "inline-block",
							fontSize: 9,
							fontWeight: 600,
							padding: "1px 6px",
							borderRadius: 10,
							marginBottom: 6,
							backgroundColor: "rgba(59,130,246,0.15)",
							color: "#93c5fd",
							textTransform: "uppercase",
							letterSpacing: "0.04em",
						}}>
							{v.status}
						</span>

						{/* Time */}
						<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 6 }}>
							{visitStartLabel(v)}
							{v.finish_constraint !== "when_done"
								? ` – ${visitEndLabel(v)}`
								: " · finish when done"}
						</div>

						{/* Tech pills */}
						{(v.visit_techs?.length ?? 0) > 0 && (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
								{v.visit_techs!.map((vt) => {
									const color = techColorMap.get(vt.tech_id) ?? "#6b7280";
									const name  = technicians.find((t) => t.id === vt.tech_id)?.name ?? vt.tech_id;
									return (
										<span
											key={vt.tech_id}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 3,
												fontSize: 9,
												color: "#e4e4e7",
												backgroundColor: color + "33",
												border: `1px solid ${color}55`,
												borderRadius: 10,
												padding: "1px 6px",
											}}
										>
											<span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color }} />
											{name}
										</span>
									);
								})}
							</div>
						)}

						{/* Navigate button */}
						<button
							onClick={() => navigate(`/dispatch/jobs/${v.job_obj.id}/visits/${v.id}`)}
							style={{
								width: "100%",
								padding: "6px 0",
								fontSize: 11,
								fontWeight: 600,
								color: "#fff",
								backgroundColor: "#3b82f6",
								border: "none",
								borderRadius: 5,
								cursor: "pointer",
								fontFamily: "inherit",
								transition: "background-color 0.1s",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
							onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
						>
							View Visit →
						</button>
					</div>
				);
			})()}

			{/* Reschedule popup */}
			{pendingDrop && (
				<ReschedulePopup
					visit={pendingDrop.visit}
					oldDateStr={pendingDrop.oldDateStr}
					newDateStr={pendingDrop.newDateStr}
					allVisitsOnNewDay={visitsByDay[pendingDrop.newDateStr] ?? []}
					technicians={technicians}
					techColorMap={techColorMap}
					anchorRect={pendingDrop.anchorRect}
					onSave={(data) => handleSave(pendingDrop.visit.id, data)}
					onUndo={() => { setPendingDrop(null); restoreOriginMonth(); }}
				/>
			)}

			{/* Occurrence reschedule popup (month view drag) */}
			{pendingOccurrenceDrop && (
				<OccurrenceReschedulePopup
					occurrence={pendingOccurrenceDrop.occurrence}
					oldDateStr={pendingOccurrenceDrop.fromDateStr}
					newDateStr={pendingOccurrenceDrop.newDateStr}
					anchorRect={pendingOccurrenceDrop.anchorRect}
					onReschedule={handleOccurrenceSave}
					onGenerate={handleOccurrenceGenerate}
					onCancel={() => { setPendingOccurrenceDrop(null); restoreOriginMonth(); }}
					isGenerating={generatingVisitId === pendingOccurrenceDrop.occurrence.id}
				/>
			)}

			{/* Occurrence click popup */}
			{clickedOccurrence && (() => {
				const { occ, rect } = clickedOccurrence;
				const pos = getPopupPos(rect);
				return (
					<div
						ref={occurrencePopupRef}
						style={{
							position: "fixed",
							top: pos.top,
							left: pos.left,
							width: POPUP_W,
							zIndex: 1000,
							backgroundColor: "#18181b",
							border: "1px solid #3f3f46",
							borderRadius: 8,
							boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
							padding: "10px 12px",
							fontFamily: "inherit",
						}}
					>
						{/* Header */}
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5", lineHeight: 1.3, marginBottom: 1 }}>
									{occ.plan.name}
								</div>
								<div style={{
									fontSize: 10,
									color: "#a1a1aa",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}>
									{occ.job_obj?.name}
								</div>
							</div>
							<button
								onClick={() => setClickedOccurrence(null)}
								style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
								onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
								onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
							>
								×
							</button>
						</div>

						{/* Status badge */}
						<span style={{
							display: "inline-block",
							fontSize: 9,
							fontWeight: 600,
							padding: "1px 6px",
							borderRadius: 10,
							marginBottom: 6,
							backgroundColor: "rgba(139,92,246,0.15)",
							color: "#a78bfa",
							textTransform: "uppercase",
							letterSpacing: "0.04em",
						}}>
							Planned
						</span>

						{/* Time */}
						<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 10 }}>
							{formatTime(occ.occurrence_start_at)}
							{" – "}
							{formatTime(occ.occurrence_end_at)}
						</div>

						{/* Buttons */}
						<div style={{ display: "flex", gap: 5 }}>
							<button
								onClick={() => {
									setClickedOccurrence(null);
									navigate(`/dispatch/recurring-plans/${occ.plan.id}`);
								}}
								style={{
									flex: 1,
									padding: "6px 0",
									fontSize: 11,
									fontWeight: 600,
									color: "#a78bfa",
									backgroundColor: "rgba(139,92,246,0.12)",
									border: "1px solid rgba(139,92,246,0.25)",
									borderRadius: 5,
									cursor: "pointer",
									fontFamily: "inherit",
									transition: "background-color 0.1s",
								}}
								onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(139,92,246,0.2)")}
								onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(139,92,246,0.12)")}
							>
								View Plan →
							</button>
							<button
								onClick={handleGenerateVisitFromClickedOccurrence}
								style={{
									flex: 1,
									padding: "6px 0",
									fontSize: 11,
									fontWeight: 600,
									color: "#fff",
									backgroundColor: "#3b82f6",
									border: "none",
									borderRadius: 5,
									cursor: "pointer",
									fontFamily: "inherit",
									transition: "background-color 0.1s",
								}}
								onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
								onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
							>
								Generate Visit
							</button>
						</div>
					</div>
				);
			})()}
		</div>
	);
}
