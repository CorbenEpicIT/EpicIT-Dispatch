import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
	ChevronDown,
	ChevronUp,
	Calendar,
	MapPin,
	Plus,
	Check,
	Briefcase,
	User,
	Mail,
	Phone,
	Award,
	Clock,
} from "lucide-react";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import {
	useAllJobsQuery,
	useAssignTechniciansToVisitMutation,
	useCreateJobVisitMutation,
} from "../../hooks/useJobs";
import CreateJobVisit from "../../components/jobs/CreateJobVisit";
import { useMasonry } from "../../hooks/useMasonry";
import type { Job, JobVisit, ArrivalConstraint, FinishConstraint } from "../../types/jobs";
import type { Priority } from "../../types/common";
import LoadSvg from "../../assets/icons/loading.svg?react";
import BoxSvg from "../../assets/icons/box.svg?react";

export default function AssignTechnicianPage() {
	const { technicianId } = useParams<{ technicianId: string }>();
	const navigate = useNavigate();

	const { data: technician, isLoading: loadingTech } = useTechnicianByIdQuery(technicianId!);
	const { data: jobs, isLoading: loadingJobs, refetch: refetchJobs } = useAllJobsQuery();
	const assignTechnicians = useAssignTechniciansToVisitMutation();
	const { mutateAsync: createJobVisitMutation } = useCreateJobVisitMutation();

	const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
	const [expandedVisits, setExpandedVisits] = useState<Set<string>>(new Set());
	const [isCreatingVisit, setIsCreatingVisit] = useState(false);
	const [creatingVisitForJob, setCreatingVisitForJob] = useState<Job | null>(null);

	const isVisitAssigned = (visit: JobVisit) => {
		return visit.visit_techs?.some((vt) => vt.tech_id === technicianId);
	};

	// Helper function to format constraint display
	const formatConstraintInfo = (visit: JobVisit) => {
		const parts: string[] = [];

		// Arrival constraint
		if (visit.arrival_constraint === "at" && visit.arrival_time) {
			parts.push(`Arrive at ${visit.arrival_time}`);
		} else if (
			visit.arrival_constraint === "between" &&
			visit.arrival_window_start &&
			visit.arrival_window_end
		) {
			parts.push(
				`Arrive ${visit.arrival_window_start}-${visit.arrival_window_end}`
			);
		} else if (visit.arrival_constraint === "by" && visit.arrival_window_end) {
			parts.push(`Arrive by ${visit.arrival_window_end}`);
		} else if (visit.arrival_constraint === "anytime") {
			parts.push("Arrive anytime");
		}

		// Finish constraint
		if (visit.finish_constraint === "at" && visit.finish_time) {
			parts.push(`Finish at ${visit.finish_time}`);
		} else if (visit.finish_constraint === "by" && visit.finish_time) {
			parts.push(`Finish by ${visit.finish_time}`);
		}

		return parts.join(" • ");
	};

	const sortedJobs = jobs
		? [...jobs].sort((a, b) => {
				const priorityOrder: Record<Priority, number> = {
					Emergency: 5,
					Urgent: 4,
					High: 3,
					Medium: 2,
					Low: 1,
				};

				const aPriority = a.priority as Priority;
				const bPriority = b.priority as Priority;
				const priorityDiff =
					priorityOrder[bPriority] - priorityOrder[aPriority];

				if (priorityDiff === 0) {
					const aAssigned =
						a.visits?.filter((v) => isVisitAssigned(v))
							.length || 0;
					const bAssigned =
						b.visits?.filter((v) => isVisitAssigned(v))
							.length || 0;
					return bAssigned - aAssigned;
				}

				return priorityDiff;
			})
		: [];

	// Initialize Masonry - recalculate when jobs change or expand/collapse
	const { containerRef, layout } = useMasonry([sortedJobs, expandedJobs, expandedVisits], {
		itemSelector: ".job-card",
		gutter: 16,
		columnWidth: 340,
		fitWidth: true,
	});

	// Trigger layout recalculation when expand state changes
	useEffect(() => {
		layout();
	}, [expandedJobs, expandedVisits, layout]);

	const toggleJob = (jobId: string) => {
		setExpandedJobs((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) {
				next.delete(jobId);
			} else {
				next.add(jobId);
			}
			return next;
		});
	};

	const toggleVisit = (visitId: string) => {
		setExpandedVisits((prev) => {
			const next = new Set(prev);
			if (next.has(visitId)) {
				next.delete(visitId);
			} else {
				next.add(visitId);
			}
			return next;
		});
	};

	const toggleVisitSelection = async (visit: JobVisit) => {
		const isAlreadyAssigned = visit.visit_techs?.some(
			(vt) => vt.tech_id === technicianId
		);

		try {
			if (isAlreadyAssigned) {
				const otherTechs =
					visit.visit_techs
						?.filter((vt) => vt.tech_id !== technicianId)
						.map((vt) => vt.tech_id) || [];

				await assignTechnicians.mutateAsync({
					visitId: visit.id,
					techIds: otherTechs,
				});
			} else {
				const currentTechs =
					visit.visit_techs?.map((vt) => vt.tech_id) || [];
				const newTechs = [...currentTechs, technicianId!];

				await assignTechnicians.mutateAsync({
					visitId: visit.id,
					techIds: newTechs,
				});
			}

			await refetchJobs();
		} catch (error) {
			console.error("Failed to toggle assignment:", error);
		}
	};

	const handleCreateVisit = (job: Job) => {
		setCreatingVisitForJob(job);
		setIsCreatingVisit(true);
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "Scheduled":
				return "bg-blue-600/20 text-blue-400 border-blue-500/30";
			case "InProgress":
				return "bg-yellow-600/20 text-yellow-400 border-yellow-500/30";
			case "Completed":
				return "bg-green-600/20 text-green-400 border-green-500/30";
			case "Cancelled":
				return "bg-red-600/20 text-red-400 border-red-500/30";
			case "Unscheduled":
				return "bg-zinc-700 text-zinc-300 border-zinc-600";
			default:
				return "bg-zinc-700 text-zinc-300 border-zinc-600";
		}
	};

	const getVisitStatusColor = (status: string) => {
		switch (status) {
			case "Scheduled":
				return "text-blue-400";
			case "InProgress":
				return "text-yellow-400";
			case "Completed":
				return "text-green-400";
			case "Cancelled":
				return "text-red-400";
			default:
				return "text-zinc-400";
		}
	};

	const getTechStatusColor = (status: string) => {
		switch (status) {
			case "Available":
				return "bg-green-500";
			case "Busy":
				return "bg-yellow-500";
			case "Break":
				return "bg-blue-500";
			case "Offline":
				return "bg-zinc-500";
			default:
				return "bg-zinc-500";
		}
	};

	if (loadingTech || loadingJobs) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<LoadSvg className="w-12 h-12" />
			</div>
		);
	}

	if (!technician) {
		return (
			<div className="p-6">
				<div className="text-white">Technician not found</div>
			</div>
		);
	}

	const totalVisits = sortedJobs.reduce((acc, job) => acc + (job.visits?.length || 0), 0);
	const assignedVisits = sortedJobs.reduce(
		(acc, job) => acc + (job.visits?.filter((v) => isVisitAssigned(v)).length || 0),
		0
	);

	return (
		<div className="min-h-screen bg-zinc-950">
			{/* Header Section */}
			<div className="border-b border-zinc-800">
				<div className="w-full px-6 pb-6">
					{/* Page Title */}
					<div className="mb-3">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
							Assign Technician
						</h2>
					</div>

					<div className="flex items-center gap-8">
						{/* Avatar + Status */}
						<div className="relative flex-shrink-0">
							<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-0.5">
								<div className="w-full h-full rounded-2xl bg-zinc-900 flex items-center justify-center">
									<span className="text-white text-2xl font-bold">
										{technician.name
											.charAt(0)
											.toUpperCase()}
									</span>
								</div>
							</div>

							<div className="absolute -bottom-2 -right-2 flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-1">
								<div
									className={`w-2 h-2 rounded-full ${getTechStatusColor(
										technician.status
									)}`}
								/>
								<span className="text-xs font-medium text-white">
									{technician.status}
								</span>
							</div>
						</div>

						{/* Name + Title */}
						<div className="min-w-[220px]">
							<h1
								onClick={() =>
									navigate(
										`/dispatch/technicians/${technicianId}`
									)
								}
								className="text-2xl font-bold text-white leading-tight cursor-pointer hover:text-blue-400 transition-colors"
							>
								{technician.name}
							</h1>
							<div className="flex items-center gap-1.5 mt-1">
								<Award
									size={14}
									className="text-blue-400"
								/>
								<span className="text-sm text-zinc-400">
									{technician.title}
								</span>
							</div>
						</div>

						{/* Contact Info */}
						<div className="flex flex-col gap-2 min-w-[260px]">
							<div className="flex items-center gap-2 text-sm bg-zinc-800/30 rounded-lg px-3 py-2">
								<Mail
									size={14}
									className="text-zinc-500"
								/>
								<span className="text-zinc-300 truncate">
									{technician.email}
								</span>
							</div>
							<div className="flex items-center gap-2 text-sm bg-zinc-800/30 rounded-lg px-3 py-2">
								<Phone
									size={14}
									className="text-zinc-500"
								/>
								<span className="text-zinc-300">
									{technician.phone}
								</span>
							</div>
						</div>

						{/* Spacer */}
						<div className="flex-1" />

						{/* Stats */}
						<div className="flex gap-3">
							<div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-center min-w-[90px]">
								<div className="text-2xl font-bold text-white">
									{assignedVisits}
								</div>
								<div className="text-xs text-zinc-400 mt-0.5">
									Assigned
								</div>
							</div>

							<div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-3 text-center min-w-[90px]">
								<div className="text-2xl font-bold text-zinc-400">
									{totalVisits}
								</div>
								<div className="text-xs text-zinc-400 mt-0.5">
									Total
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Jobs List with Masonry */}
			<div className="w-full p-6">
				{!sortedJobs || sortedJobs.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 bg-zinc-900 rounded-lg border border-zinc-800">
						<BoxSvg className="w-16 h-16 mb-3 opacity-50" />
						<p className="text-zinc-400">No jobs available</p>
						<p className="text-sm text-zinc-500 mt-1">
							Create a job to start assigning visits
						</p>
					</div>
				) : (
					<div
						ref={containerRef}
						className="masonry-container"
						style={{ margin: "0 auto" }}
					>
						{sortedJobs.map((job) => {
							const isExpanded = expandedJobs.has(job.id);
							const visitCount = job.visits?.length || 0;
							const assignedCount =
								job.visits?.filter((v) =>
									isVisitAssigned(v)
								).length || 0;

							return (
								<div
									key={job.id}
									className="job-card bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors mb-4 w-[340px]"
								>
									{/* Job Header */}
									<div className="p-4">
										<div className="flex items-center gap-2 mb-2">
											<h3 className="text-lg font-semibold text-white flex-1 truncate">
												{
													job.name
												}
											</h3>
											<span
												className={`px-2 py-1 rounded text-xs font-medium border flex-shrink-0 ${getStatusColor(job.status)}`}
											>
												{
													job.status
												}
											</span>
										</div>

										<div className="space-y-1 text-xs text-zinc-400 mb-3">
											<div className="flex items-center gap-1">
												<Briefcase
													size={
														12
													}
												/>
												<span className="truncate">
													{job
														.client
														?.name ||
														"Unknown Client"}
												</span>
											</div>
											<div className="flex items-center gap-1">
												<MapPin
													size={
														12
													}
												/>
												<span className="truncate">
													{
														job.address
													}
												</span>
											</div>
											{visitCount >
												0 && (
												<div className="flex items-center gap-1">
													<Calendar
														size={
															12
														}
													/>
													<span>
														{
															visitCount
														}{" "}
														visit
														{visitCount !==
														1
															? "s"
															: ""}
														{assignedCount >
															0 && (
															<span className="text-blue-400">
																{" "}
																(
																{
																	assignedCount
																}{" "}
																assigned)
															</span>
														)}
													</span>
												</div>
											)}
										</div>

										<div className="flex gap-2">
											<button
												onClick={() =>
													toggleJob(
														job.id
													)
												}
												className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded transition-colors"
											>
												{isExpanded ? (
													<ChevronUp
														size={
															14
														}
													/>
												) : (
													<ChevronDown
														size={
															14
														}
													/>
												)}
												{isExpanded
													? "Hide"
													: "Show"}
											</button>

											<button
												onClick={() =>
													handleCreateVisit(
														job
													)
												}
												className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
											>
												<Plus
													size={
														14
													}
												/>
												New
											</button>
										</div>
									</div>

									{/* Expanded Job Details */}
									<div
										className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
											isExpanded
												? "grid-rows-[1fr] opacity-100"
												: "grid-rows-[0fr] opacity-0"
										}`}
										onTransitionEnd={(
											e
										) => {
											if (
												e.propertyName ===
												"grid-template-rows"
											) {
												layout();
											}
										}}
									>
										<div className="overflow-hidden border-t border-zinc-800 bg-zinc-900/50">
											<div className="p-4">
												<h4 className="text-xs font-semibold text-zinc-400 mb-2">
													Details
												</h4>
												<div className="space-y-2 text-xs mb-3">
													<div>
														<p className="text-zinc-500">
															Description
														</p>
														<p className="text-zinc-300">
															{job.description ||
																"No description"}
														</p>
													</div>
													<div className="grid grid-cols-2 gap-2">
														<div>
															<p className="text-zinc-500">
																Priority
															</p>
															<p className="text-zinc-300">
																{
																	job.priority
																}
															</p>
														</div>
														<div>
															<p className="text-zinc-500">
																Created
															</p>
															<p className="text-zinc-300">
																{new Date(
																	job.created_at
																).toLocaleDateString(
																	"en-US",
																	{
																		month: "short",
																		day: "numeric",
																	}
																)}
															</p>
														</div>
													</div>
												</div>

												{/* Visits Section */}
												<div className="border-t border-zinc-800 pt-3">
													<h4 className="text-xs font-semibold text-zinc-400 mb-2">
														Visits{" "}
														{visitCount >
															0 &&
															`(${visitCount})`}
													</h4>

													{!job.visits ||
													job
														.visits
														.length ===
														0 ? (
														<div className="text-center py-3 bg-zinc-800/50 rounded">
															<p className="text-zinc-500 text-xs mb-1">
																No
																visits
																scheduled
															</p>
															<button
																onClick={() =>
																	handleCreateVisit(
																		job
																	)
																}
																className="text-blue-400 hover:text-blue-300 text-xs"
															>
																Create
																first
																visit
															</button>
														</div>
													) : (
														<div className="space-y-2">
															{job.visits.map(
																(
																	visit
																) => {
																	const isVisitExpanded =
																		expandedVisits.has(
																			visit.id
																		);
																	const isAssigned =
																		isVisitAssigned(
																			visit
																		);
																	const assignedTechCount =
																		visit
																			.visit_techs
																			?.length ||
																		0;
																	const constraintInfo =
																		formatConstraintInfo(
																			visit
																		);

																	return (
																		<div
																			key={
																				visit.id
																			}
																			className={`border rounded overflow-hidden transition-all ${
																				isAssigned
																					? "border-blue-500/50 bg-blue-900/10"
																					: "border-zinc-700 bg-zinc-800"
																			}`}
																		>
																			<div className="p-2">
																				<div className="flex items-start justify-between gap-2">
																					<div className="flex-1 min-w-0">
																						<div className="flex items-center gap-2 mb-1">
																							<Calendar
																								size={
																									12
																								}
																								className="text-zinc-400 flex-shrink-0"
																							/>
																							<span className="text-white text-xs font-medium truncate">
																								{visit.name ||
																									new Date(
																										visit.scheduled_start_at
																									).toLocaleDateString(
																										"en-US",
																										{
																											month: "short",
																											day: "numeric",
																											hour: "numeric",
																											minute: "2-digit",
																										}
																									)}
																							</span>
																							<span
																								className={`text-xs font-medium ${getVisitStatusColor(visit.status)}`}
																							>
																								{
																									visit.status
																								}
																							</span>
																						</div>

																						<div className="flex items-center gap-2 text-xs text-zinc-400">
																							{constraintInfo && (
																								<span className="flex items-center gap-1 truncate">
																									<Clock
																										size={
																											10
																										}
																									/>
																									{
																										constraintInfo
																									}
																								</span>
																							)}
																							{assignedTechCount >
																								0 && (
																								<span className="flex items-center gap-1">
																									<User
																										size={
																											10
																										}
																									/>
																									{
																										assignedTechCount
																									}
																								</span>
																							)}
																						</div>
																					</div>

																					<div className="flex items-center gap-1 flex-shrink-0">
																						<button
																							onClick={() =>
																								toggleVisit(
																									visit.id
																								)
																							}
																							className="p-1 hover:bg-zinc-700 rounded transition-colors"
																						>
																							{isVisitExpanded ? (
																								<ChevronUp
																									size={
																										12
																									}
																									className="text-zinc-400"
																								/>
																							) : (
																								<ChevronDown
																									size={
																										12
																									}
																									className="text-zinc-400"
																								/>
																							)}
																						</button>

																						<button
																							onClick={() =>
																								toggleVisitSelection(
																									visit
																								)
																							}
																							disabled={
																								assignTechnicians.isPending
																							}
																							className={`p-1.5 rounded transition-colors ${
																								isAssigned
																									? "bg-blue-600 hover:bg-blue-700 text-white"
																									: "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
																							}`}
																						>
																							{isAssigned ? (
																								<Check
																									size={
																										12
																									}
																								/>
																							) : (
																								<Plus
																									size={
																										12
																									}
																								/>
																							)}
																						</button>
																					</div>
																				</div>
																			</div>

																			{isVisitExpanded && (
																				<div className="border-t border-zinc-700 bg-zinc-900/50 p-2">
																					<div className="grid grid-cols-2 gap-2 text-xs">
																						<div>
																							<p className="text-zinc-500 mb-0.5">
																								Scheduled
																								Start
																							</p>
																							<p className="text-zinc-300">
																								{new Date(
																									visit.scheduled_start_at
																								).toLocaleString(
																									"en-US",
																									{
																										month: "short",
																										day: "numeric",
																										hour: "numeric",
																										minute: "2-digit",
																										hour12: true,
																									}
																								)}
																							</p>
																						</div>
																						<div>
																							<p className="text-zinc-500 mb-0.5">
																								Scheduled
																								End
																							</p>
																							<p className="text-zinc-300">
																								{new Date(
																									visit.scheduled_end_at
																								).toLocaleString(
																									"en-US",
																									{
																										month: "short",
																										day: "numeric",
																										hour: "numeric",
																										minute: "2-digit",
																										hour12: true,
																									}
																								)}
																							</p>
																						</div>

																						{/* Arrival Constraint Details */}
																						<div className="col-span-2">
																							<p className="text-zinc-500 mb-0.5">
																								Arrival
																							</p>
																							<p className="text-zinc-300 capitalize">
																								{visit.arrival_constraint ===
																									"at" &&
																									visit.arrival_time &&
																									`At ${visit.arrival_time}`}
																								{visit.arrival_constraint ===
																									"between" &&
																									visit.arrival_window_start &&
																									visit.arrival_window_end &&
																									`Between ${visit.arrival_window_start} - ${visit.arrival_window_end}`}
																								{visit.arrival_constraint ===
																									"by" &&
																									visit.arrival_window_end &&
																									`By ${visit.arrival_window_end}`}
																								{visit.arrival_constraint ===
																									"anytime" &&
																									"Anytime"}
																							</p>
																						</div>

																						{/* Finish Constraint Details */}
																						{visit.finish_constraint !==
																							"when_done" && (
																							<div className="col-span-2">
																								<p className="text-zinc-500 mb-0.5">
																									Finish
																								</p>
																								<p className="text-zinc-300 capitalize">
																									{visit.finish_constraint ===
																										"at" &&
																										visit.finish_time &&
																										`At ${visit.finish_time}`}
																									{visit.finish_constraint ===
																										"by" &&
																										visit.finish_time &&
																										`By ${visit.finish_time}`}
																								</p>
																							</div>
																						)}
																					</div>

																					{visit.visit_techs &&
																						visit
																							.visit_techs
																							.length >
																							0 && (
																							<div className="mt-2 pt-2 border-t border-zinc-700">
																								<p className="text-zinc-500 text-xs mb-1">
																									Assigned
																								</p>
																								<div className="flex flex-wrap gap-1">
																									{visit.visit_techs.map(
																										(
																											vt
																										) => (
																											<span
																												key={
																													vt.tech_id
																												}
																												className={`px-1.5 py-0.5 rounded text-xs ${
																													vt.tech_id ===
																													technicianId
																														? "bg-blue-600/30 text-blue-300 border border-blue-500/50"
																														: "bg-zinc-700 text-zinc-300"
																												}`}
																											>
																												{
																													vt.tech.name.split(
																														" "
																													)[0]
																												}
																											</span>
																										)
																									)}
																								</div>
																							</div>
																						)}
																				</div>
																			)}
																		</div>
																	);
																}
															)}
														</div>
													)}
												</div>
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{creatingVisitForJob && (
				<CreateJobVisit
					isModalOpen={isCreatingVisit}
					setIsModalOpen={setIsCreatingVisit}
					jobId={creatingVisitForJob.id}
					createVisit={createJobVisitMutation}
					preselectedTechId={technicianId}
					onSuccess={async (newVisit) => {
						setIsCreatingVisit(false);
						setCreatingVisitForJob(null);
						await refetchJobs();
						setExpandedJobs((prev) =>
							new Set(prev).add(newVisit.job_id)
						);
						setTimeout(() => layout(), 100);
					}}
				/>
			)}
		</div>
	);
}
