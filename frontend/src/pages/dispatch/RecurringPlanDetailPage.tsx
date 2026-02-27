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
import RecurringPlanNoteManager from "../../components/recurringPlans/RecurringPlanNoteManager";
import EditRecurringPlan from "../../components/recurringPlans/EditRecurringPlan";
import {
	RecurringPlanStatusColors,
	RecurringPlanStatusLabels,
	OccurrenceStatusColors,
	OccurrenceStatusLabels,
	formatRecurringSchedule,
	formatScheduleConstraints,
	calculateTemplateTotal,
	type RecurringPlanLineItem,
	type RecurringOccurrence,
	type OccurrenceStatus,
} from "../../types/recurringPlans";
import { PriorityColors } from "../../types/common";
import { formatCurrency } from "../../util/util";
import type { ClientContact } from "../../types/clients";

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

	// Close menu on outside click
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

	const { upcomingOccurrences, pastOccurrences } = useMemo(() => {
		if (!occurrences || occurrences.length === 0) {
			return {
				upcomingOccurrences: [],
				pastOccurrences: [],
				sortedOccurrences: [],
			};
		}

		// Sort once
		const sorted = [...occurrences].sort(
			(a, b) =>
				new Date(a.occurrence_start_at).getTime() -
				new Date(b.occurrence_start_at).getTime()
		);

		const now = new Date();

		// Split into upcoming and past in single pass
		const upcoming: RecurringOccurrence[] = [];
		const past: RecurringOccurrence[] = [];

		for (const occ of sorted) {
			const occDate = new Date(occ.occurrence_start_at);
			const isPast =
				occDate <= now ||
				occ.status === "completed" ||
				occ.status === "skipped" ||
				occ.status === "cancelled";

			if (isPast) {
				past.push(occ);
			} else if (occ.status === "planned" || occ.status === "generated") {
				upcoming.push(occ);
			}
		}

		return {
			upcomingOccurrences: upcoming,
			pastOccurrences: past.reverse(), // Most recent first
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

	const primaryContact = plan.client?.contacts?.find(
		(cc: ClientContact) => cc.is_primary
	)?.contact;

	const lineItems: RecurringPlanLineItem[] = plan.line_items || [];
	const hasLineItems = lineItems.length > 0;
	const templateTotal = calculateTemplateTotal(lineItems);

	const ITEMS_PER_PAGE = 10;
	const upcomingPaginatedOccurrences = upcomingOccurrences.slice(
		upcomingPage * ITEMS_PER_PAGE,
		(upcomingPage + 1) * ITEMS_PER_PAGE
	);
	const pastPaginatedOccurrences = pastOccurrences.slice(
		pastPage * ITEMS_PER_PAGE,
		(pastPage + 1) * ITEMS_PER_PAGE
	);
	const upcomingHasNext = (upcomingPage + 1) * ITEMS_PER_PAGE < upcomingOccurrences.length;
	const upcomingHasPrev = upcomingPage > 0;
	const pastHasNext = (pastPage + 1) * ITEMS_PER_PAGE < pastOccurrences.length;
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

	return (
		<div className="text-white space-y-6">
			{/* Title and Status with Actions Menu */}
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

					{/* Actions Menu */}
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
											<div className="border-t border-zinc-800 my-1"></div>
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

			{/* Plan Information (2/3) and Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Plan Information - 2/3 width */}
				<div className="lg:col-span-2">
					<Card title="Plan Information" className="h-full">
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

							{/* Schedule Information */}
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
						</div>
					</Card>
				</div>

				{/* Client Details - 1/3 width */}
				<div className="lg:col-span-1">
					<Card title="Client Details" className="h-full">
						<div className="space-y-4">
							<div>
								<h3 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
									<User size={14} />
									Client Name
								</h3>
								<p>
									{plan.client?.name ||
										"Unknown Client"}
								</p>
							</div>

							<div>
								<h3 className="text-zinc-400 text-sm mb-1">
									Address
								</h3>
								<p className="text-white text-sm break-words">
									{plan.client?.address ||
										"No address available"}
								</p>
							</div>

							{/* Primary Contact */}
							{primaryContact && (
								<div className="pt-4 border-t border-zinc-700">
									<div className="flex items-center justify-between mb-3">
										<h3 className="text-zinc-400 text-sm">
											Primary
											Contact
										</h3>
										{primaryContact.title && (
											<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
												{
													primaryContact.title
												}
											</span>
										)}
									</div>
									<div className="space-y-2">
										<p className="text-white font-medium">
											{
												primaryContact.name
											}
										</p>

										{primaryContact.email && (
											<div className="flex items-center gap-2 text-sm">
												<Mail
													size={
														14
													}
													className="text-zinc-400 flex-shrink-0"
												/>
												<span className="text-white truncate">
													{
														primaryContact.email
													}
												</span>
											</div>
										)}

										{primaryContact.phone && (
											<div className="flex items-center gap-2 text-sm">
												<Phone
													size={
														14
													}
													className="text-zinc-400 flex-shrink-0"
												/>
												<span className="text-white">
													{
														primaryContact.phone
													}
												</span>
											</div>
										)}
									</div>
								</div>
							)}

							<button
								onClick={() =>
									navigate(
										`/dispatch/clients/${plan.client_id}`
									)
								}
								className="w-full mt-4 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm font-medium transition-colors"
							>
								View Full Client Profile
							</button>
						</div>
					</Card>
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
						{/* Left Column - Line Items Table (2/3 width) */}
						<div className="lg:col-span-2">
							<h3 className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-4">
								Template Line Items
							</h3>

							<div className="space-y-1">
								{/* Table Header */}
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

								{/* Line Items */}
								{lineItems.map((item, index) => (
									<div
										key={
											item.id ||
											index
										}
										className="grid grid-cols-12 gap-2 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
									>
										{/* Description */}
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

										{/* Type Badge */}
										<div className="col-span-1 flex items-center justify-center">
											{item.item_type && (
												<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300 border border-zinc-600">
													{
														item.item_type
													}
												</span>
											)}
										</div>

										{/* Quantity */}
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

										{/* Unit Price */}
										<div className="col-span-2 text-right text-sm text-white tabular-nums flex items-center justify-end">
											{formatCurrency(
												Number(
													item.unit_price
												)
											)}
										</div>

										{/* Amount */}
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

						{/* Right Column - Template Total (1/3 width) */}
						<div className="lg:col-span-1 space-y-6">
							{/* Metadata */}
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

							{/* Template Total */}
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

							{/* Info Box */}
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

			{/* OPTIMIZED: Compact Occurrence Cards in Grid Layout */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Upcoming Occurrences */}
				<Card
					title="Upcoming Occurrences"
					headerAction={
						upcomingOccurrences.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-400">
									{upcomingPage *
										ITEMS_PER_PAGE +
										1}
									-
									{Math.min(
										(upcomingPage + 1) *
											ITEMS_PER_PAGE,
										upcomingOccurrences.length
									)}{" "}
									of{" "}
									{upcomingOccurrences.length}
								</span>
								<button
									onClick={() =>
										setUpcomingPage(
											Math.max(
												0,
												upcomingPage -
													1
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
										setUpcomingPage(
											upcomingPage +
												1
										)
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
								Generate occurrences to schedule
								future visits.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
							{upcomingPaginatedOccurrences.map(
								(occurrence) => (
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
												] ||
													occurrence.status}
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
													<Plus
														size={
															12
														}
													/>
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
								)
							)}
						</div>
					)}
				</Card>

				{/* Past Occurrences */}
				<Card
					title="Past Occurrences"
					headerAction={
						pastOccurrences.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-400">
									{pastPage * ITEMS_PER_PAGE +
										1}
									-
									{Math.min(
										(pastPage + 1) *
											ITEMS_PER_PAGE,
										pastOccurrences.length
									)}{" "}
									of {pastOccurrences.length}
								</span>
								<button
									onClick={() =>
										setPastPage(
											Math.max(
												0,
												pastPage -
													1
											)
										)
									}
									disabled={!pastHasPrev}
									className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<ChevronLeft size={16} />
								</button>
								<button
									onClick={() =>
										setPastPage(
											pastPage + 1
										)
									}
									disabled={!pastHasNext}
									className="p-1 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<ChevronRight size={16} />
								</button>
							</div>
						)
					}
				>
					{pastOccurrences.length === 0 ? (
						<div className="text-center py-8">
							<Clock
								size={40}
								className="mx-auto text-zinc-600 mb-3"
							/>
							<h3 className="text-zinc-400 text-sm font-medium mb-1">
								No Past Occurrences
							</h3>
							<p className="text-zinc-500 text-xs">
								Completed occurrences will appear
								here.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
							{pastPaginatedOccurrences.map(
								(occurrence) => (
									<div
										key={occurrence.id}
										className="p-2 bg-zinc-800 border border-zinc-700 rounded-md opacity-75 hover:opacity-100 transition-opacity"
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
												] ||
													occurrence.status}
											</span>
										</div>

										<div className="flex gap-1 mt-2">
											{occurrence.job_visit_id && (
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
								)
							)}
						</div>
					)}
				</Card>
			</div>

			{/* Plan Notes - Using RecurringPlanNoteManager Component */}
			{jobContainerId && <RecurringPlanNoteManager jobId={jobContainerId} />}

			{/* Edit Modal */}
			{plan && (
				<EditRecurringPlan
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					plan={plan}
				/>
			)}

			{/* Generate Occurrences Modal */}
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
