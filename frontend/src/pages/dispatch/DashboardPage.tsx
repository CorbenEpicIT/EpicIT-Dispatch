import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
	Users,
	Clock,
	MapPin,
	CheckCircle2,
	AlertCircle,
	Calendar,
	TrendingUp,
	Activity,
	ChevronRight,
	ArrowUpRight,
	Briefcase,
	FileText,
	Phone,
	DollarSign,
	Timer,
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

	// Memoized calculations for performance
	const stats = useMemo(() => {
		const today = new Date();
		const todayVisits = jobs
			.flatMap((j) => j.visits || [])
			.filter((v) => {
				const visitDate = new Date(v.scheduled_start_at);
				return visitDate.toDateString() === today.toDateString();
			});

		const completedToday = todayVisits.filter((v) => v.status === "Completed").length;
		const totalToday = todayVisits.length;

		return {
			totalRevenue: jobs.reduce(
				(sum, j) => sum + (Number(j.actual_total) || 0),
				0
			),
			weeklyGrowth: 12.5,
			completionRate: totalToday > 0 ? (completedToday / totalToday) * 100 : 0,
			avgResponseTime: 2.4,
		};
	}, [jobs]);

	const technicianStats = useMemo(() => {
		const online = allTechnicians.filter(
			(t) => t.status === "Available" || t.status === "Busy"
		);
		const available = allTechnicians.filter((t) => t.status === "Available").length;
		const busy = allTechnicians.filter((t) => t.status === "Busy").length;
		const onBreak = allTechnicians.filter((t) => t.status === "Break").length;

		return {
			total: allTechnicians.length,
			online: online.length,
			available,
			busy,
			onBreak,
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

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
			{/* Header Section - Simple Title */}
			<div className="mb-6">
				<h1 className="text-2xl font-bold text-white tracking-tight">
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

			{/* Week Schedule Calendar - TOP OF PAGE */}
			<Card className="mb-6 !p-0">
				<div className="p-4 h-[300px]">
					{jobsError ? (
						<div className="flex items-center justify-center h-full">
							<div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
								<AlertCircle
									size={16}
									className="text-red-400"
								/>
								<p className="text-sm text-red-400">
									Failed to load calendar data
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

			{/* KPI Cards - With titles in header */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<Card
					title="Total Revenue - todo"
					headerAction={
						<div className="flex items-center gap-2">
							<div className="p-1.5 bg-emerald-500/10 rounded-md">
								<DollarSign
									size={16}
									className="text-emerald-400"
								/>
							</div>
							<span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
								<ArrowUpRight size={12} />+
								{stats.weeklyGrowth}%
							</span>
						</div>
					}
				>
					<div className="text-2xl font-bold text-white">
						${stats.totalRevenue.toLocaleString()}
					</div>
					<div className="text-xs text-zinc-500 font-medium uppercase tracking-wide mt-1">
						All time revenue
					</div>
				</Card>

				<Card
					title="Completed Today"
					headerAction={
						<div className="flex items-center gap-2">
							<div className="p-1.5 bg-blue-500/10 rounded-md">
								<CheckCircle2
									size={16}
									className="text-blue-400"
								/>
							</div>
							<span
								className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
									stats.completionRate >= 90
										? "text-emerald-400 bg-emerald-400/10"
										: "text-amber-400 bg-amber-400/10"
								}`}
							>
								{stats.completionRate.toFixed(0)}%
							</span>
						</div>
					}
				>
					<div className="text-2xl font-bold text-white">
						{pipelineCounts.completedToday}
					</div>
					<div className="text-xs text-zinc-500 font-medium uppercase tracking-wide mt-1">
						Visits completed
					</div>
				</Card>

				<Card
					title="Technicians Online"
					headerAction={
						<div className="flex items-center gap-2">
							<div className="p-1.5 bg-amber-500/10 rounded-md">
								<Activity
									size={16}
									className="text-amber-400"
								/>
							</div>
							<span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2 py-1 rounded-full">
								{pipelineCounts.inProgress} active
							</span>
						</div>
					}
				>
					<div className="text-2xl font-bold text-white">
						{technicianStats.online}
					</div>
					<div className="mt-2 flex items-center gap-3 text-xs">
						<span className="flex items-center gap-1 text-emerald-400">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
							{technicianStats.available} available
						</span>
						<span className="flex items-center gap-1 text-amber-400">
							<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
							{technicianStats.busy} busy
						</span>
					</div>
				</Card>

				<Card
					title="Avg Response Time - todo"
					headerAction={
						<div className="p-1.5 bg-purple-500/10 rounded-md">
							<Timer
								size={16}
								className="text-purple-400"
							/>
						</div>
					}
				>
					<div className="text-2xl font-bold text-white">
						{stats.avgResponseTime}h
					</div>
					<div className="text-xs text-zinc-500 font-medium uppercase tracking-wide mt-1">
						From request to quote
					</div>
				</Card>
			</div>

			{/* Main Content Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Left Column - Operations Pipeline (lg:col-span-3) */}
				<div className="lg:col-span-3 space-y-6">
					{/* Workflow Pipeline */}
					<Card title="Operations Pipeline">
						<div className="space-y-1">
							{/* New Requests */}
							<div
								onClick={() =>
									navigate(
										"/dispatch/requests?status=New"
									)
								}
								className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
							>
								<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group-hover:border-blue-500/40 transition-colors">
									<Phone
										size={18}
										className="text-blue-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-0.5">
										<span className="text-sm font-medium text-zinc-200">
											New Requests
										</span>
										<span className="text-sm font-bold text-blue-400">
											{
												pipelineCounts.newRequests
											}
										</span>
									</div>
									<div className="w-full bg-zinc-800 rounded-full h-1.5">
										<div
											className="bg-blue-500 h-1.5 rounded-full"
											style={{
												width: `${Math.min(pipelineCounts.newRequests * 10, 100)}%`,
											}}
										/>
									</div>
								</div>
								<ChevronRight
									size={16}
									className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
								/>
							</div>

							{/* Needs Quote */}
							<div
								onClick={() =>
									navigate(
										"/dispatch/requests?status=Reviewing"
									)
								}
								className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
							>
								<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
									<FileText
										size={18}
										className="text-amber-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-0.5">
										<span className="text-sm font-medium text-zinc-200">
											Needs Quote
										</span>
										<span className="text-sm font-bold text-amber-400">
											{
												pipelineCounts.reviewing
											}
										</span>
									</div>
									<div className="w-full bg-zinc-800 rounded-full h-1.5">
										<div
											className="bg-amber-500 h-1.5 rounded-full"
											style={{
												width: `${Math.min(pipelineCounts.reviewing * 10, 100)}%`,
											}}
										/>
									</div>
								</div>
								<ChevronRight
									size={16}
									className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
								/>
							</div>

							{/* Pending Approval */}
							<div
								onClick={() =>
									navigate(
										"/dispatch/quotes?status=Sent"
									)
								}
								className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
							>
								<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:border-purple-500/40 transition-colors">
									<Clock
										size={18}
										className="text-purple-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-0.5">
										<span className="text-sm font-medium text-zinc-200">
											Pending
											Approval
										</span>
										<span className="text-sm font-bold text-purple-400">
											{
												pipelineCounts.pendingApproval
											}
										</span>
									</div>
									<div className="w-full bg-zinc-800 rounded-full h-1.5">
										<div
											className="bg-purple-500 h-1.5 rounded-full"
											style={{
												width: `${Math.min(pipelineCounts.pendingApproval * 10, 100)}%`,
											}}
										/>
									</div>
								</div>
								<ChevronRight
									size={16}
									className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
								/>
							</div>

							{/* Approved - Ready to Schedule */}
							<div
								onClick={() =>
									navigate(
										"/dispatch/quotes?status=Approved"
									)
								}
								className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
							>
								<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
									<CheckCircle2
										size={18}
										className="text-emerald-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-0.5">
										<span className="text-sm font-medium text-zinc-200">
											Approved
											Quotes
										</span>
										<span className="text-sm font-bold text-emerald-400">
											{
												pipelineCounts.approved
											}
										</span>
									</div>
									<div className="w-full bg-zinc-800 rounded-full h-1.5">
										<div
											className="bg-emerald-500 h-1.5 rounded-full"
											style={{
												width: `${Math.min(pipelineCounts.approved * 10, 100)}%`,
											}}
										/>
									</div>
								</div>
								<ChevronRight
									size={16}
									className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
								/>
							</div>

							{/* Unscheduled Jobs */}
							<div
								onClick={() =>
									navigate(
										"/dispatch/jobs?status=Unscheduled"
									)
								}
								className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
							>
								<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:border-orange-500/40 transition-colors">
									<Calendar
										size={18}
										className="text-orange-400"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-0.5">
										<span className="text-sm font-medium text-zinc-200">
											Unscheduled
										</span>
										<span className="text-sm font-bold text-orange-400">
											{
												pipelineCounts.unscheduled
											}
										</span>
									</div>
									<div className="w-full bg-zinc-800 rounded-full h-1.5">
										<div
											className="bg-orange-500 h-1.5 rounded-full"
											style={{
												width: `${Math.min(pipelineCounts.unscheduled * 10, 100)}%`,
											}}
										/>
									</div>
								</div>
								<ChevronRight
									size={16}
									className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0"
								/>
							</div>
						</div>
					</Card>

					{/* Recurring Plans Summary */}
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
				</div>

				{/* Center Column - Live Activity (lg:col-span-6) */}
				<div className="lg:col-span-6">
					<Card title="Live Activity Feed -todo" className="h-full">
						<div className="space-y-3">
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
											size={14}
											className={
												activity.color
											}
										/>
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm text-zinc-200 group-hover:text-white transition-colors">
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

				{/* Right Column - Field Force (lg:col-span-3) */}
				<div className="lg:col-span-3 space-y-6">
					{/* Technician Status */}
					<Card
						title="Field Force"
						headerAction={
							<button
								onClick={() =>
									navigate(
										"/dispatch/technicians"
									)
								}
								className="text-xs font-medium text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
							>
								View All
							</button>
						}
					>
						<div className="mb-4 pb-4 border-b border-zinc-800">
							<p className="text-xs text-zinc-500">
								{technicianStats.online} of{" "}
								{technicianStats.total} online
							</p>
						</div>

						{techsError ? (
							<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
								<AlertCircle
									size={14}
									className="text-red-400"
								/>
								<p className="text-xs text-red-400">
									Failed to load technicians
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
									No technicians online
								</p>
							</div>
						) : (
							<div className="space-y-3">
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
											className="group flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-800/30 cursor-pointer transition-all"
										>
											<div className="relative flex-shrink-0">
												<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-white font-semibold text-sm">
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
												<div className="flex items-center justify-between mb-0.5">
													<h4 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
														{
															tech.name
														}
													</h4>
													<span
														className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
															tech.status ===
															"Available"
																? "bg-emerald-500/10 text-emerald-400"
																: "bg-amber-500/10 text-amber-400"
														}`}
													>
														{tech.status ===
														"Available"
															? "Available"
															: "Busy"}
													</span>
												</div>
												<p className="text-xs text-zinc-500 truncate mb-2">
													{
														tech.title
													}
												</p>

												{tech.currentVisit ? (
													<div className="flex items-center gap-2 text-xs">
														<span className="flex items-center gap-1 text-amber-400">
															<Activity
																size={
																	12
																}
															/>
															On
															Job
														</span>
														<span className="text-zinc-600">
															•
														</span>
														<span className="text-zinc-400 truncate">
															{tech
																.currentVisit
																.job
																?.name ||
																"Unknown"}
														</span>
													</div>
												) : tech.nextVisit ? (
													<div className="flex items-center gap-2 text-xs">
														<span className="flex items-center gap-1 text-blue-400">
															<Clock
																size={
																	12
																}
															/>
															Next:{" "}
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
													<div className="flex items-center gap-1 text-xs text-emerald-400">
														<CheckCircle2
															size={
																12
															}
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

					{/* Quick Actions */}
					<Card title="Quick Actions">
						<div className="grid grid-cols-2 gap-2">
							<button
								onClick={() =>
									setIsCreateRequestModalOpen(
										true
									)
								}
								className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
							>
								<Phone
									size={16}
									className="text-blue-400 mb-2"
								/>
								<div className="text-xs font-medium text-zinc-200 group-hover:text-white">
									New Request
								</div>
							</button>
							<button
								onClick={() =>
									setIsCreateQuoteModalOpen(
										true
									)
								}
								className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
							>
								<FileText
									size={16}
									className="text-amber-400 mb-2"
								/>
								<div className="text-xs font-medium text-zinc-200 group-hover:text-white">
									Create Quote
								</div>
							</button>
							<button
								onClick={() =>
									setIsCreateJobModalOpen(
										true
									)
								}
								className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
							>
								<Briefcase
									size={16}
									className="text-emerald-400 mb-2"
								/>
								<div className="text-xs font-medium text-zinc-200 group-hover:text-white">
									Create Job
								</div>
							</button>
							<button
								onClick={() =>
									navigate(
										"/dispatch/schedule"
									)
								}
								className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
							>
								<Calendar
									size={16}
									className="text-purple-400 mb-2"
								/>
								<div className="text-xs font-medium text-zinc-200 group-hover:text-white">
									Schedule
								</div>
							</button>
						</div>
					</Card>
				</div>
			</div>

			{/* Modals for Quick Actions */}
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
