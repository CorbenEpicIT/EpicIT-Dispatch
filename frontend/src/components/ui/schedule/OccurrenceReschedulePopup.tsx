import { useState, useEffect } from "react";
import { AlertTriangle, ArrowRight, RotateCw } from "lucide-react";
import TimePicker from "../TimePicker";
import type { OccurrenceWithPlan } from "./dashboardCalendarUtils";
import type {
	ArrivalConstraint,
	FinishConstraint,
	RescheduleOccurrenceInput,
} from "../../../types/recurringPlans";
import {
	formatDateDisplay,
	dateToHHMM,
	hhmmToPickerDate,
	POPUP_LABEL_STYLE,
	POPUP_MUTED_STYLE,
	POPUP_SELECT_STYLE,
} from "./scheduleBoardUtils";

type ConflictState = "ok" | "error";

interface ConflictRow {
	name: string;
	timeLabel: string;
}

interface OccurrenceReschedulePopupProps {
	occurrence: OccurrenceWithPlan;
	oldDateStr: string;
	newDateStr: string;
	anchorRect: DOMRect;
	/** Occurrences already on the target date — used to detect same-plan conflicts. */
	allOccurrencesOnNewDay?: OccurrenceWithPlan[];
	/** When provided, overrides formatDateDisplay(oldDateStr) in the move chip — use for drag-triggered reschedules to show times instead of dates. */
	fromLabel?: string;
	/** When provided, overrides formatDateDisplay(newDateStr) in the move chip. */
	toLabel?: string;
	onReschedule: (input: RescheduleOccurrenceInput & { scope: "this" | "future" }) => void;
	onGenerate: (input: Omit<RescheduleOccurrenceInput, "scope">) => void;
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
	allOccurrencesOnNewDay,
	fromLabel,
	toLabel,
	onReschedule,
	onGenerate,
	onCancel,
	isGenerating = false,
}: OccurrenceReschedulePopupProps) {
	const origStart = new Date(occurrence.occurrence_start_at);
	const origEnd = new Date(occurrence.occurrence_end_at);

	// Seed constraints from the occurrence itself (populated from rule at generation, may be overridden on reschedule)
	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>(
		occurrence.arrival_constraint
	);
	const [arrivalTime, setArrivalTime] = useState(
		occurrence.arrival_time ?? dateToHHMM(origStart)
	);
	const [arrivalWindowStart, setArrivalWindowStart] = useState(
		occurrence.arrival_window_start ?? dateToHHMM(origStart)
	);
	const [arrivalWindowEnd, setArrivalWindowEnd] = useState(
		occurrence.arrival_window_end ??
			dateToHHMM(new Date(origStart.getTime() + 60 * 60 * 1000))
	);
	const [finishConstraint, setFinishConstraint] = useState<FinishConstraint>(
		occurrence.finish_constraint
	);
	const [finishTime, setFinishTime] = useState(occurrence.finish_time ?? dateToHHMM(origEnd));
	const [occurrenceScope, setOccurrenceScope] = useState<"this" | "future">("this");

	// ── Same-plan conflict detection ─────────────────────────────────────────
	const [conflictState, setConflictState] = useState<ConflictState>("ok");
	const [conflictRows, setConflictRows] = useState<ConflictRow[]>([]);

	useEffect(() => {
		const samePlan = (allOccurrencesOnNewDay ?? []).filter(
			(o) =>
				o.id !== occurrence.id &&
				o.recurring_plan_id === occurrence.recurring_plan_id
		);
		if (samePlan.length === 0) {
			setConflictState("ok");
			setConflictRows([]);
			return;
		}
		setConflictState("error");
		setConflictRows(
			samePlan.map((o) => ({
				name: o.plan.name,
				timeLabel: new Date(o.occurrence_start_at).toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
				}),
			}))
		);
	}, [allOccurrencesOnNewDay, occurrence.id, occurrence.recurring_plan_id]);

	// ── Pre-fill helpers ─────────────────────────────────────────────────────

	function handleArrivalChange(c: ArrivalConstraint) {
		setArrivalConstraint(c);
		if (c === "at" && !arrivalTime) setArrivalTime(dateToHHMM(origStart));
		else if (c === "between") {
			if (!arrivalWindowStart) setArrivalWindowStart(dateToHHMM(origStart));
			if (!arrivalWindowEnd)
				setArrivalWindowEnd(
					dateToHHMM(new Date(origStart.getTime() + 60 * 60 * 1000))
				);
		} else if (c === "by" && !arrivalWindowEnd)
			setArrivalWindowEnd(dateToHHMM(origEnd));
	}

	function handleFinishChange(c: FinishConstraint) {
		setFinishConstraint(c);
		if ((c === "at" || c === "by") && !finishTime) setFinishTime(dateToHHMM(origEnd));
	}

	// ── Compute new start / end ───────────────────────────────────────────────

	const computedStart: Date = (() => {
		let hhmm =
			arrivalConstraint === "at"
				? arrivalTime
				: arrivalConstraint === "between"
					? arrivalWindowStart
					: arrivalConstraint === "by"
						? arrivalWindowEnd
						: dateToHHMM(origStart); // anytime: preserve original time
		if (!hhmm) hhmm = dateToHHMM(origStart);
		return hhmmOnDate(newDateStr, hhmm);
	})();

	const computedEnd: Date | undefined = (() => {
		if (finishConstraint === "when_done") return undefined;
		const hhmm = finishTime || dateToHHMM(origEnd);
		return hhmmOnDate(newDateStr, hhmm);
	})();

	// ── Completion gate ───────────────────────────────────────────────────────

	const isComplete =
		(arrivalConstraint !== "at" || arrivalTime !== "") &&
		(arrivalConstraint !== "between" ||
			(arrivalWindowStart !== "" && arrivalWindowEnd !== "")) &&
		(arrivalConstraint !== "by" || arrivalWindowEnd !== "") &&
		(finishConstraint === "when_done" || finishTime !== "");

	// ── Popup positioning ─────────────────────────────────────────────────────

	const popupW = 308;
	const popupLeft =
		anchorRect.right + 8 + popupW < window.innerWidth
			? anchorRect.right + 8
			: anchorRect.left - popupW - 8;
	const popupTop = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 480));

	// ── Actions ───────────────────────────────────────────────────────────────

	function buildConstraintPayload(): Omit<
		RescheduleOccurrenceInput,
		"new_start_at" | "new_end_at" | "scope"
	> {
		return {
			arrival_constraint: arrivalConstraint,
			finish_constraint: finishConstraint,
			arrival_time: arrivalConstraint === "at" ? arrivalTime : null,
			arrival_window_start:
				arrivalConstraint === "between" ? arrivalWindowStart : null,
			arrival_window_end:
				arrivalConstraint === "between" || arrivalConstraint === "by"
					? arrivalWindowEnd
					: null,
			finish_time:
				finishConstraint === "at" || finishConstraint === "by"
					? finishTime
					: null,
		};
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
				<div
					style={{
						padding: "10px 12px 9px",
						borderBottom: "1px solid #27272a",
					}}
				>
					<div
						style={{
							fontSize: 12,
							fontWeight: 700,
							color: "#f4f4f5",
							letterSpacing: "-0.01em",
							marginBottom: 2,
						}}
					>
						Reschedule Occurrence
					</div>
					<div
						style={{
							fontSize: 11,
							color: "#a1a1aa",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{occurrence.plan.name}
					</div>
				</div>

				<div
					style={{
						padding: "10px 12px",
						display: "flex",
						flexDirection: "column",
						gap: 10,
					}}
				>
					{/* Move chip */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontSize: 11,
							backgroundColor: "rgba(59,130,246,0.06)",
							border: "1px solid rgba(59,130,246,0.14)",
							borderRadius: 6,
							padding: "6px 10px",
							width: "fit-content",
							margin: "0 auto",
						}}
					>
						{!fromLabel &&
						!toLabel &&
						oldDateStr === newDateStr ? (
							<>
								<span style={{ color: "#71717a" }}>
									Same Day
								</span>
								<span style={{ color: "#3f3f46" }}>
									:
								</span>
								<span
									style={{
										color: "#93c5fd",
										fontWeight: 600,
									}}
								>
									{formatDateDisplay(
										newDateStr
									)}
								</span>
							</>
						) : (
							<>
								<span style={{ color: "#71717a" }}>
									{fromLabel ??
										formatDateDisplay(
											oldDateStr
										)}
								</span>
								<ArrowRight
									size={11}
									style={{
										color: "#3b82f6",
										flexShrink: 0,
									}}
								/>
								<span
									style={{
										color: "#93c5fd",
										fontWeight: 600,
									}}
								>
									{toLabel ??
										formatDateDisplay(
											newDateStr
										)}
								</span>
							</>
						)}
					</div>

					{/* Two-column constraint form */}
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1px 1fr",
						}}
					>
						{/* Arrival column */}
						<div
							style={{
								paddingRight: 10,
								display: "flex",
								flexDirection: "column",
								gap: 6,
							}}
						>
							<div style={POPUP_LABEL_STYLE}>Arrival</div>
							<select
								value={arrivalConstraint}
								onChange={(e) =>
									handleArrivalChange(
										e.target
											.value as ArrivalConstraint
									)
								}
								style={POPUP_SELECT_STYLE}
								onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
								onBlur={(e) => (e.currentTarget.style.borderColor = "#3f3f46")}
							>
								<option value="anytime">
									Anytime
								</option>
								<option value="at">
									Arrive at
								</option>
								<option value="between">
									Between
								</option>
								<option value="by">
									Arrive by
								</option>
							</select>

							{arrivalConstraint === "at" && (
								<TimePicker
									value={hhmmToPickerDate(
										arrivalTime
									)}
									onChange={(d) =>
										setArrivalTime(
											dateToHHMM(
												d
											)
										)
									}
									compact
								/>
							)}
							{arrivalConstraint === "between" && (
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 4,
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
										<span style={{ fontSize: 9, color: "#a1a1aa", minWidth: 22, flexShrink: 0 }}>From</span>
										<div style={{ flex: 1, minWidth: 0 }}>
											<TimePicker
												value={hhmmToPickerDate(arrivalWindowStart)}
												onChange={(d) =>
													setArrivalWindowStart(
														dateToHHMM(d)
													)
												}
												compact
											/>
										</div>
									</div>
									<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
										<span style={{ fontSize: 9, color: "#a1a1aa", minWidth: 22, flexShrink: 0 }}>To</span>
										<div style={{ flex: 1, minWidth: 0 }}>
											<TimePicker
												value={hhmmToPickerDate(arrivalWindowEnd)}
												onChange={(d) =>
													setArrivalWindowEnd(
														dateToHHMM(d)
													)
												}
												compact
											/>
										</div>
									</div>
								</div>
							)}
							{arrivalConstraint === "by" && (
								<TimePicker
									value={hhmmToPickerDate(
										arrivalWindowEnd
									)}
									onChange={(d) =>
										setArrivalWindowEnd(
											dateToHHMM(
												d
											)
										)
									}
									compact
								/>
							)}
							{arrivalConstraint === "anytime" && (
								<div style={POPUP_MUTED_STYLE}>
									No time required
								</div>
							)}
						</div>

						{/* Divider */}
						<div
							style={{
								backgroundColor: "#27272a",
								alignSelf: "stretch",
							}}
						/>

						{/* Finish column */}
						<div
							style={{
								paddingLeft: 10,
								display: "flex",
								flexDirection: "column",
								gap: 6,
							}}
						>
							<div style={POPUP_LABEL_STYLE}>Finish</div>
							<select
								value={finishConstraint}
								onChange={(e) =>
									handleFinishChange(
										e.target
											.value as FinishConstraint
									)
								}
								style={POPUP_SELECT_STYLE}
								onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
								onBlur={(e) => (e.currentTarget.style.borderColor = "#3f3f46")}
							>
								<option value="when_done">
									When done
								</option>
								<option value="at">
									Finish at
								</option>
								<option value="by">
									Finish by
								</option>
							</select>

							{(finishConstraint === "at" ||
								finishConstraint === "by") && (
								<TimePicker
									value={hhmmToPickerDate(
										finishTime
									)}
									onChange={(d) =>
										setFinishTime(
											dateToHHMM(
												d
											)
										)
									}
									compact
								/>
							)}
							{finishConstraint === "when_done" && (
								<div style={POPUP_MUTED_STYLE}>
									No time required
								</div>
							)}
						</div>
					</div>

					{/* Same-plan conflict warning */}
					{conflictState === "error" && (
						<div
							style={{
								borderRadius: 6,
								overflow: "hidden",
								border: "1px solid rgba(239,68,68,0.25)",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 5,
									padding: "5px 8px",
									backgroundColor:
										"rgba(239,68,68,0.1)",
									borderBottom:
										"1px solid rgba(239,68,68,0.15)",
								}}
							>
								<AlertTriangle
									size={10}
									style={{
										color: "#f87171",
										flexShrink: 0,
									}}
								/>
								<span
									style={{
										fontSize: 9,
										fontWeight: 600,
										color: "#f87171",
										textTransform:
											"uppercase",
										letterSpacing:
											"0.05em",
									}}
								>
									Scheduling conflict
								</span>
							</div>
							<div
								style={{
									padding: "5px 8px",
									display: "flex",
									flexDirection: "column",
									gap: 3,
								}}
							>
								{conflictRows.map((row, i) => (
									<div
										key={i}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 5,
											fontSize: 9,
											color: "#fca5a5",
											minWidth: 0,
										}}
									>
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius:
													"50%",
												backgroundColor:
													"#a78bfa",
												flexShrink: 0,
											}}
										/>
										<span
											style={{
												overflow: "hidden",
												textOverflow:
													"ellipsis",
												whiteSpace: "nowrap",
												flex: 1,
												minWidth: 0,
											}}
										>
											{row.name}
										</span>
										<span
											style={{
												color: "#71717a",
												flexShrink: 0,
											}}
										>
											{
												row.timeLabel
											}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Scope selector */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 4,
						}}
					>
						<div style={POPUP_LABEL_STYLE}>Apply to</div>
						<div style={{ display: "flex", gap: 4 }}>
							{(["this", "future"] as const).map(
								(scope) => (
									<button
										key={scope}
										onClick={() =>
											setOccurrenceScope(
												scope
											)
										}
										style={{
											flex: 1,
											height: 26,
											fontSize: 11,
											fontWeight: 500,
											padding: "0 8px",
											borderRadius: 4,
											border: "1px solid",
											cursor: "pointer",
											backgroundColor:
												occurrenceScope ===
												scope
													? "#7c3aed"
													: "transparent",
											borderColor:
												occurrenceScope ===
												scope
													? "#7c3aed"
													: "rgba(139,92,246,0.35)",
											color:
												occurrenceScope ===
												scope
													? "#fff"
													: "#a78bfa",
											fontFamily: "inherit",
											transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
										}}
									>
										{scope === "this"
											? "This occurrence"
											: "This & all future"}
									</button>
								)
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "8px 12px",
						borderTop: "1px solid #27272a",
						gap: 6,
					}}
				>
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
						onMouseEnter={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "#d4d4d8";
						}}
						onMouseLeave={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "#a1a1aa";
						}}
					>
						Cancel
					</button>

					{/* Action buttons — right */}
					<div style={{ display: "flex", gap: 5 }}>
						{/* Reschedule — secondary outlined */}
						<button
							onClick={
								isComplete
									? () => {
											onReschedule(
												{
													new_start_at:
														computedStart.toISOString(),
													new_end_at: computedEnd?.toISOString(),
													scope: occurrenceScope,
													...buildConstraintPayload(),
												}
											);
										}
									: undefined
							}
							disabled={!isComplete}
							style={{
								height: 28,
								minWidth: 90,
								fontSize: 11,
								fontWeight: 600,
								padding: "0 12px",
								borderRadius: 6,
								border: "1px solid",
								borderColor: isComplete
									? "rgba(59,130,246,0.45)"
									: "#3f3f46",
								backgroundColor: "transparent",
								color: isComplete
									? "#60a5fa"
									: "#52525b",
								cursor: isComplete
									? "pointer"
									: "default",
								fontFamily: "inherit",
								opacity: isComplete ? 1 : 0.5,
								transition: "background-color 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
							}}
							onMouseEnter={(e) => {
								if (isComplete) {
									(
										e.currentTarget as HTMLElement
									).style.backgroundColor =
										"rgba(59,130,246,0.1)";
								}
							}}
							onMouseLeave={(e) => {
								(
									e.currentTarget as HTMLElement
								).style.backgroundColor =
									"transparent";
							}}
						>
							Save
						</button>

						{/* Generate Visit — primary solid */}
						<button
							onClick={
								isComplete && !isGenerating
									? () => {
											onGenerate({
												new_start_at:
													computedStart.toISOString(),
												new_end_at: computedEnd?.toISOString(),
												...buildConstraintPayload(),
											});
										}
									: undefined
							}
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
								cursor:
									isComplete && !isGenerating
										? "pointer"
										: "default",
								fontFamily: "inherit",
								opacity:
									!isComplete || isGenerating
										? 0.55
										: 1,
								transition: "background-color 0.15s, opacity 0.15s",
							}}
							onMouseEnter={(e) => {
								if (isComplete && !isGenerating)
									(
										e.currentTarget as HTMLElement
									).style.backgroundColor =
										"#2563eb";
							}}
							onMouseLeave={(e) => {
								(
									e.currentTarget as HTMLElement
								).style.backgroundColor = "#3b82f6";
							}}
						>
							{isGenerating ? (
								<>
									<RotateCw
										size={12}
										className="animate-spin"
									/>{" "}
									Generating…
								</>
							) : (
								"Generate Visit"
							)}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
