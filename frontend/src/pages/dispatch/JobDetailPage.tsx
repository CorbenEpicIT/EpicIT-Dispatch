import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Edit2,
	Calendar,
	MapPin,
	Clock,
	Users,
	TrendingUp,
	Map,
	Plus,
	FileText,
	DollarSign,
	ChevronRight,
	MoreVertical,
	Trash2,
	Repeat,
	Link2Off,
	Receipt,
} from "lucide-react";
import {
	useJobByIdQuery,
	useJobVisitsByJobIdQuery,
	useCreateJobVisitMutation,
	useDeleteJobMutation,
} from "../../hooks/useJobs";
import { useInvoicesByJobIdQuery } from "../../hooks/useInvoices";
import JobNoteManager from "../../components/jobs/JobNoteManager";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import EditJob from "../../components/jobs/EditJob";
import CreateJobVisit from "../../components/jobs/CreateJobVisit";
import CreateInvoice from "../../components/invoices/CreateInvoice";
import {
	JobStatusColors,
	VisitStatusColors,
	type VisitStatus,
	type JobLineItem,
} from "../../types/jobs";
import { RecurringPlanStatusColors, RecurringPlanStatusLabels } from "../../types/recurringPlans";
import { QuoteStatusColors } from "../../types/quotes";
import { RequestStatusColors } from "../../types/requests";
import { getGenericStatusColor, PriorityColors } from "../../types/common";
import { InvoiceStatusColors, InvoiceStatusLabels, type InvoiceStatus } from "../../types/invoices";
import { formatCurrency, formatDateTime, formatTime } from "../../util/util";

export default function JobDetailPage() {
	const { jobId } = useParams<{ jobId: string }>();
	const navigate = useNavigate();
	const { data: job, isLoading } = useJobByIdQuery(jobId!);
	const { data: visits = [] } = useJobVisitsByJobIdQuery(jobId!);
	const { data: linkedInvoices = [] } = useInvoicesByJobIdQuery(jobId!);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isCreateVisitModalOpen, setIsCreateVisitModalOpen] = useState(false);
	const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
	const { mutateAsync: createJobVisitMutation } = useCreateJobVisitMutation();

	const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const optionsMenuRef = useRef<HTMLDivElement>(null);

	const deleteJobMutation = useDeleteJobMutation();

	// Derive per-visit billed totals from job invoices for the 3-state billing badge.
	const visitBilledMap = useMemo(() => {
		const record: Record<string, number> = {};
		for (const inv of linkedInvoices) {
			if (inv.status === "Void" || inv.status === "Draft") continue;
			for (const iv of inv.visits ?? []) {
				record[iv.visit.id] = (record[iv.visit.id] ?? 0) + Number(iv.billed_amount ?? 0);
			}
		}
		return record;
	}, [linkedInvoices]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				optionsMenuRef.current &&
				!optionsMenuRef.current.contains(event.target as Node)
			) {
				setIsOptionsMenuOpen(false);
				setDeleteConfirm(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleDeleteJob = async () => {
		if (!jobId) return;
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			await deleteJobMutation.mutateAsync(jobId);
			setIsOptionsMenuOpen(false);
			navigate("/dispatch/jobs");
		} catch (error) {
			console.error("Failed to delete job:", error);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Loading job details...</div>
			</div>
		);
	}

	if (!job) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Job not found</div>
			</div>
		);
	}

	const sortedVisits = [...visits].sort(
		(a, b) =>
			new Date(a.scheduled_start_at).getTime() -
			new Date(b.scheduled_start_at).getTime()
	);

	const lineItems: JobLineItem[] = job.line_items || [];
	const hasLineItems = lineItems.length > 0;
	const recurringPlan = job.recurring_plan ?? null;

	const formatVisitTimeConstraints = (visit: (typeof visits)[0]): string => {
		const {
			arrival_constraint,
			finish_constraint,
			arrival_time,
			arrival_window_start,
			arrival_window_end,
			finish_time,
		} = visit;

		let arrivalStr = "";
		switch (arrival_constraint) {
			case "anytime":
				arrivalStr = "Anytime";
				break;
			case "at":
				arrivalStr = `At ${arrival_time}`;
				break;
			case "between":
				arrivalStr = `${arrival_window_start} - ${arrival_window_end}`;
				break;
			case "by":
				arrivalStr = `By ${arrival_window_end}`;
				break;
		}

		let finishStr = "";
		switch (finish_constraint) {
			case "when_done":
				finishStr = "when done";
				break;
			case "at":
				finishStr = `finish at ${finish_time}`;
				break;
			case "by":
				finishStr = `finish by ${finish_time}`;
				break;
		}

		return `${arrivalStr}, ${finishStr}`;
	};

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<h1 className="text-3xl font-bold text-white mb-2">
						{job.name}
					</h1>
					<p className="text-text-tertiary text-sm">
						{new Date(job.created_at).toLocaleDateString(
							"en-US",
							{
								year: "numeric",
								month: "short",
								day: "numeric",
							}
						)}
					</p>
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							JobStatusColors[job.status] ||
							"bg-zinc-500/20 text-text-tertiary border-border-strong/30"
						}`}
					>
						{job.status}
					</span>

					<div className="relative" ref={optionsMenuRef}>
						<button
							onClick={() => {
								setIsOptionsMenuOpen((v) => !v);
								setDeleteConfirm(false);
							}}
							className="p-2 hover:bg-surface rounded-md transition-colors border border-border hover:border-border-strong"
						>
							<MoreVertical size={20} />
						</button>

						{isOptionsMenuOpen && (
							<div className="absolute right-0 mt-2 w-56 bg-base border border-border-subtle rounded-lg shadow-xl z-50">
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
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2"
									>
										<Edit2 size={16} />
										Edit Job
									</button>
									<div className="my-1 border-t border-border-subtle" />
									<button
										onClick={
											handleDeleteJob
										}
										onMouseLeave={() =>
											setDeleteConfirm(
												false
											)
										}
										disabled={
											deleteJobMutation.isPending
										}
										className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
											deleteConfirm
												? "bg-red-600 hover:bg-red-700 text-white"
												: "text-error-text hover:bg-surface hover:text-error-text"
										} disabled:opacity-50 disabled:cursor-not-allowed`}
									>
										<Trash2 size={16} />
										{deleteJobMutation.isPending
											? "Deleting..."
											: deleteConfirm
												? "Click Again to Confirm"
												: "Delete Job"}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Job Information (2/3) + Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					<Card title="Job Information" className="h-full">
						<div className="space-y-4">
							<div>
								<h3 className="text-text-tertiary text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words">
									{job.description ||
										"No description provided"}
								</p>
							</div>
							<div>
								<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
									<MapPin size={14} />
									Address
								</h3>
								<p className="text-white break-words">
									{job.address}
								</p>
							</div>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<TrendingUp
											size={14}
										/>
										Priority
									</h3>
									<p
										className={`font-medium capitalize ${
											PriorityColors[
												job
													.priority
											]
												?.replace(
													/bg-\S+/,
													""
												)
												.trim() ||
											"text-primary-text"
										}`}
									>
										{job.priority ||
											"normal"}
									</p>
								</div>
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>
										Created
									</h3>
									<p className="text-white">
										{new Date(
											job.created_at
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
						</div>
					</Card>
				</div>

				<div className="lg:col-span-1">
					<ClientDetailsCard
						client_id={job.client_id}
						client={job.client}
					/>
				</div>
			</div>

			{/* Financial Summary */}
			<Card title="Financial Summary">
				{!job.estimated_total && !job.actual_total && !hasLineItems ? (
					<div className="text-center py-8">
						<DollarSign
							size={40}
							className="mx-auto text-text-faint mb-3"
						/>
						<h3 className="text-text-tertiary text-sm font-medium mb-1">
							No Financial Data
						</h3>
						<p className="text-text-muted text-xs">
							Edit this job to add estimated costs and
							line items.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						<div className="lg:col-span-2">
							<h3 className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-4">
								Line Items
							</h3>
							{!hasLineItems ? (
								<div className="text-center py-8">
									<FileText
										size={40}
										className="mx-auto text-text-faint mb-3"
									/>
									<h3 className="text-text-tertiary text-sm font-medium mb-1">
										No Line Items
									</h3>
									<p className="text-text-muted text-xs">
										No line items have
										been added to this
										job yet.
									</p>
								</div>
							) : (
								<div className="space-y-1">
									<div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-xs uppercase tracking-wide font-semibold text-text-tertiary">
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
									{lineItems.map(
										(
											item: JobLineItem,
											index: number
										) => (
											<div
												key={
													item.id ||
													index
												}
												className="grid grid-cols-12 gap-2 py-3 border-b border-border-subtle hover:bg-surface/30 transition-colors"
											>
												<div className="col-span-5 text-sm">
													<p className="text-white font-medium">
														{
															item.name
														}
													</p>
													{item.description && (
														<p className="text-text-tertiary text-xs mt-0.5">
															{
																item.description
															}
														</p>
													)}
												</div>
												<div className="col-span-1 flex items-center justify-center">
													{item.item_type && (
														<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-surface-raised text-text-secondary border border-border-strong">
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
															item.total
														)
													)}
												</div>
											</div>
										)
									)}
								</div>
							)}
						</div>

						<div className="lg:col-span-1 space-y-6">
							<div className="p-4 bg-surface/50 rounded-lg border border-border space-y-2">
								<div className="flex justify-between text-sm">
									<span className="text-text-tertiary">
										Total Items:
									</span>
									<span className="text-white font-medium tabular-nums">
										{lineItems.length ||
											0}
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-text-tertiary">
										Job Number:
									</span>
									<span className="text-white font-medium">
										{job.job_number}
									</span>
								</div>
							</div>

							<div className="space-y-3">
								{job.estimated_total && (
									<div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg border border-border">
										<div>
											<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-0.5">
												Estimated
												Total
											</p>
											<p className="text-xs text-text-muted">
												Initial
												estimate
											</p>
										</div>
										<p className="text-2xl font-bold text-primary-text tabular-nums">
											{formatCurrency(
												Number(
													job.estimated_total
												)
											)}
										</p>
									</div>
								)}

								{job.actual_total && (
									<div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg border border-border">
										<div>
											<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-0.5">
												Actual
												Total
											</p>
											<p className="text-xs text-text-muted">
												Final
												cost
											</p>
										</div>
										<p className="text-2xl font-bold text-success-text tabular-nums">
											{formatCurrency(
												Number(
													job.actual_total
												)
											)}
										</p>
									</div>
								)}

								{job.estimated_total &&
									job.actual_total && (
										<>
											<div className="border-t border-border my-2" />
											<div
												className={`px-4 py-3 rounded-lg border-2 ${
													Number(
														job.actual_total
													) >
													Number(
														job.estimated_total
													)
														? "bg-error/10 border-error/30"
														: "bg-success/10 border-success/30"
												}`}
											>
												<div className="flex items-center justify-between">
													<div>
														<p className="text-text-secondary text-xs uppercase tracking-wide font-semibold mb-0.5">
															Budget
															Variance
														</p>
														<p
															className={`text-xs ${
																Number(
																	job.actual_total
																) >
																Number(
																	job.estimated_total
																)
																	? "text-error-text"
																	: "text-green-300"
															}`}
														>
															{Number(
																job.actual_total
															) >
															Number(
																job.estimated_total
															)
																? "Over Budget"
																: "Under Budget"}
														</p>
													</div>
													<div className="text-right">
														<p
															className={`text-xl font-bold tabular-nums ${
																Number(
																	job.actual_total
																) >
																Number(
																	job.estimated_total
																)
																	? "text-error-text"
																	: "text-success-text"
															}`}
														>
															{Number(
																job.actual_total
															) >
															Number(
																job.estimated_total
															)
																? "+"
																: ""}
															{formatCurrency(
																Number(
																	job.actual_total
																) -
																	Number(
																		job.estimated_total
																	)
															)}
														</p>
														<p
															className={`text-sm font-semibold tabular-nums ${
																Number(
																	job.actual_total
																) >
																Number(
																	job.estimated_total
																)
																	? "text-error-text"
																	: "text-green-300"
															}`}
														>
															{(
																((Number(
																	job.actual_total
																) -
																	Number(
																		job.estimated_total
																	)) /
																	Number(
																		job.estimated_total
																	)) *
																100
															).toFixed(
																1
															)}

															%
														</p>
													</div>
												</div>
											</div>
										</>
									)}

								{!job.actual_total &&
									job.estimated_total &&
									job.status !==
										"Completed" && (
										<div className="px-4 py-3 bg-primary/10 border border-primary/30 rounded-lg">
											<p className="text-xs text-primary-text italic">
												<span className="font-semibold">
													Note:
												</span>{" "}
												Actual
												total
												will
												be
												recorded
												when
												job
												is
												marked
												as
												completed
											</p>
										</div>
									)}
							</div>
						</div>
					</div>
				)}
			</Card>

			{/* Relations Row: Request + Quote + (optional) Recurring Plan */}
			<div
				className={`grid grid-cols-1 gap-4 ${
					recurringPlan ? "lg:grid-cols-3" : "lg:grid-cols-2"
				}`}
			>
				{/* Request */}
				{job.request ? (
					<button
						onClick={() =>
							navigate(
								`/dispatch/requests/${job.request!.id}`
							)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Request
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-white font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
									{job.request.title}
								</h4>
								<div className="flex items-center gap-2 text-xs text-text-muted mt-2">
									<Calendar size={12} />
									<span>
										{new Date(
											job.request
												.created_at
										).toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											}
										)}
									</span>
								</div>
							</div>
							<span
								className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
									RequestStatusColors[
										job.request
											.status as keyof typeof RequestStatusColors
									] ||
									getGenericStatusColor(
										job.request.status
									)
								}`}
							>
								{job.request.status}
							</span>
						</div>
					</button>
				) : (
					<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Request
						</p>
						<div className="flex items-center gap-2 text-text-faint text-sm">
							<Link2Off size={14} />
							<span>No request linked</span>
						</div>
					</div>
				)}

				{/* Quote */}
				{job.quote ? (
					<button
						onClick={() =>
							navigate(
								`/dispatch/quotes/${job.quote!.id}`
							)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Quote
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-white font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
									{job.quote.quote_number}
								</h4>
								<p className="text-text-tertiary text-xs mb-2">
									{job.quote.title}
								</p>
								<div className="flex items-center gap-2 text-xs text-text-muted">
									<Calendar size={12} />
									<span>
										{new Date(
											job.quote
												.created_at
										).toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											}
										)}
									</span>
								</div>
							</div>
							<div className="flex flex-col items-end gap-2 flex-shrink-0">
								<span className="text-success-text font-semibold text-sm whitespace-nowrap">
									$
									{Number(
										job.quote.total
									).toLocaleString("en-US", {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}
								</span>
								<span
									className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
										QuoteStatusColors[
											job.quote
												.status as keyof typeof QuoteStatusColors
										] ||
										getGenericStatusColor(
											job.quote
												.status
										)
									}`}
								>
									{job.quote.status}
								</span>
							</div>
						</div>
					</button>
				) : (
					<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Quote
						</p>
						<div className="flex items-center gap-2 text-text-faint text-sm">
							<Link2Off size={14} />
							<span>No quote linked</span>
						</div>
					</div>
				)}

				{/* Recurring Plan — only rendered when linked */}
				{recurringPlan && (
					<button
						onClick={() =>
							navigate(
								`/dispatch/recurring-plans/${recurringPlan.id}`
							)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all text-left group cursor-pointer"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Recurring Plan
						</p>
						<div className="flex items-start justify-between gap-3 mb-3">
							<div className="flex items-center gap-2 min-w-0">
								<Repeat
									size={14}
									className="text-primary-text flex-shrink-0"
								/>
								<h4 className="text-white font-semibold text-sm group-hover:text-primary-text transition-colors truncate">
									{recurringPlan.name}
								</h4>
							</div>
							<span
								className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
									RecurringPlanStatusColors[
										recurringPlan.status
									] ||
									"bg-zinc-500/20 text-text-tertiary border-border-strong/30"
								}`}
							>
								{RecurringPlanStatusLabels[
									recurringPlan.status
								] || recurringPlan.status}
							</span>
						</div>
						<div className="flex items-center gap-2 text-xs text-text-tertiary">
							<Calendar
								size={12}
								className="flex-shrink-0"
							/>
							<span>
								Started{" "}
								{new Date(
									recurringPlan.starts_at
								).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</span>
						</div>
					</button>
				)}
			</div>

			{/* Linked Invoices */}
			<Card
				title="Linked Invoices"
				headerAction={
					<div className="flex items-center gap-3">
						{linkedInvoices.length > 0 && (
							<span className="text-sm text-text-tertiary">
								{linkedInvoices.length} invoice{linkedInvoices.length !== 1 ? "s" : ""}
							</span>
						)}
						<button
							onClick={() => setIsCreateInvoiceOpen(true)}
							className="flex items-center gap-1.5 rounded bg-primary-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-primary"
						>
							<Plus size={14} />
							Create Invoice
						</button>
					</div>
				}
			>
				{linkedInvoices.length === 0 ? (
					<div className="flex items-center gap-2 text-text-muted text-sm py-1">
						<Receipt size={14} className="flex-shrink-0" />
						<span>No invoices linked to this job</span>
					</div>
				) : (
					<div className="flex flex-wrap gap-3">
						{linkedInvoices.map((invoice) => (
							<button
								key={invoice.id}
								onClick={() => navigate(`/dispatch/invoices/${invoice.id}`)}
								className="bg-surface border border-border rounded-lg p-3 hover:border-primary hover:bg-surface-raised transition-all cursor-pointer text-left group"
							>
								<div className="flex items-center justify-between gap-6 mb-2">
									<span className="text-white font-semibold text-sm group-hover:text-primary-text transition-colors tabular-nums">
										{invoice.invoice_number}
									</span>
									<span
										className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
											InvoiceStatusColors[invoice.status as InvoiceStatus] ?? "bg-zinc-500/20 text-text-tertiary border-border-strong/30"
										}`}
									>
										{InvoiceStatusLabels[invoice.status as InvoiceStatus] ?? invoice.status}
									</span>
								</div>
								<div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-2">
									<Calendar size={11} />
									<span>
										{invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
									</span>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="text-white font-semibold text-sm tabular-nums">
										{formatCurrency(Number(invoice.total))}
									</span>
									{Number(invoice.balance_due) > 0 && (
										<span className="text-xs text-warning-text tabular-nums">
											{formatCurrency(Number(invoice.balance_due))} due
										</span>
									)}
								</div>
							</button>
						))}
					</div>
				)}
			</Card>

			{/* Scheduled Visits */}
			<Card
				title="Scheduled Visits"
				headerAction={
					visits.length > 0 ? (
						<button
							onClick={() =>
								setIsCreateVisitModalOpen(true)
							}
							className="flex items-center gap-2 px-4 py-2 bg-primary-hover hover:bg-blue-700 rounded-md text-sm font-medium transition-colors cursor-pointer"
						>
							<Plus size={16} />
							Create Visit
						</button>
					) : undefined
				}
			>
				{visits.length === 0 ? (
					<div className="text-center py-12">
						<Calendar
							size={48}
							className="mx-auto mb-3 opacity-50 text-text-faint"
						/>
						<p className="text-lg font-medium mb-2 text-text-tertiary">
							No visits scheduled
						</p>
						<p className="text-sm text-text-muted mb-4">
							Create a visit to schedule this job
						</p>
						<button
							onClick={() =>
								setIsCreateVisitModalOpen(true)
							}
							className="inline-flex items-center gap-2 px-4 py-2 bg-primary-hover hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
						>
							<Plus size={16} />
							Create First Visit
						</button>
					</div>
				) : (
					<div className="flex flex-wrap gap-3">
						{sortedVisits.map((visit) => (
							<button
								key={visit.id}
								onClick={() =>
									navigate(
										`/dispatch/jobs/${jobId}/visits/${visit.id}`
									)
								}
								className="bg-surface border border-border rounded-lg p-4 hover:border-primary hover:bg-surface-raised transition-all cursor-pointer text-left group w-fit"
							>
								{visit.name && (
									<h4 className="text-white font-semibold text-base mb-2 group-hover:text-primary-text transition-colors">
										{visit.name}
									</h4>
								)}

								<div className="flex items-start justify-between gap-4 mb-3">
									<div className="flex items-center gap-2 flex-wrap">
										<div
											className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
												VisitStatusColors[
													visit.status as VisitStatus
												] ||
												"bg-zinc-500/20 text-text-tertiary border-border-strong/30"
											}`}
										>
											{
												visit.status
											}
										</div>
										{(() => {
											const count = visit._count?.invoice_visits ?? 0;
											if (count === 0) return null;
											const billed = visitBilledMap[visit.id] ?? 0;
											const visitTotal = Number((visit as any).total ?? 0);
											const isPartial = visitTotal > 0 && billed < visitTotal;
											return (
												<span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${
													isPartial
														? "border-amber-800/50 bg-amber-900/50 text-warning-text"
														: "border-green-800/50 bg-green-900/50 text-success-text"
												}`}>
													{isPartial ? "Partial" : "Billed"}
												</span>
											);
										})()}
										<span className="text-text-muted text-sm">
											•
										</span>
										<span className="text-xs text-text-tertiary">
											{formatVisitTimeConstraints(
												visit
											)}
										</span>
									</div>
									<ChevronRight
										size={16}
										className="text-text-tertiary group-hover:text-primary-text group-hover:translate-x-1 transition-all flex-shrink-0"
									/>
								</div>

								<div className="space-y-2">
									<div className="flex items-center gap-2 text-sm">
										<Clock
											size={16}
											className="text-text-tertiary flex-shrink-0"
										/>
										<span className="text-text-secondary whitespace-nowrap">
											{
												formatDateTime(
													visit.scheduled_start_at
												).split(
													" at "
												)[0]
											}{" "}
											•{" "}
											{formatTime(
												visit.scheduled_start_at
											)}{" "}
											-{" "}
											{formatTime(
												visit.scheduled_end_at
											)}
										</span>
									</div>

									{visit.visit_techs &&
										visit.visit_techs
											.length >
											0 && (
											<div className="flex items-center gap-2 text-sm">
												<Users
													size={
														16
													}
													className="text-text-tertiary flex-shrink-0"
												/>
												<span className="text-text-secondary">
													{visit.visit_techs
														.map(
															(
																vt
															) =>
																vt
																	.tech
																	.name
														)
														.join(
															", "
														)}
												</span>
											</div>
										)}

									{visit.description &&
										!visit.name && (
											<div className="text-xs text-text-tertiary italic mt-2 line-clamp-2">
												{
													visit.description
												}
											</div>
										)}

									{visit.actual_start_at &&
										visit.actual_end_at && (
											<div className="mt-2 pt-2 border-t border-border text-xs text-text-tertiary">
												Actual:{" "}
												{formatTime(
													visit.actual_start_at
												)}{" "}
												-{" "}
												{formatTime(
													visit.actual_end_at
												)}
											</div>
										)}
								</div>
							</button>
						))}
					</div>
				)}
			</Card>

			{/* Assigned Technicians + Technician Location */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card
					title="Assigned Technicians"
					headerAction={
						visits.length > 0 &&
						visits.some(
							(v) =>
								v.visit_techs &&
								v.visit_techs.length > 0
						) ? (
							<span className="text-sm text-text-tertiary">
								{visits.reduce(
									(acc, v) =>
										acc +
										(v.visit_techs
											?.length ||
											0),
									0
								)}{" "}
								assignments
							</span>
						) : undefined
					}
				>
					{visits.length === 0 ? (
						<div className="flex items-center justify-center min-h-[300px]">
							<div className="text-center">
								<Users
									size={48}
									className="mx-auto text-text-faint mb-3"
								/>
								<h3 className="text-text-tertiary text-lg font-medium mb-2">
									No Visits Created
								</h3>
								<p className="text-text-muted text-sm max-w-sm mx-auto">
									Create a visit to assign
									technicians to this job.
								</p>
							</div>
						</div>
					) : visits.every(
							(v) =>
								!v.visit_techs ||
								v.visit_techs.length === 0
					  ) ? (
						<div className="text-center py-12">
							<Users
								size={48}
								className="mx-auto text-text-faint mb-3"
							/>
							<h3 className="text-text-tertiary text-lg font-medium mb-2">
								No Technicians Assigned
							</h3>
							<p className="text-text-muted text-sm max-w-sm mx-auto">
								Edit a visit to assign technicians
								to the job.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{sortedVisits
								.filter(
									(visit) =>
										visit.visit_techs &&
										visit.visit_techs
											.length > 0
								)
								.map((visit) => (
									<div
										key={visit.id}
										className="space-y-2"
									>
										<button
											onClick={() =>
												navigate(
													`/dispatch/jobs/${jobId}/visits/${visit.id}`
												)
											}
											className="w-full flex items-center gap-2 text-xs text-text-tertiary hover:text-text-secondary mb-2 transition-colors group"
										>
											<Calendar
												size={
													12
												}
											/>
											<span>
												{
													formatDateTime(
														visit.scheduled_start_at
													).split(
														" at "
													)[0]
												}{" "}
												•{" "}
												{formatTime(
													visit.scheduled_start_at
												)}{" "}
												-{" "}
												{formatTime(
													visit.scheduled_end_at
												)}
											</span>
											<span
												className={`ml-auto px-2 py-0.5 rounded text-xs font-medium border ${
													VisitStatusColors[
														visit.status as VisitStatus
													] ||
													"bg-zinc-500/20 text-text-tertiary border-border-strong/30"
												}`}
											>
												{
													visit.status
												}
											</span>
											<ChevronRight
												size={
													14
												}
												className="text-text-muted group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all"
											/>
										</button>

										{visit.visit_techs.map(
											(vt) => (
												<button
													key={
														vt.tech_id
													}
													onClick={(
														e
													) => {
														e.stopPropagation();
														navigate(
															`/dispatch/technicians/${vt.tech_id}`
														);
													}}
													className="w-full bg-surface hover:bg-surface-raised border border-border hover:border-border-strong rounded-lg p-3 transition-all cursor-pointer text-left group"
												>
													<div className="flex items-center gap-3">
														<div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
															{vt.tech.name
																.split(
																	" "
																)
																.map(
																	(
																		n
																	) =>
																		n[0]
																)
																.join(
																	""
																)
																.toUpperCase()
																.slice(
																	0,
																	2
																)}
														</div>
														<div className="flex-1 min-w-0">
															<h4 className="text-white font-medium text-sm truncate group-hover:text-primary-text transition-colors mb-1">
																{
																	vt
																		.tech
																		.name
																}
															</h4>
															<div className="flex items-center gap-2 text-xs text-text-tertiary">
																<span className="truncate">
																	{
																		vt
																			.tech
																			.title
																	}
																</span>
																{vt
																	.tech
																	.phone && (
																	<>
																		<span>
																			•
																		</span>
																		<span className="truncate">
																			{
																				vt
																					.tech
																					.phone
																			}
																		</span>
																	</>
																)}
															</div>
														</div>
														<div className="flex items-center gap-2 flex-shrink-0">
															<span
																className={`px-2 py-1 rounded text-xs font-medium ${
																	vt
																		.tech
																		.status ===
																	"Available"
																		? "bg-success/20 text-success-text border border-success/30"
																		: vt
																					.tech
																					.status ===
																			  "Busy"
																			? "bg-error/20 text-error-text border border-error/30"
																			: vt
																						.tech
																						.status ===
																				  "Offline"
																				? "bg-zinc-500/20 text-text-tertiary border border-border-strong/30"
																				: "bg-primary/20 text-primary-text border border-primary/30"
																}`}
															>
																{
																	vt
																		.tech
																		.status
																}
															</span>
															<ChevronRight
																size={
																	16
																}
																className="text-text-tertiary group-hover:translate-x-1 transition-transform"
															/>
														</div>
													</div>
												</button>
											)
										)}
									</div>
								))}
						</div>
					)}
				</Card>

				<Card title="Technician Location" className="h-fit">
					<div className="text-center py-12">
						<Map
							size={48}
							className="mx-auto text-text-faint mb-3"
						/>
						<h3 className="text-text-tertiary text-lg font-medium mb-2">
							GPS Tracking
						</h3>
						<p className="text-text-muted text-sm max-w-sm mx-auto mb-4">
							Real-time GPS tracking will display
							technician locations on an interactive map.
						</p>
						<div className="flex items-center justify-center gap-2 text-xs text-text-muted mt-4">
							<MapPin size={14} />
							<span>Live GPS tracking coming soon</span>
						</div>
						<div className="mt-4 p-3 bg-surface/50 rounded-lg border border-border/50">
							<p className="text-xs text-text-tertiary">
								Job Address:{" "}
								<span className="text-white">
									{job.address}
								</span>
							</p>
						</div>
					</div>
				</Card>
			</div>

			<JobNoteManager jobId={jobId!} visits={visits} />

			{job && isEditModalOpen && (
				<EditJob
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					job={job}
				/>
			)}

			<CreateJobVisit
				isModalOpen={isCreateVisitModalOpen}
				setIsModalOpen={setIsCreateVisitModalOpen}
				jobId={jobId!}
				createVisit={createJobVisitMutation}
			/>

			<CreateInvoice
				isModalOpen={isCreateInvoiceOpen}
				setIsModalOpen={setIsCreateInvoiceOpen}
				initialJobId={jobId}
				defaultClientId={job?.client_id}
			/>
		</div>
	);
}
