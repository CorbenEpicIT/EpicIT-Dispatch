import { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScheduleBoardCard, { type AssignedTech } from "./ScheduleBoardCard";
import {
	resolveOverlapLayout,
	calcCardTop,
	calcTopFromDatetime,
	calcCardHeight,
	visitStartLabel,
	visitEndLabel,
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
	const [hoveredOccurrenceId, setHoveredOccurrenceId] = useState<string | null>(null);
	const [clickedOccurrenceId, setClickedOccurrenceId] = useState<string | null>(null);
	const [generatingVisitId, setGeneratingVisitId] = useState<string | null>(null);
	const [dragOverMinutes, setDragOverMinutes] = useState<number | null>(null);
	const columnRef = useRef<HTMLDivElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);
	const occurrencePopupRef = useRef<HTMLDivElement>(null);
	const dragOffsetY = useRef(0);

	const totalSlots = DAY_END - DAY_START;
	const columnHeight = totalSlots * SLOT_H;
	const halfSlotH = SLOT_H / 2;

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

	// Resolve time-collision cascade positions
	const slots = resolveOverlapLayout(uniqueVisits, colWidth);

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
			})
		);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleOccurrenceDragStart(e: React.DragEvent, occ: OccurrenceWithPlan) {
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

	async function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragOverMinutes(null);
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
		};

		const rect = columnRef.current.getBoundingClientRect();
		const y = e.clientY - rect.top - sharedDragOffsetY;
		const snappedMins = snapTo15Min((y / SLOT_H) * 60);
		const clampedMins = Math.max(0, Math.min(snappedMins, (DAY_END - DAY_START) * 60));
		const [year, month, day] = dateStr.split("-").map(Number);
		const newStart = new Date(year, month - 1, day, DAY_START + Math.floor(clampedMins / 60), clampedMins % 60, 0, 0);

		// ── No-op check: dropped in same position as origin ───────────────────
		const origDate = new Date(parsed.startMs);
		const origDateStr = `${origDate.getFullYear()}-${String(origDate.getMonth() + 1).padStart(2, "0")}-${String(origDate.getDate()).padStart(2, "0")}`;
		const origMinsFromDayStart = (origDate.getHours() - DAY_START) * 60 + origDate.getMinutes();
		const origSnappedMins = snapTo15Min(origMinsFromDayStart);
		if (dateStr === origDateStr && clampedMins === origSnappedMins) return;

		// ── Occurrence drag: direct reschedule, no popup ──────────────────────
		if (parsed.type === "occurrence") {
			const newEnd = new Date(newStart.getTime() + parsed.durationMs);
			onDropHandled?.();
			try {
				await rescheduleOccurrence({
					occurrenceId: parsed.occurrenceId!,
					jobId: parsed.jobId!,
					input: { new_start_at: newStart.toISOString(), new_end_at: newEnd.toISOString() },
				});
				onRescheduleConfirmed?.();
			} catch {
				// revert via query invalidation
			}
			return;
		}

		// ── Visit drag ────────────────────────────────────────────────────────
		const { visitId, durationMs, arrival_constraint, arrival_time, arrival_window_start, arrival_window_end } = parsed;
		const newEnd  = new Date(newStart.getTime() + durationMs);
		const newHHMM = minsToHHMM(clampedMins);

		const data: UpdateJobVisitInput = {
			scheduled_start_at: newStart.toISOString(),
			scheduled_end_at: newEnd.toISOString(),
		};

		// Sync the constraint time field that controls visual card position
		if (arrival_constraint === "at") {
			data.arrival_time = newHHMM;
		} else if (arrival_constraint === "between") {
			// Shift the whole window, preserving its duration
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
		// "anytime" dropped onto time grid → convert to timed "at" constraint
		if (arrival_constraint === "anytime") {
			data.arrival_constraint = "at";
			data.arrival_time = newHHMM;
			data.finish_constraint = "when_done";
			data.finish_time = null;
		}

		onDropHandled?.();
		try {
			await updateVisit({ id: visitId!, data });
			onRescheduleConfirmed?.();
		} catch {
			// mutation failure — data reverts via query invalidation
		}
	}

	// ── Occurrence generate-visit handler ────────────────────────────────────

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

	// ── Popup ─────────────────────────────────────────────────────────────────

	const clickedVisit = clickedCardId
		? uniqueVisits.find((v) => v.id === clickedCardId) ?? null
		: null;

	const clickedOccurrence = clickedOccurrenceId
		? occurrences.find((o) => o.id === clickedOccurrenceId) ?? null
		: null;

	// Popup goes right for columns 0–3, left for columns 4–6 (avoids right-edge overflow)
	const popupOnLeft = dayIndex >= 4;

	const dropIndicatorTop =
		dragOverMinutes !== null
			? Math.max(0, (dragOverMinutes / 60) * SLOT_H)
			: null;

	return (
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

			{/* Visit cards — one per unique visit, time-collision cascade */}
			{showVisits && slots.map(({ visit, left, width }) => {
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
						top={top}
						height={height}
						left={left}
						width={width}
						zIndex={zIndex}
						onClick={() => {
							setClickedOccurrenceId(null);
							setClickedCardId(clickedCardId === visit.id ? null : visit.id);
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
				const top      = calcTopFromDatetime(occ.occurrence_start_at);
				const height   = Math.min(2 * SLOT_H, columnHeight - top);
				const occWidth = colWidth - LEFT_PAD - RIGHT_PAD;
				const isHov    = hoveredOccurrenceId === occ.id;
				const isClicked = clickedOccurrenceId === occ.id;
				const isGenerating = generatingVisitId === occ.id;

				const startD = new Date(occ.occurrence_start_at);
				const endD   = new Date(occ.occurrence_end_at);
				const timeLabel = startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
					+ " – " + endD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

				return (
					<div
						key={`occ-${occ.id}`}
						draggable
						onDragStart={(e) => handleOccurrenceDragStart(e, occ)}
						onClick={() => {
							setClickedCardId(null);
							setClickedOccurrenceId(isClicked ? null : occ.id);
						}}
						onMouseEnter={() => setHoveredOccurrenceId(occ.id)}
						onMouseLeave={() => setHoveredOccurrenceId(null)}
						style={{
							position: "absolute",
							top,
							left: LEFT_PAD,
							width: occWidth,
							height,
							zIndex: isHov ? 30 : 1,
							backgroundColor: "#252838",
							borderRadius: 4,
							overflow: "hidden",
							boxSizing: "border-box",
							cursor: isGenerating ? "default" : "grab",
							display: "flex",
							opacity: isGenerating ? 0.5 : 1,
							transition: "box-shadow 0.15s ease-out, transform 0.15s ease-out",
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
								padding: "4px 5px",
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
									whiteSpace: "nowrap",
									textOverflow: "ellipsis",
								}}>
									{occ.job_obj?.name}
								</span>
								{height >= 40 && (
									<span style={{
										fontSize: 9,
										color: "rgba(196,181,253,0.55)",
										lineHeight: 1.2,
										whiteSpace: "nowrap",
									}}>
										{timeLabel}
									</span>
								)}
								{height >= 56 && (
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
					</div>
				);
			})}

			{/* Click popup */}
			{clickedVisit && (
				<div
					ref={popupRef}
					style={{
						position: "absolute",
						top: Math.min(calcCardTop(clickedVisit), columnHeight - 240),
						...(popupOnLeft
							? { right: colWidth + 4 }
							: { left: colWidth + 4 }),
						width: 224,
						zIndex: 100,
						backgroundColor: "#18181b",
						border: "1px solid #3f3f46",
						borderRadius: 8,
						boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
						padding: "10px 12px",
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
						<span style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5", lineHeight: 1.3, flex: 1 }}>
							{clickedVisit.job_obj?.name}
						</span>
						<button
							onClick={() => setClickedCardId(null)}
							style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
							onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
							onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
						>
							×
						</button>
					</div>

					<span
						style={{
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
						}}
					>
						{clickedVisit.status}
					</span>

					<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 6 }}>
						{visitStartLabel(clickedVisit)}
						{clickedVisit.finish_constraint !== "when_done"
							? ` – ${visitEndLabel(clickedVisit)}`
							: " · finish when done"}
					</div>

					{(clickedVisit.visit_techs?.length ?? 0) > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
							{clickedVisit.visit_techs!.map((vt) => {
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

					<button
						onClick={() => navigate(`/dispatch/jobs/${clickedVisit.job_obj.id}/visits/${clickedVisit.id}`)}
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
							transition: "background-color 0.1s",
						}}
						onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
						onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
					>
						View Visit →
					</button>
				</div>
			)}

			{/* Occurrence click popup */}
			{clickedOccurrence && (
				<div
					ref={occurrencePopupRef}
					style={{
						position: "absolute",
						top: Math.min(calcTopFromDatetime(clickedOccurrence.occurrence_start_at), columnHeight - 260),
						...(popupOnLeft
							? { right: colWidth + 4 }
							: { left: colWidth + 4 }),
						width: 236,
						zIndex: 100,
						backgroundColor: "#18181b",
						border: "1px solid #3f3f46",
						borderRadius: 8,
						boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
						padding: "10px 12px",
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5", lineHeight: 1.3, marginBottom: 1 }}>
								{clickedOccurrence.plan.name}
							</div>
							<div style={{
								fontSize: 10,
								color: "#a1a1aa",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}>
								{clickedOccurrence.job_obj?.name}
							</div>
						</div>
						<button
							onClick={() => setClickedOccurrenceId(null)}
							style={{ fontSize: 16, color: "#52525b", background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
							onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
							onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
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
						backgroundColor: "rgba(139,92,246,0.15)",
						color: "#a78bfa",
						textTransform: "uppercase",
						letterSpacing: "0.04em",
					}}>
						Planned
					</span>

					<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 10 }}>
						{new Date(clickedOccurrence.occurrence_start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
						{" – "}
						{new Date(clickedOccurrence.occurrence_end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
					</div>

					<div style={{ display: "flex", gap: 5 }}>
						<button
							onClick={() => navigate(`/dispatch/recurring-plans/${clickedOccurrence.plan.id}`)}
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
								transition: "background-color 0.1s",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(139,92,246,0.2)")}
							onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(139,92,246,0.12)")}
						>
							View Plan →
						</button>
						<button
							onClick={() => handleGenerateVisitFromOccurrence(clickedOccurrence)}
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
								transition: "background-color 0.1s",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
							onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
						>
							Generate Visit
						</button>
					</div>
				</div>
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
		</div>
	);
}
