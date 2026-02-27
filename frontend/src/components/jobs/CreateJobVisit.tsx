import LoadSvg from "../../assets/icons/loading.svg?react";
import { useState, useEffect, useRef } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import {
	CreateJobVisitSchema,
	type CreateJobVisitInput,
	type JobVisit,
	type ArrivalConstraint,
	type FinishConstraint,
} from "../../types/jobs";
import { ArrivalConstraintValues, FinishConstraintValues } from "../../types/recurringPlans";
import { LineItemTypeValues, type LineItemType } from "../../types/common";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";
import DatePicker from "../ui/DatePicker";
import TimePicker from "../ui/TimePicker";
import { Plus, Trash2 } from "lucide-react";

interface CreateJobVisitProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	jobId: string;
	createVisit: (input: CreateJobVisitInput) => Promise<JobVisit>;
	preselectedTechId?: string;
	onSuccess?: (visit: JobVisit) => void;
}

// Local UI-only interface for form state
interface LineItem {
	id: string;
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
}

const CreateJobVisit = ({
	isModalOpen,
	setIsModalOpen,
	jobId,
	createVisit,
	preselectedTechId,
	onSuccess,
}: CreateJobVisitProps) => {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [startDate, setStartDate] = useState<Date>(new Date());
	const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);

	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>("at");
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

	const { data: technicians } = useAllTechniciansQuery();

	useEffect(() => {
		if (isModalOpen && preselectedTechId) {
			setSelectedTechIds([preselectedTechId]);
		}
	}, [isModalOpen, preselectedTechId]);

	// Reset form when modal closes
	useEffect(() => {
		if (!isModalOpen) {
			setStartDate(new Date());
			setArrivalConstraint("at");
			setFinishConstraint("when_done");
			const resetTime = new Date();
			resetTime.setHours(9, 0, 0, 0);
			setArrivalTime(resetTime);
			setArrivalWindowStart(resetTime);
			const resetWindowEnd = new Date();
			resetWindowEnd.setHours(17, 0, 0, 0);
			setArrivalWindowEnd(resetWindowEnd);
			setFinishTime(resetWindowEnd);
			setSelectedTechIds([]);
			setLineItems([
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
			setErrors(null);
		}
	}, [isModalOpen]);

	const handleTechSelection = (techId: string) => {
		setSelectedTechIds((prev) =>
			prev.includes(techId)
				? prev.filter((id) => id !== techId)
				: [...prev, techId]
		);
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

	const formatTimeString = (date: Date | null): string | null => {
		if (!date) return null;
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

	const invokeCreate = async () => {
		if (!nameRef.current || !isLoading) {
			setErrors(null);

			const nameValue = nameRef.current?.value.trim() || "";
			const descValue = descRef.current?.value.trim() || "";

			let combinedStartDate = new Date(startDate);
			let combinedEndDate = new Date(startDate);

			if (arrivalConstraint === "at" && arrivalTime) {
				combinedStartDate.setHours(
					arrivalTime.getHours(),
					arrivalTime.getMinutes(),
					0,
					0
				);
			} else if (arrivalConstraint === "between" && arrivalWindowStart) {
				combinedStartDate.setHours(
					arrivalWindowStart.getHours(),
					arrivalWindowStart.getMinutes(),
					0,
					0
				);
			} else if (arrivalConstraint === "by" && arrivalWindowEnd) {
				// Start 4 hours before deadline
				const deadlineMinutes =
					arrivalWindowEnd.getHours() * 60 +
					arrivalWindowEnd.getMinutes();
				const startMinutes = Math.max(0, deadlineMinutes - 240);
				combinedStartDate.setHours(
					Math.floor(startMinutes / 60),
					startMinutes % 60,
					0,
					0
				);
			} else {
				// anytime - default to 9 AM
				combinedStartDate.setHours(9, 0, 0, 0);
			}

			if (finishConstraint === "at" && finishTime) {
				combinedEndDate.setHours(
					finishTime.getHours(),
					finishTime.getMinutes(),
					0,
					0
				);
			} else if (finishConstraint === "by" && finishTime) {
				combinedEndDate.setHours(
					finishTime.getHours(),
					finishTime.getMinutes(),
					0,
					0
				);
			} else {
				// when_done - default 2 hour duration
				combinedEndDate = new Date(
					combinedStartDate.getTime() + 2 * 60 * 60 * 1000
				);
			}

			// Prepare line items
			const preparedLineItems = lineItems
				.filter((item) => item.name.trim() !== "") // Only include items with names
				.map((item, index) => ({
					name: item.name,
					description: item.description || undefined,
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					item_type: (item.item_type || undefined) as
						| LineItemType
						| undefined,
					sort_order: index,
				}));

			const newVisit: CreateJobVisitInput = {
				job_id: jobId,
				name: nameValue,
				description: descValue || undefined,
				scheduled_start_at: combinedStartDate.toISOString(),
				scheduled_end_at: combinedEndDate.toISOString(),
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
				status: "Scheduled",
				tech_ids: selectedTechIds,
				line_items:
					preparedLineItems.length > 0
						? preparedLineItems
						: undefined,
			};

			const parseResult = CreateJobVisitSchema.safeParse(newVisit);

			if (!parseResult.success) {
				setErrors(parseResult.error);
				return;
			}

			setIsLoading(true);

			try {
				const createdVisit = await createVisit(newVisit);

				if (onSuccess) {
					onSuccess(createdVisit);
				} else {
					setIsModalOpen(false);
				}
			} catch (error) {
				console.error("Failed to create visit:", error);
			} finally {
				setIsLoading(false);
			}
		}
	};

	let nameErrors, descriptionErrors, constraintErrors, lineItemErrors;
	if (errors) {
		nameErrors = errors.issues.filter((err) => err.path[0] === "name");
		descriptionErrors = errors.issues.filter((err) => err.path[0] === "description");
		constraintErrors = errors.issues.filter(
			(err) =>
				err.path[0] === "arrival_constraint" ||
				err.path[0] === "finish_constraint" ||
				err.path[0] === "arrival_time" ||
				err.path[0] === "arrival_window_start" ||
				err.path[0] === "arrival_window_end" ||
				err.path[0] === "finish_time"
		);
		lineItemErrors = errors.issues.filter((err) => err.path[0] === "line_items");
	}

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
					<h2 className="text-2xl font-bold mb-6">Create Visit</h2>

					{preselectedTechId && (
						<div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-md">
							<p className="text-sm text-blue-300">
								Creating visit with pre-selected
								technician
							</p>
						</div>
					)}

					{/* SECTION 1: Visit Details */}
					<div id="visit-details" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Visit Details
							</h3>

							<div className="space-y-3">
								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Visit Name *
									</label>
									<input
										type="text"
										placeholder="e.g., Initial Assessment, Follow-up Visit"
										ref={nameRef}
										disabled={isLoading}
										className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
									/>
									{nameErrors && (
										<div>
											{nameErrors.map(
												(
													err
												) => (
													<p
														className="mt-1 text-sm text-red-300"
														key={
															err.message
														}
													>
														{
															err.message
														}
													</p>
												)
											)}
										</div>
									)}
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Description
										(Optional)
									</label>
									<textarea
										placeholder="Describe what will be done during this visit..."
										ref={descRef}
										disabled={isLoading}
										className="border border-zinc-700 p-2 w-full h-20 rounded-sm bg-zinc-900 text-white resize-none"
									/>
									{descriptionErrors && (
										<div>
											{descriptionErrors.map(
												(
													err
												) => (
													<p
														className="mt-1 text-sm text-red-300"
														key={
															err.message
														}
													>
														{
															err.message
														}
													</p>
												)
											)}
										</div>
									)}
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Visit Date *
									</label>
									<DatePicker
										value={startDate}
										onChange={(date) =>
											setStartDate(
												date ||
													new Date()
											)
										}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* SECTION 2: Time Constraints */}
					<div id="time-constraints" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Time Constraints
							</h3>

							{constraintErrors &&
								constraintErrors.length > 0 && (
									<div className="mb-3 p-3 bg-red-900/20 border border-red-500/30 rounded-md">
										{constraintErrors.map(
											(err) => (
												<p
													key={
														err.message
													}
													className="text-sm text-red-300"
												>
													{
														err.message
													}
												</p>
											)
										)}
									</div>
								)}

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

					{/* SECTION 3: Line Items */}
					<div id="line-items" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold">
									Line Items (Optional)
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

					{/* SECTION 4: Assign Technicians */}
					<div id="technicians" className="scroll-mt-4">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 mb-4">
							<h3 className="text-lg font-semibold mb-4">
								Assign Technicians
							</h3>

							<div className="border border-zinc-700 rounded-sm p-3 max-h-48 overflow-y-auto bg-zinc-900">
								{technicians &&
								technicians.length > 0 ? (
									<div className="space-y-2">
										{technicians.map(
											(tech) => (
												<label
													key={
														tech.id
													}
													className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800 p-2 rounded transition-colors"
												>
													<input
														type="checkbox"
														checked={selectedTechIds.includes(
															tech.id
														)}
														onChange={() =>
															handleTechSelection(
																tech.id
															)
														}
														disabled={
															isLoading
														}
														className="w-4 h-4 accent-blue-600"
													/>
													<span className="text-white text-sm flex-1">
														{
															tech.name
														}{" "}
														-{" "}
														{
															tech.title
														}
													</span>
													<span
														className={`text-xs px-2 py-0.5 rounded ${
															tech.status ===
															"Available"
																? "bg-green-500/20 text-green-400"
																: tech.status ===
																	  "Busy"
																	? "bg-red-500/20 text-red-400"
																	: "bg-zinc-500/20 text-zinc-400"
														}`}
													>
														{
															tech.status
														}
													</span>
												</label>
											)
										)}
									</div>
								) : (
									<p className="text-zinc-400 text-sm">
										No technicians
										available
									</p>
								)}
							</div>

							{selectedTechIds.length > 0 && (
								<p className="text-sm text-zinc-400 mt-2">
									{selectedTechIds.length}{" "}
									technician
									{selectedTechIds.length > 1
										? "s"
										: ""}{" "}
									selected
								</p>
							)}
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
								onClick={invokeCreate}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-sm font-medium transition-all"
							>
								Create Visit
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

export default CreateJobVisit;
