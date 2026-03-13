import { useEffect } from "react";
import TimePicker from "../TimePicker";
import { ArrivalConstraintValues, FinishConstraintValues } from "../../../types/recurringPlans";
import type { ArrivalConstraint, FinishConstraint } from "../../../types/recurringPlans";
import { UndoButton } from "./UndoButton";
import { useTimeConstraints } from "../../../hooks/forms/useTimeConstraints";

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
		initialArrivalConstraint,
		initialFinishConstraint,
		initialArrivalTime,
		initialArrivalWindowStart,
		initialArrivalWindowEnd,
		initialFinishTime,
	});

	// Notify parent whenever state changes
	useEffect(() => {
		if (onStateChange) {
			onStateChange({
				arrivalConstraint,
				finishConstraint,
				arrivalTime,
				arrivalWindowStart,
				arrivalWindowEnd,
				finishTime,
			});
		}
	}, [
		arrivalConstraint,
		finishConstraint,
		arrivalTime,
		arrivalWindowStart,
		arrivalWindowEnd,
		finishTime,
		onStateChange,
	]);

	const showUndo = mode === "edit";

	return (
		<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
			<h3 className="text-lg font-semibold mb-4 text-white">Time Constraints</h3>

			{/* Arrival */}
			<div>
				<label className="text-sm text-zinc-300 block mb-1">Arrival</label>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
					{/* LEFT: constraint selector */}
					<div className="space-y-1">
						<label className="text-xs text-zinc-400 block h-4">
							Constraint
						</label>

						<div className="relative h-10">
							<select
								value={arrivalConstraint}
								onChange={(e) =>
									setArrivalConstraint(
										e.target
											.value as ArrivalConstraint
									)
								}
								disabled={isLoading}
								className="appearance-none w-full h-10 p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
							>
								{ArrivalConstraintValues.map(
									(val) => (
										<option
											key={val}
											value={val}
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
							</select>

							{showUndo && (
								<UndoButton
									show={
										isArrivalConstraintDirty
									}
									onUndo={
										undoArrivalConstraint
									}
									position="right-2"
									disabled={isLoading}
								/>
							)}
						</div>
					</div>

					{/* RIGHT: time inputs */}
					<div className="space-y-2">
						{arrivalConstraint === "at" && (
							<div className="space-y-1">
								<label className="text-xs text-zinc-400 block h-4">
									Time
								</label>

								<div className="relative h-10">
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
								<div className="space-y-1">
									<label className="text-xs text-zinc-400 block h-4">
										Start Time
									</label>
									<div className="relative h-10">
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

								<div className="space-y-1">
									<label className="text-xs text-zinc-400 block h-4">
										End Time
									</label>
									<div className="relative h-10">
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
							<div className="space-y-1">
								<label className="text-xs text-zinc-400 block h-4">
									Deadline
								</label>
								<div className="relative h-10">
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
								<label className="text-xs text-zinc-400 block h-4">
									&nbsp;
								</label>
								<div className="h-10 flex items-center">
									<p className="text-xs text-zinc-400">
										Arrival is flexible.
										Scheduled start
										defaults to 9:00 AM.
									</p>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="my-4 border-t border-zinc-700" />

			{/* Finish */}
			<div>
				<label className="text-sm text-zinc-300 block mb-1">Finish</label>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
					{/* LEFT */}
					<div className="space-y-1">
						<label className="text-xs text-zinc-400 block h-4">
							Constraint
						</label>

						<div className="relative h-10">
							<select
								value={finishConstraint}
								onChange={(e) =>
									setFinishConstraint(
										e.target
											.value as FinishConstraint
									)
								}
								disabled={isLoading}
								className="appearance-none w-full h-10 p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
							>
								{FinishConstraintValues.map(
									(val) => (
										<option
											key={val}
											value={val}
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
							</select>

							{showUndo && (
								<UndoButton
									show={
										isFinishConstraintDirty
									}
									onUndo={
										undoFinishConstraint
									}
									position="right-2"
									disabled={isLoading}
								/>
							)}
						</div>
					</div>

					{/* RIGHT */}
					<div className="space-y-2">
						{(finishConstraint === "at" ||
							finishConstraint === "by") && (
							<div className="space-y-1">
								<label className="text-xs text-zinc-400 block h-4">
									{finishConstraint === "at"
										? "Time"
										: "Deadline"}
								</label>

								<div className="relative h-10">
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
								<label className="text-xs text-zinc-400 block h-4">
									&nbsp;
								</label>
								<div className="h-10 flex items-center">
									<p className="text-xs text-zinc-400">
										Default duration is
										2 hours (adjust by
										selecting a finish
										constraint).
									</p>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default TimeConstraints;
