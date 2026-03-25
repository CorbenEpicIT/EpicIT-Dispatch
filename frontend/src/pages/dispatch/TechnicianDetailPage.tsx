import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	Edit,
	Briefcase,
	MapPin,
	Clock,
	MoreVertical,
	Trash2,
	ChevronDown,
	ExternalLink,
	Mail,
	Phone,
	Calendar,
} from "lucide-react";
import Card from "../../components/ui/Card";
import DynamicMap from "../../components/ui/maps/DynamicMap";
import EditTechnicianModal from "../../components/technicians/EditTechnician";
import { useTechnicianByIdQuery, useDeleteTechnicianMutation } from "../../hooks/useTechnicians";
import { TechnicianStatusColors, TechnicianStatusDotColors } from "../../types/technicians";
import {
	JobStatusColors,
	JobStatusLabels,
	VisitStatusColors,
	VisitStatusLabels,
	type JobStatus,
	type VisitStatus,
} from "../../types/jobs";

export default function TechnicianDetailsPage() {
	const { technicianId } = useParams<{ technicianId: string }>();
	const navigate = useNavigate();

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
	const toggleJob = (jobId: string) =>
		setExpandedJobs((prev) => {
			const next = new Set(prev);
			next.has(jobId) ? next.delete(jobId) : next.add(jobId);
			return next;
		});

	const optionsMenuRef = useRef<HTMLDivElement>(null);
	const locationMapRef = useRef<HTMLDivElement>(null);
	const deleteTechnician = useDeleteTechnicianMutation();

	const { data: technician, isLoading, error } = useTechnicianByIdQuery(technicianId);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				optionsMenuRef.current &&
				!optionsMenuRef.current.contains(e.target as Node)
			) {
				setIsOptionsMenuOpen(false);
				setDeleteConfirm(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			navigate("/dispatch/technicians", { replace: true });
			await deleteTechnician.mutateAsync(technician!.id);
		} catch (error) {
			console.error("Failed to delete technician:", error);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-zinc-400">Loading...</div>
			</div>
		);
	}

	if (error || !technician) {
		return (
			<div className="p-6">
				<button
					onClick={() => navigate("/dispatch/technicians")}
					className="text-zinc-400 hover:text-white mb-4 transition-colors"
				>
					← Back to Technicians
				</button>
				<div className="text-white">Technician not found</div>
			</div>
		);
	}

	const visitTechs = technician.visit_techs ?? [];

	const jobMap = new Map<
		string,
		{
			job: (typeof visitTechs)[0]["visit"]["job"];
			visits: (typeof visitTechs)[0]["visit"][];
		}
	>();
	for (const vt of visitTechs) {
		const entry = jobMap.get(vt.visit.job_id);
		if (entry) entry.visits.push(vt.visit);
		else jobMap.set(vt.visit.job_id, { job: vt.visit.job, visits: [vt.visit] });
	}
	const groupedJobs = Array.from(jobMap.values()).sort((a, b) => {
		const aLatest = Math.max(
			...a.visits.map((v) => new Date(v.scheduled_start_at).getTime())
		);
		const bLatest = Math.max(
			...b.visits.map((v) => new Date(v.scheduled_start_at).getTime())
		);
		return bLatest - aLatest;
	});

	const ACTIVE_STATUSES = ["InProgress", "OnSite", "Driving", "Paused", "Delayed"];
	const activeVisit =
		visitTechs
			.map((vt) => vt.visit)
			.filter((v) => ACTIVE_STATUSES.includes(v.status))
			.sort((a, b) => {
				const priority = [
					"InProgress",
					"OnSite",
					"Driving",
					"Paused",
					"Delayed",
				];
				return priority.indexOf(a.status) - priority.indexOf(b.status);
			})[0] ?? null;

	const fmtTime = (d: Date | string) =>
		new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	const fmtDate = (d: Date | string) =>
		new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	const statCards = [
		{ label: "Total Jobs", value: groupedJobs.length, color: "text-white" },
		{
			label: "Completed",
			value: visitTechs.filter((vt) => vt.visit.status === "Completed").length,
			color: "text-emerald-400",
		},
		{
			label: "In Progress",
			value: visitTechs.filter((vt) => vt.visit.status === "InProgress").length,
			color: "text-amber-400",
		},
		{
			label: "Scheduled",
			value: visitTechs.filter((vt) => vt.visit.status === "Scheduled").length,
			color: "text-blue-400",
		},
	];

	return (
		<div className="text-white space-y-6 p-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-4 min-w-0">
					<div className="relative flex-shrink-0">
						<div className="w-14 h-14 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-white font-bold text-xl">
							{technician.name.charAt(0).toUpperCase()}
						</div>
						<div
							className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${TechnicianStatusDotColors[technician.status]} rounded-full border-2 border-zinc-950`}
						/>
					</div>
					<div className="min-w-0">
						<h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
							{technician.name}
						</h1>
						<p className="text-zinc-400 text-sm mt-0.5">
							{technician.title}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 flex-shrink-0">
					<span
						className={`px-3 py-1 rounded-full text-xs font-semibold border ${TechnicianStatusColors[technician.status]}`}
					>
						{technician.status}
					</span>
					<div className="relative" ref={optionsMenuRef}>
						<button
							onClick={() => {
								setIsOptionsMenuOpen((v) => !v);
								setDeleteConfirm(false);
							}}
							className="p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical size={18} />
						</button>
						{isOptionsMenuOpen && (
							<div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={() => {
											setIsEditModalOpen(
												true
											);
											setIsOptionsMenuOpen(
												false
											);
											setDeleteConfirm(
												false
											);
										}}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 text-zinc-200"
									>
										<Edit size={14} />
										Edit Technician
									</button>
									<div className="my-1 border-t border-zinc-800" />
									<button
										onClick={
											handleDelete
										}
										onMouseLeave={() =>
											setDeleteConfirm(
												false
											)
										}
										disabled={
											deleteTechnician.isPending
										}
										className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
											deleteConfirm
												? "bg-red-600 hover:bg-red-700 text-white"
												: "text-red-400 hover:bg-zinc-800 hover:text-red-300"
										} disabled:opacity-50 disabled:cursor-not-allowed`}
									>
										<Trash2 size={14} />
										{deleteTechnician.isPending
											? "Deleting..."
											: deleteConfirm
												? "Click Again to Confirm"
												: "Delete Technician"}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Stat Row */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{statCards.map((s) => (
					<div
						key={s.label}
						className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center"
					>
						<p className={`text-2xl font-bold mb-1 ${s.color}`}>
							{s.value}
						</p>
						<p className="text-xs text-zinc-500 uppercase tracking-wider">
							{s.label}
						</p>
					</div>
				))}
			</div>

			{/* Info + Recent Jobs */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Basic Information */}
				<Card title="Information">
					<div className="space-y-4">
						{[
							{
								icon: Mail,
								label: "Email",
								value: technician.email,
							},
							{
								icon: Phone,
								label: "Phone",
								value: technician.phone,
							},
							{
								icon: Calendar,
								label: "Hire Date",
								value: new Date(
									technician.hire_date
								).toLocaleDateString("en-US", {
									year: "numeric",
									month: "long",
									day: "numeric",
								}),
							},
							{
								icon: Clock,
								label: "Last Login",
								value: `${new Date(technician.last_login).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${new Date(technician.last_login).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
							},
						].map(({ icon: Icon, label, value }) => (
							<div
								key={label}
								className="flex items-center gap-3"
							>
								<div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
									<Icon
										size={14}
										className="text-zinc-400"
									/>
								</div>
								<div className="min-w-0">
									<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
										{label}
									</p>
									<p className="text-sm text-white truncate">
										{value}
									</p>
								</div>
							</div>
						))}
						{technician.description && (
							<div className="pt-3 border-t border-zinc-800">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
									Description
								</p>
								<p className="text-sm text-zinc-300 leading-relaxed">
									{technician.description}
								</p>
							</div>
						)}
					</div>
				</Card>

				{/* Jobs Accordion */}
				<Card title="Jobs">
					<style>{`
						.tech-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; transition: scrollbar-color 0.2s ease; }
						.tech-scroll:hover { scrollbar-color: #52525b #27272a; }
						.tech-scroll::-webkit-scrollbar { width: 6px; }
						.tech-scroll::-webkit-scrollbar-track { background: transparent; }
						.tech-scroll:hover::-webkit-scrollbar-track { background: #27272a; border-radius: 3px; }
						.tech-scroll::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 3px; }
						.tech-scroll:hover::-webkit-scrollbar-thumb { background-color: #52525b; }
						.tech-scroll::-webkit-scrollbar-thumb:hover { background-color: #71717a; }
					`}</style>
					{groupedJobs.length === 0 ? (
						<div className="py-10 text-center">
							<div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-800 rounded-full mb-3">
								<Briefcase
									size={20}
									className="text-zinc-500"
								/>
							</div>
							<p className="text-sm text-zinc-400">
								No jobs assigned
							</p>
						</div>
					) : (
						<div className="overflow-y-auto tech-scroll max-h-[520px] -mt-4 -mx-4">
							{groupedJobs.map(({ job, visits }) => {
								const isExpanded = expandedJobs.has(
									job.id
								);
								const jobColor =
									JobStatusColors[
										job.status as JobStatus
									] ??
									"bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
								const jobLabel =
									JobStatusLabels[
										job.status as JobStatus
									] ?? job.status;
								return (
									<div
										key={job.id}
										className="border-b border-zinc-800"
									>
										{/* Job row*/}
										<div className="flex items-stretch">
											<button
												onClick={() =>
													navigate(
														`/dispatch/jobs/${job.id}`
													)
												}
												className="w-1/4 flex items-center gap-2 pl-4 pr-3 py-2.5 border-r border-zinc-800 hover:bg-zinc-800/60 transition-colors text-left group flex-shrink-0"
											>
												<Briefcase
													size={
														14
													}
													className="text-zinc-500 group-hover:text-zinc-300 transition-colors flex-shrink-0"
												/>
												<div className="min-w-0">
													<p className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors truncate leading-tight">
														{
															job.name
														}
													</p>
													<p className="text-[11px] text-zinc-500 truncate leading-tight">
														{
															job
																.client
																.name
														}
													</p>
												</div>
											</button>

											<button
												onClick={() =>
													toggleJob(
														job.id
													)
												}
												className="flex-1 flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/40 transition-colors text-left group min-w-0"
											>
												<div className="flex-1 min-w-0">
													{job.address && (
														<p className="text-xs text-zinc-500 truncate flex items-center gap-1">
															<MapPin
																size={
																	10
																}
																className="flex-shrink-0"
															/>
															{
																job.address
															}
														</p>
													)}
												</div>
												<span className="text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 whitespace-nowrap flex-shrink-0">
													{
														visits.length
													}{" "}
													visit
													{visits.length !==
													1
														? "s"
														: ""}
												</span>
												<span
													className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${jobColor}`}
												>
													{
														jobLabel
													}
												</span>
												<ChevronDown
													size={
														13
													}
													className={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
												/>
											</button>
										</div>

										{/* Expanded visit rows */}
										{isExpanded && (
											<div className="border-t border-zinc-800">
												{visits.map(
													(
														visit
													) => {
														const visitColor =
															VisitStatusColors[
																visit.status as VisitStatus
															] ??
															"bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
														const visitLabel =
															VisitStatusLabels[
																visit.status as VisitStatus
															] ??
															visit.status;
														return (
															<button
																key={
																	visit.id
																}
																onClick={() =>
																	navigate(
																		`/dispatch/jobs/${job.id}/visits/${visit.id}`
																	)
																}
																className="w-full flex items-center gap-3 pl-10 pr-4 py-2 border-b border-zinc-800/60 last:border-b-0 hover:bg-zinc-800/40 transition-colors text-left group"
															>
																<div className="flex-1 min-w-0">
																	<div className="flex items-center gap-1.5 flex-wrap">
																		<span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">
																			{fmtDate(
																				visit.scheduled_start_at
																			)}
																		</span>
																		<span className="text-zinc-700">
																			·
																		</span>
																		<span className="text-xs text-zinc-500">
																			{fmtTime(
																				visit.scheduled_start_at
																			)}{" "}
																			–{" "}
																			{fmtTime(
																				visit.scheduled_end_at
																			)}
																		</span>
																	</div>
																	{visit.actual_start_at && (
																		<p className="text-[11px] text-zinc-600 mt-0.5">
																			Actual:{" "}
																			{fmtTime(
																				visit.actual_start_at
																			)}
																			{visit.actual_end_at
																				? ` – ${fmtTime(visit.actual_end_at)}`
																				: " (ongoing)"}
																		</p>
																	)}
																</div>
																<div className="flex items-center gap-1.5 flex-shrink-0">
																	<span
																		className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${visitColor}`}
																	>
																		{
																			visitLabel
																		}
																	</span>
																	<ExternalLink
																		size={
																			11
																		}
																		className="text-zinc-600 group-hover:text-zinc-400 transition-colors"
																	/>
																</div>
															</button>
														);
													}
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</Card>
			</div>

			{/* Location placeholder */}
			<Card title="Current Location">
				<div className="w-full h-48 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center justify-center">
					<div className="text-center">
						<MapPin
							size={36}
							className="text-zinc-600 mx-auto mb-2"
						/>
						<p className="text-zinc-400 text-sm">Map view</p>
						<p className="text-zinc-500 text-xs mt-1">
							Location tracking integration pending
						</p>
					</div>
				</div>
			</Card>

			<EditTechnicianModal
				isOpen={isEditModalOpen}
				onClose={() => setIsEditModalOpen(false)}
				technician={technician}
			/>
		</div>
	);
}
