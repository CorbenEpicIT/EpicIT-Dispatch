import { useState, useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import {
	useUpdateJobVisitMutation,
	useDeleteJobVisitMutation,
	useAssignTechniciansToVisitMutation,
} from "../../hooks/useJobs";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";
import type {
	JobVisit,
	UpdateJobVisitInput,
	VisitStatus,
	ArrivalConstraint,
	FinishConstraint,
} from "../../types/jobs";
import {
	VisitStatusValues,
	ArrivalConstraintValues,
	FinishConstraintValues,
} from "../../types/jobs";
import DatePicker from "../ui/DatePicker";
import TimePicker from "../ui/TimePicker";
import FullPopup from "../ui/FullPopup";

interface EditJobVisitProps {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
	visit: JobVisit;
	jobId: string;
}

export default function EditJobVisit({ isModalOpen, setIsModalOpen, visit }: EditJobVisitProps) {
	const updateVisit = useUpdateJobVisitMutation();
	const deleteVisit = useDeleteJobVisitMutation();
	const assignTechs = useAssignTechniciansToVisitMutation();
	const { data: technicians } = useAllTechniciansQuery();

	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const originalStartDate = useRef<Date>(new Date(visit.scheduled_start_at));

	const [startDate, setStartDate] = useState<Date>(new Date(visit.scheduled_start_at));
	const [status, setStatus] = useState<VisitStatus>(visit.status);
	const [selectedTechIds, setSelectedTechIds] = useState<string[]>(
		visit.visit_techs.map((vt) => vt.tech_id)
	);
	const [deleteConfirm, setDeleteConfirm] = useState(false);

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

	// Reset form data when modal opens with new visit
	useEffect(() => {
		if (isModalOpen) {
			const visitStartDate = new Date(visit.scheduled_start_at);
			originalStartDate.current = visitStartDate;

			setStartDate(visitStartDate);
			setStatus(visit.status);
			setSelectedTechIds(visit.visit_techs.map((vt) => vt.tech_id));
			setDeleteConfirm(false);

			if (visit.arrival_constraint) {
				setArrivalConstraint(visit.arrival_constraint as ArrivalConstraint);
			}
			if (visit.finish_constraint) {
				setFinishConstraint(visit.finish_constraint as FinishConstraint);
			}

			// Parse times from HH:MM strings
			if (visit.arrival_time) {
				const [hours, minutes] = visit.arrival_time.split(":").map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalTime(time);
			}

			if (visit.arrival_window_start) {
				const [hours, minutes] = visit.arrival_window_start
					.split(":")
					.map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalWindowStart(time);
			}

			if (visit.arrival_window_end) {
				const [hours, minutes] = visit.arrival_window_end
					.split(":")
					.map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setArrivalWindowEnd(time);
			}

			if (visit.finish_time) {
				const [hours, minutes] = visit.finish_time.split(":").map(Number);
				const time = new Date();
				time.setHours(hours, minutes, 0, 0);
				setFinishTime(time);
			}
		}
	}, [isModalOpen, visit]);

	const handleTechSelection = (techId: string) => {
		setSelectedTechIds((prev) =>
			prev.includes(techId)
				? prev.filter((id) => id !== techId)
				: [...prev, techId]
		);
	};

	const formatTimeString = (date: Date | null): string | null => {
		if (!date) return null;
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	const handleSubmit = async () => {
		try {
			const nameValue = nameRef.current?.value.trim() || visit.name || "";
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

			const updates: UpdateJobVisitInput = {
				name: nameValue !== visit.name ? nameValue : undefined,
				description:
					descValue !== (visit.description || "")
						? descValue
						: undefined,
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
				status: status,
			};

			await updateVisit.mutateAsync({
				id: visit.id,
				data: updates,
			});

			// Update technician assignments separately if changed
			const originalTechIds = visit.visit_techs.map((vt) => vt.tech_id).sort();
			const newTechIds = selectedTechIds.sort();
			if (JSON.stringify(originalTechIds) !== JSON.stringify(newTechIds)) {
				await assignTechs.mutateAsync({
					visitId: visit.id,
					techIds: selectedTechIds,
				});
			}

			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to update visit:", error);
		}
	};

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}

		try {
			await deleteVisit.mutateAsync(visit.id);
			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to delete visit:", error);
		}
	};

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
					<h2 className="text-2xl font-bold mb-6">Edit Visit</h2>

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
										ref={nameRef}
										defaultValue={
											visit.name ||
											""
										}
										placeholder="e.g., Initial Assessment, Follow-up Visit"
										disabled={
											updateVisit.isPending
										}
										className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white"
									/>
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Description
										(Optional)
									</label>
									<textarea
										ref={descRef}
										defaultValue={
											visit.description ||
											""
										}
										placeholder="Describe what will be done during this visit..."
										disabled={
											updateVisit.isPending
										}
										className="border border-zinc-700 p-2 w-full h-20 rounded-sm bg-zinc-900 text-white resize-none"
									/>
								</div>

								<div>
									<label className="text-sm text-zinc-300 mb-1 block">
										Status
									</label>
									<select
										value={status}
										onChange={(e) =>
											setStatus(
												e
													.target
													.value as VisitStatus
											)
										}
										disabled={
											updateVisit.isPending
										}
										className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-sm outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors"
									>
										{VisitStatusValues.map(
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
													"InProgress"
														? "In Progress"
														: val ===
															  "OnSite"
															? "On Site"
															: val}
												</option>
											)
										)}
									</select>
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
													originalStartDate.current
											)
										}
									/>
									{startDate.toDateString() !==
										originalStartDate.current.toDateString() && (
										<p className="text-xs text-blue-400 mt-1">
											Changed from{" "}
											{originalStartDate.current.toLocaleDateString(
												"en-US",
												{
													month: "short",
													day: "numeric",
													year: "numeric",
												}
											)}
										</p>
									)}
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
													updateVisit.isPending
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
													updateVisit.isPending
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

					{/* SECTION 3: Assign Technicians */}
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
															updateVisit.isPending
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
				<div className="flex gap-3">
					<button
						type="button"
						onClick={handleSubmit}
						disabled={updateVisit.isPending}
						className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors"
					>
						{updateVisit.isPending
							? "Saving..."
							: "Save Changes"}
					</button>
					<button
						type="button"
						onClick={handleDelete}
						onMouseLeave={() => setDeleteConfirm(false)}
						disabled={deleteVisit.isPending}
						className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
							deleteConfirm
								? "bg-red-600 hover:bg-red-700 text-white"
								: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
						} disabled:opacity-50 disabled:cursor-not-allowed`}
					>
						<Trash2 size={16} />
						{deleteVisit.isPending
							? "Deleting..."
							: deleteConfirm
								? "Confirm Delete"
								: "Delete"}
					</button>
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
}
