import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MonthMiniCard from "./MonthMiniCard";
import TechFilter from "./TechFilter";
import ReschedulePopup from "./ReschedulePopup";
import OccurrenceReschedulePopup from "./OccurrenceReschedulePopup";
import {
	buildTechOrder,
	getTechColor,
	getWeekDays,
	groupVisitsByDay,
	visitStartLabel,
	visitEndLabel,
	getPriorityColor,
	SCROLL_ZONE_W,
	SCROLL_DELAY_MS,
} from "./scheduleBoardUtils";
import { extractVisits, extractOccurrences, formatTime } from "./dashboardCalendarUtils";
import type { OccurrenceWithPlan, VisitWithJob } from "./dashboardCalendarUtils";
import type { Job, UpdateJobVisitInput } from "../../../types/jobs";
import type { Technician } from "../../../types/technicians";
import { useUpdateJobVisitMutation } from "../../../hooks/useJobs";
import { useRescheduleOccurrenceMutation, useGenerateVisitFromOccurrenceMutation } from "../../../hooks/useRecurringPlans";
import type { RescheduleOccurrenceInput } from "../../../types/recurringPlans";

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

interface ClickedVisit {
	visit: VisitWithJob;
	rect: DOMRect;
}

interface ClickedOccurrence {
	occ: OccurrenceWithPlan;
	rect: DOMRect;
}

interface WeekStripProps {
	jobs: Job[];
	technicians: Technician[];
}

/** Returns the Monday of the current week at midnight local time */
function getThisMonday(): Date {
	const today = new Date();
	const day = today.getDay();
	const monday = new Date(today);
	monday.setDate(today.getDate() - ((day + 6) % 7));
	monday.setHours(0, 0, 0, 0);
	return monday;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE    = 3;
const POPUP_W        = 224;

function visitTimeLabel(v: VisitWithJob): string {
	if (v.arrival_constraint === "anytime") return "";
	return visitStartLabel(v);
}

function occurrenceTimeLabel(occ: OccurrenceWithPlan): string {
	const d = new Date(occ.occurrence_start_at);
	if (d.getHours() === 0 && d.getMinutes() === 0) return "";
	return formatTime(occ.occurrence_start_at);
}

function getPopupPos(rect: DOMRect): { top: number; left: number } {
	const PAD = 8;
	const spaceRight = window.innerWidth - rect.right - PAD;
	const left = spaceRight >= POPUP_W
		? rect.right + 4
		: Math.max(PAD, rect.left - POPUP_W - 4);
	const top = Math.max(PAD, Math.min(rect.top, window.innerHeight - 300 - PAD));
	return { top, left };
}

export default function WeekStrip({ jobs, technicians }: WeekStripProps) {
	const navigate = useNavigate();

	const [weekStart, setWeekStart] = useState<Date>(getThisMonday);
	const [showVisits, setShowVisits] = useState(true);
	const [showOccurrences, setShowOccurrences] = useState(true);
	const [selectedTechs, setSelectedTechs] = useState<Set<string>>(new Set());

	const [draggingVisitId, setDraggingVisitId] = useState<string | null>(null);
	const [draggingOccurrenceId, setDraggingOccurrenceId] = useState<string | null>(null);
	const [dragOverDate, setDragOverDate] = useState<string | null>(null);

	const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
	const [pendingOccurrenceDrop, setPendingOccurrenceDrop] = useState<PendingOccurrenceDrop | null>(null);
	const [clickedVisit, setClickedVisit] = useState<ClickedVisit | null>(null);
	const [clickedOccurrence, setClickedOccurrence] = useState<ClickedOccurrence | null>(null);
	const [generatingVisitId, setGeneratingVisitId] = useState<string | null>(null);

	const popupRef = useRef<HTMLDivElement>(null);
	const occurrencePopupRef = useRef<HTMLDivElement>(null);

	const [scrollZone, setScrollZone] = useState<"left" | "right" | null>(null);
	const [scrollProgress, setScrollProgress] = useState(0);

	const weekGridRef        = useRef<HTMLDivElement>(null);
	const scrollZoneRef      = useRef<"left" | "right" | null>(null);
	const scrollEnterTimeRef = useRef<number | null>(null);
	const scrollRafRef       = useRef<number | null>(null);
	const dragOriginWeekRef  = useRef<Date | null>(null);
	const hasPendingPopupRef = useRef(false);

	const isDragging = draggingVisitId !== null || draggingOccurrenceId !== null;

	// Cancel RAF on unmount
	useEffect(() => {
		return () => { if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current); };
	}, []);

	// Close visit popup on outside click
	useEffect(() => {
		if (!clickedVisit) return;
		function handle(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node))
				setClickedVisit(null);
		}
		document.addEventListener("mousedown", handle);
		return () => document.removeEventListener("mousedown", handle);
	}, [clickedVisit]);

	// Close occurrence popup on outside click
	useEffect(() => {
		if (!clickedOccurrence) return;
		function handle(e: MouseEvent) {
			if (occurrencePopupRef.current && !occurrencePopupRef.current.contains(e.target as Node))
				setClickedOccurrence(null);
		}
		document.addEventListener("mousedown", handle);
		return () => document.removeEventListener("mousedown", handle);
	}, [clickedOccurrence]);

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();
	const { mutateAsync: rescheduleOccurrence } = useRescheduleOccurrenceMutation();
	const { mutateAsync: generateVisitFromOccurrence } = useGenerateVisitFromOccurrenceMutation();

	const globalTechOrder = useMemo(() => buildTechOrder(technicians), [technicians]);
	const techColorMap = useMemo(
		() => new Map(globalTechOrder.map((id, i) => [id, getTechColor(i)])),
		[globalTechOrder]
	);

	const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
	const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

	const weekLabel = useMemo(() => {
		const first = new Date(weekDays[0] + "T12:00:00");
		const last  = new Date(weekDays[6] + "T12:00:00");
		const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
			d.toLocaleDateString("en-US", opts);
		return `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric", year: "numeric" })}`;
	}, [weekDays]);

	const allVisits = useMemo(
		() => extractVisits(jobs) as VisitWithJob[],
		[jobs]
	);
	const allOccurrences = useMemo(() => extractOccurrences(jobs), [jobs]);

	const filteredVisits = useMemo(() => {
		const visible = showVisits ? allVisits : [];
		if (selectedTechs.size === 0) return visible;
		return visible.filter((v) =>
			v.visit_techs?.some((vt) => selectedTechs.has(vt.tech_id))
		);
	}, [allVisits, showVisits, selectedTechs]);

	const visibleOccurrences = useMemo(
		() => (showOccurrences ? allOccurrences : []),
		[allOccurrences, showOccurrences]
	);

	const visitsByDay = useMemo(
		() => groupVisitsByDay(filteredVisits) as Record<string, VisitWithJob[]>,
		[filteredVisits]
	);

	const occurrencesByDay = useMemo(() => {
		const map: Record<string, OccurrenceWithPlan[]> = {};
		for (const occ of visibleOccurrences) {
			const day = new Date(occ.occurrence_start_at).toISOString().split("T")[0];
			if (!map[day]) map[day] = [];
			map[day].push(occ);
		}
		return map;
	}, [visibleOccurrences]);

	const effectiveVisitsByDay = useMemo(() => {
		if (!pendingDrop) return visitsByDay;
		const result = { ...visitsByDay };
		result[pendingDrop.oldDateStr] = (result[pendingDrop.oldDateStr] ?? []).filter(
			(v) => v.id !== pendingDrop.visit.id
		);
		result[pendingDrop.newDateStr] = [...(result[pendingDrop.newDateStr] ?? []), pendingDrop.visit];
		return result;
	}, [visitsByDay, pendingDrop]);

	const effectiveOccurrencesByDay = useMemo(() => {
		if (!pendingOccurrenceDrop) return occurrencesByDay;
		const result = { ...occurrencesByDay };
		result[pendingOccurrenceDrop.fromDateStr] = (result[pendingOccurrenceDrop.fromDateStr] ?? []).filter(
			(o) => o.id !== pendingOccurrenceDrop.occurrence.id
		);
		result[pendingOccurrenceDrop.newDateStr] = [
			...(result[pendingOccurrenceDrop.newDateStr] ?? []),
			pendingOccurrenceDrop.occurrence,
		];
		return result;
	}, [occurrencesByDay, pendingOccurrenceDrop]);

	// ── Scroll zone helpers ───────────────────────────────────────────────────

	function startScrollRaf() {
		if (scrollRafRef.current) return;
		function tick() {
			const enterTime = scrollEnterTimeRef.current;
			const zone = scrollZoneRef.current;
			if (!enterTime || !zone) { scrollRafRef.current = null; return; }
			const progress = Math.min(1, (Date.now() - enterTime) / SCROLL_DELAY_MS);
			setScrollProgress(progress);
			if (progress >= 1) {
				setWeekStart((d) => {
					const nd = new Date(d);
					nd.setDate(nd.getDate() + (zone === "left" ? -7 : 7));
					return nd;
				});
				scrollEnterTimeRef.current = Date.now();
			}
			scrollRafRef.current = requestAnimationFrame(tick);
		}
		scrollRafRef.current = requestAnimationFrame(tick);
	}

	function stopScrollRaf() {
		if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = null; }
	}

	function clearScrollZone() {
		setScrollZone(null);
		scrollZoneRef.current = null;
		scrollEnterTimeRef.current = null;
		stopScrollRaf();
		setScrollProgress(0);
	}

	function restoreOriginWeek() {
		if (dragOriginWeekRef.current) setWeekStart(dragOriginWeekRef.current);
		dragOriginWeekRef.current = null;
		hasPendingPopupRef.current = false;
	}

	// ── Drag handlers ────────────────────────────────────────────────────────

	function handleVisitDragStart(e: React.DragEvent, visit: VisitWithJob, fromDateStr: string) {
		dragOriginWeekRef.current = weekStart;
		setDraggingVisitId(visit.id);

		// Native fallback: if the card unmounts mid-drag (e.g. week shift via scroll zone),
		// React's synthetic dragend won't fire. A native listener on the source element
		// fires reliably even on detached DOM nodes.
		const el = e.currentTarget as HTMLElement;
		function onNativeDragEnd() {
			el.removeEventListener("dragend", onNativeDragEnd);
			setDragOverDate(null);
			setDraggingVisitId(null);
			setDraggingOccurrenceId(null);
			clearScrollZone();
			if (!hasPendingPopupRef.current) restoreOriginWeek();
		}
		el.addEventListener("dragend", onNativeDragEnd);

		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({ type: "visit", visitId: visit.id, fromDateStr })
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleOccurrenceDragStart(e: React.DragEvent, occ: OccurrenceWithPlan, fromDateStr: string) {
		dragOriginWeekRef.current = weekStart;
		setDraggingOccurrenceId(occ.id);

		const el = e.currentTarget as HTMLElement;
		function onNativeDragEnd() {
			el.removeEventListener("dragend", onNativeDragEnd);
			setDragOverDate(null);
			setDraggingVisitId(null);
			setDraggingOccurrenceId(null);
			clearScrollZone();
			if (!hasPendingPopupRef.current) restoreOriginWeek();
		}
		el.addEventListener("dragend", onNativeDragEnd);

		const startMs = new Date(occ.occurrence_start_at).getTime();
		const endMs   = new Date(occ.occurrence_end_at).getTime();
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({ type: "occurrence", occurrenceId: occ.id, jobId: occ.job_obj.id, durationMs: endMs - startMs, fromDateStr })
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleDragEnd() {
		setDragOverDate(null);
		setDraggingVisitId(null);
		setDraggingOccurrenceId(null);
		clearScrollZone();
		if (!hasPendingPopupRef.current) restoreOriginWeek();
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

	function handleGridDragOver(e: React.DragEvent<HTMLDivElement>) {
		const rect = weekGridRef.current?.getBoundingClientRect();
		if (!rect || !isDragging) return;
		const x = e.clientX - rect.left;
		const newZone: "left" | "right" | null =
			x < SCROLL_ZONE_W ? "left" : x > rect.width - SCROLL_ZONE_W ? "right" : null;
		if (newZone !== scrollZoneRef.current) {
			scrollZoneRef.current = newZone;
			setScrollZone(newZone);
			if (newZone) {
				scrollEnterTimeRef.current = Date.now();
				startScrollRaf();
			} else {
				scrollEnterTimeRef.current = null;
				stopScrollRaf();
				setScrollProgress(0);
			}
		}
	}

	function handleGridDragLeave(e: React.DragEvent<HTMLDivElement>) {
		const rect = weekGridRef.current?.getBoundingClientRect();
		if (!rect) return;
		const { clientX: x, clientY: y } = e;
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			clearScrollZone();
		}
	}

	function handleDrop(e: React.DragEvent, toDateStr: string) {
		e.preventDefault();
		setDragOverDate(null);
		setDraggingVisitId(null);
		setDraggingOccurrenceId(null);
		clearScrollZone();

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

		if (parsed.fromDateStr === toDateStr) {
			restoreOriginWeek();
			return;
		}

		const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();

		if (parsed.type === "occurrence") {
			let occ: OccurrenceWithPlan | undefined;
			for (const occs of Object.values(occurrencesByDay)) {
				occ = occs.find((o) => o.id === parsed.occurrenceId);
				if (occ) break;
			}
			if (!occ) return;
			hasPendingPopupRef.current = true;
			setPendingOccurrenceDrop({ occurrence: occ, fromDateStr: parsed.fromDateStr, newDateStr: toDateStr, anchorRect });
			return;
		}

		let visit: VisitWithJob | undefined;
		for (const dayVisits of Object.values(visitsByDay)) {
			visit = dayVisits.find((v) => v.id === parsed.visitId);
			if (visit) break;
		}
		if (!visit) return;
		hasPendingPopupRef.current = true;
		setPendingDrop({ visit, oldDateStr: parsed.fromDateStr, newDateStr: toDateStr, anchorRect });
	}

	// ── Mutation handlers ────────────────────────────────────────────────────

	async function handleVisitSave(visitId: string, data: UpdateJobVisitInput) {
		dragOriginWeekRef.current = null;
		hasPendingPopupRef.current = false;
		try {
			await updateVisit({ id: visitId, data });
		} catch {
			// reverts via query invalidation
		}
		setPendingDrop(null);
	}

	function handleVisitRescheduleCancel() {
		setPendingDrop(null);
		restoreOriginWeek();
	}

	async function handleOccurrenceSave(newStartAt: string, newEndAt: string | undefined) {
		if (!pendingOccurrenceDrop) return;
		dragOriginWeekRef.current = null;
		hasPendingPopupRef.current = false;
		const { occurrence } = pendingOccurrenceDrop;
		try {
			await rescheduleOccurrence({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
				input: { new_start_at: newStartAt, new_end_at: newEndAt },
			});
		} catch {
			// reverts via query invalidation
		}
		setPendingOccurrenceDrop(null);
	}

	function handleOccurrenceRescheduleCancel() {
		setPendingOccurrenceDrop(null);
		restoreOriginWeek();
	}

	async function handleOccurrenceGenerate(newStartAt: string, newEndAt: string | undefined) {
		if (!pendingOccurrenceDrop) return;
		dragOriginWeekRef.current = null;
		hasPendingPopupRef.current = false;
		const { occurrence } = pendingOccurrenceDrop;
		setGeneratingVisitId(occurrence.id);
		setPendingOccurrenceDrop(null);
		try {
			await rescheduleOccurrence({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
				input: { new_start_at: newStartAt, new_end_at: newEndAt },
			});
			await generateVisitFromOccurrence({ occurrenceId: occurrence.id, jobId: occurrence.job_obj.id });
		} catch {
			// reverts via query invalidation
		}
		setGeneratingVisitId(null);
	}

	async function handleGenerateVisitFromClickedOccurrence() {
		if (!clickedOccurrence) return;
		const { occ } = clickedOccurrence;
		setGeneratingVisitId(occ.id);
		setClickedOccurrence(null);
		try {
			await generateVisitFromOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id });
		} catch {
			// reverts via query invalidation
		}
		setGeneratingVisitId(null);
	}

	return (
		<div style={{
			display: "flex",
			flexDirection: "column",
			backgroundColor: "#18181b",
			border: "1px solid #27272a",
			borderRadius: 8,
			overflow: "hidden",
			userSelect: "none",
		}}>

			{/* ── Toolbar ──────────────────────────────────────────────────────── */}
			<div className="flex items-center gap-1.5 px-3 border-b border-zinc-800 shrink-0" style={{ height: 44 }}>

				{/* Today */}
				<button
					onClick={() => setWeekStart(getThisMonday())}
					className="h-7 px-3 rounded text-[11px] font-medium border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors shrink-0"
				>
					Today
				</button>

				{/* Prev / Next */}
				<div className="flex items-center shrink-0">
					<button
						onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })}
						className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
					>
						<ChevronLeft size={14} />
					</button>
					<span className="text-[13px] font-semibold text-zinc-100 min-w-[176px] text-center tracking-tight">
						{weekLabel}
					</span>
					<button
						onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })}
						className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
					>
						<ChevronRight size={14} />
					</button>
				</div>

				{/* Divider */}
				<div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />

				{/* Visits toggle */}
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

				{/* Recurring toggle */}
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

			{/* ── Week grid ────────────────────────────────────────────────────── */}
			<div
				ref={weekGridRef}
				style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", position: "relative" }}
				onDragOver={handleGridDragOver}
				onDragLeave={handleGridDragLeave}
			>
				{weekDays.map((dateStr, i) => {
					const dayNum = parseInt(dateStr.split("-")[2]);
					const isToday = dateStr === todayStr;
					const label = WEEKDAY_LABELS[i];
					return (
						<div
							key={dateStr}
							style={{
								borderRight: i < 6 ? "1px solid #27272a" : "none",
							}}
						>
							{/* Day header */}
							<div style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "5px 7px 4px",
								borderBottom: "1px solid #27272a",
								backgroundColor: "#1c1c1f",
							}}>
								<span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a1a1aa" }}>
									{label}
								</span>
								<div style={{
									width: 22, height: 22, borderRadius: "50%",
									display: "flex", alignItems: "center", justifyContent: "center",
									fontSize: 11, fontWeight: 600,
									backgroundColor: isToday ? "#3b82f6" : "transparent",
									color: isToday ? "#fff" : "#71717a",
								}}>
									{dayNum}
								</div>
							</div>
							{/* Day body — drop zone + cards */}
							<div
								style={{
									minHeight: 96,
									padding: 4,
									display: "flex",
									flexDirection: "column",
									gap: 2,
									backgroundColor: dragOverDate === dateStr ? "rgba(59,130,246,0.08)" : "transparent",
									outline: dragOverDate === dateStr ? "2px inset rgba(59,130,246,0.4)" : "none",
									transition: "background-color 0.1s",
								}}
								onDragOver={(e) => handleDragOver(e, dateStr)}
								onDragLeave={handleDragLeave}
								onDrop={(e) => handleDrop(e, dateStr)}
							>
								{(() => {
									const dayVisits  = effectiveVisitsByDay[dateStr]      ?? [];
									const dayOccs    = effectiveOccurrencesByDay[dateStr] ?? [];
									const allItems   = [
										...dayVisits.map((v) => ({ type: "visit" as const, item: v })),
										...dayOccs.map((o)   => ({ type: "occ"   as const, item: o })),
									];
									const visible     = allItems.slice(0, MAX_VISIBLE);
									const hiddenCount = Math.max(0, allItems.length - MAX_VISIBLE);

									return (
										<>
											{visible.map((di) => {
												if (di.type === "visit") {
													const v = di.item;
													const techs = (v.visit_techs ?? []).map((vt) => ({
														id: vt.tech_id,
														color: techColorMap.get(vt.tech_id) ?? "#6b7280",
													}));
													return (
														<MonthMiniCard
															key={v.id}
															visitName={v.job_obj?.name ?? "Visit"}
															priorityColor={getPriorityColor(v.job_obj?.priority)}
															timeLabel={visitTimeLabel(v)}
															techs={techs}
															isDragging={draggingVisitId === v.id || pendingDrop?.visit.id === v.id}
															onDragStart={(e) => handleVisitDragStart(e, v, dateStr)}
															onDragEnd={handleDragEnd}
															onClick={(e) => {
																e.stopPropagation();
																setClickedOccurrence(null);
																const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
																setClickedVisit((prev) => prev?.visit.id === v.id ? null : { visit: v, rect });
															}}
														/>
													);
												} else {
													const occ = di.item;
													const isGenerating = generatingVisitId === occ.id;
													return (
														<MonthMiniCard
															key={occ.id}
															visitName={occ.job_obj?.name ?? "Recurring"}
															priorityColor={getPriorityColor(occ.job_obj?.priority)}
															timeLabel={occurrenceTimeLabel(occ)}
															techs={[]}
															isOccurrence
															isDragging={draggingOccurrenceId === occ.id || isGenerating || pendingOccurrenceDrop?.occurrence.id === occ.id}
															onDragStart={(e) => handleOccurrenceDragStart(e, occ, dateStr)}
															onDragEnd={handleDragEnd}
															onClick={(e) => {
																e.stopPropagation();
																setClickedVisit(null);
																const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
																setClickedOccurrence((prev) => prev?.occ.id === occ.id ? null : { occ, rect });
															}}
														/>
													);
												}
											})}

											{hiddenCount > 0 && (
												<button
													onClick={() => navigate("/dispatch/schedule")}
													style={{
														fontSize: 9,
														fontWeight: 600,
														color: "#60a5fa",
														background: "none",
														border: "none",
														cursor: "pointer",
														padding: "1px 0",
														textAlign: "left",
														fontFamily: "inherit",
													}}
												>
													+{hiddenCount} more
												</button>
											)}
										</>
									);
								})()}
							</div>
						</div>
					);
				})}

				{/* ── Left drag scroll zone ─────────────────────────────────────── */}
				<div
					aria-hidden
					style={{
						position: "absolute", left: 0, top: 0, bottom: 0, width: SCROLL_ZONE_W,
						pointerEvents: "none",
						opacity: isDragging ? 1 : 0,
						transition: "opacity 0.3s ease",
						overflow: "hidden",
						zIndex: 10,
					}}
				>
					{/* Base gradient — visible while dragging */}
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(59,130,246,0.22), transparent)" }} />
					{/* Progress trailing fill */}
					{scrollZone === "left" && (
						<div style={{
							position: "absolute", top: 0, bottom: 0, left: 0,
							width: `${scrollProgress * 100}%`,
							background: "linear-gradient(to right, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)",
						}} />
					)}
					{/* Sweep bar */}
					{scrollZone === "left" && scrollProgress > 0 && (
						<div style={{
							position: "absolute", top: 0, bottom: 0,
							left: `calc(${scrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6",
							boxShadow: "0 0 6px rgba(59,130,246,0.7)",
						}} />
					)}
					{/* Finish line — shown when hovering the zone */}
					{scrollZone === "left" && (
						<div style={{
							position: "absolute", top: 0, bottom: 0, right: 0, width: 1,
							background: "rgba(59,130,246,0.55)",
						}} />
					)}
					{/* Chevron */}
					<div style={{
						position: "absolute", top: "50%", left: 6,
						transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (scrollZone === "left" ? scrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none",
					}}>‹</div>
				</div>

				{/* ── Right drag scroll zone ────────────────────────────────────── */}
				<div
					aria-hidden
					style={{
						position: "absolute", right: 0, top: 0, bottom: 0, width: SCROLL_ZONE_W,
						pointerEvents: "none",
						opacity: isDragging ? 1 : 0,
						transition: "opacity 0.3s ease",
						overflow: "hidden",
						zIndex: 10,
					}}
				>
					<div style={{ position: "absolute", inset: 0, background: "linear-gradient(to left, rgba(59,130,246,0.22), transparent)" }} />
					{scrollZone === "right" && (
						<div style={{
							position: "absolute", top: 0, bottom: 0, right: 0,
							width: `${scrollProgress * 100}%`,
							background: "linear-gradient(to left, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.18) 100%)",
						}} />
					)}
					{scrollZone === "right" && scrollProgress > 0 && (
						<div style={{
							position: "absolute", top: 0, bottom: 0,
							right: `calc(${scrollProgress * 100}% - 2px)`, width: 2,
							background: "#3b82f6",
							boxShadow: "0 0 6px rgba(59,130,246,0.7)",
						}} />
					)}
					{/* Finish line — shown when hovering the zone */}
					{scrollZone === "right" && (
						<div style={{
							position: "absolute", top: 0, bottom: 0, left: 0, width: 1,
							background: "rgba(59,130,246,0.55)",
						}} />
					)}
					<div style={{
						position: "absolute", top: "50%", right: 6,
						transform: "translateY(-50%)",
						color: `rgba(147,197,253,${0.4 + (scrollZone === "right" ? scrollProgress * 0.6 : 0)})`,
						fontSize: 16, fontWeight: 700, lineHeight: 1, userSelect: "none",
					}}>›</div>
				</div>
			</div>

		{/* ── Visit detail popup ───────────────────────────────────────────── */}
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
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5", lineHeight: 1.3, flex: 1 }}>
							{v.job_obj?.name}
						</span>
						<button
							onClick={() => setClickedVisit(null)}
							style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1 }}
						>
							×
						</button>
					</div>

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

					<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 8 }}>
						{visitStartLabel(v)}{v.finish_constraint !== "when_done" ? ` – ${visitEndLabel(v)}` : " · finish when done"}
					</div>

					{(v.visit_techs?.length ?? 0) > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
							{v.visit_techs!.map((vt) => {
								const color = techColorMap.get(vt.tech_id) ?? "#6b7280";
								const name  = technicians.find((t) => t.id === vt.tech_id)?.name ?? vt.tech_id;
								return (
									<span
										key={vt.tech_id}
										style={{
											display: "inline-flex", alignItems: "center", gap: 3,
											fontSize: 9, color: "#e4e4e7",
											backgroundColor: color + "33", border: `1px solid ${color}55`,
											borderRadius: 10, padding: "1px 6px",
										}}
									>
										<span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, display: "block" }} />
										{name}
									</span>
								);
							})}
						</div>
					)}

					<button
						onClick={() => navigate(`/dispatch/jobs/${v.job_obj.id}/visits/${v.id}`)}
						style={{
							width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 600,
							color: "#fff", backgroundColor: "#3b82f6", border: "none",
							borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
						}}
					>
						View Visit →
					</button>
				</div>
			);
		})()}

		{/* ── Occurrence click popup ───────────────────────────────────────── */}
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
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", lineHeight: 1.3, flex: 1 }}>
							{occ.job_obj?.name ?? "Recurring"}
						</span>
						<button
							onClick={() => setClickedOccurrence(null)}
							style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1 }}
						>
							×
						</button>
					</div>
					<span style={{
						display: "inline-block",
						fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10, marginBottom: 10,
						backgroundColor: "rgba(139,92,246,0.15)", color: "#c4b5fd",
						textTransform: "uppercase", letterSpacing: "0.04em",
					}}>
						Recurring Occurrence
					</span>
					<button
						onClick={handleGenerateVisitFromClickedOccurrence}
						disabled={generatingVisitId === occ.id}
						style={{
							width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 600,
							color: "#fff", backgroundColor: "#7c3aed", border: "none",
							borderRadius: 5, cursor: generatingVisitId === occ.id ? "not-allowed" : "pointer",
							fontFamily: "inherit", opacity: generatingVisitId === occ.id ? 0.6 : 1,
							marginBottom: 4,
						}}
					>
						{generatingVisitId === occ.id ? "Generating…" : "Generate Visit"}
					</button>
				</div>
			);
		})()}

		{/* ── Reschedule popup (visit drag) ────────────────────────────────── */}
		{pendingDrop && (
			<ReschedulePopup
				visit={pendingDrop.visit}
				oldDateStr={pendingDrop.oldDateStr}
				newDateStr={pendingDrop.newDateStr}
				allVisitsOnNewDay={visitsByDay[pendingDrop.newDateStr] ?? []}
				technicians={technicians}
				techColorMap={techColorMap}
				anchorRect={pendingDrop.anchorRect}
				onSave={(data) => handleVisitSave(pendingDrop.visit.id, data)}
				onUndo={handleVisitRescheduleCancel}
			/>
		)}

		{/* ── Occurrence reschedule popup (occurrence drag) ─────────────────── */}
		{pendingOccurrenceDrop && (
			<OccurrenceReschedulePopup
				occurrence={pendingOccurrenceDrop.occurrence}
				oldDateStr={pendingOccurrenceDrop.fromDateStr}
				newDateStr={pendingOccurrenceDrop.newDateStr}
				anchorRect={pendingOccurrenceDrop.anchorRect}
				onReschedule={handleOccurrenceSave}
				onGenerate={handleOccurrenceGenerate}
				onCancel={handleOccurrenceRescheduleCancel}
				isGenerating={generatingVisitId === pendingOccurrenceDrop.occurrence.id}
			/>
		)}
		</div>
	);
}
