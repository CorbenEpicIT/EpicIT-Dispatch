import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
	Clock,
	MapPin,
	CheckCircle2,
	AlertCircle,
	Calendar,
	Activity,
	ChevronRight,
	Briefcase,
	FileText,
	Phone,
} from "lucide-react";
import Card from "../../components/ui/Card";
import SmartCalendar from "../../components/ui/SmartCalendar";
import { useAllJobsQuery, useCreateJobMutation } from "../../hooks/useJobs";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";
import { useAllRequestsQuery, useCreateRequestMutation } from "../../hooks/useRequests";
import { useAllQuotesQuery, useCreateQuoteMutation } from "../../hooks/useQuotes";
import { useAllRecurringPlansQuery } from "../../hooks/useRecurringPlans";
import type { JobVisit } from "../../types/jobs";
import CreateRequest from "../../components/requests/CreateRequest";
import CreateJob from "../../components/jobs/CreateJob";
import CreateQuote from "../../components/quotes/CreateQuote";
import CreateRecurringPlan from "../../components/recurringPlans/CreateRecurringPlan";
import LowStockWidget from "../../components/dashboard/LowStockWidget";

export default function DashboardPage() {
	const navigate = useNavigate();

	const [isCreateRequestModalOpen, setIsCreateRequestModalOpen] = useState(false);
	const [isCreateQuoteModalOpen, setIsCreateQuoteModalOpen] = useState(false);
	const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
	const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);

	const { mutateAsync: createRequest } = useCreateRequestMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const { mutateAsync: createQuote } = useCreateQuoteMutation();

	const { data: jobs = [], error: jobsError } = useAllJobsQuery();
	const { data: requests = [] } = useAllRequestsQuery();
	const { data: quotes = [] } = useAllQuotesQuery();
	const { data: recurringPlans = [] } = useAllRecurringPlansQuery();
	const { data: allTechnicians = [], error: techsError } = useAllTechniciansQuery();

	const technicianStats = useMemo(() => {
		const online = allTechnicians.filter(
			(t) => t.status === "Available" || t.status === "Busy"
		);
		return {
			total: allTechnicians.length,
			online: online.length,
			available: allTechnicians.filter((t) => t.status === "Available").length,
			busy: allTechnicians.filter((t) => t.status === "Busy").length,
			onBreak: allTechnicians.filter((t) => t.status === "Break").length,
			offline: allTechnicians.filter((t) => t.status === "Offline").length,
		};
	}, [allTechnicians]);

	const pipelineCounts = useMemo(
		() => ({
			newRequests: requests.filter((r) => r.status === "New").length,
			reviewing: requests.filter((r) => r.status === "Reviewing").length,
			quoted: requests.filter((r) => r.status === "Quoted").length,
			pendingApproval: quotes.filter(
				(q) => q.status === "Sent" || q.status === "Viewed"
			).length,
			approved: quotes.filter((q) => q.status === "Approved").length,
			unscheduled: jobs.filter((j) => j.status === "Unscheduled").length,
			scheduled: jobs.filter((j) => j.status === "Scheduled").length,
			inProgress: jobs
				.flatMap((j) => j.visits || [])
				.filter((v) => v.status === "InProgress").length,
			completedToday: jobs
				.flatMap((j) => j.visits || [])
				.filter(
					(v) =>
						v.status === "Completed" &&
						new Date(v.actual_end_at || "").toDateString() ===
							new Date().toDateString()
				).length,
		}),
		[requests, quotes, jobs]
	);

	const activeTechnicians = useMemo(() => {
		return allTechnicians
			.filter((t) => t.status !== "Offline")
			.map((tech) => {
				const allVisits = jobs.flatMap((j) => j.visits || []);
				const activeVisits = allVisits.filter(
					(v) =>
						v.status === "InProgress" &&
						v.visit_techs?.some((vt) => vt.tech_id === tech.id)
				) as JobVisit[];

				const upcomingVisits = allVisits
					.filter(
						(v) =>
							v.status === "Scheduled" &&
							v.visit_techs?.some(
								(vt) => vt.tech_id === tech.id
							) &&
							new Date(v.scheduled_start_at) > new Date()
					)
					.sort(
						(a, b) =>
							new Date(a.scheduled_start_at).getTime() -
							new Date(b.scheduled_start_at).getTime()
					) as JobVisit[];

				return {
					...tech,
					currentVisit: activeVisits[0] || null,
					nextVisit: upcomingVisits[0] || null,
					totalToday:
						activeVisits.length +
						upcomingVisits.filter(
							(v) =>
								new Date(
									v.scheduled_start_at
								).toDateString() ===
								new Date().toDateString()
						).length,
				};
			})
			.sort((a, b) => (a.currentVisit ? -1 : 1));
	}, [allTechnicians, jobs]);

	const getStatusColor = (status: string) => {
		const colors: Record<string, string> = {
			Available: "bg-emerald-500",
			Busy: "bg-amber-500",
			Break: "bg-blue-500",
			Offline: "bg-zinc-500",
		};
		return colors[status] || "bg-zinc-500";
	};

	const getStatusBadgeClass = (status: string) => {
		switch (status) {
			case "Available":
				return "bg-emerald-500/10 text-emerald-400";
			case "Busy":
				return "bg-amber-500/10 text-amber-400";
			case "Break":
				return "bg-blue-500/10 text-blue-400";
			default:
				return "bg-zinc-500/10 text-zinc-400";
		}
	};

	const getStatusAbbr = (status: string) => {
		switch (status) {
			case "Available":
				return "Avail";
			case "Busy":
				return "Busy";
			case "Break":
				return "Break";
			default:
				return "Off";
		}
	};

	const pipelineItems = useMemo(() => {
		const items = [
			{
				label: "New Requests",
				count: pipelineCounts.newRequests,
				icon: Phone,
				bg: "bg-blue-500/10",
				border: "border-blue-500/20",
				hoverBorder: "group-hover:border-blue-500/40",
				text: "text-blue-400",
				progress: "bg-blue-500",
				path: "/dispatch/requests?status=New",
			},
			{
				label: "Needs Quote",
				count: pipelineCounts.reviewing,
				icon: FileText,
				bg: "bg-amber-500/10",
				border: "border-amber-500/20",
				hoverBorder: "group-hover:border-amber-500/40",
				text: "text-amber-400",
				progress: "bg-amber-500",
				path: "/dispatch/requests?status=Reviewing",
			},
			{
				label: "Pending Approval",
				count: pipelineCounts.pendingApproval,
				icon: Clock,
				bg: "bg-purple-500/10",
				border: "border-purple-500/20",
				hoverBorder: "group-hover:border-purple-500/40",
				text: "text-purple-400",
				progress: "bg-purple-500",
				path: "/dispatch/quotes?status=Sent",
			},
			{
				label: "Approved Quotes",
				count: pipelineCounts.approved,
				icon: CheckCircle2,
				bg: "bg-emerald-500/10",
				border: "border-emerald-500/20",
				hoverBorder: "group-hover:border-emerald-500/40",
				text: "text-emerald-400",
				progress: "bg-emerald-500",
				path: "/dispatch/quotes?status=Approved",
			},
			{
				label: "Unscheduled",
				count: pipelineCounts.unscheduled,
				icon: Calendar,
				bg: "bg-orange-500/10",
				border: "border-orange-500/20",
				hoverBorder: "group-hover:border-orange-500/40",
				text: "text-orange-400",
				progress: "bg-orange-500",
				path: "/dispatch/jobs?status=Unscheduled",
			},
		];

		const max = Math.max(...items.map((i) => i.count), 1);
		return items.map((item) => ({
			...item,
			barWidth: Math.round((item.count / max) * 100),
		}));
	}, [pipelineCounts]);

	return (
		<div className="min-h-0 bg-zinc-950 text-zinc-100 w-full">
			<div className="w-full px-3 sm:px-5 lg:px-6 ">
				{/* Header */}
				<div className="mb-5">
					<h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
						Dispatch Dashboard
					</h1>
					<p className="text-sm text-zinc-400 mt-1">
						{new Date().toLocaleDateString("en-US", {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>

				{/* Week Schedule Calendar */}
				<Card className="mb-5 !p-0">
					<div className="p-3 sm:p-4 ">
						{jobsError ? (
							<div className="flex items-center justify-center h-full">
								<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
									<AlertCircle
										size={16}
										className="text-red-400"
									/>
									<p className="text-sm text-red-400">
										Failed to load
										calendar data
									</p>
								</div>
							</div>
						) : (
							<SmartCalendar
								jobs={jobs}
								view="week"
								toolbar={{
									left: "title",
									center: "",
									right: "today prev,next",
								}}
							/>
						)}
					</div>
				</Card>

				{/* Main Content Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
					{/* Left Column */}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0">
						{/* Operations Pipeline */}
						<Card title="Operations Pipeline">
							<div className="space-y-1">
								{pipelineItems.map((item) => (
									<div
										key={item.label}
										onClick={() =>
											navigate(
												item.path
											)
										}
										className="group flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all active:scale-[0.98]"
									>
										{/* Icon */}
										<div
											className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${item.bg} flex items-center justify-center border ${item.border} ${item.hoverBorder} transition-colors`}
										>
											<item.icon
												size={
													16
												}
												className={
													item.text
												}
											/>
										</div>

										<div className="flex-1 min-w-0">
											{/* Label row */}
											<div className="flex items-start justify-between gap-2 mb-1">
												<span className="text-sm font-medium text-zinc-200 leading-tight">
													{
														item.label
													}
												</span>
												{/* Count as badge */}
												<span
													className={`text-sm font-bold ${item.text} flex-shrink-0 bg-zinc-800/50 px-2 py-0.5 rounded-md`}
												>
													{
														item.count
													}
												</span>
											</div>

											{/* Progress bar */}
											<div className="w-full bg-zinc-800 rounded-full h-1.5">
												<div
													className={`${item.progress} h-1.5 rounded-full transition-all duration-300`}
													style={{
														width: `${item.barWidth}%`,
													}}
												/>
											</div>
										</div>

										{/* Chevron */}
										<ChevronRight
											size={16}
											className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 hidden sm:block -mr-1"
										/>
									</div>
								))}
							</div>
						</Card>

						<Card title="Recurring Plans">
							<div className="flex items-center justify-between mb-3">
								<span className="text-sm text-zinc-400">
									Active Plans
								</span>
								<span className="text-lg font-bold text-white">
									{
										recurringPlans.filter(
											(p) =>
												p.status ===
												"Active"
										).length
									}
								</span>
							</div>
							<div className="flex items-center justify-between mb-3">
								<span className="text-sm text-zinc-400">
									Paused
								</span>
								<span className="text-sm font-bold text-zinc-300">
									{
										recurringPlans.filter(
											(p) =>
												p.status ===
												"Paused"
										).length
									}
								</span>
							</div>
							<div className="pt-3 border-t border-zinc-800">
								<button
									onClick={() =>
										navigate(
											"/dispatch/jobs?view=templates"
										)
									}
									className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
								>
									Manage Plans
									<ChevronRight size={12} />
								</button>
							</div>
						</Card>

						<LowStockWidget />
					</div>

					{/* Center Column */}
					<div className="min-w-0">
						<Card
							title="Live Activity Feed -todo"
							className="h-full"
						>
							<div className="space-y-2">
								{[
									{
										type: "visit_completed",
										message: "Job #1024 completed by Mike R.",
										time: "2 min ago",
										icon: CheckCircle2,
										color: "text-emerald-400",
										bg: "bg-emerald-500/10",
									},
									{
										type: "quote_approved",
										message: "Quote #2041 approved by Acme Corp",
										time: "15 min ago",
										icon: FileText,
										color: "text-blue-400",
										bg: "bg-blue-500/10",
									},
									{
										type: "tech_checkin",
										message: "Sarah L. checked in for Job #1025",
										time: "32 min ago",
										icon: MapPin,
										color: "text-amber-400",
										bg: "bg-amber-500/10",
									},
									{
										type: "request_urgent",
										message: "Urgent request received from Downtown Properties",
										time: "1 hr ago",
										icon: AlertCircle,
										color: "text-red-400",
										bg: "bg-red-500/10",
									},
									{
										type: "visit_completed",
										message: "Job #1023 completed by John D.",
										time: "2 hr ago",
										icon: CheckCircle2,
										color: "text-emerald-400",
										bg: "bg-emerald-500/10",
									},
									{
										type: "quote_sent",
										message: "Quote #2040 sent to Westside Apartments",
										time: "3 hr ago",
										icon: FileText,
										color: "text-purple-400",
										bg: "bg-purple-500/10",
									},
								].map((activity, idx) => (
									<div
										key={idx}
										className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-800/30 transition-colors cursor-pointer group"
									>
										<div
											className={`flex-shrink-0 w-8 h-8 rounded-lg ${activity.bg} flex items-center justify-center`}
										>
											<activity.icon
												size={
													14
												}
												className={
													activity.color
												}
											/>
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm text-zinc-200 group-hover:text-white transition-colors break-words">
												{
													activity.message
												}
											</p>
											<p className="text-xs text-zinc-500 mt-0.5">
												{
													activity.time
												}
											</p>
										</div>
									</div>
								))}
							</div>
						</Card>
					</div>

					{/* Right Column */}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0">
						<Card
							title="Technicians"
							headerAction={
								<div className="flex items-center gap-2 min-w-0">
									<span className="text-xs text-zinc-500 whitespace-nowrap hidden xl:inline">
										{
											technicianStats.online
										}{" "}
										of{" "}
										{
											technicianStats.total
										}{" "}
										online
									</span>
									<span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0 hidden xl:inline-block" />
									<button
										onClick={() =>
											navigate(
												"/dispatch/technicians"
											)
										}
										className="text-xs font-medium text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors flex-shrink-0"
									>
										View All
									</button>
								</div>
							}
						>
							{techsError ? (
								<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
									<AlertCircle
										size={14}
										className="text-red-400"
									/>
									<p className="text-xs text-red-400">
										Failed to load
										technicians
									</p>
								</div>
							) : activeTechnicians.length === 0 ? (
								<div className="py-8 text-center">
									<div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-800 rounded-full mb-3">
										<Clock
											size={20}
											className="text-zinc-500"
										/>
									</div>
									<p className="text-sm text-zinc-400">
										No technicians
										online
									</p>
								</div>
							) : (
								<div className="space-y-2">
									{activeTechnicians
										.slice(0, 8)
										.map((tech) => (
											<div
												key={
													tech.id
												}
												onClick={() =>
													navigate(
														`/dispatch/technicians/${tech.id}`
													)
												}
												className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30 cursor-pointer transition-all"
											>
												{/* Avatar */}
												<div className="relative flex-shrink-0">
													<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-white font-semibold text-sm">
														{tech.name
															.charAt(
																0
															)
															.toUpperCase()}
													</div>
													<div
														className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${getStatusColor(tech.status)} rounded-full border-2 border-zinc-900`}
													/>
												</div>

												<div className="flex-1 min-w-0">
													{/* Name + status badge */}
													<div className="flex items-center justify-between mb-0.5 gap-2">
														<h4 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
															{
																tech.name
															}
														</h4>
														<span
															className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusBadgeClass(tech.status)}`}
														>
															<span className="inline sm:hidden">
																{getStatusAbbr(
																	tech.status
																)}
															</span>
															<span className="hidden sm:inline">
																{
																	tech.status
																}
															</span>
														</span>
													</div>

													{/* Title */}
													<p className="text-xs text-zinc-500 truncate mb-1.5">
														{
															tech.title
														}
													</p>

													{/* Visit status */}
													{tech.currentVisit ? (
														<div className="flex items-center gap-1.5 text-xs">
															<Activity
																size={
																	12
																}
																className="text-amber-400 flex-shrink-0"
															/>
															<span className="text-amber-400 flex-shrink-0">
																On
																Job
															</span>
															<span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
															<span className="text-zinc-400 truncate">
																{tech
																	.currentVisit
																	.job
																	?.name ||
																	"Unknown"}
															</span>
														</div>
													) : tech.nextVisit ? (
														<div className="flex items-center gap-1.5 text-xs min-w-0">
															<Clock
																size={
																	12
																}
																className="text-blue-400 flex-shrink-0"
															/>
															<span className="text-blue-400 flex-shrink-0">
																Next:
															</span>
															<span className="text-zinc-400 truncate inline sm:hidden">
																{new Date(
																	tech
																		.nextVisit
																		.scheduled_start_at
																).toLocaleDateString(
																	"en-US",
																	{
																		weekday: "short",
																		month: "short",
																		day: "numeric",
																	}
																)}

																,{" "}
																{new Date(
																	tech
																		.nextVisit
																		.scheduled_start_at
																).toLocaleTimeString(
																	"en-US",
																	{
																		hour: "numeric",
																		minute: "2-digit",
																	}
																)}
															</span>
															<span className="text-zinc-400 truncate hidden sm:inline">
																{new Date(
																	tech
																		.nextVisit
																		.scheduled_start_at
																).toLocaleDateString(
																	"en-US",
																	{
																		weekday: "long",
																		month: "long",
																		day: "numeric",
																	}
																)}

																,{" "}
																{new Date(
																	tech
																		.nextVisit
																		.scheduled_start_at
																).toLocaleTimeString(
																	"en-US",
																	{
																		hour: "numeric",
																		minute: "2-digit",
																	}
																)}
															</span>
														</div>
													) : (
														<div className="flex items-center gap-1.5 text-xs text-emerald-400">
															<CheckCircle2
																size={
																	12
																}
																className="flex-shrink-0"
															/>
															<span>
																No
																active
																visits
															</span>
														</div>
													)}
												</div>
											</div>
										))}
								</div>
							)}

							{activeTechnicians.length > 8 && (
								<div className="mt-4 pt-4 border-t border-zinc-800 text-center">
									<button
										onClick={() =>
											navigate(
												"/dispatch/technicians"
											)
										}
										className="text-xs text-zinc-400 hover:text-white font-medium"
									>
										+
										{activeTechnicians.length -
											8}{" "}
										more technicians
									</button>
								</div>
							)}
						</Card>

						<Card title="Quick Actions">
							<div className="grid grid-cols-2 gap-2">
								{[
									{
										label: "New Request",
										icon: Phone,
										color: "text-blue-400",
										action: () =>
											setIsCreateRequestModalOpen(
												true
											),
									},
									{
										label: "Create Quote",
										icon: FileText,
										color: "text-amber-400",
										action: () =>
											setIsCreateQuoteModalOpen(
												true
											),
									},
									{
										label: "Create Job",
										icon: Briefcase,
										color: "text-emerald-400",
										action: () =>
											setIsCreateJobModalOpen(
												true
											),
									},
									{
										label: "Schedule",
										icon: Calendar,
										color: "text-purple-400",
										action: () =>
											navigate(
												"/dispatch/schedule"
											),
									},
								].map((action) => (
									<button
										key={action.label}
										onClick={
											action.action
										}
										className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors group active:scale-[0.98]"
									>
										<action.icon
											size={16}
											className={`${action.color} mb-2`}
										/>
										<div className="text-xs font-medium text-zinc-200 group-hover:text-white">
											{
												action.label
											}
										</div>
									</button>
								))}
							</div>
						</Card>
					</div>
				</div>
			</div>

			<CreateRequest
				isModalOpen={isCreateRequestModalOpen}
				setIsModalOpen={setIsCreateRequestModalOpen}
				createRequest={async (input) => {
					const newRequest = await createRequest(input);
					if (!newRequest?.id)
						throw new Error(
							"Request creation failed: no ID returned"
						);
					navigate(`/dispatch/requests/${newRequest.id}`);
					return newRequest.id;
				}}
			/>

			<CreateJob
				isModalOpen={isCreateJobModalOpen}
				setIsModalOpen={setIsCreateJobModalOpen}
				createJob={async (input) => {
					const newJob = await createJob(input);
					if (!newJob?.id)
						throw new Error(
							"Job creation failed: no ID returned"
						);
					navigate(`/dispatch/jobs/${newJob.id}`);
					return newJob.id;
				}}
			/>

			<CreateQuote
				isModalOpen={isCreateQuoteModalOpen}
				setIsModalOpen={setIsCreateQuoteModalOpen}
				createQuote={async (input) => {
					const newQuote = await createQuote(input);
					if (!newQuote?.id)
						throw new Error(
							"Quote creation failed: no ID returned"
						);
					navigate(`/dispatch/quotes/${newQuote.id}`);
					return newQuote.id;
				}}
			/>

			<CreateRecurringPlan
				isModalOpen={isCreatePlanModalOpen}
				setIsModalOpen={setIsCreatePlanModalOpen}
			/>
		</div>
	);
}
