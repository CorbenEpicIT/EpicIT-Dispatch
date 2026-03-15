import type { ZodError } from "zod";
import {
	RecurringFrequencyValues,
	WeekdayValues,
	type RecurringFrequency,
	type Weekday,
} from "../../../types/recurringPlans";
import DatePicker from "../../ui/DatePicker";
import { UndoButton } from "./UndoButton";
import Dropdown from "../../ui/Dropdown";
import { RotateCcw } from "lucide-react";

interface ScheduleConfigurationProps {
	startDate: Date;
	endDate: Date | null;
	generationWindow: number;
	minAdvance: number;
	frequency: RecurringFrequency;
	interval: number;
	selectedWeekdays: Weekday[];
	monthDay: number | "";
	month: number | "";

	onStartDateChange: (date: Date | null) => void;
	onEndDateChange: (date: Date | null) => void;
	onGenerationWindowChange: (value: number) => void;
	onMinAdvanceChange: (value: number) => void;
	onFrequencyChange: (value: RecurringFrequency) => void;
	onIntervalChange: (value: number) => void;
	onToggleWeekday: (weekday: Weekday) => void;
	onMonthDayChange: (value: number | "") => void;
	onMonthChange: (value: number | "") => void;

	isLoading?: boolean;
	errors?: ZodError | null;
	mode?: "create" | "edit";

	originalStartDate?: Date;
	originalEndDate?: Date | null;

	isDirty?: (field: string) => boolean;
	onUndo?: (field: string) => void;
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";

export const ScheduleConfiguration = ({
	startDate,
	endDate,
	generationWindow,
	minAdvance,
	frequency,
	interval,
	selectedWeekdays,
	monthDay,
	month,
	onStartDateChange,
	onEndDateChange,
	onGenerationWindowChange,
	onMinAdvanceChange,
	onFrequencyChange,
	onIntervalChange,
	onToggleWeekday,
	onMonthDayChange,
	onMonthChange,
	isLoading = false,
	errors = null,
	mode = "create",
	originalStartDate,
	originalEndDate,
	isDirty,
	onUndo,
}: ScheduleConfigurationProps) => {
	const getFieldErrors = (path: string) => {
		if (!errors) return [];
		return errors.issues.filter((err) => err.path[0] === path);
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		const fieldErrors = getFieldErrors(path);
		if (fieldErrors.length === 0) return null;
		return (
			<div className="mt-0.5">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-xs leading-tight">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const getIntervalLabel = () => {
		const labels = {
			daily: interval === 1 ? "day" : "days",
			weekly: interval === 1 ? "week" : "weeks",
			monthly: interval === 1 ? "month" : "months",
			yearly: interval === 1 ? "year" : "years",
		};
		return labels[frequency] || "";
	};

	const showUndo = (field: string) =>
		mode === "edit" && !!isDirty && !!onUndo && isDirty(field);

	return (
		<div className="space-y-2 lg:space-y-3 pt-2 min-w-0">
			<div className="p-2.5 lg:p-3 bg-zinc-800 rounded-lg border border-zinc-700">
				<h3 className="text-xs lg:text-sm font-semibold mb-2 lg:mb-3 text-white uppercase tracking-wider">
					Schedule Configuration
				</h3>

				{/* Dates + Windows */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 mb-2 lg:mb-3 min-w-0">
					{/* Start Date */}
					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							Start Date *
						</label>
						<DatePicker
							mode={mode}
							originalValue={originalStartDate}
							value={startDate}
							onChange={onStartDateChange}
							align="left"
							position="below"
						/>
						<ErrorDisplay path="starts_at" />
					</div>

					{/* End Date */}
					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							End Date (Optional)
						</label>
						<DatePicker
							mode={mode}
							originalValue={originalEndDate}
							value={endDate}
							onChange={onEndDateChange}
							align="right"
							position="below"
						/>
						<ErrorDisplay path="ends_at" />
					</div>

					{/* Generation Window */}
					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							Generation Window (days) *
						</label>
						<div className="relative min-w-0">
							<input
								type="number"
								min="1"
								value={generationWindow}
								onChange={(e) =>
									onGenerationWindowChange(
										parseInt(
											e.target
												.value
										) || 30
									)
								}
								disabled={isLoading}
								className={`${INPUT} pr-8`}
								placeholder="30"
							/>
							{showUndo("generationWindow") && (
								<UndoButton
									show
									onUndo={() =>
										onUndo!(
											"generationWindow"
										)
									}
									disabled={isLoading}
								/>
							)}
						</div>
						<ErrorDisplay path="generation_window_days" />
					</div>

					{/* Min Advance */}
					<div className="min-w-0">
						<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							Min. Advance (days) *
						</label>
						<div className="relative min-w-0">
							<input
								type="number"
								min="0"
								value={minAdvance}
								onChange={(e) =>
									onMinAdvanceChange(
										parseInt(
											e.target
												.value
										) || 1
									)
								}
								disabled={isLoading}
								className={`${INPUT} pr-8`}
								placeholder="1"
							/>
							{showUndo("minAdvance") && (
								<UndoButton
									show
									onUndo={() =>
										onUndo!(
											"minAdvance"
										)
									}
									disabled={isLoading}
								/>
							)}
						</div>
						<ErrorDisplay path="min_advance_days" />
					</div>
				</div>

				{/* Recurrence Pattern */}
				<div className="border-t border-zinc-700 pt-2 lg:pt-3">
					<h4 className="text-[10px] lg:text-xs font-medium mb-2 text-zinc-400 uppercase tracking-wider">
						Recurrence Pattern *
					</h4>
					<ErrorDisplay path="rule" />

					<div className="grid grid-cols-2 gap-2 lg:gap-3 mb-2 lg:mb-3 min-w-0">
						{/* Frequency */}
						<div className="min-w-0">
							<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
								Frequency *
							</label>
							<div className="relative min-w-0">
								<Dropdown
									entries={RecurringFrequencyValues.map(
										(freq) => (
											<option
												key={
													freq
												}
												value={
													freq
												}
											>
												{freq
													.charAt(
														0
													)
													.toUpperCase() +
													freq.slice(
														1
													)}
											</option>
										)
									)}
									value={frequency}
									onChange={(v) =>
										onFrequencyChange(
											v as RecurringFrequency
										)
									}
									disabled={isLoading}
								/>
								{showUndo("frequency") && (
									<UndoButton
										show
										onUndo={() =>
											onUndo!(
												"frequency"
											)
										}
										position="right-9"
										disabled={isLoading}
									/>
								)}
							</div>
						</div>

						{/* Interval */}
						<div className="min-w-0">
							<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
								Repeat Every *
							</label>
							<div className="relative min-w-0">
								<input
									type="number"
									min="1"
									value={interval}
									onChange={(e) =>
										onIntervalChange(
											parseInt(
												e
													.target
													.value
											) || 1
										)
									}
									disabled={isLoading}
									className={`${INPUT} pr-16`}
									placeholder="1"
								/>
								{showUndo("interval") && (
									<UndoButton
										show
										onUndo={() =>
											onUndo!(
												"interval"
											)
										}
										position="right-16"
										disabled={isLoading}
									/>
								)}
								<span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-xs pointer-events-none">
									{getIntervalLabel()}
								</span>
							</div>
						</div>
					</div>

					{/* Weekly */}
					{frequency === "weekly" && (
						<div className="mt-2 lg:mt-3">
							<div className="flex items-center gap-2 mb-1.5">
								<label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
									Repeat On *
								</label>
								{showUndo("selectedWeekdays") && (
									<button
										type="button"
										title="Undo"
										onClick={() =>
											onUndo!(
												"selectedWeekdays"
											)
										}
										disabled={isLoading}
										className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<RotateCcw
											size={12}
										/>
									</button>
								)}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{WeekdayValues.map((day) => (
									<button
										key={day}
										type="button"
										onClick={() =>
											onToggleWeekday(
												day
											)
										}
										disabled={isLoading}
										className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
											selectedWeekdays.includes(
												day
											)
												? "bg-blue-600 text-white"
												: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
										}`}
									>
										{day}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Monthly */}
					{frequency === "monthly" && (
						<div className="mt-2 lg:mt-3 min-w-0">
							<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
								Day of Month *
							</label>
							<div className="relative min-w-0">
								<input
									type="number"
									min="1"
									max="31"
									value={monthDay}
									onChange={(e) =>
										onMonthDayChange(
											e.target
												.value
												? parseInt(
														e
															.target
															.value
													)
												: ""
										)
									}
									disabled={isLoading}
									className={`${INPUT} pr-8`}
									placeholder="1–31"
								/>
								{showUndo("monthDay") && (
									<UndoButton
										show
										onUndo={() =>
											onUndo!(
												"monthDay"
											)
										}
										disabled={isLoading}
									/>
								)}
							</div>
						</div>
					)}

					{/* Yearly */}
					{frequency === "yearly" && (
						<div className="grid grid-cols-2 gap-2 lg:gap-3 mt-2 lg:mt-3 min-w-0">
							<div className="min-w-0">
								<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
									Month *
								</label>
								<div className="relative min-w-0">
									<Dropdown
										entries={
											<>
												<option value="">
													Select
													month
												</option>
												{MONTH_NAMES.map(
													(
														m,
														i
													) => (
														<option
															key={
																i
															}
															value={
																i +
																1
															}
														>
															{
																m
															}
														</option>
													)
												)}
											</>
										}
										value={
											month !== ""
												? String(
														month
													)
												: ""
										}
										onChange={(v) =>
											onMonthChange(
												v
													? parseInt(
															v
														)
													: ""
											)
										}
										disabled={isLoading}
									/>
									{showUndo("month") && (
										<UndoButton
											show
											onUndo={() =>
												onUndo!(
													"month"
												)
											}
											position="right-9"
											disabled={
												isLoading
											}
										/>
									)}
								</div>
							</div>

							<div className="min-w-0">
								<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
									Day of Month *
								</label>
								<div className="relative min-w-0">
									<input
										type="number"
										min="1"
										max="31"
										value={monthDay}
										onChange={(e) =>
											onMonthDayChange(
												e
													.target
													.value
													? parseInt(
															e
																.target
																.value
														)
													: ""
											)
										}
										disabled={isLoading}
										className={`${INPUT} pr-8`}
										placeholder="1–31"
									/>
									{showUndo("monthDay") && (
										<UndoButton
											show
											onUndo={() =>
												onUndo!(
													"monthDay"
												)
											}
											disabled={
												isLoading
											}
										/>
									)}
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
