import type { ZodError } from "zod";
import {
	RecurringFrequencyValues,
	WeekdayValues,
	type RecurringFrequency,
	type Weekday,
} from "../../../types/recurringPlans";
import DatePicker from "../../ui/DatePicker";
import { UndoButton } from "./UndoButton";

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
			<div className="mt-1 space-y-1">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-sm">
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

	return (
		<div className="space-y-3 pt-2">
			<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
				<h3 className="text-lg font-semibold mb-3 text-white">
					Schedule Configuration
				</h3>

				{/* 2x2 Grid for Dates and Windows */}
				<div className="grid grid-cols-2 gap-3 mb-4">
					{/* Start Date */}
					<div>
						<label className="text-sm text-zinc-300 mb-1 block">
							Start Date *
						</label>
						<DatePicker
							mode={mode}
							originalValue={originalStartDate}
							value={startDate}
							onChange={onStartDateChange}
							align="left"
						/>
						<ErrorDisplay path="starts_at" />
					</div>

					{/* End Date */}
					<div>
						<label className="text-sm text-zinc-300 mb-1 block">
							End Date (Optional)
						</label>
						<DatePicker
							mode={mode}
							originalValue={originalEndDate}
							value={endDate}
							onChange={onEndDateChange}
							align="right"
						/>
						<ErrorDisplay path="ends_at" />
					</div>

					{/* Generation Window */}
					<div>
						<label className="text-sm text-zinc-300 mb-1 block">
							Generation Window (days) *
						</label>
						<div className="relative">
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
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
								placeholder="30"
							/>
							{mode === "edit" &&
								isDirty &&
								onUndo &&
								isDirty("generationWindow") && (
									<UndoButton
										show={true}
										onUndo={() =>
											onUndo(
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
					<div>
						<label className="text-sm text-zinc-300 mb-1 block">
							Min. Advance (days) *
						</label>
						<div className="relative">
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
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
								placeholder="1"
							/>
							{mode === "edit" &&
								isDirty &&
								onUndo &&
								isDirty("minAdvance") && (
									<UndoButton
										show={true}
										onUndo={() =>
											onUndo(
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
				<div className="border-t border-zinc-700 pt-4">
					<h4 className="text-md font-medium mb-3 text-zinc-300">
						Recurrence Pattern *
					</h4>
					<ErrorDisplay path="rule" />

					<div className="grid grid-cols-2 gap-3 mb-3">
						{/* Frequency */}
						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Frequency *
							</label>
							<div className="relative">
								<select
									value={frequency}
									onChange={(e) =>
										onFrequencyChange(
											e.target
												.value as RecurringFrequency
										)
									}
									disabled={isLoading}
									className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
								>
									{RecurringFrequencyValues.map(
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
								</select>
								{mode === "edit" &&
									isDirty &&
									onUndo &&
									isDirty("frequency") && (
										<UndoButton
											show={true}
											onUndo={() =>
												onUndo(
													"frequency"
												)
											}
											position="right-2"
											disabled={
												isLoading
											}
										/>
									)}
							</div>
						</div>

						{/* Interval */}
						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Repeat Every *
							</label>
							<div className="relative">
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
									className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white pr-20 focus:border-blue-500 focus:outline-none transition-colors"
									placeholder="1"
								/>
								{mode === "edit" &&
									isDirty &&
									onUndo &&
									isDirty("interval") && (
										<UndoButton
											show={true}
											onUndo={() =>
												onUndo(
													"interval"
												)
											}
											position="right-16"
											disabled={
												isLoading
											}
										/>
									)}
								<span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">
									{getIntervalLabel()}
								</span>
							</div>
						</div>
					</div>

					{/* Weekly - Weekday Selection */}
					{frequency === "weekly" && (
						<div className="mt-3">
							<div className="flex items-center gap-2 mb-2">
								<label className="text-sm text-zinc-300">
									Repeat On *
								</label>
								{mode === "edit" &&
									isDirty &&
									onUndo &&
									isDirty(
										"selectedWeekdays"
									) && (
										<button
											type="button"
											title="Undo"
											onClick={() =>
												onUndo(
													"selectedWeekdays"
												)
											}
											disabled={
												isLoading
											}
											className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
												<path d="M3 3v5h5" />
											</svg>
										</button>
									)}
							</div>
							<div className="flex flex-wrap gap-2">
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
										className={`px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

					{/* Monthly - Day Selection */}
					{frequency === "monthly" && (
						<div className="mt-3">
							<label className="text-sm text-zinc-300 mb-1 block">
								Day of Month *
							</label>
							<div className="relative">
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
									className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
									placeholder="1-31"
								/>
								{mode === "edit" &&
									isDirty &&
									onUndo &&
									isDirty("monthDay") && (
										<UndoButton
											show={true}
											onUndo={() =>
												onUndo(
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
					)}

					{/* Yearly - Month and Day Selection */}
					{frequency === "yearly" && (
						<div className="grid grid-cols-2 gap-3 mt-3">
							{/* Month */}
							<div>
								<label className="text-sm text-zinc-300 mb-1 block">
									Month *
								</label>
								<div className="relative">
									<select
										value={month}
										onChange={(e) =>
											onMonthChange(
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
										className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
									>
										<option value="">
											Select month
										</option>
										{MONTH_NAMES.map(
											(m, i) => (
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
									</select>
									{mode === "edit" &&
										isDirty &&
										onUndo &&
										isDirty(
											"month"
										) && (
											<UndoButton
												show={
													true
												}
												onUndo={() =>
													onUndo(
														"month"
													)
												}
												position="right-2"
												disabled={
													isLoading
												}
											/>
										)}
								</div>
							</div>

							{/* Day of Month */}
							<div>
								<label className="text-sm text-zinc-300 mb-1 block">
									Day of Month *
								</label>
								<div className="relative">
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
										className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
										placeholder="1-31"
									/>
									{mode === "edit" &&
										isDirty &&
										onUndo &&
										isDirty(
											"monthDay"
										) && (
											<UndoButton
												show={
													true
												}
												onUndo={() =>
													onUndo(
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
