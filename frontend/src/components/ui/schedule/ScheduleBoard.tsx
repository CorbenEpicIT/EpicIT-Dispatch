import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScheduleBoardDayColumn, { setSharedDragOffset } from "./ScheduleBoardDayColumn";
import MonthGrid from "./MonthGrid";
import TechFilter from "./TechFilter";
import {
	buildTechOrder,
	getTechColor,
	getWeekDays,
	formatDayHeader,
	groupVisitsByDay,
	getPriorityColor,
	visitStartLabel,
	visitEndLabel,
	SLOT_H,
	DAY_START,
	DAY_END,
	SCROLL_ZONE_W,
	SCROLL_DELAY_MS,
} from "./scheduleBoardUtils";
import { extractOccurrences, type OccurrenceWithPlan, type VisitWithJob } from "./dashboardCalendarUtils";
import type { Job } from "../../../types/jobs";
import type { Technician } from "../../../types/technicians";
import { useUpdateJobVisitMutation } from "../../../hooks/useJobs";
import { useRescheduleOccurrenceMutation, useGenerateVisitFromOccurrenceMutation } from "../../../hooks/useRecurringPlans";

interface ScheduleBoardProps {
	jobs: Job[];
	technicians: Technician[];
}

/** An occurrence whose occurrence_start_at is local midnight — treated as "anytime" (no specific time). */
function isAnytimeOccurrence(occ: OccurrenceWithPlan): boolean {
	const d = new Date(occ.occurrence_start_at);
	return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

const GUTTER_W  = 64;
const HEADER_H  = 44;

function hourLabel(h: number): string {
	if (h === 0)  return "12 AM";
	if (h === 12) return "12 PM";
	return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function ScheduleBoard({ jobs, technicians }: ScheduleBoardProps) {
	const navigate = useNavigate();
	const [viewMode, setViewMode] = useState<"week" | "month">("week");

	// Week view state
	const [weekStart, setWeekStart] = useState<Date>(() => {
		const today = new Date();
		const day = today.getDay();
		const monday = new Date(today);
		monday.setDate(today.getDate() - ((day + 6) % 7));
		monday.setHours(0, 0, 0, 0);
		return monday;
	});

	// Month view state
	const [monthYear, setMonthYear] = useState<{ year: number; month: number }>(() => {
		const today = new Date();
		return { year: today.getFullYear(), month: today.getMonth() };
	});

	const [selectedTechs, setSelectedTechs] = useState<Set<string>>(new Set());
	const [showVisits, setShowVisits] = useState(true);
	const [showOccurrences, setShowOccurrences] = useState(true);
	const [anytimeOpen, setAnytimeOpen] = useState(false);
	const [colWidth, setColWidth] = useState(200);
	const [clickedAnytimeVisit, setClickedAnytimeVisit] = useState<{ visit: VisitWithJob; rect: DOMRect } | null>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [containerHeight, setContainerHeight] = useState(0);
	const [dragOverAnytimeDay, setDragOverAnytimeDay] = useState<string | null>(null);

	const gridRef         = useRef<HTMLDivElement>(null);
	const scrollRef       = useRef<HTMLDivElement>(null);
	const anytimePopupRef = useRef<HTMLDivElement>(null);
	const anytimeRef      = useRef<HTMLDivElement>(null);

	// ── Week-view scroll zone state/refs ──────────────────────────────────────
	const [weekScrollZone, setWeekScrollZone]         = useState<"left" | "right" | null>(null);
	const [weekScrollProgress, setWeekScrollProgress] = useState(0);
	const [isDraggingWeek, setIsDraggingWeek]         = useState(false);
	const weekTimeGridRef        = useRef<HTMLDivElement>(null);
	const weekScrollZoneRef      = useRef<"left" | "right" | null>(null);
	const weekScrollEnterTimeRef = useRef<number | null>(null);
	const weekScrollRafRef       = useRef<number | null>(null);
	const weekDragOriginRef      = useRef<Date | null>(null);
	const weekHasPendingPopupRef = useRef(false);
	const isDraggingWeekRef      = useRef(false);
	const weekDragOverTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
	const weekStartRef           = useRef<Date>(new Date());

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();
	const { mutateAsync: rescheduleOccurrence } = useRescheduleOccurrenceMutation();
	const { mutateAsync: generateVisitFromOccurrence } = useGenerateVisitFromOccurrenceMutation();

	// Track scroll container height for overflow pills
	useEffect(() => {
		if (!scrollRef.current) return;
		const ro = new ResizeObserver(() => {
			if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight);
		});
		ro.observe(scrollRef.current);
		setContainerHeight(scrollRef.current.clientHeight);
		return () => ro.disconnect();
	}, []);


	// Measure column width
	useEffect(() => {
		function measure() {
			if (!gridRef.current) return;
			setColWidth((gridRef.current.getBoundingClientRect().width - GUTTER_W) / 7);
		}
		measure();
		const ro = new ResizeObserver(measure);
		if (gridRef.current) ro.observe(gridRef.current);
		return () => ro.disconnect();
	}, []);

	// Auto-scroll to ~2 hours before current time on week-view mount
	useEffect(() => {
		if (viewMode !== "week" || !scrollRef.current) return;
		const now = new Date();
		const top = (now.getHours() + now.getMinutes() / 60) * SLOT_H;
		scrollRef.current.scrollTop = Math.max(0, top - 2 * SLOT_H);
	}, [viewMode]);

	// Close anytime popup on outside click
	useEffect(() => {
		if (!clickedAnytimeVisit) return;
		function handler(e: MouseEvent) {
			if (anytimePopupRef.current && !anytimePopupRef.current.contains(e.target as Node))
				setClickedAnytimeVisit(null);
		}
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [clickedAnytimeVisit]);

	const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
	const todayStr = new Date().toISOString().split("T")[0];

	const globalTechOrder = useMemo(() => buildTechOrder(technicians), [technicians]);
	const techColorMap = useMemo(
		() => new Map(globalTechOrder.map((id, i) => [id, getTechColor(i)])),
		[globalTechOrder]
	);

	const isAllSelected = selectedTechs.size === 0;

	const allVisits: VisitWithJob[] = useMemo(
		() => jobs.flatMap((job_obj) => (job_obj.visits ?? []).map((v) => ({ ...v, job_obj }))),
		[jobs]
	);

	const filteredVisits = useMemo(() => {
		if (isAllSelected) return allVisits;
		return allVisits.filter((v) =>
			v.visit_techs?.some((vt) => selectedTechs.has(vt.tech_id))
		);
	}, [allVisits, selectedTechs, isAllSelected]);

	// Split anytime vs timed visits
	const anytimeVisits = useMemo(
		() => filteredVisits.filter((v) => v.arrival_constraint === "anytime"),
		[filteredVisits]
	);
	const timedVisits = useMemo(
		() => filteredVisits.filter((v) => v.arrival_constraint !== "anytime"),
		[filteredVisits]
	);

	const visitsByDay    = useMemo(() => groupVisitsByDay(timedVisits),   [timedVisits]);
	const anytimeByDay   = useMemo(() => groupVisitsByDay(anytimeVisits), [anytimeVisits]);

	// All planned occurrences — split into timed (time-grid) and anytime (midnight signal)
	const allOccs = useMemo(() => extractOccurrences(jobs), [jobs]);

	const timedOccurrencesByDay = useMemo(() =>
		allOccs.filter((o) => !isAnytimeOccurrence(o)).reduce((acc, occ) => {
			const dateStr = new Date(occ.occurrence_start_at).toISOString().split("T")[0];
			if (!acc[dateStr]) acc[dateStr] = [];
			acc[dateStr].push(occ);
			return acc;
		}, {} as Record<string, OccurrenceWithPlan[]>),
	[allOccs]);

	const anytimeOccurrencesByDay = useMemo(() =>
		allOccs.filter(isAnytimeOccurrence).reduce((acc, occ) => {
			const d = new Date(occ.occurrence_start_at);
			const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			if (!acc[dateStr]) acc[dateStr] = [];
			acc[dateStr].push(occ);
			return acc;
		}, {} as Record<string, OccurrenceWithPlan[]>),
	[allOccs]);

	// Now indicator — raw fractional hour (DAY_START = 0)
	const nowTop = useMemo(() => {
		const now = new Date();
		return (now.getHours() + now.getMinutes() / 60) * SLOT_H;
	}, []);

	// ── Navigation ────────────────────────────────────────────────────────────

	function prevWeek() {
		setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
	}
	function nextWeek() {
		setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
	}
	function prevMonth() {
		setMonthYear(({ year, month }) =>
			month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
		);
	}
	function nextMonth() {
		setMonthYear(({ year, month }) =>
			month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
		);
	}
	function goToday() {
		const today = new Date();
		const day = today.getDay();
		const monday = new Date(today);
		monday.setDate(today.getDate() - ((day + 6) % 7));
		monday.setHours(0, 0, 0, 0);
		setWeekStart(monday);
		setMonthYear({ year: today.getFullYear(), month: today.getMonth() });
		// Also scroll to now
		if (scrollRef.current) {
			const top = (today.getHours() + today.getMinutes() / 60) * SLOT_H;
			scrollRef.current.scrollTop = Math.max(0, top - 2 * SLOT_H);
		}
	}

	function scrollToY(y: number) {
		if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, y);
	}

	// ── Week-view scroll zone helpers ─────────────────────────────────────────

	// Keep weekStartRef current so mount-only document handlers have fresh weekStart
	useEffect(() => { weekStartRef.current = weekStart; }, [weekStart]);

	// Document-level drag tracking (mount only — uses refs, no stale closures)
	useEffect(() => {
		function onDragStart(e: DragEvent) {
			const inTimeGrid = weekTimeGridRef.current?.contains(e.target as Node);
			const inAnytime  = anytimeRef.current?.contains(e.target as Node);
			if (!inTimeGrid && !inAnytime) return;
			weekDragOriginRef.current = weekStartRef.current;
			isDraggingWeekRef.current = true;
			setIsDraggingWeek(true);
		}
		function onDragOver() {
			if (!isDraggingWeekRef.current) return;
			if (weekDragOverTimerRef.current) clearTimeout(weekDragOverTimerRef.current);
			weekDragOverTimerRef.current = setTimeout(() => {
				isDraggingWeekRef.current = false;
				setIsDraggingWeek(false);
				clearWeekScrollZone();
				if (!weekHasPendingPopupRef.current) restoreOriginWeek();
			}, 150);
		}
		document.addEventListener("dragstart", onDragStart);
		document.addEventListener("dragover", onDragOver);
		return () => {
			document.removeEventListener("dragstart", onDragStart);
			document.removeEventListener("dragover", onDragOver);
			if (weekDragOverTimerRef.current) clearTimeout(weekDragOverTimerRef.current);
			if (weekScrollRafRef.current) cancelAnimationFrame(weekScrollRafRef.current);
		};
	}, []); // mount only

	function startWeekScrollRaf() {
		if (weekScrollRafRef.current) return;
		function tick() {
			const enterTime = weekScrollEnterTimeRef.current;
			const zone = weekScrollZoneRef.current;
			if (!enterTime || !zone) { weekScrollRafRef.current = null; return; }
			const progress = Math.min(1, (Date.now() - enterTime) / SCROLL_DELAY_MS);
			setWeekScrollProgress(progress);
			if (progress >= 1) {
				if (zone === "left") prevWeek(); else nextWeek();
				weekScrollEnterTimeRef.current = Date.now();
			}
			weekScrollRafRef.current = requestAnimationFrame(tick);
		}
		weekScrollRafRef.current = requestAnimationFrame(tick);
	}

	function stopWeekScrollRaf() {
		if (weekScrollRafRef.current) { cancelAnimationFrame(weekScrollRafRef.current); weekScrollRafRef.current = null; }
	}

	function clearWeekScrollZone() {
		setWeekScrollZone(null);
		weekScrollZoneRef.current = null;
		weekScrollEnterTimeRef.current = null;
		stopWeekScrollRaf();
		setWeekScrollProgress(0);
	}

	function restoreOriginWeek() {
		if (weekDragOriginRef.current) setWeekStart(weekDragOriginRef.current);
		weekDragOriginRef.current = null;
		weekHasPendingPopupRef.current = false;
	}

	function handleWeekGridDragOver(e: React.DragEvent<HTMLDivElement>) {
		const rect = weekTimeGridRef.current?.getBoundingClientRect();
		if (!rect || !isDraggingWeekRef.current) return;
		const x = e.clientX - rect.left;
		const newZone: "left" | "right" | null =
			x > GUTTER_W && x < GUTTER_W + SCROLL_ZONE_W ? "left"
			: x > rect.width - SCROLL_ZONE_W ? "right"
			: null;
		if (newZone !== weekScrollZoneRef.current) {
			weekScrollZoneRef.current = newZone;
			setWeekScrollZone(newZone);
			if (newZone) {
				weekScrollEnterTimeRef.current = Date.now();
				startWeekScrollRaf();
			} else {
				weekScrollEnterTimeRef.current = null;
				stopWeekScrollRaf();
				setWeekScrollProgress(0);
			}
		}
	}

	function handleWeekGridDragLeave(e: React.DragEvent<HTMLDivElement>) {
		const rect = weekTimeGridRef.current?.getBoundingClientRect();
		if (!rect) return;
		const { clientX: x, clientY: y } = e;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			clearWeekScrollZone();
		}
	}

	// Clears scroll zone when leaving the anytime section — but NOT if the pointer
	// moved into the time grid below (so dragging down doesn't flicker the zone).
	function handleAnytimeSectionDragLeave(e: React.DragEvent<HTMLDivElement>) {
		const anytimeRect  = anytimeRef.current?.getBoundingClientRect();
		const gridRect     = weekTimeGridRef.current?.getBoundingClientRect();
		if (!anytimeRect) return;
		const { clientX: x, clientY: y } = e;
		const inAnytime = x >= anytimeRect.left && x <= anytimeRect.right && y >= anytimeRect.top && y <= anytimeRect.bottom;
		const inGrid    = gridRect && x >= gridRect.left && x <= gridRect.right && y >= gridRect.top && y <= gridRect.bottom;
		if (!inAnytime && !inGrid) clearWeekScrollZone();
	}

	// ── Anytime drag/drop ────────────────────────────────────────────────────

	function handleAnytimeDragStart(e: React.DragEvent, visit: VisitWithJob) {
		setSharedDragOffset(0);
		// stopPropagation on child dragstart blocks the document-level handler, so
		// activate the week-scroll state here directly instead.
		weekDragOriginRef.current = weekStartRef.current;
		isDraggingWeekRef.current = true;
		setIsDraggingWeek(true);
		const startMs = new Date(visit.scheduled_start_at).getTime();
		const endMs   = new Date(visit.scheduled_end_at).getTime();
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: "visit",
				visitId: visit.id,
				jobId: visit.job_obj.id,
				durationMs: endMs - startMs,
				startMs,
				arrival_constraint: "anytime",
				arrival_time: null,
				arrival_window_start: null,
				arrival_window_end: null,
			})
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleAnytimeOccurrenceDragStart(e: React.DragEvent, occ: OccurrenceWithPlan) {
		setSharedDragOffset(0);
		// Same as above — set scroll state explicitly because stopPropagation prevents
		// the document-level dragstart listener from running.
		weekDragOriginRef.current = weekStartRef.current;
		isDraggingWeekRef.current = true;
		setIsDraggingWeek(true);
		const startMs = new Date(occ.occurrence_start_at).getTime();
		const endMs   = new Date(occ.occurrence_end_at).getTime();
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: "occurrence",
				occurrenceId: occ.id,
				jobId: occ.job_obj.id,
				durationMs: Math.max(endMs - startMs, 3_600_000),
				startMs,
			})
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleAnytimeCellDragOver(e: React.DragEvent, dateStr: string) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOverAnytimeDay(dateStr);
	}

	function handleAnytimeCellDragLeave(e: React.DragEvent) {
		// Only clear if leaving the cell entirely (not entering a child)
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const { clientX: x, clientY: y } = e;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			setDragOverAnytimeDay(null);
		}
	}

	async function handleAnytimeCellDrop(e: React.DragEvent, targetDateStr: string) {
		e.preventDefault();
		setDragOverAnytimeDay(null);
		const raw = e.dataTransfer.getData("text/plain");
		if (!raw) return;
		const parsed = JSON.parse(raw) as {
			type?: string;
			visitId?: string;
			occurrenceId?: string;
			jobId?: string;
			arrival_constraint?: string;
			durationMs: number;
		};

		if (parsed.type === "occurrence") {
			const [year, month, day] = targetDateStr.split("-").map(Number);
			const newStart = new Date(year, month - 1, day, 0, 0, 0, 0);
			weekHasPendingPopupRef.current = true;
			try {
				await rescheduleOccurrence({
					occurrenceId: parsed.occurrenceId!,
					jobId: parsed.jobId!,
					input: { new_start_at: newStart.toISOString() },
				});
				weekDragOriginRef.current = null;
				weekHasPendingPopupRef.current = false;
			} catch {
				weekHasPendingPopupRef.current = false;
			}
			return;
		}

		if (parsed.type !== "visit") return;
		const [year, month, day] = targetDateStr.split("-").map(Number);
		const newStart = new Date(year, month - 1, day, 0, 0, 0, 0);
		const newEnd   = new Date(newStart.getTime() + Math.max(parsed.durationMs, 3_600_000));
		const data: Parameters<typeof updateVisit>[0]["data"] = {
			scheduled_start_at: newStart.toISOString(),
			scheduled_end_at: newEnd.toISOString(),
			arrival_constraint: "anytime",
			arrival_time: null,
			arrival_window_start: null,
			arrival_window_end: null,
		};
		// Converting from a timed constraint → also reset finish to when_done
		if (parsed.arrival_constraint !== "anytime") {
			data.finish_constraint = "when_done";
			data.finish_time = null;
		}
		weekHasPendingPopupRef.current = true;
		try {
			await updateVisit({ id: parsed.visitId!, data });
			weekDragOriginRef.current = null;
			weekHasPendingPopupRef.current = false;
		} catch {
			weekHasPendingPopupRef.current = false;
		}
	}

	// ── Labels ────────────────────────────────────────────────────────────────

	const weekLabel = useMemo(() => {
		const firstDay = new Date(weekDays[0] + "T12:00:00");
		const lastDay  = new Date(weekDays[6] + "T12:00:00");
		const startMon = firstDay.toLocaleDateString("en-US", { month: "short" });
		const startDay = firstDay.getDate();
		const endDay   = lastDay.getDate();
		const year     = lastDay.getFullYear();
		return firstDay.getMonth() === lastDay.getMonth()
			? `${startMon} ${startDay} – ${endDay}, ${year}`
			: `${startMon} ${startDay} – ${lastDay.toLocaleDateString("en-US", { month: "short" })} ${endDay}, ${year}`;
	}, [weekDays]);

	const monthLabel = useMemo(() =>
		new Date(monthYear.year, monthYear.month, 1).toLocaleDateString("en-US", {
			month: "long", year: "numeric",
		}),
		[monthYear]
	);

	const totalSlots = DAY_END - DAY_START; // 24

	// ── Anytime popup positioning ─────────────────────────────────────────────

	const ANYTIME_POPUP_W = 224;
	function getAnytimePopupPos(rect: DOMRect) {
		const PAD = 8;
		const left = rect.right + 4 + ANYTIME_POPUP_W < window.innerWidth
			? rect.right + 4
			: Math.max(PAD, rect.left - ANYTIME_POPUP_W - 4);
		const top = Math.min(rect.bottom + 4, window.innerHeight - 280 - PAD);
		return { top, left };
	}

	// ── Grid column template ──────────────────────────────────────────────────

	const gridTemplateColumns = `${GUTTER_W}px repeat(7, minmax(150px, 1fr))`;
	const gridMinWidth = GUTTER_W + 7 * 150;

	return (
		<div className="flex flex-col h-full bg-zinc-950 text-zinc-200 select-none">

			{/* ── Toolbar ──────────────────────────────────────────────────────── */}
			<div className="flex items-center gap-1.5 px-3 border-b border-zinc-800 shrink-0" style={{ height: 44 }}>

				{/* Today */}
				<button
					onClick={goToday}
					className="h-7 px-3 rounded text-[11px] font-medium border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors shrink-0"
				>
					Today
				</button>

				{/* Period navigation */}
				<div className="flex items-center shrink-0">
					<button
						aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
						onClick={viewMode === "week" ? prevWeek : prevMonth}
						className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
					>
						<ChevronLeft size={14} />
					</button>
					<span className="text-[13px] font-semibold text-zinc-100 min-w-[144px] text-center tracking-tight">
						{viewMode === "week" ? weekLabel : monthLabel}
					</span>
					<button
						aria-label={viewMode === "week" ? "Next week" : "Next month"}
						onClick={viewMode === "week" ? nextWeek : nextMonth}
						className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
					>
						<ChevronRight size={14} />
					</button>
				</div>

				{/* Divider */}
				<div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />

				{/* View mode — segmented */}
				<div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 shrink-0">
					<button
						onClick={() => setViewMode("week")}
						className={`h-6 px-3 rounded-sm text-[11px] font-medium transition-colors ${
							viewMode === "week" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
						}`}
					>
						Week
					</button>
					<button
						onClick={() => setViewMode("month")}
						className={`h-6 px-3 rounded-sm text-[11px] font-medium transition-colors ${
							viewMode === "month" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
						}`}
					>
						Month
					</button>
				</div>

				{/* Divider */}
				<div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />

				{/* Layer toggles */}
				<button
					onClick={() => setShowVisits((v) => !v)}
					className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border transition-colors shrink-0 ${
						showVisits
							? "bg-blue-500/10 border-blue-500/25 text-blue-300"
							: "border-transparent text-zinc-500 hover:text-zinc-300"
					}`}
				>
					{showVisits ? <Eye size={12} /> : <EyeOff size={12} />}
					Visits
				</button>
				<button
					onClick={() => setShowOccurrences((v) => !v)}
					className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium border transition-colors shrink-0 ${
						showOccurrences
							? "bg-violet-500/10 border-violet-500/25 text-violet-300"
							: "border-transparent text-zinc-500 hover:text-zinc-300"
					}`}
				>
					{showOccurrences ? <Eye size={12} /> : <EyeOff size={12} />}
					Recurring
				</button>

				{/* Divider */}
				<div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />

				<TechFilter
					technicians={technicians}
					selected={selectedTechs}
					onChange={setSelectedTechs}
					techColorMap={techColorMap}
				/>

			</div>

			{/* ── Month View ───────────────────────────────────────────────────── */}
			{viewMode === "month" && (
				<div className="flex-1 overflow-auto">
					<MonthGrid
						year={monthYear.year}
						month={monthYear.month}
						todayStr={todayStr}
						visitsByDay={visitsByDay}
						occurrencesByDay={timedOccurrencesByDay}
						showVisits={showVisits}
						showOccurrences={showOccurrences}
						technicians={technicians}
						techColorMap={techColorMap}
						selectedTechs={selectedTechs}
						isAllSelected={isAllSelected}
						updateVisit={updateVisit}
						rescheduleOccurrence={rescheduleOccurrence}
						generateVisitFromOccurrence={generateVisitFromOccurrence}
						onPrevMonth={prevMonth}
						onNextMonth={nextMonth}
						currentMonthYear={monthYear}
						onRestoreMonthYear={setMonthYear}
					/>
				</div>
			)}

			{/* ── Week View ────────────────────────────────────────────────────── */}
			{viewMode === "week" && (
				<div ref={scrollRef} className="flex-1 overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
				<div ref={gridRef} style={{ minWidth: gridMinWidth, position: "relative" }}>

					{/* Sticky day-header row */}
					<div
						style={{
							display: "grid",
							gridTemplateColumns,
							height: HEADER_H,
							position: "sticky",
							top: 0,
							borderBottom: "1px solid #3f3f46",
							backgroundColor: "#09090b",
							zIndex: 30,
						}}
					>
						{/* Gutter header cell */}
						<div style={{ borderRight: "1px solid #3f3f46" }} />
						{weekDays.map((dateStr) => {
							const { weekday, day } = formatDayHeader(dateStr);
							const isToday = dateStr === todayStr;
							return (
								<div
									key={dateStr}
									style={{
										borderLeft: "1px solid #3f3f46",
										display: "flex",
										alignItems: "center",
										paddingLeft: 10,
										boxShadow: isToday ? "inset 0 -2px 0 #3b82f6" : undefined,
									}}
								>
									<div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
										<span style={{
											fontSize: 10,
											fontWeight: 600,
											color: isToday ? "#60a5fa" : "#c4c4c8",
											textTransform: "uppercase",
											letterSpacing: "0.05em",
										}}>
											{weekday}
										</span>
										<span style={{
											fontSize: 15,
											fontWeight: 700,
											color: isToday ? "#3b82f6" : "#e4e4e7",
										}}>
											{day}
										</span>
									</div>
								</div>
							);
						})}
					</div>

					{/* Anytime section */}
					{showVisits && (
						<div
							ref={anytimeRef}
							onDragOver={handleWeekGridDragOver}
							onDragLeave={handleAnytimeSectionDragLeave}
							style={{
								display: "grid",
								gridTemplateColumns,
								position: "sticky",
								top: HEADER_H,
								borderBottom: "1px solid #3f3f46",
								backgroundColor: "#0f0f11",
								zIndex: 20,
							}}
						>
							{/* Anytime toggle cell */}
							<div
								style={{
									borderRight: "1px solid #3f3f46",
									display: "flex",
									alignItems: "flex-start",
									justifyContent: "flex-end",
									padding: "6px 6px 0 0",
								}}
							>
								<button
									onClick={() => setAnytimeOpen((v) => !v)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 3,
										fontSize: 9,
										fontWeight: 600,
										color: "#a1a1aa",
										background: "none",
										border: "none",
										cursor: "pointer",
										padding: "2px 4px",
										borderRadius: 4,
										transition: "color 0.15s",
									}}
									onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#27272a"; }}
									onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
								>
									Anytime
									<ChevronDown
										size={11}
										style={{
											transform: anytimeOpen ? "rotate(180deg)" : "rotate(0deg)",
											transition: "transform 0.15s ease",
											color: "#a1a1aa",
										}}
									/>
								</button>
							</div>

							{/* Per-day anytime cells */}
							{weekDays.map((dateStr) => {
								const dayVisits = (anytimeByDay[dateStr] ?? []) as VisitWithJob[];
								const dayOccs   = showOccurrences ? (anytimeOccurrencesByDay[dateStr] ?? []) : [];
								const totalCount = dayVisits.length + dayOccs.length;
								return (
									<div
										key={dateStr}
										onDragOver={(e) => handleAnytimeCellDragOver(e, dateStr)}
										onDragLeave={handleAnytimeCellDragLeave}
										onDrop={(e) => handleAnytimeCellDrop(e, dateStr)}
										style={{
											borderLeft: "1px solid #3f3f46",
											padding: "4px 5px",
											minHeight: anytimeOpen ? undefined : 28,
											outline: dragOverAnytimeDay === dateStr ? "2px solid #3b82f6" : undefined,
											outlineOffset: -2,
											transition: "outline 0.1s",
										}}
									>
										{!anytimeOpen ? (
											/* Collapsed: first item (visit preferenced) + overflow count */
											totalCount > 0 ? (() => {
												const hasVisit = dayVisits.length > 0;
												return (
													<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
														{hasVisit ? (() => {
															const first = dayVisits[0];
															const firstTechId = first.visit_techs?.[0]?.tech_id;
															const firstTechColor = (firstTechId ? techColorMap.get(firstTechId) : undefined) ?? "#6b7280";
															return (
																<button
																	draggable
																	onDragStart={(e) => { e.stopPropagation(); handleAnytimeDragStart(e, first); }}
																	onClick={(e) => {
																		e.stopPropagation();
																		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
																		setClickedAnytimeVisit((prev) =>
																			prev?.visit.id === first.id ? null : { visit: first, rect }
																		);
																	}}
																	style={{
																		display: "flex",
																		alignItems: "center",
																		gap: 4,
																		padding: "3px 5px",
																		borderRadius: 4,
																		backgroundColor: `${firstTechColor}22`,
																		border: `1px solid ${firstTechColor}55`,
																		cursor: "pointer",
																		textAlign: "left",
																		width: "100%",
																	}}
																>
																	<span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: getPriorityColor(first.job_obj?.priority), flexShrink: 0 }} />
																	<span style={{
																		display: "-webkit-box",
																		WebkitBoxOrient: "vertical",
																		WebkitLineClamp: 2,
																		overflow: "hidden",
																		wordBreak: "break-word",
																		fontSize: 9,
																		color: "#e4e4e7",
																		flex: 1,
																		textAlign: "left",
																		lineHeight: 1.4,
																	} as React.CSSProperties}>
																		{first.job_obj?.name ?? "Visit"}
																	</span>
																	<div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
																		{(first.visit_techs ?? []).slice(0, 4).map((vt) => {
																			const tc = techColorMap.get(vt.tech_id) ?? "#6b7280";
																			const inf = isAllSelected || selectedTechs.has(vt.tech_id);
																			return (
																				<span key={vt.tech_id} style={{
																					display: "block",
																					width: 6,
																					height: 6,
																					borderRadius: "50%",
																					flexShrink: 0,
																					backgroundColor: tc,
																					opacity: inf ? 1 : 0.35,
																				}} />
																			);
																		})}
																	</div>
																</button>
															);
														})() : (() => {
															const first = dayOccs[0];
															return (
																<button
																	draggable
																	onDragStart={(e) => { e.stopPropagation(); handleAnytimeOccurrenceDragStart(e, first); }}
																	style={{
																		display: "flex",
																		alignItems: "center",
																		gap: 4,
																		padding: "3px 5px",
																		borderRadius: 4,
																		backgroundColor: "#2d2f45",
																		border: "1px solid #7c3aed55",
																		cursor: "grab",
																		textAlign: "left",
																		width: "100%",
																	}}
																>
																	<span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: getPriorityColor(first.job_obj?.priority), flexShrink: 0 }} />
																	<span style={{
																		display: "-webkit-box",
																		WebkitBoxOrient: "vertical",
																		WebkitLineClamp: 2,
																		overflow: "hidden",
																		wordBreak: "break-word",
																		fontSize: 9,
																		color: "#c4b5fd",
																		flex: 1,
																		textAlign: "left",
																		lineHeight: 1.4,
																	} as React.CSSProperties}>
																		{first.job_obj?.name ?? "Recurring"}
																	</span>
																</button>
															);
														})()}
														{totalCount > 1 && (
															<button
																onClick={() => setAnytimeOpen(true)}
																style={{ fontSize: 9, color: "#71717a", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "0 2px", transition: "color 0.1s" }}
																onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#a1a1aa"; }}
																onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#71717a"; }}
															>
																+{totalCount - 1} more
															</button>
														)}
													</div>
												);
											})() : null
										) : (
											/* Expanded: all visit chips then all occurrence chips */
											<div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
												{dayVisits.map((visit) => {
													const firstTechId = visit.visit_techs?.[0]?.tech_id;
													const firstTechColor = (firstTechId ? techColorMap.get(firstTechId) : undefined) ?? "#6b7280";
													return (
														<button
															key={visit.id}
															draggable
															onDragStart={(e) => { e.stopPropagation(); handleAnytimeDragStart(e, visit); }}
															onClick={(e) => {
																e.stopPropagation();
																const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
																setClickedAnytimeVisit((prev) =>
																	prev?.visit.id === visit.id ? null : { visit, rect }
																);
															}}
															style={{
																display: "flex",
																alignItems: "center",
																gap: 4,
																padding: "3px 5px",
																borderRadius: 4,
																backgroundColor: `${firstTechColor}22`,
																border: `1px solid ${firstTechColor}55`,
																cursor: "pointer",
																textAlign: "left",
																width: "100%",
															}}
														>
															<span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: getPriorityColor(visit.job_obj?.priority), flexShrink: 0 }} />
															<span style={{
																display: "-webkit-box",
																WebkitBoxOrient: "vertical",
																WebkitLineClamp: 2,
																overflow: "hidden",
																wordBreak: "break-word",
																fontSize: 9,
																color: "#e4e4e7",
																flex: 1,
																textAlign: "left",
																lineHeight: 1.4,
															} as React.CSSProperties}>
																{visit.job_obj?.name ?? "Visit"}
															</span>
															<div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
																{(visit.visit_techs ?? []).slice(0, 4).map((vt) => {
																	const tc = techColorMap.get(vt.tech_id) ?? "#6b7280";
																	const inf = isAllSelected || selectedTechs.has(vt.tech_id);
																	return (
																		<span key={vt.tech_id} style={{
																			display: "block",
																			width: 6,
																			height: 6,
																			borderRadius: "50%",
																			flexShrink: 0,
																			backgroundColor: tc,
																			opacity: inf ? 1 : 0.35,
																		}} />
																	);
																})}
															</div>
														</button>
													);
												})}
												{dayOccs.map((occ) => (
													<button
														key={occ.id}
														draggable
														onDragStart={(e) => { e.stopPropagation(); handleAnytimeOccurrenceDragStart(e, occ); }}
														style={{
															display: "flex",
															alignItems: "center",
															gap: 4,
															padding: "3px 5px",
															borderRadius: 4,
															backgroundColor: "#2d2f45",
															border: "1px solid #7c3aed55",
															cursor: "grab",
															textAlign: "left",
															width: "100%",
														}}
													>
														<span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: getPriorityColor(occ.job_obj?.priority), flexShrink: 0 }} />
														<span style={{
															display: "-webkit-box",
															WebkitBoxOrient: "vertical",
															WebkitLineClamp: 2,
															overflow: "hidden",
															wordBreak: "break-word",
															fontSize: 9,
															color: "#c4b5fd",
															flex: 1,
															textAlign: "left",
															lineHeight: 1.4,
														} as React.CSSProperties}>
															{occ.job_obj?.name ?? "Recurring"}
														</span>
													</button>
												))}
												{totalCount === 0 && (
													<span style={{ fontSize: 9, color: "#52525b" }}>—</span>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}

					{/* Time grid */}
					<div
						ref={weekTimeGridRef}
						style={{
							display: "grid",
							gridTemplateColumns,
							height: totalSlots * SLOT_H,
							position: "relative",
						}}
						onDragOver={handleWeekGridDragOver}
						onDragLeave={handleWeekGridDragLeave}
					>
							{/* Time gutter — sticky left */}
							<div
								style={{
									position: "sticky",
									left: 0,
									zIndex: 10,
									backgroundColor: "#09090b",
									borderRight: "1px solid #3f3f46",
									height: totalSlots * SLOT_H,
								}}
							>
								{Array.from({ length: totalSlots }, (_, i) => (
									<div
										key={i}
										style={{
											position: "absolute",
											top: i === 0 ? 4 : i * SLOT_H - 8,
											left: 0,
											right: 6,
											fontSize: 10,
											color: "#71717a",
											lineHeight: 1,
											userSelect: "none",
											textAlign: "right",
										}}
									>
										{hourLabel(DAY_START + i)}
									</div>
								))}
								{/* Bottom 12 AM label */}
								<div
									style={{
										position: "absolute",
										top: totalSlots * SLOT_H - 8,
										left: 0,
										right: 6,
										fontSize: 10,
										color: "#71717a",
										lineHeight: 1,
										userSelect: "none",
										textAlign: "right",
									}}
								>
									12 AM
								</div>
							</div>

							{/* Day columns */}
							{weekDays.map((dateStr, dayIndex) => {
								const dayVisits     = (visitsByDay[dateStr] ?? []) as VisitWithJob[];
								const dayOccurrences = timedOccurrencesByDay[dateStr] ?? [];
								const isToday = dateStr === todayStr;
								return (
									<div key={dateStr} style={{ position: "relative" }}>
										<ScheduleBoardDayColumn
											dateStr={dateStr}
											dayIndex={dayIndex}
											isToday={isToday}
											visits={dayVisits}
											occurrences={dayOccurrences}
											showVisits={showVisits}
											showOccurrences={showOccurrences}
											technicians={technicians}
											techColorMap={techColorMap}
											colWidth={colWidth}
											selectedTechs={selectedTechs}
											isAllSelected={isAllSelected}
											updateVisit={updateVisit}
											rescheduleOccurrence={rescheduleOccurrence}
											generateVisitFromOccurrence={generateVisitFromOccurrence}
											scrollTop={scrollTop}
											visibleHeight={Math.max(0, containerHeight - HEADER_H - (showVisits && anytimeRef.current ? anytimeRef.current.offsetHeight : 0))}
											onScrollToY={scrollToY}
											onDropHandled={() => { weekHasPendingPopupRef.current = true; }}
											onRescheduleConfirmed={() => { weekDragOriginRef.current = null; weekHasPendingPopupRef.current = false; }}
										/>
										{isToday && (
											<>
												<div
													style={{
														position: "absolute",
														top: nowTop,
														left: 0,
														right: 0,
														height: 2,
														backgroundColor: "#ef4444",
														zIndex: 40,
														pointerEvents: "none",
													}}
												/>
												<div
													style={{
														position: "absolute",
														top: nowTop - 4,
														left: -4,
														width: 10,
														height: 10,
														borderRadius: "50%",
														backgroundColor: "#ef4444",
														zIndex: 41,
														pointerEvents: "none",
													}}
												/>
											</>
										)}
									</div>
								);
							})}

					</div>

				{/* Left week scroll zone — positioned at gridRef level so it spans the
				    anytime sticky section + time grid (zIndex 25 clears sticky z-index 20) */}
				<div aria-hidden style={{
					position: "absolute", left: GUTTER_W, top: 0, bottom: 0, width: SCROLL_ZONE_W,
					pointerEvents: "none", opacity: isDraggingWeek ? 1 : 0, transition: "opacity 0.3s ease",
					overflow: "hidden", zIndex: 25,
				}}>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(59,130,246,0.22), transparent)" }} />
					{weekScrollZone === "left" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${weekScrollProgress * 100}%`,
							background: "linear-gradient(to right, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)" }} />
					)}
					{weekScrollZone === "left" && weekScrollProgress > 0 && (
						<div style={{ position: "absolute", top: 0, bottom: 0,
							left: `calc(${weekScrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.7)" }} />
					)}
					{weekScrollZone === "left" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 1, background: "rgba(59,130,246,0.55)" }} />
					)}
					<div style={{ position: "absolute", top: "50%", left: 6, transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (weekScrollZone === "left" ? weekScrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none" }}>‹</div>
				</div>

				{/* Right week scroll zone */}
				<div aria-hidden style={{
					position: "absolute", right: 0, top: 0, bottom: 0, width: SCROLL_ZONE_W,
					pointerEvents: "none", opacity: isDraggingWeek ? 1 : 0, transition: "opacity 0.3s ease",
					overflow: "hidden", zIndex: 25,
				}}>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to left, rgba(59,130,246,0.22), transparent)" }} />
					{weekScrollZone === "right" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${weekScrollProgress * 100}%`,
							background: "linear-gradient(to left, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)" }} />
					)}
					{weekScrollZone === "right" && weekScrollProgress > 0 && (
						<div style={{ position: "absolute", top: 0, bottom: 0,
							right: `calc(${weekScrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6", boxShadow: "0 0 6px rgba(59,130,246,0.7)" }} />
					)}
					{weekScrollZone === "right" && (
						<div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 1, background: "rgba(59,130,246,0.55)" }} />
					)}
					<div style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (weekScrollZone === "right" ? weekScrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none" }}>›</div>
				</div>
			</div>
		</div>
		)}

			{/* Anytime visit detail popup */}
			{clickedAnytimeVisit && (() => {
				const v   = clickedAnytimeVisit.visit;
				const pos = getAnytimePopupPos(clickedAnytimeVisit.rect);
				const timeStart = visitStartLabel(v);
				return (
					<div
						ref={anytimePopupRef}
						style={{
							position: "fixed",
							top: pos.top,
							left: pos.left,
							width: 224,
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
								aria-label="Close"
								onClick={() => setClickedAnytimeVisit(null)}
								style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
								onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#a1a1aa")}
								onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#52525b")}
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
							{timeStart
								? `${timeStart}${v.finish_constraint !== "when_done" ? ` – ${visitEndLabel(v)}` : " · finish when done"}`
								: "Anytime"}
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
							onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#2563eb")}
							onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "#3b82f6")}
						>
							View Visit →
						</button>
					</div>
				);
			})()}
	</div>
	);
}
