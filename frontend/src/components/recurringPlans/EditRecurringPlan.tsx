import LoadSvg from "../../assets/icons/loading.svg?react";
import { useRef, useState, useEffect } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import {
	RecurringFrequencyValues,
	BillingModeValues,
	InvoiceTimingValues,
	WeekdayValues,
	UpdateRecurringPlanSchema,
	ArrivalConstraintValues,
	FinishConstraintValues,
	type UpdateRecurringPlanInput,
	type RecurringFrequency,
	type Weekday,
	type RecurringPlan,
	type ArrivalConstraint,
	type FinishConstraint,
} from "../../types/recurringPlans";
import { JobPriorityValues } from "../../types/jobs";
import { LineItemTypeValues, type LineItemType } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useUpdateRecurringPlanMutation } from "../../hooks/useRecurringPlans";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import DatePicker from "../ui/DatePicker";
import TimePicker from "../ui/TimePicker";
import { Plus, Trash2 } from "lucide-react";

interface EditRecurringPlanProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	plan: RecurringPlan;
}

interface LineItem {
	id: string;
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
}

const EditRecurringPlan = ({ isModalOpen, setIsModalOpen, plan }: EditRecurringPlanProps) => {
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const clientRef = useRef<HTMLSelectElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const frequencyRef = useRef<HTMLSelectElement>(null);
	const monthRef = useRef<HTMLSelectElement>(null);
	const generationWindowRef = useRef<HTMLInputElement>(null);
	const minAdvanceRef = useRef<HTMLInputElement>(null);
	const billingModeRef = useRef<HTMLSelectElement>(null);
	const invoiceTimingRef = useRef<HTMLSelectElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const [geoData, setGeoData] = useState<GeocodeResult | undefined>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();
	const updateMutation = useUpdateRecurringPlanMutation();

	const [startDate, setStartDate] = useState<Date>(new Date());
	const [endDate, setEndDate] = useState<Date | null>(null);
	const [autoInvoice, setAutoInvoice] = useState<boolean>(false);
	const [lineItems, setLineItems] = useState<LineItem[]>([
		{
			id: crypto.randomUUID(),
			name: "",
			description: "",
			quantity: 1,
			unit_price: 0,
			item_type: "",
			total: 0,
		},
	]);

	const [frequency, setFrequency] = useState<RecurringFrequency>("weekly");
	const [interval, setInterval] = useState<number>(1);
	const [selectedWeekdays, setSelectedWeekdays] = useState<Weekday[]>([]);
	const [monthDay, setMonthDay] = useState<number | "">("");
	const [month, setMonth] = useState<number | "">("");
	const [timezone] = useState<string>("America/Chicago");

	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>("anytime");
	const [finishConstraint, setFinishConstraint] = useState<FinishConstraint>("when_done");
	const [arrivalTime, setArrivalTime] = useState<Date | null>(() => {
		const time = new Date();
		time.setHours(9, 0, 0, 0);
		return time;
	});
	const [arrivalWindowStart, setArrivalWindowStart] = useState<Date | null>(() => {
		const time = new Date();
		time.setHours(9, 0, 0, 0);
		return time;
	});
	const [arrivalWindowEnd, setArrivalWindowEnd] = useState<Date | null>(() => {
		const time = new Date();
		time.setHours(17, 0, 0, 0);
		return time;
	});
	const [finishTime, setFinishTime] = useState<Date | null>(() => {
		const time = new Date();
		time.setHours(17, 0, 0, 0);
		return time;
	});

	// Initialize form with plan data
	useEffect(() => {
		if (!isModalOpen || !plan) return;

		if (nameRef.current) nameRef.current.value = plan.name || "";
		if (descRef.current) descRef.current.value = plan.description || "";
		if (clientRef.current) clientRef.current.value = plan.client_id || "";
		if (priorityRef.current) priorityRef.current.value = plan.priority || "";
		if (billingModeRef.current) billingModeRef.current.value = plan.billing_mode || "";
		if (invoiceTimingRef.current)
			invoiceTimingRef.current.value = plan.invoice_timing || "";
		if (generationWindowRef.current) {
			generationWindowRef.current.value = String(
				plan.generation_window_days || 30
			);
		}
		if (minAdvanceRef.current) {
			minAdvanceRef.current.value = String(plan.min_advance_days || 1);
		}

		if (plan.address && plan.coords) {
			setGeoData({
				address: plan.address,
				coords: plan.coords,
			});
		}

		setStartDate(new Date(plan.starts_at));
		setEndDate(plan.ends_at ? new Date(plan.ends_at) : null);
		setAutoInvoice(plan.auto_invoice || false);

		if (plan.line_items && plan.line_items.length > 0) {
			setLineItems(
				plan.line_items.map((item) => ({
					id: crypto.randomUUID(),
					name: item.name,
					description: item.description || "",
					quantity: item.quantity,
					unit_price: item.unit_price,
					item_type: item.item_type || "",
					total: item.quantity * item.unit_price,
				}))
			);
		}

		if (plan.rules && plan.rules.length > 0) {
			const rule = plan.rules[0];

			setFrequency(rule.frequency as RecurringFrequency);
			if (frequencyRef.current) {
				frequencyRef.current.value = rule.frequency;
			}

			setInterval(rule.interval || 1);

			if (rule.by_weekday && rule.by_weekday.length > 0) {
				setSelectedWeekdays(
					rule.by_weekday.map((wd) => wd.weekday) as Weekday[]
				);
			} else {
				setSelectedWeekdays([]);
			}

			setMonthDay(rule.by_month_day || "");
			setMonth(rule.by_month || "");

			if (rule.arrival_constraint) {
				setArrivalConstraint(rule.arrival_constraint as ArrivalConstraint);
			}
			if (rule.finish_constraint) {
				setFinishConstraint(rule.finish_constraint as FinishConstraint);
			}

			// Parse times from HH:MM strings
			if (rule.arrival_time) {
				const [hours, minutes] = rule.arrival_time.split(":").map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalTime(time);
			}

			if (rule.arrival_window_start) {
				const [hours, minutes] = rule.arrival_window_start
					.split(":")
					.map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalWindowStart(time);
			}

			if (rule.arrival_window_end) {
				const [hours, minutes] = rule.arrival_window_end
					.split(":")
					.map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalWindowEnd(time);
			}

			if (rule.finish_time) {
				const [hours, minutes] = rule.finish_time.split(":").map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setFinishTime(time);
			}
		}
	}, [isModalOpen, plan]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
	};

	const addLineItem = () => {
		setLineItems([
			...lineItems,
			{
				id: crypto.randomUUID(),
				name: "",
				description: "",
				quantity: 1,
				unit_price: 0,
				item_type: "",
				total: 0,
			},
		]);
	};

	const removeLineItem = (id: string) => {
		if (lineItems.length > 1) {
			setLineItems(lineItems.filter((item) => item.id !== id));
		}
	};

	const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
		setLineItems(
			lineItems.map((item) => {
				if (item.id === id) {
					const updated = { ...item, [field]: value };
					if (field === "quantity" || field === "unit_price") {
						updated.total =
							Number(updated.quantity) *
							Number(updated.unit_price);
					}
					return updated;
				}
				return item;
			})
		);
	};

	const toggleWeekday = (weekday: Weekday) => {
		setSelectedWeekdays((prev) =>
			prev.includes(weekday)
				? prev.filter((d) => d !== weekday)
				: [...prev, weekday]
		);
	};

	const formatTimeString = (date: Date | null): string | null => {
		if (!date) return null;
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

	const invokeUpdate = async () => {
		if (
			nameRef.current &&
			clientRef.current &&
			descRef.current &&
			priorityRef.current &&
			generationWindowRef.current &&
			minAdvanceRef.current &&
			billingModeRef.current &&
			invoiceTimingRef.current &&
			!isLoading
		) {
			const nameValue = nameRef.current.value.trim();
			// const clientValue = clientRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();
			const generationWindowValue = generationWindowRef.current.value.trim();
			const minAdvanceValue = minAdvanceRef.current.value.trim();
			const billingModeValue = billingModeRef.current.value.trim();
			const invoiceTimingValue = invoiceTimingRef.current.value.trim();

			if (!geoData?.address || !geoData?.coords) {
				setErrors({
					issues: [
						{
							path: ["address"],
							message: "Address with coordinates is required",
						},
					],
				} as any);
				return;
			}

			const startsAtValue = startDate.toISOString();
			const endsAtValue = endDate ? endDate.toISOString() : undefined;

			const preparedLineItems = lineItems.map((item, index) => ({
				name: item.name,
				description: item.description || undefined,
				quantity: Number(item.quantity),
				unit_price: Number(item.unit_price),
				item_type: (item.item_type || undefined) as
					| LineItemType
					| undefined,
				sort_order: index,
			}));

			const preparedRule = {
				frequency: frequency,
				interval: Number(interval),
				by_weekday:
					selectedWeekdays.length > 0 ? selectedWeekdays : undefined,
				by_month_day: monthDay !== "" ? Number(monthDay) : undefined,
				by_month: month !== "" ? Number(month) : undefined,

				arrival_constraint: arrivalConstraint,
				finish_constraint: finishConstraint,
				arrival_time:
					arrivalConstraint === "at"
						? formatTimeString(arrivalTime)
						: null,
				arrival_window_start:
					arrivalConstraint === "between"
						? formatTimeString(arrivalWindowStart)
						: null,
				arrival_window_end:
					arrivalConstraint === "between" ||
					arrivalConstraint === "by"
						? formatTimeString(arrivalWindowEnd)
						: null,
				finish_time:
					finishConstraint === "at" || finishConstraint === "by"
						? formatTimeString(finishTime)
						: null,
			};

			const updatedRecurringPlan: UpdateRecurringPlanInput = {
				name: nameValue,
				address: geoData.address,
				coords: geoData.coords,
				description: descValue,
				priority: priorityValue as
					| "Low"
					| "Medium"
					| "High"
					| "Urgent"
					| "Emergency",
				starts_at: startsAtValue,
				ends_at: endsAtValue || undefined,
				timezone: timezone,
				generation_window_days: Number(generationWindowValue),
				min_advance_days: Number(minAdvanceValue),
				billing_mode: billingModeValue as
					| "per_visit"
					| "subscription"
					| "none",
				invoice_timing: invoiceTimingValue as
					| "on_completion"
					| "on_schedule_date"
					| "manual",
				auto_invoice: autoInvoice,
				rule: preparedRule,
				line_items: preparedLineItems,
			};

			const parseResult =
				UpdateRecurringPlanSchema.safeParse(updatedRecurringPlan);

			if (!parseResult.success) {
				setErrors(parseResult.error);
				console.error("Validation errors:", parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			try {
				await updateMutation.mutateAsync({
					jobId: plan.job_container?.id || plan.id,
					updates: updatedRecurringPlan,
				});

				setIsModalOpen(false);
			} catch (error) {
				console.error("Failed to update recurring plan:", error);
			} finally {
				setIsLoading(false);
			}
		}
	};

	let nameErrors,
		addressErrors,
		descriptionErrors,
		lineItemErrors,
		ruleErrors,
		startsAtErrors;
	if (errors) {
		nameErrors = errors.issues.filter((err) => err.path[0] === "name");
		addressErrors = errors.issues.filter((err) => err.path[0] === "address");
		descriptionErrors = errors.issues.filter((err) => err.path[0] === "description");
		lineItemErrors = errors.issues.filter((err) => err.path[0] === "line_items");
		ruleErrors = errors.issues.filter((err) => err.path[0] === "rule");
		startsAtErrors = errors.issues.filter((err) => err.path[0] === "starts_at");
	}

	const dropdownEntries =
		clients && clients.length ? (
			<>
				{clients.map((c) => (
					<option value={c.id} key={c.id}>
						{c.name}
					</option>
				))}
			</>
		) : (
			<option disabled selected value={""}>
				No clients found
			</option>
		);

	const content = (
		<div className="flex flex-col h-full">
			{/* Scrollable content */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-y-auto pr-2 pl-1"
				style={{
					scrollbarWidth: "thin",
					scrollbarColor: "rgb(63 63 70) transparent",
				}}
			>
				<style>{`
					.overflow-y-auto::-webkit-scrollbar {
						width: 8px;
					}
					.overflow-y-auto::-webkit-scrollbar-track {
						background: transparent;
					}
					.overflow-y-auto::-webkit-scrollbar-thumb {
						background-color: rgb(63 63 70);
						border-radius: 4px;
					}
					.overflow-y-auto::-webkit-scrollbar-thumb:hover {
						background-color: rgb(82 82 91);
					}
				`}</style>

				<div className="pr-1">
					<h2 className="text-2xl font-bold mb-6">
						Edit Recurring Plan
					</h2>

					{/* SECTION 1: Basic Information */}
					<div className="space-y-3 mb-6">
						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Plan Name *
							</label>
							<input
								type="text"
								placeholder="Plan Name"
								className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
								disabled={isLoading}
								ref={nameRef}
							/>
							{nameErrors &&
								nameErrors.map((err) => (
									<p
										key={err.message}
										className="mt-1 text-red-300 text-sm"
									>
										{err.message}
									</p>
								))}
						</div>

						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Client *
							</label>
							<Dropdown
								refToApply={clientRef}
								entries={dropdownEntries}
								disabled={isLoading}
								required
								aria-label="Select client"
							/>
						</div>

						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Description *
							</label>
							<textarea
								placeholder="Plan Description"
								className="border border-zinc-700 p-2 w-full h-24 rounded-sm bg-zinc-900 text-white resize-none"
								disabled={isLoading}
								ref={descRef}
							/>
							{descriptionErrors &&
								descriptionErrors.map((err) => (
									<p
										key={err.message}
										className="mt-1 text-red-300 text-sm"
									>
										{err.message}
									</p>
								))}
						</div>

						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Address *
							</label>
							<AddressForm
								handleChange={handleChangeAddress}
							/>
							{addressErrors &&
								addressErrors.map((err) => (
									<p
										key={err.message}
										className="mt-1 text-red-300 text-sm"
									>
										{err.message}
									</p>
								))}
						</div>

						<div>
							<label className="text-sm text-zinc-300 mb-1 block">
								Priority
							</label>
							<Dropdown
								refToApply={priorityRef}
								entries={
									<>
										{JobPriorityValues.map(
											(v) => (
												<option
													key={
														v
													}
													value={
														v
													}
												>
													{
														v
													}
												</option>
											)
										)}
									</>
								}
								disabled={isLoading}
								aria-label="Select priority"
							/>
						</div>
					</div>

					{/* SECTION 2: Schedule Configuration */}
					<div id="schedule-config" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Schedule Configuration
							</h3>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Start Date *
									</label>
									<DatePicker
										value={startDate}
										onChange={(date) =>
											setStartDate(
												date ||
													new Date()
											)
										}
										align="left"
									/>
									{startsAtErrors &&
										startsAtErrors.map(
											(err) => (
												<p
													key={
														err.message
													}
													className="mt-1 text-red-300 text-xs"
												>
													{
														err.message
													}
												</p>
											)
										)}
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										End Date (Optional)
									</label>
									<DatePicker
										value={endDate}
										onChange={
											setEndDate
										}
										align="right"
									/>
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Generation Window
										(days) *
									</label>
									<input
										type="number"
										min="1"
										placeholder="30"
										className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
										disabled={isLoading}
										ref={
											generationWindowRef
										}
									/>
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Min. Advance (days)
										*
									</label>
									<input
										type="number"
										min="0"
										placeholder="1"
										className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
										disabled={isLoading}
										ref={minAdvanceRef}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* SECTION 3: Recurring Rule */}
					<div id="recurring-rule" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Recurring Schedule *
							</h3>

							{ruleErrors &&
								ruleErrors.map((err) => (
									<p
										key={err.message}
										className="mb-3 text-red-300"
									>
										{err.message}
									</p>
								))}

							<div className="space-y-3">
								<div className="grid grid-cols-2 gap-3">
									<div>
										<label className="text-sm text-zinc-300 mb-1 block">
											Frequency *
										</label>
										<Dropdown
											refToApply={
												frequencyRef
											}
											entries={
												<>
													{RecurringFrequencyValues.map(
														(
															freq
														) => (
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
												</>
											}
											disabled={
												isLoading
											}
											onChange={(
												value
											) =>
												setFrequency(
													value as RecurringFrequency
												)
											}
											required
											aria-label="Select frequency"
										/>
									</div>

									<div>
										<label className="text-sm text-zinc-300 mb-1 block">
											Repeat Every
											*
										</label>
										<div className="relative">
											<input
												type="number"
												min="1"
												value={
													interval
												}
												onChange={(
													e
												) =>
													setInterval(
														parseInt(
															e
																.target
																.value
														) ||
															1
													)
												}
												disabled={
													isLoading
												}
												className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white pr-20"
												placeholder="1"
											/>
											<span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">
												{frequency ===
												"daily"
													? interval ===
														1
														? "day"
														: "days"
													: frequency ===
														  "weekly"
														? interval ===
															1
															? "week"
															: "weeks"
														: frequency ===
															  "monthly"
															? interval ===
																1
																? "month"
																: "months"
															: frequency ===
																  "yearly"
																? interval ===
																	1
																	? "year"
																	: "years"
																: ""}
											</span>
										</div>
									</div>
								</div>

								{frequency === "weekly" && (
									<div>
										<label className="text-sm text-zinc-300 mb-2 block">
											Repeat On *
										</label>
										<div className="flex flex-wrap gap-2">
											{WeekdayValues.map(
												(
													day
												) => (
													<button
														key={
															day
														}
														type="button"
														onClick={() =>
															toggleWeekday(
																day
															)
														}
														disabled={
															isLoading
														}
														className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
															selectedWeekdays.includes(
																day
															)
																? "bg-blue-600 text-white"
																: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
														}`}
													>
														{
															day
														}
													</button>
												)
											)}
										</div>
									</div>
								)}

								{frequency === "monthly" && (
									<div>
										<label className="text-sm text-zinc-300 mb-1 block">
											Day of Month
											*
										</label>
										<input
											type="number"
											min="1"
											max="31"
											value={
												monthDay
											}
											onChange={(
												e
											) =>
												setMonthDay(
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
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
											placeholder="1-31"
										/>
									</div>
								)}

								{frequency === "yearly" && (
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="text-sm text-zinc-300 mb-1 block">
												Month
												*
											</label>
											<Dropdown
												refToApply={
													monthRef
												}
												entries={
													<>
														{[
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
														].map(
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
												disabled={
													isLoading
												}
												onChange={(
													value
												) =>
													setMonth(
														value
															? parseInt(
																	value
																)
															: ""
													)
												}
												placeholder="Select month"
												required
												aria-label="Select month"
											/>
										</div>

										<div>
											<label className="text-sm text-zinc-300 mb-1 block">
												Day
												of
												Month
											</label>
											<input
												type="number"
												min="1"
												max="31"
												value={
													monthDay
												}
												onChange={(
													e
												) =>
													setMonthDay(
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
												disabled={
													isLoading
												}
												className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
												placeholder="1-31"
											/>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* SECTION 4: Time Constraints */}
					<div id="time-constraints" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Time Constraints
							</h3>

							<div className="space-y-4">
								{/* Arrival Constraint */}
								<div>
									<label className="text-sm text-zinc-300 mb-2 block">
										Arrival
									</label>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
										<div>
											<select
												value={
													arrivalConstraint
												}
												onChange={(
													e
												) =>
													setArrivalConstraint(
														e
															.target
															.value as ArrivalConstraint
													)
												}
												disabled={
													isLoading
												}
												className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-sm outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors"
											>
												{ArrivalConstraintValues.map(
													(
														val
													) => (
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
											</select>
										</div>

										<div className="space-y-2">
											{arrivalConstraint ===
												"at" && (
												<TimePicker
													value={
														arrivalTime
													}
													onChange={
														setArrivalTime
													}
												/>
											)}

											{arrivalConstraint ===
												"between" && (
												<>
													<TimePicker
														value={
															arrivalWindowStart
														}
														onChange={
															setArrivalWindowStart
														}
													/>
													<TimePicker
														value={
															arrivalWindowEnd
														}
														onChange={
															setArrivalWindowEnd
														}
													/>
												</>
											)}

											{arrivalConstraint ===
												"by" && (
												<TimePicker
													value={
														arrivalWindowEnd
													}
													onChange={
														setArrivalWindowEnd
													}
												/>
											)}
										</div>
									</div>
								</div>

								{/* Finish Constraint */}
								<div>
									<label className="text-sm text-zinc-300 mb-2 block">
										Finish
									</label>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
										<div>
											<select
												value={
													finishConstraint
												}
												onChange={(
													e
												) =>
													setFinishConstraint(
														e
															.target
															.value as FinishConstraint
													)
												}
												disabled={
													isLoading
												}
												className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-sm outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors"
											>
												{FinishConstraintValues.map(
													(
														val
													) => (
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
											</select>
										</div>

										<div>
											{(finishConstraint ===
												"at" ||
												finishConstraint ===
													"by") && (
												<TimePicker
													value={
														finishTime
													}
													onChange={
														setFinishTime
													}
												/>
											)}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* SECTION 5: Line Items */}
					<div id="line-items" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold">
									Line Items
								</h3>
								<button
									type="button"
									onClick={addLineItem}
									disabled={isLoading}
									className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md text-sm font-medium transition-colors"
								>
									<Plus size={16} />
									Add Item
								</button>
							</div>

							{lineItemErrors &&
								lineItemErrors.map((err) => (
									<p
										key={err.message}
										className="mb-3 text-red-300"
									>
										{err.message}
									</p>
								))}

							<div className="space-y-3">
								{lineItems.map((item, index) => (
									<div
										key={item.id}
										className="p-3 bg-zinc-900 rounded-lg border border-zinc-700"
									>
										<div className="flex items-start justify-between mb-2">
											<span className="text-sm text-zinc-400">
												Item{" "}
												{index +
													1}
											</span>
											<button
												type="button"
												onClick={() =>
													removeLineItem(
														item.id
													)
												}
												disabled={
													lineItems.length ===
														1 ||
													isLoading
												}
												className="text-red-400 hover:text-red-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
											>
												<Trash2
													size={
														16
													}
												/>
											</button>
										</div>

										<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
											<div>
												<input
													type="text"
													placeholder="Item name"
													value={
														item.name
													}
													onChange={(
														e
													) =>
														updateLineItem(
															item.id,
															"name",
															e
																.target
																.value
														)
													}
													disabled={
														isLoading
													}
													className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
												/>
											</div>

											<div>
												<select
													value={
														item.item_type
													}
													onChange={(
														e
													) =>
														updateLineItem(
															item.id,
															"item_type",
															e
																.target
																.value
														)
													}
													disabled={
														isLoading
													}
													className="appearance-none w-full h-full p-2 bg-zinc-800 text-white border border-zinc-700 rounded-sm outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors"
												>
													<option
														value=""
														disabled
														hidden
													>
														Type
														(optional)
													</option>
													{LineItemTypeValues.map(
														(
															type
														) => (
															<option
																key={
																	type
																}
																value={
																	type
																}
															>
																{type
																	.charAt(
																		0
																	)
																	.toUpperCase() +
																	type.slice(
																		1
																	)}
															</option>
														)
													)}
												</select>
											</div>

											<div className="md:col-span-2">
												<input
													type="text"
													placeholder="Description (optional)"
													value={
														item.description
													}
													onChange={(
														e
													) =>
														updateLineItem(
															item.id,
															"description",
															e
																.target
																.value
														)
													}
													disabled={
														isLoading
													}
													className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
												/>
											</div>

											<div>
												<label className="text-xs text-zinc-400 mb-1 block">
													Quantity
												</label>
												<input
													type="number"
													min="0.01"
													step="0.01"
													value={
														item.quantity
													}
													onChange={(
														e
													) =>
														updateLineItem(
															item.id,
															"quantity",
															parseFloat(
																e
																	.target
																	.value
															) ||
																0
														)
													}
													disabled={
														isLoading
													}
													className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
												/>
											</div>

											<div>
												<label className="text-xs text-zinc-400 mb-1 block">
													Unit
													Price
												</label>
												<div className="relative">
													<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
														$
													</span>
													<input
														type="number"
														min="0"
														step="0.01"
														value={
															item.unit_price
														}
														onChange={(
															e
														) =>
															updateLineItem(
																item.id,
																"unit_price",
																parseFloat(
																	e
																		.target
																		.value
																) ||
																	0
															)
														}
														disabled={
															isLoading
														}
														className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pl-6"
													/>
												</div>
											</div>

											<div className="md:col-span-2">
												<div className="flex items-center justify-between p-2 bg-zinc-800 rounded border border-zinc-700">
													<span className="text-sm text-zinc-400">
														Line
														Total:
													</span>
													<span className="text-sm font-semibold text-white">
														$
														{item.total.toFixed(
															2
														)}
													</span>
												</div>
											</div>
										</div>
									</div>
								))}
							</div>

							<div className="mt-3 pt-3 border-t border-zinc-700">
								<div className="flex items-center justify-between text-lg font-bold">
									<span className="text-white">
										Subtotal:
									</span>
									<span className="text-green-400">
										$
										{subtotal.toFixed(
											2
										)}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* SECTION 6: Billing Configuration */}
					<div id="billing" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Billing Configuration
							</h3>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Billing Mode *
									</label>
									<Dropdown
										refToApply={
											billingModeRef
										}
										entries={
											<>
												{BillingModeValues.map(
													(
														v
													) => (
														<option
															key={
																v
															}
															value={
																v
															}
														>
															{v ===
															"per_visit"
																? "Per Visit"
																: v ===
																	  "subscription"
																	? "Subscription"
																	: "None"}
														</option>
													)
												)}
											</>
										}
										disabled={isLoading}
										required
										aria-label="Select billing mode"
									/>
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Invoice Timing *
									</label>
									<Dropdown
										refToApply={
											invoiceTimingRef
										}
										entries={
											<>
												{InvoiceTimingValues.map(
													(
														v
													) => (
														<option
															key={
																v
															}
															value={
																v
															}
														>
															{v ===
															"on_completion"
																? "On Completion"
																: v ===
																	  "on_schedule_date"
																	? "On Schedule Date"
																	: "Manual"}
														</option>
													)
												)}
											</>
										}
										disabled={isLoading}
										required
										aria-label="Select invoice timing"
									/>
								</div>

								<div className="md:col-span-2">
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={
												autoInvoice
											}
											onChange={(
												e
											) =>
												setAutoInvoice(
													e
														.target
														.checked
												)
											}
											disabled={
												isLoading
											}
											className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500"
										/>
										<span className="text-sm text-zinc-300">
											Auto-generate
											invoices
										</span>
									</label>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="flex-shrink-0 border-t border-zinc-700 pt-3 pb-2">
				<div className="flex justify-end space-x-2">
					{isLoading ? (
						<LoadSvg className="w-10 h-10" />
					) : (
						<>
							<button
								onClick={() =>
									setIsModalOpen(false)
								}
								className="px-4 py-2 border border-zinc-700 rounded-sm hover:bg-zinc-800 transition-all"
							>
								Cancel
							</button>
							<button
								onClick={invokeUpdate}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-sm font-medium transition-all"
							>
								Update Recurring Plan
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
		/>
	);
};

export default EditRecurringPlan;
