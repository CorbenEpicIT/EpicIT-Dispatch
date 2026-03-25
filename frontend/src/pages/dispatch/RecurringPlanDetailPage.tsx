import { useParams, useNavigate } from "react-router-dom";
import {
	ChevronLeft,
	Edit2,
	User,
	Calendar,
	MapPin,
	Clock,
	TrendingUp,
	Plus,
	Mail,
	Phone,
	DollarSign,
	Repeat,
	PlayCircle,
	PauseCircle,
	CheckCircle2,
	XCircle,
	RefreshCw,
	ExternalLink,
	MoreVertical,
	ChevronRight,
	Briefcase,
	ReceiptText,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import {
	useRecurringPlanByIdQuery,
	useOccurrencesByJobIdQuery,
	usePauseRecurringPlanMutation,
	useResumeRecurringPlanMutation,
	useCancelRecurringPlanMutation,
	useCompleteRecurringPlanMutation,
	useGenerateOccurrencesMutation,
	useGenerateVisitFromOccurrenceMutation,
} from "../../hooks/useRecurringPlans";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import RecurringPlanNoteManager from "../../components/recurringPlans/RecurringPlanNoteManager";
import EditRecurringPlan from "../../components/recurringPlans/EditRecurringPlan";
import {
	RecurringPlanStatusColors,
	RecurringPlanStatusLabels,
	OccurrenceStatusColors,
	OccurrenceStatusLabels,
	BillingModeLabels,
	InvoiceTimingLabels,
	InvoiceScheduleFrequencyLabels,
	InvoiceScheduleBillingBasisLabels,
	WeekdayLabels,
	formatRecurringSchedule,
	formatScheduleConstraints,
	calculateTemplateTotal,
	type RecurringPlanLineItem,
	type RecurringOccurrence,
	type OccurrenceStatus,
} from "../../types/recurringPlans";
import {
	JobStatusColors,
	VisitStatusColors,
	VisitStatusLabels,
	type JobStatus,
	type VisitStatus,
} from "../../types/jobs";
import { PriorityColors } from "../../types/common";
import { formatCurrency } from "../../util/util";

const ITEMS_PER_PAGE = 10;

function ordinalDay(n: number): string {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function RecurringPlanDetailPage() {
	const { recurringPlanId } = useParams<{ recurringPlanId: string }>();
	const navigate = useNavigate();

	const {
		data: plan,
		isLoading: planLoading,
		error: planError,
	} = useRecurringPlanByIdQuery(recurringPlanId || "");

	const jobContainerId = plan?.job_container?.id;

	const { data: occurrences = [], isLoading: occurrencesLoading } =
		useOccurrencesByJobIdQuery(jobContainerId || "");

	const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [daysAhead, setDaysAhead] = useState(30);
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [upcomingPage, setUpcomingPage] = useState(0);
	const [pastPage, setPastPage] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);

	const pauseMutation = usePauseRecurringPlanMutation();
	const resumeMutation = useResumeRecurringPlanMutation();
	const cancelMutation = useCancelRecurringPlanMutation();
	const completeMutation = useCompleteRecurringPlanMutation();
	const generateMutation = useGenerateOccurrencesMutation();
	const generateVisitMutation = useGenerateVisitFromOccurrenceMutation();

	useEffect(() => {
		const handleOutsideClick = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
			}
		};
		if (showActionsMenu) {
			document.addEventListener("mousedown", handleOutsideClick);
			return () => document.removeEventListener("mousedown", handleOutsideClick);
		}
	}, [showActionsMenu]);

	const { upcomingOccurrences, serviceHistory } = useMemo(() => {
		if (!occurrences || occurrences.length === 0) {
			return {
				upcomingOccurrences: [],
				serviceHistory: [],
				sortedOccurrences: [],
			};
		}

		const sorted = [...occurrences].sort(
			(a, b) =>
				new Date(a.occurrence_start_at).getTime() -
				new Date(b.occurrence_start_at).getTime()
		);

		const now = new Date();
		const upcoming: RecurringOccurrence[] = [];
		const history: RecurringOccurrence[] = [];

		for (const occ of sorted) {
			const occDate = new Date(occ.occurrence_start_at);
			const isPast =
				occDate <= now ||
				occ.status === "completed" ||
				occ.status === "skipped" ||
				occ.status === "cancelled";

			if (isPast) {
				// Only include occurrences that became actual visits
				if (occ.job_visit_id) {
					history.push(occ);
				}
			} else if (occ.status === "planned" || occ.status === "generated") {
				upcoming.push(occ);
			}
		}

		return {
			upcomingOccurrences: upcoming,
			serviceHistory: history.reverse(),
			sortedOccurrences: sorted,
		};
	}, [occurrences]);


	const isLoading = planLoading || occurrencesLoading;

	if (planError) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">
					Error loading recurring plan: {planError.message}
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Loading recurring plan...</div>
			</div>
		);
	}

	if (!plan) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Recurring plan not found</div>
			</div>
		);
	}

	const lineItems: RecurringPlanLineItem[] = plan.line_items || [];
	const hasLineItems = lineItems.length > 0;
	const templateTotal = calculateTemplateTotal(lineItems);

	const upcomingPaginatedOccurrences = upcomingOccurrences.slice(
		upcomingPage * ITEMS_PER_PAGE,
		(upcomingPage + 1) * ITEMS_PER_PAGE
	);
	const historyPaginatedOccurrences = serviceHistory.slice(
		pastPage * ITEMS_PER_PAGE,
		(pastPage + 1) * ITEMS_PER_PAGE
	);
	const upcomingHasNext = (upcomingPage + 1) * ITEMS_PER_PAGE < upcomingOccurrences.length;
	const upcomingHasPrev = upcomingPage > 0;
	const pastHasNext = (pastPage + 1) * ITEMS_PER_PAGE < serviceHistory.length;
	const pastHasPrev = pastPage > 0;

	const handlePause = async () => {
		if (!jobContainerId) return;
		try {
			await pauseMutation.mutateAsync(jobContainerId);
			setShowActionsMenu(false);
		} catch (error) {
			console.error("Failed to pause plan:", error);
		}
	};

	const handleResume = async () => {
		if (!jobContainerId) return;
		try {
			await resumeMutation.mutateAsync(jobContainerId);
			setShowActionsMenu(false);
		} catch (error) {
			console.error("Failed to resume plan:", error);
		}
	};

	const handleCancel = async () => {
		if (!jobContainerId) return;
		if (
			window.confirm(
				"Are you sure you want to cancel this recurring plan? All future planned occurrences will be cancelled."
			)
		) {
			try {
				await cancelMutation.mutateAsync(jobContainerId);
				setShowActionsMenu(false);
			} catch (error) {
				console.error("Failed to cancel plan:", error);
			}
		}
	};

	const handleComplete = async () => {
		if (!jobContainerId) return;
		if (
			window.confirm(
				"Are you sure you want to mark this recurring plan as completed?"
			)
		) {
			try {
				await completeMutation.mutateAsync(jobContainerId);
				setShowActionsMenu(false);
			} catch (error) {
				console.error("Failed to complete plan:", error);
			}
		}
	};

	const handleEdit = () => {
		setShowActionsMenu(false);
		setIsEditModalOpen(true);
	};

	const handleGenerateOccurrences = async () => {
		if (!jobContainerId) return;
		try {
			await generateMutation.mutateAsync({
				jobId: jobContainerId,
				input: { days_ahead: daysAhead },
			});
			setIsGenerateModalOpen(false);
			setShowActionsMenu(false);
		} catch (error) {
			console.error("Failed to generate occurrences:", error);
		}
	};

	const handleGenerateVisit = async (occurrenceId: string) => {
		if (!jobContainerId) return;
		try {
			const result = await generateVisitMutation.mutateAsync({
				occurrenceId: occurrenceId,
				jobId: jobContainerId,
			});
			navigate(`/dispatch/jobs/${jobContainerId}/visits/${result.visit_id}`);
		} catch (error) {
			console.error("Failed to generate visit:", error);
		}
	};

	const JobContainerCard = plan.job_container ? (
		<button
			onClick={() => navigate(`/dispatch/jobs/${plan.job_container!.id}`)}
			className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-all text-left group"
		>
			<div className="grid grid-cols-3 gap-4">
				<div className="col-span-2 flex flex-col gap-2">
					<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold">
						Job Container
					</p>
					<div className="flex items-center gap-3 min-w-0">
						<Briefcase
							size={16}
							className="text-zinc-400 flex-shrink-0"
						/>
						<div className="min-w-0">
							<p className="text-white font-semibold text-sm group-hover:text-blue-400 transition-colors">
								{plan.job_container.job_number}
							</p>
							{plan.job_container.name && (
								<p className="text-zinc-400 text-sm truncate">
									{plan.job_container.name}
								</p>
							)}
						</div>
					</div>
				</div>
				<div className="col-span-1 flex items-center justify-end gap-3">
					<span
						className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
							JobStatusColors[
								plan.job_container
									.status as JobStatus
							] ||
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{plan.job_container.status}
					</span>
					<ChevronRight
						size={16}
						className="text-zinc-400 group-hover:text-blue-400 group-hover:translate-x-1 transition-all flex-shrink-0"
					/>
				</div>
			</div>
		</button>
	) : null;

	const UpcomingOccurrencesCard = (
		<Card
			className="h-full"
			title="Upcoming Occurrences"
			headerAction={
				upcomingOccurrences.length > 0 && (
					<div className="flex items-center gap-2">
						<span className="text-sm text-zinc-400">
							{upcomingPage * ITEMS_PER_PAGE + 1}-
							{Math.min(
								(upcomingPage + 1) * ITEMS_PER_PAGE,
								upcomingOccurrences.length
							)}{" "}
							of {upcomingOccurrences.length}
						</span>
						<button
							onClick={() =>
								setUpcomingPage(
									Math.max(
										0,
										upcomingPage - 1
									)
								)
							}
							disabled={!upcomingHasPrev}
							className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ChevronLeft size={16} />
						</button>
						<button
							onClick={() =>
								setUpcomingPage(upcomingPage + 1)
							}
							disabled={!upcomingHasNext}
							className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				)
			}
		>
			{upcomingOccurrences.length === 0 ? (
				<div className="text-center py-8">
					<Calendar
						size={40}
						className="mx-auto text-zinc-600 mb-3"
					/>
					<h3 className="text-zinc-400 text-sm font-medium mb-1">
						No Upcoming Occurrences
					</h3>
					<p className="text-zinc-500 text-xs">
						Generate occurrences to schedule future visits.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
					{upcomingPaginatedOccurrences.map((occurrence) => (
						<div
							key={occurrence.id}
							className="p-2 bg-zinc-800 border border-zinc-700 rounded-md hover:border-zinc-600 transition-colors"
						>
							<div className="flex items-start justify-between gap-2 mb-1">
								<div className="flex-1 min-w-0">
									<p className="text-white text-xs font-medium truncate">
										{new Date(
											occurrence.occurrence_start_at
										).toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											}
										)}
									</p>
									<p className="text-zinc-400 text-xs">
										{new Date(
											occurrence.occurrence_start_at
										).toLocaleTimeString(
											"en-US",
											{
												hour: "numeric",
												minute: "2-digit",
											}
										)}
									</p>
								</div>
								<span
									className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${
										OccurrenceStatusColors[
											occurrence.status as OccurrenceStatus
										] ||
										"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
									}`}
								>
									{OccurrenceStatusLabels[
										occurrence.status as OccurrenceStatus
									] || occurrence.status}
								</span>
							</div>
							<div className="flex gap-1 mt-2">
								{occurrence.status ===
									"planned" && (
									<button
										onClick={() =>
											handleGenerateVisit(
												occurrence.id
											)
										}
										disabled={
											generateVisitMutation.isPending
										}
										className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors disabled:opacity-50"
									>
										<Plus size={12} />
										Create
									</button>
								)}
								{occurrence.status ===
									"generated" &&
									occurrence.job_visit_id && (
										<button
											onClick={() => {
												if (
													jobContainerId
												) {
													navigate(
														`/dispatch/jobs/${jobContainerId}/visits/${occurrence.job_visit_id}`
													);
												}
											}}
											className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-medium transition-colors"
										>
											<ExternalLink
												size={
													12
												}
											/>
											View
										</button>
									)}
							</div>
						</div>
					))}
				</div>
			)}
		</Card>
	);

	const ServiceHistoryCard = (
		<Card
			className="h-full"
			title="Service History"
			headerAction={
				serviceHistory.length > 0 && (
					<div className="flex items-center gap-2">
						<span className="text-sm text-zinc-400">
							{pastPage * ITEMS_PER_PAGE + 1}-
							{Math.min(
								(pastPage + 1) * ITEMS_PER_PAGE,
								serviceHistory.length
							)}{" "}
							of {serviceHistory.length}
						</span>
						<button
							onClick={() =>
								setPastPage(
									Math.max(0, pastPage - 1)
								)
							}
							disabled={!pastHasPrev}
							className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ChevronLeft size={16} />
						</button>
						<button
							onClick={() => setPastPage(pastPage + 1)}
							disabled={!pastHasNext}
							className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				)
			}
		>
			{serviceHistory.length === 0 ? (
				<div className="text-center py-8">
					<Clock size={40} className="mx-auto text-zinc-600 mb-3" />
					<h3 className="text-zinc-400 text-sm font-medium mb-1">
						No visits recorded yet
					</h3>
					<p className="text-zinc-500 text-xs">
						Past visits generated from this plan will appear here.
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
					{historyPaginatedOccurrences.map((occurrence) => {
						const visitDate = occurrence.job_visit?.scheduled_start_at
							? new Date(occurrence.job_visit.scheduled_start_at)
							: new Date(occurrence.occurrence_start_at);
						const visitStatus = occurrence.job_visit?.status as VisitStatus | undefined;
						return (
							<div
								key={occurrence.id}
								className="p-2 bg-zinc-800 border border-zinc-700 rounded-md opacity-75 hover:opacity-100 transition-opacity"
							>
								<div className="flex items-start justify-between gap-2 mb-1">
									<div className="flex-1 min-w-0">
										<p className="text-white text-xs font-medium truncate">
											{visitDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
											{" · "}
											{visitDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
										</p>
										<p className="text-zinc-400 text-xs truncate">
											{occurrence.job_visit?.name ?? "\u00A0"}
										</p>
									</div>
									{visitStatus && (
										<span
											className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${
												VisitStatusColors[visitStatus] ||
												"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
											}`}
										>
											{VisitStatusLabels[visitStatus] || visitStatus}
										</span>
									)}
								</div>
								<div className="flex gap-1 mt-2">
									<button
										onClick={() => {
											if (jobContainerId) {
												navigate(
													`/dispatch/jobs/${jobContainerId}/visits/${occurrence.job_visit_id}`
												);
											}
										}}
										className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-medium transition-colors"
									>
										<ExternalLink size={12} />
										View Visit
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</Card>
	);

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<Repeat size={24} className="text-blue-400" />
						<h1 className="text-3xl font-bold text-white">
							{plan.name}
						</h1>
					</div>
					{plan.job_container && (
						<p className="text-zinc-400 text-sm">
							{plan.job_container.job_number}
						</p>
					)}
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							RecurringPlanStatusColors[plan.status] ||
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{RecurringPlanStatusLabels[plan.status] ||
							plan.status}
					</span>

					<div className="relative" ref={menuRef}>
						<button
							data-testid="recurring-plan-actions-menu"
							onClick={() =>
								setShowActionsMenu(!showActionsMenu)
							}
							className="p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical size={20} />
						</button>

						{showActionsMenu && (
							<div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={handleEdit}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Edit2 size={16} />
										Edit Plan
									</button>

									{plan.status ===
										"Active" && (
										<>
											<button
												onClick={() => {
													setShowActionsMenu(
														false
													);
													setIsGenerateModalOpen(
														true
													);
												}}
												disabled={
													generateMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<RefreshCw
													size={
														16
													}
												/>
												Generate
												Occurrences
											</button>
											<button
												onClick={
													handlePause
												}
												disabled={
													pauseMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<PauseCircle
													size={
														16
													}
												/>
												Pause
												Plan
											</button>
										</>
									)}

									{plan.status ===
										"Paused" && (
										<button
											onClick={
												handleResume
											}
											disabled={
												resumeMutation.isPending
											}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
										>
											<PlayCircle
												size={
													16
												}
											/>
											Resume Plan
										</button>
									)}

									{(plan.status ===
										"Active" ||
										plan.status ===
											"Paused") && (
										<>
											<button
												onClick={
													handleComplete
												}
												disabled={
													completeMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<CheckCircle2
													size={
														16
													}
												/>
												Complete
												Plan
											</button>
											<div className="border-t border-zinc-800 my-1" />
											<button
												onClick={
													handleCancel
												}
												disabled={
													cancelMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-red-900/30 transition-colors flex items-center gap-2 text-red-400 disabled:opacity-50"
											>
												<XCircle
													size={
														16
													}
												/>
												Cancel
												Plan
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Plan Information (2/3) and Client Details + Job Container (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
				<div className="lg:col-span-2 flex flex-col">
					<Card title="Plan Information" className="flex-1">
						<div className="space-y-4">
							<div>
								<h3 className="text-zinc-400 text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words">
									{plan.description ||
										"No description provided"}
								</p>
							</div>

							<div>
								<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
									<MapPin size={14} />
									Address
								</h3>
								<p className="text-white break-words">
									{plan.address}
								</p>
							</div>

							<div className="pt-4 border-t border-zinc-700">
								<h3 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
									<Repeat size={14} />
									Schedule
								</h3>
								{plan.rules &&
									plan.rules.length > 0 && (
										<div className="space-y-2">
											<p className="text-white font-medium">
												{formatRecurringSchedule(
													plan
														.rules[0]
												)}
											</p>
											<p className="text-sm text-zinc-400">
												{formatScheduleConstraints(
													plan
														.rules[0]
												)}
											</p>
										</div>
									)}
							</div>

							<div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-700">
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<TrendingUp
											size={14}
										/>
										Priority
									</h3>
									<p
										className={`font-medium capitalize ${
											PriorityColors[
												plan
													.priority
											]
												?.replace(
													/bg-\S+/,
													""
												)
												.trim() ||
											"text-blue-400"
										}`}
									>
										{plan.priority ||
											"normal"}
									</p>
								</div>
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>
										Started
									</h3>
									<p className="text-white">
										{new Date(
											plan.starts_at
										).toLocaleDateString(
											"en-US",
											{
												year: "numeric",
												month: "short",
												day: "numeric",
											}
										)}
									</p>
								</div>
							</div>

							{plan.ends_at && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Ends
									</h3>
									<p className="text-white">
										{new Date(
											plan.ends_at
										).toLocaleDateString(
											"en-US",
											{
												year: "numeric",
												month: "short",
												day: "numeric",
											}
										)}
									</p>
								</div>
							)}

							{/* Invoicing */}
							<div className="pt-4 border-t border-zinc-700">
								<h3 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
									<ReceiptText size={14} />
									Invoicing
								</h3>
								{plan.billing_mode === "none" ? (
									<p className="text-white text-sm">
										{BillingModeLabels[plan.billing_mode]}
									</p>
								) : (
									<div className="grid grid-cols-3 gap-x-4 gap-y-3">
										{/* Row 1 */}
										<div>
											<p className="text-zinc-400 text-xs mb-0.5">Billing Mode</p>
											<p className="text-white text-sm">{BillingModeLabels[plan.billing_mode]}</p>
										</div>
										<div>
											<p className="text-zinc-400 text-xs mb-0.5">Trigger</p>
											<p className="text-white text-sm">{InvoiceTimingLabels[plan.invoice_timing]}</p>
										</div>
										<div>
											<p className="text-zinc-400 text-xs mb-0.5">Auto Invoice</p>
											<p className="text-white text-sm">{plan.auto_invoice ? "Yes" : "No"}</p>
										</div>

										{/* Row 2 */}
										{plan.invoice_schedule && (
											<>
												<div>
													<p className="text-zinc-400 text-xs mb-0.5">Frequency</p>
													<p className="text-white text-sm">{InvoiceScheduleFrequencyLabels[plan.invoice_schedule.frequency]}</p>
													{(plan.invoice_schedule.frequency === "weekly" || plan.invoice_schedule.frequency === "biweekly") &&
														plan.invoice_schedule.day_of_week && (
														<p className="text-zinc-400 text-xs mt-0.5">{WeekdayLabels[plan.invoice_schedule.day_of_week]}</p>
													)}
													{(plan.invoice_schedule.frequency === "monthly" || plan.invoice_schedule.frequency === "quarterly") &&
														plan.invoice_schedule.day_of_month != null && (
														<p className="text-zinc-400 text-xs mt-0.5">{ordinalDay(plan.invoice_schedule.day_of_month)} of {plan.invoice_schedule.frequency === "monthly" ? "month" : "quarter"}</p>
													)}
												</div>
												<div>
													<p className="text-zinc-400 text-xs mb-0.5">Billing Basis</p>
													<p className="text-white text-sm">{InvoiceScheduleBillingBasisLabels[plan.invoice_schedule.billing_basis]}</p>
													{plan.invoice_schedule.billing_basis === "fixed_amount" && plan.invoice_schedule.fixed_amount != null && (
														<p className="text-zinc-400 text-xs mt-0.5">{"$" + Number(plan.invoice_schedule.fixed_amount).toFixed(2)}</p>
													)}
												</div>
												<div>
													<p className="text-zinc-400 text-xs mb-0.5">Payment Terms</p>
													<p className="text-white text-sm">{plan.invoice_schedule.payment_terms_days != null ? "Net " + plan.invoice_schedule.payment_terms_days : "—"}</p>
												</div>
											</>
										)}
									</div>
								)}
							</div>
						</div>
					</Card>
				</div>

				<div className="lg:col-span-1 flex flex-col gap-6">
					<ClientDetailsCard
						client_id={plan.client_id}
						client={plan.client}
					/>
					{JobContainerCard}
				</div>
			</div>

			{/* Template Pricing - Full Width */}
			<Card title="Template Pricing">
				{!hasLineItems ? (
					<div className="text-center py-8">
						<DollarSign
							size={40}
							className="mx-auto text-zinc-600 mb-3"
						/>
						<h3 className="text-zinc-400 text-sm font-medium mb-1">
							No Line Items
						</h3>
						<p className="text-zinc-500 text-xs">
							Edit this recurring plan to add template
							line items.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						<div className="lg:col-span-2">
							<h3 className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-4">
								Template Line Items
							</h3>
							<div className="space-y-1">
								<div className="grid grid-cols-12 gap-2 pb-2 border-b border-zinc-700 text-xs uppercase tracking-wide font-semibold text-zinc-400">
									<div className="col-span-5">
										Description
									</div>
									<div className="col-span-1 text-center">
										Type
									</div>
									<div className="col-span-2 text-right">
										Qty
									</div>
									<div className="col-span-2 text-right">
										Unit Price
									</div>
									<div className="col-span-2 text-right">
										Amount
									</div>
								</div>

								{lineItems.map((item, index) => (
									<div
										key={
											item.id ||
											index
										}
										className="grid grid-cols-12 gap-2 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
									>
										<div className="col-span-5 text-sm">
											<p className="text-white font-medium">
												{
													item.name
												}
											</p>
											{item.description && (
												<p className="text-zinc-400 text-xs mt-0.5">
													{
														item.description
													}
												</p>
											)}
										</div>
										<div className="col-span-1 flex items-center justify-center">
											{item.item_type && (
												<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300 border border-zinc-600">
													{
														item.item_type
													}
												</span>
											)}
										</div>
										<div className="col-span-2 text-right text-sm text-white tabular-nums flex items-center justify-end">
											{Number(
												item.quantity
											).toLocaleString(
												"en-US",
												{
													minimumFractionDigits: 0,
													maximumFractionDigits: 2,
												}
											)}
										</div>
										<div className="col-span-2 text-right text-sm text-white tabular-nums flex items-center justify-end">
											{formatCurrency(
												Number(
													item.unit_price
												)
											)}
										</div>
										<div className="col-span-2 text-right text-sm text-white font-medium tabular-nums flex items-center justify-end">
											{formatCurrency(
												Number(
													item.quantity
												) *
													Number(
														item.unit_price
													)
											)}
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="lg:col-span-1 space-y-6">
							<div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-2">
								<div className="flex justify-between text-sm">
									<span className="text-zinc-400">
										Total Items:
									</span>
									<span className="text-white font-medium tabular-nums">
										{lineItems.length}
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-zinc-400">
										Billing Mode:
									</span>
									<span className="text-white font-medium capitalize">
										{plan.billing_mode.replace(
											"_",
											" "
										)}
									</span>
								</div>
							</div>

							<div className="flex items-center justify-between px-4 py-3 bg-blue-500/10 rounded-lg border-2 border-blue-500/30">
								<div>
									<p className="text-zinc-300 text-xs uppercase tracking-wide font-semibold mb-0.5">
										Template Total
									</p>
									<p className="text-xs text-blue-300">
										Per visit estimate
									</p>
								</div>
								<p className="text-2xl font-bold text-blue-400 tabular-nums">
									{formatCurrency(
										templateTotal
									)}
								</p>
							</div>

							<div className="px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
								<p className="text-xs text-zinc-400 italic">
									This template is applied to
									each generated visit. Actual
									costs may vary per visit.
								</p>
							</div>
						</div>
					</div>
				)}
			</Card>

			{/* Occurrences + Job Container */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
				{/* Left column: upcoming occurrences — stretches to match right column height */}
				<div className="flex flex-col">
					<div className="flex-1">{UpcomingOccurrencesCard}</div>
				</div>

				{/* Right column: service history */}
				<div className="flex flex-col">
					<div className="flex-1">{ServiceHistoryCard}</div>
				</div>
			</div>

			{jobContainerId && <RecurringPlanNoteManager jobId={jobContainerId} />}

			{plan && (
				<EditRecurringPlan
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					plan={plan}
				/>
			)}

			{isGenerateModalOpen && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full mx-4">
						<h2 className="text-xl font-bold text-white mb-4">
							Generate Occurrences
						</h2>
						<p className="text-zinc-400 text-sm mb-4">
							Generate future occurrences for this
							recurring plan.
						</p>
						<div className="mb-6">
							<label className="block text-sm font-medium text-zinc-300 mb-2">
								Days Ahead
							</label>
							<input
								type="number"
								min="1"
								max="365"
								value={daysAhead}
								onChange={(e) =>
									setDaysAhead(
										parseInt(
											e.target
												.value
										) || 30
									)
								}
								className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<p className="text-xs text-zinc-500 mt-1">
								Generate occurrences up to{" "}
								{daysAhead} days in the future
							</p>
						</div>
						<div className="flex gap-3">
							<button
								onClick={() =>
									setIsGenerateModalOpen(
										false
									)
								}
								className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm font-medium transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleGenerateOccurrences}
								disabled={
									generateMutation.isPending
								}
								className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
							>
								{generateMutation.isPending
									? "Generating..."
									: "Generate"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
