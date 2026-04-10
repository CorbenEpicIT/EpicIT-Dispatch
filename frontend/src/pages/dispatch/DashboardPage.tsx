import React, { useState, useMemo } from "react";
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
	ReceiptText,
	XCircle,
	RefreshCw,
	Repeat,
	User,
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
import { useRecentActivityQuery } from "../../hooks/useLogs";
import type { ActivityLog } from "../../types/logs";
import type { JobVisit } from "../../types/jobs";
import CreateRequest from "../../components/requests/CreateRequest";
import CreateJob from "../../components/jobs/CreateJob";
import CreateQuote from "../../components/quotes/CreateQuote";
import CreateRecurringPlan from "../../components/recurringPlans/CreateRecurringPlan";
import LowStockWidget from "../../components/dashboard/LowStockWidget";

const FEED_FILTERS = [
	{ key: "requests",  icon: Phone,       color: "text-orange-400", bg: "bg-orange-500/10",  eventTypes: ["request.created"] },
	{ key: "jobs",      icon: Briefcase,   color: "text-amber-400",  bg: "bg-amber-500/10",   eventTypes: ["job.created", "job_visit.created", "job_visit.updated", "job_visit.technicians_assigned"] },
	{ key: "quotes",    icon: FileText,    color: "text-blue-400",   bg: "bg-blue-500/10",    eventTypes: ["quote.created", "quote.updated"] },
	{ key: "recurring", icon: Repeat,      color: "text-indigo-400", bg: "bg-indigo-500/10",  eventTypes: ["recurring_plan.created", "recurring_occurrence.generated"] },
	{ key: "invoices",  icon: ReceiptText, color: "text-green-400",  bg: "bg-green-500/10",   eventTypes: ["invoice.created", "invoice.updated", "invoice_payment.created"] },
] as const;

export default function DashboardPage() {
	const navigate = useNavigate();
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const [isCreateRequestModalOpen, setIsCreateRequestModalOpen] = useState(false);
	const [isCreateQuoteModalOpen, setIsCreateQuoteModalOpen] = useState(false);
	const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
	const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);

	const [refreshSpinning, setRefreshSpinning] = useState(false);
	const handleRefresh = () => {
		refetchActivity();
		setRefreshSpinning(true);
		setTimeout(() => setRefreshSpinning(false), 600);
	};

	const [activeFilters, setActiveFilters] = useState<Set<string>>(
		() => new Set(FEED_FILTERS.map((f) => f.key))
	);
	const toggleFilter = (key: string) => {
		setActiveFilters((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};
	const activeEventTypes = useMemo<Set<string>>(
		() => new Set(FEED_FILTERS.filter((f) => activeFilters.has(f.key)).flatMap((f) => [...f.eventTypes])),
		[activeFilters]
	);

	const { mutateAsync: createRequest } = useCreateRequestMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const { mutateAsync: createQuote } = useCreateQuoteMutation();

	const { data: jobs = [], error: jobsError } = useAllJobsQuery();
	const { data: requests = [] } = useAllRequestsQuery();
	const { data: quotes = [] } = useAllQuotesQuery();
	const { data: recurringPlans = [] } = useAllRecurringPlansQuery();
	const {
		data: activityLogs,
		isLoading: activityLoading,
		isError: activityError,
		refetch: refetchActivity,
	} = useRecentActivityQuery(30);
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
								new Date(v.scheduled_start_at).toLocaleDateString("en-CA", { timeZone: tz }) ===
								new Date().toLocaleDateString("en-CA", { timeZone: tz })
						).length,
				};
			})
			.sort((a, b) => (a.currentVisit ? -1 : 1));
	}, [allTechnicians, jobs, tz]);

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

	const timeAgo = (iso: string): string => {
		const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
		if (diff < 15) return "just now";
		if (diff < 60) return `${diff}s ago`;
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	};

	type FeedEntry = { message: string; icon: React.ElementType; color: string; bg: string };

	const formatCurrency = (val: unknown): string | null => {
		const n = parseFloat(String(val));
		if (isNaN(n)) return null;
		return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
	};

	const formatShortDate = (val: unknown): string | null => {
		if (!val) return null;
		const d = new Date(String(val));
		if (isNaN(d.getTime())) return null;
		return d.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZone: tz,
		});
	};

	const formatActivity = (log: ActivityLog): FeedEntry | null => {
		const changes = log.changes as Record<
			string,
			{ old: unknown; new: unknown }
		> | null;
		const newStatus = changes?.status?.new as string | undefined;
		const entityName = changes?.name?.new as string | undefined;

		switch (log.event_type) {
			case "job.created": {
				const jobNum = changes?.job_number?.new as string | undefined;
				const jobName = changes?.name?.new as string | undefined;
				const base = `New job${jobNum ? ` ${jobNum}` : ""} created`;
				return {
					message: jobName ? `${base} — ${jobName}` : base,
					icon: Briefcase,
					color: "text-amber-400",
					bg: "bg-amber-500/10",
				};
			}
			case "job_visit.created": {
				const jobNum = changes?._job_number?.new as string | undefined;
				const visitName = changes?.name?.new as string | undefined;
				const dateStr = formatShortDate(changes?.scheduled_start_at?.new);
				const namePart = visitName ? `Visit '${visitName}'` : "Visit";
				const jobPart = jobNum ? ` on ${jobNum}` : "";
				const datePart = dateStr ? ` — ${dateStr}` : "";
				return {
					message: `${namePart} scheduled${jobPart}${datePart}`,
					icon: Calendar,
					color: "text-blue-400",
					bg: "bg-blue-500/10",
				};
			}
			case "job_visit.updated": {
				const jobNum = changes?._job_number?.new as string | undefined;
				const suffix = jobNum ? ` on ${jobNum}` : "";
				if (!newStatus) {
					const rescheduledDate = formatShortDate(
						changes?.scheduled_start_at?.new
					);
					if (rescheduledDate)
						return {
							message: `Visit${suffix} rescheduled to ${rescheduledDate}`,
							icon: Calendar,
							color: "text-blue-400",
							bg: "bg-blue-500/10",
						};
					return null;
				}
				if (newStatus === "Completed")
					return {
						message: `Visit${suffix} marked complete`,
						icon: CheckCircle2,
						color: "text-emerald-400",
						bg: "bg-emerald-500/10",
					};
				if (newStatus === "InProgress")
					return {
						message: `Visit${suffix} now in progress`,
						icon: Activity,
						color: "text-amber-400",
						bg: "bg-amber-500/10",
					};
				if (newStatus === "OnSite")
					return {
						message: `Technician on site${suffix}`,
						icon: MapPin,
						color: "text-purple-400",
						bg: "bg-purple-500/10",
					};
				if (newStatus === "Driving")
					return {
						message: `Technician en route${suffix}`,
						icon: MapPin,
						color: "text-cyan-400",
						bg: "bg-cyan-500/10",
					};
				if (newStatus === "Cancelled")
					return {
						message: `Visit${suffix} cancelled`,
						icon: XCircle,
						color: "text-red-400",
						bg: "bg-red-500/10",
					};
				return null;
			}
			case "job_visit.technicians_assigned": {
				const techsNew = changes?.technicians?.new;
				const rawTechs: unknown[] = Array.isArray(techsNew) ? techsNew : [];
				const isUUID = (s: unknown) =>
					typeof s === "string" &&
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
						s
					);
				const newTechs = rawTechs.filter(
					(t): t is string => typeof t === "string" && !isUUID(t)
				);
				let label: string;
				if (newTechs.length === 0) label = "Technician";
				else if (newTechs.length === 1) label = newTechs[0];
				else if (newTechs.length === 2)
					label = `${newTechs[0]} & ${newTechs[1]}`;
				else label = `${newTechs[0]} & ${newTechs.length - 1} others`;
				const jobNum = changes?._job_number?.new as string | undefined;
				return {
					message:
						label +
						" assigned to visit" +
						(jobNum ? ` on ${jobNum}` : ""),
					icon: User,
					color: "text-blue-400",
					bg: "bg-blue-500/10",
				};
			}
			case "request.created": {
				const title = changes?.title?.new as string | undefined;
				const priority = changes?.priority?.new as string | undefined;
				const hasPriority =
					priority && priority !== "None" && priority !== "Low";
				const base = hasPriority
					? `New ${priority} priority request`
					: "New request received";
				return {
					message: title ? `${base}: '${title}'` : base,
					icon: Phone,
					color: "text-orange-400",
					bg: "bg-orange-500/10",
				};
			}
			case "quote.created": {
				const qNum = changes?.quote_number?.new as string | undefined;
				const qTitle = changes?.title?.new as string | undefined;
				const qTotal = formatCurrency(changes?.total?.new);
				let msg = `Quote${qNum ? ` ${qNum}` : ""} created`;
				if (qTitle) msg += ` — ${qTitle}${qTotal ? ` (${qTotal})` : ""}`;
				else if (qTotal) msg += ` — ${qTotal}`;
				return {
					message: msg,
					icon: FileText,
					color: "text-blue-400",
					bg: "bg-blue-500/10",
				};
			}
			case "quote.updated": {
				if (!newStatus) return null;
				const qNum = changes?._quote_number?.new as string | undefined;
				const qSuffix = qNum ? ` ${qNum}` : "";
				if (newStatus === "Sent")
					return {
						message: `Quote${qSuffix} sent to client`,
						icon: FileText,
						color: "text-blue-400",
						bg: "bg-blue-500/10",
					};
				if (newStatus === "Approved")
					return {
						message: `Quote${qSuffix} approved`,
						icon: CheckCircle2,
						color: "text-emerald-400",
						bg: "bg-emerald-500/10",
					};
				if (newStatus === "Rejected")
					return {
						message: `Quote${qSuffix} rejected`,
						icon: XCircle,
						color: "text-red-400",
						bg: "bg-red-500/10",
					};
				return null;
			}
			case "invoice.created": {
				const invNum = changes?.invoice_number?.new as string | undefined;
				const invTotal = formatCurrency(changes?.total?.new);
				const base = `Invoice${invNum ? ` ${invNum}` : ""} created`;
				return {
					message: invTotal ? `${base} — ${invTotal}` : base,
					icon: ReceiptText,
					color: "text-green-400",
					bg: "bg-green-500/10",
				};
			}
			case "invoice.updated": {
				if (!newStatus) return null;
				const invNum = changes?._invoice_number?.new as string | undefined;
				const invSuffix = invNum ? ` ${invNum}` : "";
				if (newStatus === "Sent")
					return {
						message: `Invoice${invSuffix} sent to client`,
						icon: ReceiptText,
						color: "text-green-400",
						bg: "bg-green-500/10",
					};
				if (newStatus === "Void")
					return {
						message: `Invoice${invSuffix} voided`,
						icon: XCircle,
						color: "text-red-400",
						bg: "bg-red-500/10",
					};
				if (newStatus === "Paid")
					return {
						message: `Invoice${invSuffix} fully paid`,
						icon: CheckCircle2,
						color: "text-emerald-400",
						bg: "bg-emerald-500/10",
					};
				return null;
			}
			case "invoice_payment.created": {
				const invNum = changes?._invoice_number?.new as string | undefined;
				const amount = formatCurrency(changes?.amount?.new);
				const method = changes?.method?.new as string | undefined;
				let msg = amount
					? `Payment of ${amount} received`
					: "Payment received";
				if (invNum) msg += ` on ${invNum}`;
				if (method) msg += ` via ${method}`;
				return {
					message: msg,
					icon: CheckCircle2,
					color: "text-emerald-400",
					bg: "bg-emerald-500/10",
				};
			}
			case "recurring_occurrence.generated": {
				const count = changes?.generated_count?.new;
				const n = typeof count === "number" ? count : parseInt(String(count ?? ""), 10);
				const countStr = !isNaN(n) ? `${n} visit${n === 1 ? "" : "s"} generated` : "Visits generated";
				return { message: `${countStr} from recurring plan`, icon: Repeat, color: "text-indigo-400", bg: "bg-indigo-500/10" };
			}
			case "recurring_plan.created":
				return {
					message: `Recurring plan created${entityName ? ` — ${entityName}` : ""}`,
					icon: Repeat,
					color: "text-blue-400",
					bg: "bg-blue-500/10",
				};
			default:
				return null;
		}
	};

	const resolveRoute = (log: ActivityLog): string | null => {
		const ch = log.changes;
		const id = log.entity_id;
		switch (log.event_type) {
			case "job.created":
				return `/dispatch/jobs/${id}`;
			case "job_visit.created":
			case "job_visit.updated":
			case "job_visit.technicians_assigned":
			case "job_visit.generated_from_occurrence": {
				const jobId = (ch?.job_id?.new ?? ch?._job_id?.new) as
					| string
					| undefined;
				return jobId
					? `/dispatch/jobs/${jobId}/visits/${id}`
					: `/dispatch/jobs`;
			}
			case "request.created":
				return `/dispatch/requests/${id}`;
			case "quote.created":
			case "quote.updated":
				return `/dispatch/quotes/${id}`;
			case "invoice.created":
			case "invoice.updated":
				return `/dispatch/invoices/${id}`;
			case "invoice_payment.created": {
				const invoiceId = ch?.invoice_id?.new as string | undefined;
				return invoiceId ? `/dispatch/invoices/${invoiceId}` : null;
			}
			case "recurring_plan.created":
			case "recurring_occurrence.generated":
				return `/dispatch/recurring-plans/${id}`;
			default:
				return null;
		}
	};

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
							timeZone: tz,
						})}
					</p>
				</div>

				{/* Week Schedule Calendar */}
				<Card className="mb-5 !p-0">
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
						<WeekStrip
							jobs={jobs}
							technicians={allTechnicians}
						/>
					)}
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
							title="Live Activity Feed"
							className="h-full"
							headerAction={
								<div className="flex items-center gap-1">
									{FEED_FILTERS.map((f) => {
										const active = activeFilters.has(f.key);
										const Icon = f.icon;
										return (
											<button
												key={f.key}
												onClick={() => toggleFilter(f.key)}
												title={f.key.charAt(0).toUpperCase() + f.key.slice(1)}
												className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
													active
														? `${f.bg} ${f.color}`
														: "bg-transparent text-zinc-600 hover:text-zinc-400"
												}`}
											>
												<Icon size={13} />
											</button>
										);
									})}
									<div className="w-px h-4 bg-zinc-700" />
									<button
										onClick={handleRefresh}
										title="Refresh"
										className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
									>
										<RefreshCw size={12} className={refreshSpinning ? "animate-spin" : ""} />
									</button>
								</div>
							}
						>
							<style>{`
							.activity-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; transition: scrollbar-color 0.2s ease; }
							.activity-scroll:hover { scrollbar-color: #52525b #27272a; }
							.activity-scroll::-webkit-scrollbar { width: 6px; }
							.activity-scroll::-webkit-scrollbar-track { background: transparent; }
							.activity-scroll:hover::-webkit-scrollbar-track { background: #27272a; border-radius: 3px; }
							.activity-scroll::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 3px; }
							.activity-scroll:hover::-webkit-scrollbar-thumb { background-color: #52525b; }
							.activity-scroll::-webkit-scrollbar-thumb:hover { background-color: #71717a; }
						`}</style>
							{activityLoading ? (
								<div className="space-y-1">
									{Array.from({ length: 6 }).map((_, i) => (
										<div key={i} className="flex items-start gap-3 p-3">
											<div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800/70 animate-pulse" />
											<div className="flex-1 space-y-2 pt-0.5">
												<div className="h-3.5 bg-zinc-800/70 rounded animate-pulse" style={{ width: `${55 + (i % 4) * 10}%` }} />
												<div className="h-2.5 bg-zinc-800/50 rounded animate-pulse w-14" />
											</div>
										</div>
									))}
								</div>
							) : activityError ? (
								<div className="flex flex-col items-center justify-center py-10 gap-2">
									<AlertCircle size={20} className="text-red-400/60" />
									<p className="text-sm text-red-400">Failed to load activity</p>
								</div>
							) : !activityLogs?.length ? (
								<div className="flex flex-col items-center justify-center py-10 gap-2">
									<Activity size={20} className="text-zinc-600" />
									<p className="text-sm text-zinc-500">No recent activity</p>
								</div>
							) : (
								<div className="space-y-0.5 overflow-y-auto max-h-[510px] activity-scroll">
									{(() => {
										const visibleEntries = activityLogs
											.filter((log) => activeEventTypes.has(log.event_type))
											.map((log) => ({ log, entry: formatActivity(log), route: resolveRoute(log) }))
											.filter(({ entry }) => entry !== null);

										if (visibleEntries.length === 0) {
											return (
												<div className="flex flex-col items-center justify-center py-10 gap-2">
													<Activity size={20} className="text-zinc-600" />
													<p className="text-sm text-zinc-500">No matching activity</p>
												</div>
											);
										}

										return visibleEntries.map(({ log, entry, route }) => {
											const Icon = entry!.icon;
											const showActor = log.actor_name && log.actor_type !== "system";
											return (
												<div
													key={log.id}
													onClick={route ? () => navigate(route) : undefined}
													className={`flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/40 transition-colors group${route ? " cursor-pointer" : ""}`}
												>
													<div className={`flex-shrink-0 w-8 h-8 rounded-lg ${entry!.bg} flex items-center justify-center`}>
														<Icon size={14} className={entry!.color} />
													</div>
													<div className="flex-1 min-w-0">
														<p className="text-sm text-zinc-200 group-hover:text-white transition-colors leading-snug truncate">
															{entry!.message}
														</p>
														<p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1 truncate">
															<span>{timeAgo(log.timestamp)}</span>
															{showActor && (
																<>
																	<span className="text-zinc-700">·</span>
																	<span className="text-zinc-500 truncate">{log.actor_name}</span>
																</>
															)}
														</p>
													</div>
													{route && (
														<ChevronRight size={13} className="flex-shrink-0 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
													)}
												</div>
											);
										});
									})()}
								</div>
							)}
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
																		timeZone: tz,
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
																		timeZone: tz,
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
																		timeZone: tz,
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
																		timeZone: tz,
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
