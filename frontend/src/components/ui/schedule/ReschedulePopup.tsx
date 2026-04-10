import { useState, useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, RotateCcw, RotateCw } from "lucide-react";
import TimePicker from "../TimePicker";
import type { UpdateJobVisitInput } from "../../../types/jobs";
import type { ArrivalConstraint, FinishConstraint } from "../../../types/recurringPlans";
import type { Technician } from "../../../types/technicians";
import type { VisitWithJob } from "./dashboardCalendarUtils";
import {
	formatDateDisplay,
	dateToHHMM,
	hhmmToPickerDate,
	POPUP_LABEL_STYLE,
	POPUP_MUTED_STYLE,
	POPUP_SELECT_STYLE,
} from "./scheduleBoardUtils";

interface ConflictRow {
	techName: string;
	techColor: string;
	visitName: string;
	timeRange: string;
}

type ConflictState = "ok" | "checking" | "error";

interface ReschedulePopupProps {
	visit: VisitWithJob;
	oldDateStr: string;
	newDateStr: string;
	allVisitsOnNewDay: VisitWithJob[];
	technicians: Technician[];
	techColorMap: Map<string, string>;
	anchorRect: DOMRect;
	onSave: (data: UpdateJobVisitInput) => void;
	onUndo: () => void;
}

function formatTimeSimple(d: Date): string {
	const h = d.getHours();
	const m = d.getMinutes();
	const period = h >= 12 ? "PM" : "AM";
	const displayH = h % 12 || 12;
	return m === 0 ? `${displayH} ${period}` : `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

function hhmmToDate(newDateStr: string, hhmm: string): Date | null {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	const [y, mo, d] = newDateStr.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m, 0, 0);
}

function computeNewTimes(
	newDateStr: string,
	oldStartAt: string | Date,
	oldEndAt: string | Date,
): { newStart: Date; newEnd: Date } {
	const oldStart = typeof oldStartAt === "string" ? new Date(oldStartAt) : oldStartAt;
	const oldEnd = typeof oldEndAt === "string" ? new Date(oldEndAt) : oldEndAt;
	const durationMs = oldEnd.getTime() - oldStart.getTime();
	const [y, mo, d] = newDateStr.split("-").map(Number);
	const newStart = new Date(y, mo - 1, d, oldStart.getHours(), oldStart.getMinutes(), 0, 0);
	const newEnd = new Date(newStart.getTime() + durationMs);
	return { newStart, newEnd };
}

function detectConflicts(
	visitId: string,
	newStart: Date,
	newEnd: Date,
	assignedTechIds: string[],
	allVisitsOnNewDay: VisitWithJob[],
	technicians: Technician[],
	techColorMap: Map<string, string>,
): ConflictRow[] {
	const rows: ConflictRow[] = [];
	for (const v of allVisitsOnNewDay) {
		if (v.id === visitId) continue;
		const vTechIds = (v.visit_techs ?? []).map((vt) => vt.tech_id);
		const shared = assignedTechIds.filter((id) => vTechIds.includes(id));
		if (shared.length === 0) continue;
		const vStart = new Date(v.scheduled_start_at);
		const vEnd = new Date(v.scheduled_end_at);
		if (newStart < vEnd && vStart < newEnd) {
			for (const techId of shared) {
				rows.push({
					techName: technicians.find((t) => t.id === techId)?.name ?? techId,
					techColor: techColorMap.get(techId) ?? "#6b7280",
					visitName: v.job_obj?.name ?? "Visit",
					timeRange: `${formatTimeSimple(vStart)}–${formatTimeSimple(vEnd)}`,
				});
			}
		}
	}
	return rows;
}

/** "HH:MM" from a Date string (scheduled_start_at / _end_at) */
function scheduledToHHMM(iso: string | Date): string {
	const d = typeof iso === "string" ? new Date(iso) : iso;
	return dateToHHMM(d);
}

export default function ReschedulePopup({
	visit,
	oldDateStr,
	newDateStr,
	allVisitsOnNewDay,
	technicians,
	techColorMap,
	anchorRect,
	onSave,
	onUndo,
}: ReschedulePopupProps) {
	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>(
		visit.arrival_constraint as ArrivalConstraint
	);
	const [arrivalTime, setArrivalTime] = useState(visit.arrival_time ?? "");
	const [arrivalWindowStart, setArrivalWindowStart] = useState(visit.arrival_window_start ?? "");
	const [arrivalWindowEnd, setArrivalWindowEnd] = useState(visit.arrival_window_end ?? "");
	const [finishConstraint, setFinishConstraint] = useState<FinishConstraint>(
		visit.finish_constraint as FinishConstraint
	);
	const [finishTime, setFinishTime] = useState(visit.finish_time ?? "");
	const [recurringScope, setRecurringScope] = useState<"this" | "future">("this");
	const [conflictState, setConflictState] = useState<ConflictState>("checking");
	const [conflictRows, setConflictRows] = useState<ConflictRow[]>([]);
	const popupRef = useRef<HTMLDivElement>(null);

	const assignedTechIds = (visit.visit_techs ?? []).map((vt) => vt.tech_id);
	const isRecurring = !!visit.job_obj?.recurring_plan;

	// Save is only valid when every selected constraint type has its required time filled
	const isComplete =
		(arrivalConstraint !== "at"      || arrivalTime !== "") &&
		(arrivalConstraint !== "between" || (arrivalWindowStart !== "" && arrivalWindowEnd !== "")) &&
		(arrivalConstraint !== "by"      || arrivalWindowEnd !== "") &&
		(finishConstraint === "when_done" || finishTime !== "");

	// When switching arrival constraint type, pre-fill times from scheduled values so
	// the new inputs are never blank and the user doesn't have to type from scratch.
	function handleArrivalConstraintChange(newC: ArrivalConstraint) {
		setArrivalConstraint(newC);
		if (newC === "at" && !arrivalTime)
			setArrivalTime(scheduledToHHMM(visit.scheduled_start_at));
		else if (newC === "between") {
			if (!arrivalWindowStart) setArrivalWindowStart(scheduledToHHMM(visit.scheduled_start_at));
			if (!arrivalWindowEnd)   setArrivalWindowEnd(scheduledToHHMM(visit.scheduled_end_at));
		} else if (newC === "by" && !arrivalWindowEnd)
			setArrivalWindowEnd(scheduledToHHMM(visit.scheduled_end_at));
	}

	function handleFinishConstraintChange(newC: FinishConstraint) {
		setFinishConstraint(newC);
		if ((newC === "at" || newC === "by") && !finishTime)
			setFinishTime(scheduledToHHMM(visit.scheduled_end_at));
	}

	// True when the user has edited any constraint field from its original value
	const hasChanges =
		arrivalConstraint !== (visit.arrival_constraint as ArrivalConstraint) ||
		arrivalTime        !== (visit.arrival_time         ?? "") ||
		arrivalWindowStart !== (visit.arrival_window_start ?? "") ||
		arrivalWindowEnd   !== (visit.arrival_window_end   ?? "") ||
		finishConstraint   !== (visit.finish_constraint    as FinishConstraint) ||
		finishTime         !== (visit.finish_time          ?? "");

	// Run conflict detection whenever timing constraints change
	useEffect(() => {
		setConflictState("checking");
		const timer = setTimeout(() => {
			const { newStart, newEnd } = computeNewTimes(
				newDateStr,
				visit.scheduled_start_at,
				visit.scheduled_end_at,
			);

			// Override start if user has set an explicit arrival time
			let checkStart = newStart;
			if (arrivalConstraint === "at" && arrivalTime) {
				checkStart = hhmmToDate(newDateStr, arrivalTime) ?? newStart;
			} else if (arrivalConstraint === "between" && arrivalWindowStart) {
				checkStart = hhmmToDate(newDateStr, arrivalWindowStart) ?? newStart;
			} else if (arrivalConstraint === "by" && arrivalWindowEnd) {
				checkStart = hhmmToDate(newDateStr, arrivalWindowEnd) ?? newStart;
			}

			let checkEnd = newEnd;
			if ((finishConstraint === "at" || finishConstraint === "by") && finishTime) {
				checkEnd = hhmmToDate(newDateStr, finishTime) ?? newEnd;
			}

			const rows = detectConflicts(
				visit.id,
				checkStart,
				checkEnd,
				assignedTechIds,
				allVisitsOnNewDay,
				technicians,
				techColorMap,
			);
			setConflictRows(rows);
			setConflictState(rows.length > 0 ? "error" : "ok");
		}, 150);
		return () => clearTimeout(timer);
	}, [arrivalConstraint, arrivalTime, arrivalWindowStart, arrivalWindowEnd, finishConstraint, finishTime]);

	// Smart popup position: right of cell if space allows, else left
	const popupW = 308;
	const popupLeft =
		anchorRect.right + 8 + popupW < window.innerWidth
			? anchorRect.right + 8
			: anchorRect.left - popupW - 8;
	const popupTop = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 520));

	function handleUndo() {
		setArrivalConstraint(visit.arrival_constraint as ArrivalConstraint);
		setArrivalTime(visit.arrival_time ?? "");
		setArrivalWindowStart(visit.arrival_window_start ?? "");
		setArrivalWindowEnd(visit.arrival_window_end ?? "");
		setFinishConstraint(visit.finish_constraint as FinishConstraint);
		setFinishTime(visit.finish_time ?? "");
	}

	function handleSave() {
		const { newStart, newEnd } = computeNewTimes(
			newDateStr,
			visit.scheduled_start_at,
			visit.scheduled_end_at,
		);
		const data: UpdateJobVisitInput = {
			scheduled_start_at: newStart.toISOString(),
			scheduled_end_at: newEnd.toISOString(),
			arrival_constraint: arrivalConstraint,
			finish_constraint: finishConstraint,
			arrival_time: arrivalConstraint === "at" ? (arrivalTime || null) : null,
			arrival_window_start: arrivalConstraint === "between" ? (arrivalWindowStart || null) : null,
			arrival_window_end: (arrivalConstraint === "between" || arrivalConstraint === "by") ? (arrivalWindowEnd || null) : null,
			finish_time: (finishConstraint === "at" || finishConstraint === "by") ? (finishTime || null) : null,
		};
		onSave(data);
	}

	return (
		<>
			{/* Backdrop */}
			<div
				style={{ position: "fixed", inset: 0, zIndex: 1000 }}
				onClick={onUndo}
			/>

			{/* Popup */}
			<div
				ref={popupRef}
				style={{
					position: "fixed",
					top: popupTop,
					left: popupLeft,
					width: popupW,
					zIndex: 1001,
					backgroundColor: "#18181b",
					border: "1px solid #3f3f46",
					borderRadius: 8,
					boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.7)",
					overflow: "hidden",
					fontFamily: "inherit",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div style={{ padding: "10px 12px 9px", borderBottom: "1px solid #27272a" }}>
					<div style={{
						fontSize: 12,
						fontWeight: 700,
						color: "#f4f4f5",
						letterSpacing: "-0.01em",
						marginBottom: 2,
					}}>
						Reschedule Visit
					</div>
					<div style={{
						fontSize: 11,
						color: "#a1a1aa",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}>
						{visit.job_obj?.name}
					</div>
				</div>

				<div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

					{/* Move chip — full width, subtle blue accent */}
					<div style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 6,
						fontSize: 11,
						backgroundColor: "rgba(59,130,246,0.06)",
						border: "1px solid rgba(59,130,246,0.14)",
						borderRadius: 6,
						padding: "6px 10px",
					}}>
						<span style={{ color: "#71717a" }}>{formatDateDisplay(oldDateStr)}</span>
						<ArrowRight size={11} style={{ color: "#3b82f6", flexShrink: 0 }} />
						<span style={{ color: "#93c5fd", fontWeight: 600 }}>{formatDateDisplay(newDateStr)}</span>
					</div>

					{/* Recurring scope */}
					{isRecurring && (
						<div style={{
							backgroundColor: "rgba(139,92,246,0.08)",
							border: "1px solid rgba(139,92,246,0.2)",
							borderRadius: 6,
							padding: "7px 9px",
						}}>
							<div style={{
								fontSize: 9,
								color: "#a78bfa",
								marginBottom: 5,
								fontWeight: 600,
								textTransform: "uppercase",
								letterSpacing: "0.06em",
							}}>
								Recurring visit
							</div>
							<div style={{ display: "flex", gap: 4 }}>
								{(["this", "future"] as const).map((scope) => (
									<button
										key={scope}
										onClick={() => setRecurringScope(scope)}
										style={{
											fontSize: 10,
											padding: "3px 9px",
											borderRadius: 4,
											border: "1px solid",
											cursor: "pointer",
											backgroundColor: recurringScope === scope ? "#7c3aed" : "transparent",
											borderColor: recurringScope === scope ? "#7c3aed" : "rgba(139,92,246,0.35)",
											color: recurringScope === scope ? "#fff" : "#a78bfa",
											fontFamily: "inherit",
											transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
										}}
									>
										{scope === "this" ? "This visit only" : "This & all future"}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Two-column constraint form */}
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>

						{/* Arrival column */}
						<div style={{ paddingRight: 10, display: "flex", flexDirection: "column", gap: 6 }}>
							<div style={POPUP_LABEL_STYLE}>Arrival</div>
							<select
								value={arrivalConstraint}
								onChange={(e) => handleArrivalConstraintChange(e.target.value as ArrivalConstraint)}
								style={POPUP_SELECT_STYLE}
							>
								<option value="anytime">Anytime</option>
								<option value="at">Arrive at</option>
								<option value="between">Between</option>
								<option value="by">Arrive by</option>
							</select>

							{arrivalConstraint === "at" && (
								<TimePicker
									value={hhmmToPickerDate(arrivalTime)}
									onChange={(d) => setArrivalTime(dateToHHMM(d))}
									compact
								/>
							)}
							{arrivalConstraint === "between" && (
								<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
									<div>
										<div style={{ fontSize: 9, color: "#71717a", marginBottom: 2 }}>From</div>
										<TimePicker
											value={hhmmToPickerDate(arrivalWindowStart)}
											onChange={(d) => setArrivalWindowStart(dateToHHMM(d))}
											compact
										/>
									</div>
									<div>
										<div style={{ fontSize: 9, color: "#71717a", marginBottom: 2 }}>To</div>
										<TimePicker
											value={hhmmToPickerDate(arrivalWindowEnd)}
											onChange={(d) => setArrivalWindowEnd(dateToHHMM(d))}
											compact
										/>
									</div>
								</div>
							)}
							{arrivalConstraint === "by" && (
								<TimePicker
									value={hhmmToPickerDate(arrivalWindowEnd)}
									onChange={(d) => setArrivalWindowEnd(dateToHHMM(d))}
									compact
								/>
							)}
							{arrivalConstraint === "anytime" && (
								<div style={POPUP_MUTED_STYLE}>No time required</div>
							)}
						</div>

						{/* Divider */}
						<div style={{ backgroundColor: "#27272a", alignSelf: "stretch" }} />

						{/* Finish column */}
						<div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 6 }}>
							<div style={POPUP_LABEL_STYLE}>Finish</div>
							<select
								value={finishConstraint}
								onChange={(e) => handleFinishConstraintChange(e.target.value as FinishConstraint)}
								style={POPUP_SELECT_STYLE}
							>
								<option value="when_done">When done</option>
								<option value="at">Finish at</option>
								<option value="by">Finish by</option>
							</select>

							{(finishConstraint === "at" || finishConstraint === "by") && (
								<TimePicker
									value={hhmmToPickerDate(finishTime)}
									onChange={(d) => setFinishTime(dateToHHMM(d))}
									compact
								/>
							)}
							{finishConstraint === "when_done" && (
								<div style={POPUP_MUTED_STYLE}>No time required</div>
							)}
						</div>
					</div>

					{/* Conflict box */}
					{conflictState === "error" && (
						<div style={{
							borderRadius: 6,
							overflow: "hidden",
							border: "1px solid rgba(239,68,68,0.25)",
						}}>
							<div style={{
								display: "flex",
								alignItems: "center",
								gap: 5,
								padding: "5px 8px",
								backgroundColor: "rgba(239,68,68,0.1)",
								borderBottom: "1px solid rgba(239,68,68,0.15)",
							}}>
								<AlertTriangle size={10} style={{ color: "#f87171", flexShrink: 0 }} />
								<span style={{ fontSize: 9, fontWeight: 600, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.05em" }}>
									Scheduling conflict
								</span>
							</div>
							<div style={{ padding: "5px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
								{conflictRows.map((row, i) => (
									<div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "#fca5a5", minWidth: 0 }}>
										<span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: row.techColor, flexShrink: 0 }} />
										<span style={{ fontWeight: 600, flexShrink: 0 }}>{row.techName}</span>
										<span style={{ color: "#52525b", flexShrink: 0 }}>·</span>
										<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{row.visitName}</span>
										<span style={{ color: "#71717a", flexShrink: 0 }}>{row.timeRange}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "8px 12px",
					borderTop: "1px solid #27272a",
					gap: 6,
				}}>
					<button
						onClick={hasChanges ? handleUndo : onUndo}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 5,
							height: 28,
							fontSize: 11,
							fontWeight: hasChanges ? 600 : 400,
							color: hasChanges ? "#f59e0b" : "#a1a1aa",
							background: hasChanges ? "rgba(245,158,11,0.08)" : "none",
							border: hasChanges ? "1px solid rgba(245,158,11,0.22)" : "1px solid #3f3f46",
							borderRadius: 6,
							cursor: "pointer",
							padding: "0 9px",
							fontFamily: "inherit",
							transition: "color 0.15s, background 0.15s, border-color 0.15s",
						}}
						onMouseEnter={(e) => {
							(e.currentTarget as HTMLElement).style.color = hasChanges ? "#fbbf24" : "#d4d4d8";
						}}
						onMouseLeave={(e) => {
							(e.currentTarget as HTMLElement).style.color = hasChanges ? "#f59e0b" : "#a1a1aa";
						}}
					>
						{hasChanges && <RotateCcw size={11} />}
						{hasChanges ? "Undo changes" : "Cancel"}
					</button>

					<button
						onClick={(!isComplete || conflictState === "checking") ? undefined : handleSave}
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							height: 28,
							minWidth: 64,
							fontSize: 11,
							fontWeight: 600,
							padding: "0 12px",
							borderRadius: 6,
							border: "none",
							backgroundColor: "#3b82f6",
							color: "#fff",
							cursor: (!isComplete || conflictState === "checking") ? "default" : "pointer",
							fontFamily: "inherit",
							transition: "background-color 0.15s, opacity 0.15s",
							opacity: !isComplete ? 0.45 : 1,
							pointerEvents: (!isComplete || conflictState === "checking") ? "none" : "auto",
						}}
						onMouseEnter={(e) => {
							if (isComplete && conflictState !== "checking")
								(e.currentTarget as HTMLElement).style.backgroundColor = "#2563eb";
						}}
						onMouseLeave={(e) => {
							(e.currentTarget as HTMLElement).style.backgroundColor = "#3b82f6";
						}}
					>
						{conflictState === "checking"
							? <RotateCw size={12} className="animate-spin" />
							: "Save"
						}
					</button>
				</div>
			</div>
		</>
	);
}
