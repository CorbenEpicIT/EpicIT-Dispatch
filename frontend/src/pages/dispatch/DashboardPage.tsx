import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
	AlertCircle,
	ChevronRight,
	ChevronDown,
	Briefcase,
	FileText,
	Clock,
	Plus,
} from "lucide-react";
import Card from "../../components/ui/Card";
import WeekStrip from "../../components/ui/schedule/WeekStrip";
import { useAuthStore } from "../../auth/authStore";
import { FALLBACK_TIMEZONE } from "../../util/util";
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
import ActivityFeed from "../../components/dashboard/ActivityFeed";

export default function DashboardPage() {
	const navigate = useNavigate();
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const [isCreateRequestModalOpen, setIsCreateRequestModalOpen] = useState(false);
	const [isCreateQuoteModalOpen, setIsCreateQuoteModalOpen] = useState(false);
	const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
	const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);
	const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
	const actionMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
				setIsActionMenuOpen(false);
			}
		}
		if (isActionMenuOpen) document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isActionMenuOpen]);

	const { mutateAsync: createRequest } = useCreateRequestMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const { mutateAsync: createQuote } = useCreateQuoteMutation();

	const { data: jobs = [], error: jobsError } = useAllJobsQuery();
	const { data: requests = [] } = useAllRequestsQuery();
	const { data: quotes = [] } = useAllQuotesQuery();
	const { data: recurringPlans = [] } = useAllRecurringPlansQuery();
	const { data: allTechnicians = [], error: techsError } = useAllTechniciansQuery();

	const technicianStats = useMemo(() => ({
		total: allTechnicians.length,
		online: allTechnicians.filter((t) => t.status !== "Offline").length,
	}), [allTechnicians]);

	const pipelineCounts = useMemo(
		() => ({
			newRequests: requests.filter((r) => r.status === "New").length,
			reviewing: requests.filter((r) => r.status === "Reviewing").length,
			pendingApproval: quotes.filter(
				(q) => q.status === "Sent" || q.status === "Viewed"
			).length,
			approved: quotes.filter((q) => q.status === "Approved").length,
			unscheduled: jobs.filter((j) => j.status === "Unscheduled").length,
			inProgress: jobs
				.flatMap((j) => j.visits || [])
				.filter((v) => v.status === "InProgress").length,
			completedToday: jobs
				.flatMap((j) => j.visits || [])
				.filter(
					(v) =>
						v.status === "Completed" &&
						new Date(v.actual_end_at || "").toLocaleDateString("en-CA", { timeZone: tz }) ===
							new Date().toLocaleDateString("en-CA", { timeZone: tz })
				).length,
		}),
		[requests, quotes, jobs, tz]
	);

	const activeTechnicians = useMemo(() => {
		return allTechnicians
			.filter((t) => t.status !== "Offline")
			.map((tech) => {
				const allVisits = jobs.flatMap((j) => j.visits || []);
				const activeVisits = allVisits.filter(
					(v) =>
						["InProgress", "Driving", "OnSite", "Paused"].includes(v.status) &&
						v.visit_techs?.some((vt) => vt.tech_id === tech.id)
				) as JobVisit[];

				const upcomingVisits = allVisits
					.filter(
						(v) =>
							v.status === "Scheduled" &&
							v.visit_techs?.some((vt) => vt.tech_id === tech.id) &&
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
				};
			})
			.sort((a, b) => (a.currentVisit ? -1 : 1));
	}, [allTechnicians, jobs]);

	const getStatusBorderClass = (status: string) => {
		const classes: Record<string, string> = {
			Available: "border-emerald-500",
			Busy: "border-amber-500",
			Break: "border-primary",
			Offline: "border-zinc-600",
		};
		return classes[status] || "border-zinc-600";
	};

	const formatNextVisit = (visit: JobVisit): string => {
		const d = new Date(visit.scheduled_start_at);
		const isToday =
			d.toLocaleDateString("en-CA", { timeZone: tz }) ===
			new Date().toLocaleDateString("en-CA", { timeZone: tz });
		const time = d.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			timeZone: tz,
		});
		if (isToday) return time;
		const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
		return `${weekday} ${time}`;
	};

	const pipelineItems = useMemo(() => [
		{
			label: "New Requests",
			count: pipelineCounts.newRequests,
			topBorder: "border-primary",
			text: "text-blue-400",
			path: "/dispatch/requests?status=New",
		},
		{
			label: "Needs Quote",
			count: pipelineCounts.reviewing,
			topBorder: "border-amber-500",
			text: "text-amber-400",
			path: "/dispatch/requests?status=Reviewing",
		},
		{
			label: "Pending Approval",
			count: pipelineCounts.pendingApproval,
			topBorder: "border-purple-500",
			text: "text-purple-400",
			path: "/dispatch/quotes?status=Sent",
		},
		{
			label: "Approved Quotes",
			count: pipelineCounts.approved,
			topBorder: "border-emerald-500",
			text: "text-emerald-400",
			path: "/dispatch/quotes?status=Approved",
		},
		{
			label: "Unscheduled Jobs",
			count: pipelineCounts.unscheduled,
			topBorder: "border-orange-500",
			text: "text-orange-400",
			path: "/dispatch/jobs?status=Unscheduled",
		},
	], [pipelineCounts]);

	const activePlansCount = recurringPlans.filter((p) => p.status === "Active").length;
	const pausedPlansCount = recurringPlans.filter((p) => p.status === "Paused").length;

	return (
		<div className="min-h-0 bg-canvas text-text-primary w-full">
			<div className="w-full px-3 sm:px-5 lg:px-6">
				{/* Header */}
				<div className="mb-5 flex items-center justify-between gap-4">
					<div>
						<div className="flex items-baseline gap-2">
							<h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
								Dispatch Dashboard
							</h1>
							<span className="hidden sm:inline text-text-faint text-sm">·</span>
							<p className="hidden sm:block text-sm text-text-tertiary">
								{new Date().toLocaleDateString("en-US", {
									weekday: "long",
									month: "long",
									day: "numeric",
									timeZone: tz,
								})}
							</p>
						</div>
						{/* Situation bar */}
						<div className="flex items-center gap-2 mt-1.5 flex-wrap">
							<span className="text-xs text-text-muted">
								<span className="text-text-secondary font-medium">{technicianStats.online}</span>
								{" "}of {technicianStats.total} online
							</span>
							<span className="w-px h-3 bg-zinc-700" />
							<span className="text-xs text-text-muted">
								<span className="text-amber-400 font-medium">{pipelineCounts.inProgress}</span>
								{" "}in progress
							</span>
							<span className="w-px h-3 bg-zinc-700" />
							<span className="text-xs text-text-muted">
								<span className="text-orange-400 font-medium">{pipelineCounts.unscheduled}</span>
								{" "}unscheduled
							</span>
							<span className="w-px h-3 bg-zinc-700" />
							<span className="text-xs text-text-muted">
								<span className="text-emerald-400 font-medium">{pipelineCounts.completedToday}</span>
								{" "}done today
							</span>
						</div>
					</div>

					{/* Split action button */}
					<div className="relative shrink-0" ref={actionMenuRef}>
						<div className="flex h-10 rounded-md overflow-hidden">
							<button
								onClick={() => setIsCreateRequestModalOpen(true)}
								className="inline-flex items-center justify-center gap-1.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
							>
								<Plus size={14} strokeWidth={2.5} className="-mt-px" />
								New Request
							</button>
							<span className="w-px bg-blue-500" />
							<button
								onClick={() => setIsActionMenuOpen((o) => !o)}
								className="flex items-center px-2.5 bg-blue-600 hover:bg-blue-500 text-white transition-colors"
								aria-label="More actions"
							>
								<ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-150 ${isActionMenuOpen ? "rotate-180" : ""}`} />
							</button>
						</div>

						{isActionMenuOpen && (
							<div className="absolute top-full mt-1.5 right-0 min-w-[170px] bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl z-50 py-1">
								<button
									onClick={() => { setIsCreateQuoteModalOpen(true); setIsActionMenuOpen(false); }}
									className="flex items-center gap-2.5 px-3 py-2 text-sm text-purple-300 hover:text-purple-200 hover:bg-purple-500/10 transition-colors w-full text-left"
								>
									<FileText size={13} className="text-purple-400" />
									Create Quote
								</button>
								<button
									onClick={() => { setIsCreateJobModalOpen(true); setIsActionMenuOpen(false); }}
									className="flex items-center gap-2.5 px-3 py-2 text-sm text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors w-full text-left"
								>
									<Briefcase size={13} className="text-amber-400" />
									Create Job
								</button>
							</div>
						)}
					</div>
				</div>

				{/* Week Schedule Calendar */}
				<Card className="mb-5 !p-0">
					{jobsError ? (
						<div className="flex items-center justify-center h-full">
							<div className="flex items-center gap-2 p-4 bg-error/10 border border-error/20 rounded-lg">
								<AlertCircle size={16} className="text-error-text" />
								<p className="text-sm text-error-text">Failed to load calendar data</p>
							</div>
						</div>
					) : (
						<WeekStrip jobs={jobs} technicians={allTechnicians} />
					)}
				</Card>

				{/* Main Content Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
					{/* Left Column */}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0">
						{/* Operations Pipeline */}
						<Card title="Operations Pipeline">
							{/* 2-col stat grid for first 4 items */}
							<div className="grid grid-cols-2 gap-x-5 gap-y-4">
								{pipelineItems.slice(0, 4).map((item) => (
									<div
										key={item.label}
										onClick={() => navigate(item.path)}
										className={`cursor-pointer group border-t-2 ${item.topBorder} pt-2.5`}
									>
										<div className={`text-2xl font-bold tabular-nums ${item.text} group-hover:opacity-75 transition-opacity`}>
											{item.count}
										</div>
										<div className="text-[10px] uppercase tracking-wider text-text-muted mt-1 leading-tight">
											{item.label}
										</div>
									</div>
								))}
							</div>

							{/* Unscheduled — full-width, inline count + label */}
							<div
								onClick={() => navigate(pipelineItems[4].path)}
								className={`cursor-pointer group border-t-2 ${pipelineItems[4].topBorder} pt-2.5 mt-4 flex items-baseline gap-3`}
							>
								<div className={`text-2xl font-bold tabular-nums ${pipelineItems[4].text} group-hover:opacity-75 transition-opacity`}>
									{pipelineItems[4].count}
								</div>
								<div className="text-[10px] uppercase tracking-wider text-text-muted">
									{pipelineItems[4].label}
								</div>
							</div>

							{/* Recurring Plans — folded in below pipeline */}
							<div className="mt-4 pt-4 border-t border-border-subtle">
								<button
									onClick={(e) => {
										e.stopPropagation();
										navigate("/dispatch/jobs?view=templates");
									}}
									className="w-full flex items-center justify-between -mx-1 px-1 py-1 rounded hover:bg-surface/40 transition-colors group"
								>
									<span className="text-xs font-medium text-text-tertiary group-hover:text-text-primary transition-colors">
										Recurring Plans
									</span>
									<div className="flex items-center gap-2">
										<span className="text-xs text-text-muted">
											<span className="font-semibold text-text-secondary">{activePlansCount}</span> active
										</span>
										<span className="w-px h-3 bg-zinc-700" />
										<span className="text-xs text-text-muted">
											<span className="font-semibold text-text-secondary">{pausedPlansCount}</span> paused
										</span>
										<ChevronRight size={12} className="text-text-faint group-hover:text-text-tertiary transition-colors" />
									</div>
								</button>
							</div>
						</Card>

						<LowStockWidget />
					</div>

					{/* Center Column */}
					<div className="min-w-0">
						<ActivityFeed />
					</div>

					{/* Right Column */}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0">
						{/* Technicians — compact tile grid */}
						<Card
							title="Technicians"
							headerAction={
								<div className="flex items-center gap-2">
									<span className="text-xs text-text-muted hidden xl:inline">
										{technicianStats.online} of {technicianStats.total} online
									</span>
									<button
										onClick={() => navigate("/dispatch/technicians")}
										className="text-xs font-medium text-text-tertiary hover:text-white px-2 py-1 rounded hover:bg-surface transition-colors"
									>
										View All
									</button>
								</div>
							}
						>
							{techsError ? (
								<div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
									<AlertCircle size={14} className="text-error-text" />
									<p className="text-xs text-error-text">Failed to load technicians</p>
								</div>
							) : activeTechnicians.length === 0 ? (
								<div className="py-8 text-center">
									<div className="inline-flex items-center justify-center w-12 h-12 bg-surface rounded-full mb-3">
										<Clock size={20} className="text-text-muted" />
									</div>
									<p className="text-sm text-text-tertiary">No technicians online</p>
								</div>
							) : (
								<>
									<div
									className="grid gap-1.5"
									style={{ gridTemplateColumns: "repeat(auto-fill, minmax(4.5rem, 1fr))" }}
								>
										{activeTechnicians.slice(0, 9).map((tech) => (
											<div
												key={tech.id}
												onClick={() => navigate(`/dispatch/technicians/${tech.id}`)}
												className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface/40 cursor-pointer transition-colors group w-full max-w-[5rem] mx-auto"
											>
												<div className={`relative w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-white font-semibold text-sm border-b-[3px] ${getStatusBorderClass(tech.status)}`}>
													{tech.name.charAt(0).toUpperCase()}
													{tech.currentVisit && (
														<span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full border border-zinc-900" />
													)}
												</div>
												<div className="w-full text-center">
													<div className="text-[10px] font-medium text-text-secondary group-hover:text-text-primary truncate transition-colors leading-tight">
														{tech.name.split(" ")[0]}
													</div>
													<div className="text-[9px] leading-tight mt-0.5 truncate">
														{tech.currentVisit ? (
															<span className="text-amber-400">On Job</span>
														) : tech.nextVisit ? (
															<span className="text-text-muted">{formatNextVisit(tech.nextVisit)}</span>
														) : (
															<span className="text-text-faint">—</span>
														)}
													</div>
												</div>
											</div>
										))}
									</div>
									{activeTechnicians.length > 9 && (
										<div className="mt-3 pt-3 border-t border-border-subtle text-center">
											<button
												onClick={() => navigate("/dispatch/technicians")}
												className="text-xs text-text-tertiary hover:text-white font-medium transition-colors"
											>
												+{activeTechnicians.length - 9} more
											</button>
										</div>
									)}
								</>
							)}
						</Card>

								</div>
				</div>
			</div>

			<CreateRequest
				isModalOpen={isCreateRequestModalOpen}
				setIsModalOpen={setIsCreateRequestModalOpen}
				createRequest={async (input) => {
					const newRequest = await createRequest(input);
					if (!newRequest?.id) throw new Error("Request creation failed: no ID returned");
					navigate(`/dispatch/requests/${newRequest.id}`);
					return newRequest.id;
				}}
			/>

			<CreateJob
				isModalOpen={isCreateJobModalOpen}
				setIsModalOpen={setIsCreateJobModalOpen}
				createJob={async (input) => {
					const newJob = await createJob(input);
					if (!newJob?.id) throw new Error("Job creation failed: no ID returned");
					navigate(`/dispatch/jobs/${newJob.id}`);
					return newJob.id;
				}}
			/>

			<CreateQuote
				isModalOpen={isCreateQuoteModalOpen}
				setIsModalOpen={setIsCreateQuoteModalOpen}
				createQuote={async (input) => {
					const newQuote = await createQuote(input);
					if (!newQuote?.id) throw new Error("Quote creation failed: no ID returned");
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
