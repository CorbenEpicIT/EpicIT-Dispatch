import { useState } from "react";
import { ArrowRight, RotateCw } from "lucide-react";
import TimePicker from "../TimePicker";
import type { OccurrenceWithPlan } from "./dashboardCalendarUtils";
import type { ArrivalConstraint, FinishConstraint } from "../../../types/recurringPlans";
import {
	formatDateDisplay,
	dateToHHMM,
	hhmmToPickerDate,
	POPUP_LABEL_STYLE,
	POPUP_MUTED_STYLE,
	POPUP_SELECT_STYLE,
} from "./scheduleBoardUtils";

interface OccurrenceReschedulePopupProps {
	occurrence: OccurrenceWithPlan;
	oldDateStr: string;
	newDateStr: string;
	anchorRect: DOMRect;
	onReschedule: (newStartAt: string, newEndAt: string | undefined) => void;
	onGenerate: (newStartAt: string, newEndAt: string | undefined) => void;
	onCancel: () => void;
	isGenerating?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hhmmOnDate(newDateStr: string, hhmm: string): Date {
	const [h, m] = hhmm.split(":").map(Number);
	const [y, mo, dd] = newDateStr.split("-").map(Number);
	return new Date(y, mo - 1, dd, h, m, 0, 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OccurrenceReschedulePopup({
	occurrence,
	oldDateStr,
	newDateStr,
	anchorRect,
	onReschedule,
	onGenerate,
	onCancel,
	isGenerating = false,
}: OccurrenceReschedulePopupProps) {
	const origStart  = new Date(occurrence.occurrence_start_at);
	const origEnd    = new Date(occurrence.occurrence_end_at);
	const durationMs = origEnd.getTime() - origStart.getTime();

	// Seed constraints from the occurrence's own times
	const [arrivalConstraint,  setArrivalConstraint]  = useState<ArrivalConstraint>("at");
	const [arrivalTime,        setArrivalTime]         = useState(dateToHHMM(origStart));
	const [arrivalWindowStart, setArrivalWindowStart]  = useState(dateToHHMM(origStart));
	const [arrivalWindowEnd,   setArrivalWindowEnd]    = useState(() => {
		const t = new Date(origStart.getTime() + 60 * 60 * 1000); // +1 h as default window end
		return dateToHHMM(t);
	});
	const [finishConstraint,   setFinishConstraint]    = useState<FinishConstraint>("at");
	const [finishTime,         setFinishTime]          = useState(dateToHHMM(origEnd));

	// ── Pre-fill helpers ─────────────────────────────────────────────────────

	function handleArrivalChange(c: ArrivalConstraint) {
		setArrivalConstraint(c);
		if (c === "at" && !arrivalTime)
			setArrivalTime(dateToHHMM(origStart));
		else if (c === "between") {
			if (!arrivalWindowStart) setArrivalWindowStart(dateToHHMM(origStart));
			if (!arrivalWindowEnd)   setArrivalWindowEnd(dateToHHMM(new Date(origStart.getTime() + 60 * 60 * 1000)));
		} else if (c === "by" && !arrivalWindowEnd)
			setArrivalWindowEnd(dateToHHMM(origEnd));
	}

	function handleFinishChange(c: FinishConstraint) {
		setFinishConstraint(c);
		if ((c === "at" || c === "by") && !finishTime)
			setFinishTime(dateToHHMM(origEnd));
	}

	// ── Compute new start / end ───────────────────────────────────────────────

	const computedStart: Date = (() => {
		let hhmm =
			arrivalConstraint === "at"      ? arrivalTime :
			arrivalConstraint === "between" ? arrivalWindowStart :
			arrivalConstraint === "by"      ? arrivalWindowEnd :
			dateToHHMM(origStart); // anytime: preserve original time
		if (!hhmm) hhmm = dateToHHMM(origStart);
		return hhmmOnDate(newDateStr, hhmm);
	})();

	const computedEnd: Date | undefined = (() => {
		if (finishConstraint === "when_done") return undefined;
		const hhmm = finishTime || dateToHHMM(origEnd);
		return hhmmOnDate(newDateStr, hhmm);
	})();

	// Fallback for display purposes (when_done: preserve original duration)
	const displayEnd = computedEnd ?? new Date(computedStart.getTime() + durationMs);

	// ── Completion gate ───────────────────────────────────────────────────────

	const isComplete =
		(arrivalConstraint !== "at"      || arrivalTime !== "") &&
		(arrivalConstraint !== "between" || (arrivalWindowStart !== "" && arrivalWindowEnd !== "")) &&
		(arrivalConstraint !== "by"      || arrivalWindowEnd !== "") &&
		(finishConstraint === "when_done" || finishTime !== "");

	// ── Popup positioning ─────────────────────────────────────────────────────

	const popupW = 308;
	const popupLeft =
		anchorRect.right + 8 + popupW < window.innerWidth
			? anchorRect.right + 8
			: anchorRect.left - popupW - 8;
	const popupTop = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 480));

	// ── Actions ───────────────────────────────────────────────────────────────

	function getNewTimes(): [string, string | undefined] {
		return [
			computedStart.toISOString(),
			computedEnd?.toISOString(),
		];
	}

	return (
		<>
			{/* Backdrop */}
			<div
				style={{ position: "fixed", inset: 0, zIndex: 1000 }}
				onClick={onCancel}
			/>

			{/* Popup */}
			<div
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
						Reschedule Occurrence
					</div>
					<div style={{
						fontSize: 11,
						color: "#a1a1aa",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}>
						{occurrence.plan.name}
					</div>
				</div>

				<div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

					{/* Move chip */}
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

					{/* Two-column constraint form */}
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>

						{/* Arrival column */}
						<div style={{ paddingRight: 10, display: "flex", flexDirection: "column", gap: 6 }}>
							<div style={POPUP_LABEL_STYLE}>Arrival</div>
							<select
								value={arrivalConstraint}
								onChange={(e) => handleArrivalChange(e.target.value as ArrivalConstraint)}
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
								onChange={(e) => handleFinishChange(e.target.value as FinishConstraint)}
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

					{/* Summary row — computed start → end */}
					<div style={{
						fontSize: 9,
						color: "#52525b",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}>
						<span style={{ color: "#3f3f46" }}>Scheduled:</span>
						<span style={{ color: "#71717a" }}>
							{computedStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
							{" – "}
							{finishConstraint === "when_done"
								? "finish when done"
								: displayEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
							}
						</span>
					</div>
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
					{/* Cancel — left */}
					<button
						onClick={onCancel}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 5,
							height: 28,
							fontSize: 11,
							fontWeight: 400,
							color: "#a1a1aa",
							background: "none",
							border: "1px solid #3f3f46",
							borderRadius: 6,
							cursor: "pointer",
							padding: "0 9px",
							fontFamily: "inherit",
							transition: "color 0.15s",
						}}
						onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#d4d4d8"; }}
						onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#a1a1aa"; }}
					>
						Cancel
					</button>

					{/* Action buttons — right */}
					<div style={{ display: "flex", gap: 5 }}>
						{/* Reschedule — secondary outlined */}
						<button
							onClick={isComplete ? () => { const [s, e] = getNewTimes(); onReschedule(s, e); } : undefined}
							disabled={!isComplete}
							style={{
								height: 28,
								minWidth: 90,
								fontSize: 11,
								fontWeight: 600,
								padding: "0 12px",
								borderRadius: 6,
								border: "1px solid",
								borderColor: isComplete ? "rgba(59,130,246,0.45)" : "#3f3f46",
								backgroundColor: "transparent",
								color: isComplete ? "#60a5fa" : "#52525b",
								cursor: isComplete ? "pointer" : "default",
								fontFamily: "inherit",
								opacity: isComplete ? 1 : 0.5,
								transition: "background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
							}}
							onMouseEnter={(e) => {
								if (isComplete) {
									(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(59,130,246,0.1)";
								}
							}}
							onMouseLeave={(e) => {
								(e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
							}}
						>
							Reschedule
						</button>

						{/* Generate Visit — primary solid */}
						<button
							onClick={(isComplete && !isGenerating) ? () => { const [s, e] = getNewTimes(); onGenerate(s, e); } : undefined}
							disabled={!isComplete || isGenerating}
							style={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 5,
								height: 28,
								minWidth: 110,
								fontSize: 11,
								fontWeight: 600,
								padding: "0 12px",
								borderRadius: 6,
								border: "none",
								backgroundColor: "#3b82f6",
								color: "#fff",
								cursor: (isComplete && !isGenerating) ? "pointer" : "default",
								fontFamily: "inherit",
								opacity: (!isComplete || isGenerating) ? 0.55 : 1,
								transition: "background-color 0.15s, opacity 0.15s",
							}}
							onMouseEnter={(e) => {
								if (isComplete && !isGenerating)
									(e.currentTarget as HTMLElement).style.backgroundColor = "#2563eb";
							}}
							onMouseLeave={(e) => {
								(e.currentTarget as HTMLElement).style.backgroundColor = "#3b82f6";
							}}
						>
							{isGenerating
								? <><RotateCw size={12} className="animate-spin" /> Generating…</>
								: "Generate Visit"
							}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
