import { useEffect, useRef } from "react";
import TimePicker from "../TimePicker";
import { ArrivalConstraintValues, FinishConstraintValues } from "../../../types/recurringPlans";
import type { ArrivalConstraint, FinishConstraint } from "../../../types/recurringPlans";
import { UndoButton } from "./UndoButton";
import { useTimeConstraints } from "../../../hooks/forms/useTimeConstraints";
import Dropdown from "../Dropdown";

export interface TimeConstraintsState {
	arrivalConstraint: ArrivalConstraint;
	finishConstraint: FinishConstraint;
	arrivalTime: Date | null;
	arrivalWindowStart: Date | null;
	arrivalWindowEnd: Date | null;
	finishTime: Date | null;
}

interface TimeConstraintsProps {
	mode?: "create" | "edit";
	isLoading?: boolean;
	resetKey?: number;
	initialArrivalConstraint?: ArrivalConstraint;
	initialFinishConstraint?: FinishConstraint;
	initialArrivalTime?: Date | null;
	initialArrivalWindowStart?: Date | null;
	initialArrivalWindowEnd?: Date | null;
	initialFinishTime?: Date | null;
	onStateChange?: (state: TimeConstraintsState) => void;
}

const TimeConstraints = ({
	mode = "create",
	isLoading = false,
	resetKey,
	initialArrivalConstraint,
	initialFinishConstraint,
	initialArrivalTime,
	initialArrivalWindowStart,
	initialArrivalWindowEnd,
	initialFinishTime,
	onStateChange,
}: TimeConstraintsProps) => {
	const {
		arrivalConstraint,
		setArrivalConstraint,
		finishConstraint,
		setFinishConstraint,
		arrivalTime,
		setArrivalTime,
		arrivalWindowStart,
		setArrivalWindowStart,
		arrivalWindowEnd,
		setArrivalWindowEnd,
		finishTime,
		setFinishTime,
		isArrivalConstraintDirty,
		isFinishConstraintDirty,
		isArrivalTimeDirty,
		isArrivalWindowStartDirty,
		isArrivalWindowEndDirty,
		isFinishTimeDirty,
		undoArrivalConstraint,
		undoFinishConstraint,
		undoArrivalTime,
		undoArrivalWindowStart,
		undoArrivalWindowEnd,
		undoFinishTime,
	} = useTimeConstraints({
		mode,
		resetKey,
		initialArrivalConstraint,
		initialFinishConstraint,
		initialArrivalTime,
		initialArrivalWindowStart,
		initialArrivalWindowEnd,
		initialFinishTime,
	});

	// Use a ref for onStateChange so the effect never needs it as a dep,
	// preventing infinite loops when the parent passes an inline function.
	const onStateChangeRef = useRef(onStateChange);
	useEffect(() => {
		onStateChangeRef.current = onStateChange;
	});

	// isMounted guard: skip the initial fire so markDirty isn't called on mount.
	// isResetting guard: skip fires caused by a resetKey change (draft load / form reset)
	// so that loading a draft doesn't immediately mark the form dirty.
	const isMounted = useRef(false);
	const isResetting = useRef(false);
	const prevResetKeyForGuard = useRef(resetKey);

	// Arm the suppression flag when resetKey changes — must be declared BEFORE the
	// state-change effect so React runs it first in the same flush.
	useEffect(() => {
		if (resetKey === prevResetKeyForGuard.current) return;
		prevResetKeyForGuard.current = resetKey;
		isResetting.current = true;
	}, [resetKey]);

	useEffect(() => {
		if (!isMounted.current) {
			isMounted.current = true;
			return;
		}
		if (isResetting.current) {
			isResetting.current = false;
			return;
		}
		onStateChangeRef.current?.({
			arrivalConstraint,
			finishConstraint,
			arrivalTime,
			arrivalWindowStart,
			arrivalWindowEnd,
			finishTime,
		});
	}, [
		arrivalConstraint,
		finishConstraint,
		arrivalTime,
		arrivalWindowStart,
		arrivalWindowEnd,
		finishTime,
		// onStateChange intentionally excluded — accessed via ref to avoid loop
	]);

	const showUndo = mode === "edit";

	return (
		<div className="p-2.5 lg:p-3 bg-zinc-800 rounded-lg border border-zinc-700">
			<h3 className="text-xs lg:text-sm font-semibold mb-2 lg:mb-3 text-white uppercase tracking-wider">
				Time Constraints
			</h3>

			{/* Arrival */}
			<div>
				<label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
					Arrival
				</label>

				<div className="grid grid-cols-2 gap-2 lg:gap-3 items-start">
					{/* LEFT: constraint selector */}
					<div className="space-y-1 min-w-0">
						<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
							Constraint
						</label>
						<div className="relative min-w-0">
							<Dropdown
								entries={
									<>
										{ArrivalConstraintValues.map(
											(val) => (
												<option
													key={
														val
													}
													value={
														val
													}
												>
													{val ===
													"anytime"
														? "Anytime"
														: val ===
															  "at"
															? "At specific time"
															: val ===
																  "between"
																? "Between times"
																: "By deadline"}
												</option>
											)
										)}
									</>
								}
								value={arrivalConstraint}
								onChange={(v) =>
									setArrivalConstraint(
										v as ArrivalConstraint
									)
								}
								disabled={isLoading}
							/>
							{showUndo && (
								<UndoButton
									show={
										isArrivalConstraintDirty
									}
									onUndo={
										undoArrivalConstraint
									}
									position="right-9"
									disabled={isLoading}
								/>
							)}
						</div>
					</div>

					{/* RIGHT: time inputs */}
					<div className="space-y-2 min-w-0">
						{arrivalConstraint === "at" && (
							<div className="space-y-1 min-w-0">
								<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
									Time
								</label>
								<div className="relative min-w-0">
									<TimePicker
										value={arrivalTime}
										onChange={
											setArrivalTime
										}
									/>
									{showUndo && (
										<UndoButton
											show={
												isArrivalTimeDirty
											}
											onUndo={
												undoArrivalTime
											}
											position="right-2"
											disabled={
												isLoading
											}
										/>
									)}
								</div>
							</div>
						)}

						{arrivalConstraint === "between" && (
							<>
								<div className="space-y-1 min-w-0">
									<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
										Start Time
									</label>
									<div className="relative min-w-0">
										<TimePicker
											value={
												arrivalWindowStart
											}
											onChange={
												setArrivalWindowStart
											}
										/>
										{showUndo && (
											<UndoButton
												show={
													isArrivalWindowStartDirty
												}
												onUndo={
													undoArrivalWindowStart
												}
												position="right-2"
												disabled={
													isLoading
												}
											/>
										)}
									</div>
								</div>
								<div className="space-y-1 min-w-0">
									<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
										End Time
									</label>
									<div className="relative min-w-0">
										<TimePicker
											value={
												arrivalWindowEnd
											}
											onChange={
												setArrivalWindowEnd
											}
										/>
										{showUndo && (
											<UndoButton
												show={
													isArrivalWindowEndDirty
												}
												onUndo={
													undoArrivalWindowEnd
												}
												position="right-2"
												disabled={
													isLoading
												}
											/>
										)}
									</div>
								</div>
							</>
						)}

						{arrivalConstraint === "by" && (
							<div className="space-y-1 min-w-0">
								<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
									Deadline
								</label>
								<div className="relative min-w-0">
									<TimePicker
										value={
											arrivalWindowEnd
										}
										onChange={
											setArrivalWindowEnd
										}
									/>
									{showUndo && (
										<UndoButton
											show={
												isArrivalWindowEndDirty
											}
											onUndo={
												undoArrivalWindowEnd
											}
											position="right-2"
											disabled={
												isLoading
											}
										/>
									)}
								</div>
							</div>
						)}

						{arrivalConstraint === "anytime" && (
							<div className="space-y-1">
								<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
									&nbsp;
								</label>
								<p className="text-[10px] lg:text-xs text-zinc-400 leading-tight pt-1">
									Arrival is flexible.
									Defaults to 9:00 AM.
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="my-2 lg:my-3 border-t border-zinc-700" />

			{/* Finish */}
			<div>
				<label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
					Finish
				</label>

				<div className="grid grid-cols-2 gap-2 lg:gap-3 items-start">
					{/* LEFT */}
					<div className="space-y-1 min-w-0">
						<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
							Constraint
						</label>
						<div className="relative min-w-0">
							<Dropdown
								entries={
									<>
										{FinishConstraintValues.map(
											(val) => (
												<option
													key={
														val
													}
													value={
														val
													}
												>
													{val ===
													"when_done"
														? "When done"
														: val ===
															  "at"
															? "At specific time"
															: "By deadline"}
												</option>
											)
										)}
									</>
								}
								value={finishConstraint}
								onChange={(v) =>
									setFinishConstraint(
										v as FinishConstraint
									)
								}
								disabled={isLoading}
							/>
							{showUndo && (
								<UndoButton
									show={
										isFinishConstraintDirty
									}
									onUndo={
										undoFinishConstraint
									}
									position="right-9"
									disabled={isLoading}
								/>
							)}
						</div>
					</div>

					{/* RIGHT */}
					<div className="space-y-2 min-w-0">
						{(finishConstraint === "at" ||
							finishConstraint === "by") && (
							<div className="space-y-1 min-w-0">
								<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
									{finishConstraint === "at"
										? "Time"
										: "Deadline"}
								</label>
								<div className="relative min-w-0">
									<TimePicker
										value={finishTime}
										onChange={
											setFinishTime
										}
										dropdownPosition="above"
									/>
									{showUndo && (
										<UndoButton
											show={
												isFinishTimeDirty
											}
											onUndo={
												undoFinishTime
											}
											position="right-2"
											disabled={
												isLoading
											}
										/>
									)}
								</div>
							</div>
						)}

						{finishConstraint === "when_done" && (
							<div className="space-y-1">
								<label className="text-[10px] text-zinc-400 block uppercase tracking-wider">
									&nbsp;
								</label>
								<p className="text-[10px] lg:text-xs text-zinc-400 leading-tight pt-1">
									Default duration is 2 hours.
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default TimeConstraints;
