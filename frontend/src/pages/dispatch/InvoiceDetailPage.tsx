import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
	Edit2,
	Calendar,
	DollarSign,
	FileText,
	MoreVertical,
	Trash2,
	Send,
	CheckCircle,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	AlertCircle,
	ChevronRight,
	Plus,
	Clock,
	Repeat,
	CreditCard,
	Briefcase,
	Download,
	Loader2,
	Mail,
} from "lucide-react";
import {
	useInvoiceByIdQuery,
	useUpdateInvoiceMutation,
	useDeleteInvoiceMutation,
	useCreateInvoicePaymentMutation,
	useDeleteInvoicePaymentMutation,
} from "../../hooks/useInvoices";
import { downloadInvoicePdf, sendInvoice } from "../../api/invoices";
import SendDocumentModal from "../../components/ui/SendDocumentModal";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import InvoiceNoteManager from "../../components/invoices/InvoiceNoteManager";
import EditInvoice from "../../components/invoices/EditInvoice";
import {
	InvoiceStatusColors,
	InvoiceStatusLabels,
	PaymentMethodLabels,
	type InvoiceStatus,
	type PaymentMethod,
	type Invoice,
	type InvoiceLineItem,
	isOverdue,
	isEditable,
	isDeletable,
	canRecordPayment,
	getPaymentProgress,
	type CreateInvoicePaymentInput,
} from "../../types/invoices";
import { formatCurrency, formatDate } from "../../util/util";
import { usePermission } from "../../hooks/usePermission";
import { formatRatePercentLabel } from "../../lib/formatTax";
import type { TaxSnapshotRate } from "../../types/tax";
import { 
	useQBStatusQuery, 
	useQBInvoiceSyncMutation, 
	useQBInvoiceEmailMutation
} from "../../hooks/useQuickbooks";

// ── Local helpers ─────────────────────────────────────────────────────────────

const formatDateTime = (val: string | Date | null | undefined): string => {
	if (!val) return "—";
	return new Date(val).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

/** Line items on an invoice may carry source attribution fields. */
interface InvoiceLineItemWithSource extends InvoiceLineItem {
	source_job_id?: string | null;
	source_visit_id?: string | null;
}

/** Collapsed per-rate tax entry used in the totals section. */
interface CollapsedRate {
	id: string;
	name: string;
	rate: number;
	amountCents: number;
}

/** Strongly-typed shape for a job group used when rendering the linked section. */
interface LinkedJobGroup {
	jobId: string;
	jobNumber: string;
	jobName: string;
	/** Present when the job is directly linked (invoice.jobs). Absent when only referenced via a visit. */
	billedAmount: number | null;
	isDirectlyLinked: boolean;
	visits: Array<{
		visitId: string;
		scheduledStartAt: string | Date;
		billedAmount: number;
		jobId: string;
	}>;
}

/** Build the grouped job+visit structure from an invoice. No any, no casts. */
function buildLinkedJobGroups(invoice: Invoice): LinkedJobGroup[] {
	const groupMap = new Map<string, LinkedJobGroup>();

	for (const ij of invoice.jobs ?? []) {
		if (!groupMap.has(ij.job_id)) {
			groupMap.set(ij.job_id, {
				jobId: ij.job_id,
				jobNumber: ij.job.job_number,
				jobName: ij.job.name,
				billedAmount:
					ij.billed_amount != null ? Number(ij.billed_amount) : null,
				isDirectlyLinked: true,
				visits: [],
			});
		}
	}

	for (const iv of invoice.visits ?? []) {
		const parentId = iv.visit.job.id;
		if (!groupMap.has(parentId)) {
			groupMap.set(parentId, {
				jobId: parentId,
				jobNumber: iv.visit.job.job_number,
				jobName: iv.visit.job.name,
				billedAmount: null,
				isDirectlyLinked: false,
				visits: [],
			});
		}
		groupMap.get(parentId)!.visits.push({
			visitId: iv.visit_id,
			scheduledStartAt: iv.visit.scheduled_start_at,
			billedAmount: Number(iv.billed_amount ?? 0),
			jobId: parentId,
		});
	}

	return Array.from(groupMap.values());
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
	const { invoiceId: invoiceIdParam, id: idParam } = useParams<{
		invoiceId?: string;
		id?: string;
	}>();
	const invoiceId = invoiceIdParam ?? idParam;
	const navigate = useNavigate();

	const { data: invoice, isLoading } = useInvoiceByIdQuery(invoiceId!);
	const { mutateAsync: updateInvoice } = useUpdateInvoiceMutation();
	const { mutateAsync: deleteInvoice, isPending: isDeleting } = useDeleteInvoiceMutation();
	const { mutateAsync: recordPayment, isPending: isRecordingPayment } =
		useCreateInvoicePaymentMutation();
	const { mutateAsync: deletePayment } = useDeleteInvoicePaymentMutation();

	const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isPdfLoading, setIsPdfLoading] = useState(false);
	const [isSendModalOpen, setIsSendModalOpen] = useState(false);
	const [paymentForm, setPaymentForm] = useState<CreateInvoicePaymentInput>({
		amount: 0,
		method: undefined,
		note: "",
	});

	//permissions
	const EDIT_INVOICE = usePermission("edit_invoices");
	const DELETE_INVOICE = usePermission("delete_invoices");

	const { data: qbStatus } = useQBStatusQuery();
	const { mutate: syncToQB, isPending: isSyncingQB } = useQBInvoiceSyncMutation();

	const optionsMenuRef = useRef<HTMLDivElement>(null);

	const sendEmailMutation = useQBInvoiceEmailMutation();
	const primaryEmail = invoice?.client?.contacts?.find(c => c.is_primary)?.contact?.email;

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

	// ── Handlers ──────────────────────────────────────────────────────────────

	const handleDelete = async () => {
		if (!DELETE_INVOICE) return;
		if (!invoiceId || !invoice) return;
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			await deleteInvoice({ id: invoiceId, clientId: invoice.client_id });
			navigate("/dispatch/invoices");
		} catch (error) {
			console.error("Failed to delete invoice:", error);
		}
	};

	const handleStatusTransition = async (newStatus: InvoiceStatus) => {
		if (!EDIT_INVOICE) return;
		if (!invoiceId) return;
		try {
			await updateInvoice({ id: invoiceId, updates: { status: newStatus } });
		} catch (error) {
			console.error("Failed to update status:", error);
		}
	};

	const handleVoid = async () => {
		if (!EDIT_INVOICE) return;
		if (!invoiceId) return;
		const reason = prompt("Enter a reason for voiding this invoice:");
		if (!reason?.trim()) return;
		try {
			await updateInvoice({
				id: invoiceId,
				updates: { status: "Void", void_reason: reason.trim() },
			});
		} catch (error) {
			console.error("Failed to void invoice:", error);
		}
	};

	const resetPaymentForm = useCallback(() => {
		setPaymentForm({ amount: 0, method: undefined, note: "" });
	}, []);

	const openPaymentModal = useCallback(() => {
		if (!EDIT_INVOICE) return;
		resetPaymentForm();
		setIsPaymentModalOpen(true);
	}, [resetPaymentForm]);

	const closePaymentModal = useCallback(() => {
		resetPaymentForm();
		setIsPaymentModalOpen(false);
	}, [resetPaymentForm]);

	const handleRecordPayment = async () => {
		if (!invoiceId || !paymentForm.amount) return;
		try {
			await recordPayment({ invoiceId, data: paymentForm });
			closePaymentModal();
		} catch (error) {
			console.error("Failed to record payment:", error);
		}
	};

	const handleDeletePayment = async (paymentId: string) => {
		if (!invoiceId) return;
		if (!confirm("Remove this payment? This will recalculate the invoice balance."))
			return;
		try {
			await deletePayment({ invoiceId, paymentId });
		} catch (error) {
			console.error("Failed to delete payment:", error);
		}
	};

	const handleSendConfirm = async (email: string) => {
		await sendInvoice(invoiceId!, email);
	};

	const handleDownloadPdf = async () => {
		setIsOptionsMenuOpen(false);
		setIsPdfLoading(true);
		try {
			await downloadInvoicePdf(invoiceId!, invoice!.invoice_number);
		} catch (error) {
			console.error("Failed to download PDF:", error);
		} finally {
			setIsPdfLoading(false);
		}
	};

	// Map group name → individual rates array for line item tax badge + totals section
	// Must be above early returns — useMemo must not be called conditionally
	const groupRatesMap = useMemo(() => {
		const map = new Map<string, TaxSnapshotRate[]>();
		for (const group of invoice?.tax_snapshot?.groups ?? []) {
			if ((group.rates ?? []).length > 0) map.set(group.name, group.rates);
		}
		return map;
	}, [invoice?.tax_snapshot]);

	// Per-rate totals from snapshot; deduplicate by rate ID, sum amounts, drop group names.
	const collapsedTaxRates = useMemo((): CollapsedRate[] => {
		if (!invoice?.tax_snapshot) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const group of invoice.tax_snapshot.groups ?? []) {
			for (const rate of group.rates ?? []) {
				const cents = Math.round(rate.rate * (group.taxable_amount_cents ?? 0));
				const entry = rateMap.get(rate.id);
				if (entry) {
					entry.amountCents += cents;
				} else {
					rateMap.set(rate.id, { id: rate.id, name: rate.name, rate: rate.rate, amountCents: cents });
				}
			}
		}
		return [...rateMap.values()];
	}, [invoice?.tax_snapshot]);

	// Fallback: derive per-rate totals from line items when no snapshot exists.
	const lineItemCollapsedRates = useMemo((): CollapsedRate[] => {
		if (collapsedTaxRates.length > 0) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const item of (invoice?.line_items ?? []) as InvoiceLineItemWithSource[]) {
			if (!item.taxable || item.tax_amount == null || !item.tax_group?.rates?.length) continue;
			const itemTaxCents = Math.round(Number(item.tax_amount) * 100);
			if (itemTaxCents === 0) continue;
			const combinedRate = item.tax_group.rates.reduce((s, r) => s + r.tax_rate.rate, 0);
			if (combinedRate === 0) continue;
			for (const r of item.tax_group.rates) {
				const share = Math.round(itemTaxCents * (r.tax_rate.rate / combinedRate));
				const existing = rateMap.get(r.tax_rate.id);
				if (existing) {
					existing.amountCents += share;
				} else {
					rateMap.set(r.tax_rate.id, {
						id: r.tax_rate.id,
						name: r.tax_rate.name,
						rate: r.tax_rate.rate,
						amountCents: share,
					});
				}
			}
		}
		return [...rateMap.values()];
	}, [collapsedTaxRates, invoice?.line_items]);

	// ── Guards ────────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Loading invoice...</div>
			</div>
		);
	}

	if (!invoice) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Invoice not found</div>
			</div>
		);
	}

	// ── Derived values ────────────────────────────────────────────────────────

	const overdue = isOverdue(invoice);
	const editable = isEditable(invoice.status);
	const deletable = isDeletable(invoice.status);
	const payable = canRecordPayment(invoice.status);
	const paymentProgress = getPaymentProgress(invoice);

	const lineItems = (invoice.line_items ?? []) as InvoiceLineItemWithSource[];
	const payments = invoice.payments ?? [];
	const total = Number(invoice.total ?? 0);
	const amountPaid = Number(invoice.amount_paid ?? 0);
	const balanceDue = Number(invoice.balance_due ?? 0);

	const linkedJobGroups = buildLinkedJobGroups(invoice);

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-start">
				<div>
					{/* Invoice number + memo on the same line when space allows,
					    wrapping memo beneath on narrow viewports */}
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-1">
						<div className="flex items-center gap-3 flex-shrink-0">
							<h1 className="text-3xl font-bold text-white">
								{invoice.invoice_number}
							</h1>
							{overdue && (
								<span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error/20 text-error-text border border-error/30">
									<AlertTriangle size={11} />
									Overdue
								</span>
							)}
							{qbStatus?.connected && invoice.qb_sync_status === "synced" && (
								<span className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="Synced to QuickBooks">
									<CheckCircle2 size={11} />
									QB Synced
									<button
										onClick={() => sendEmailMutation.mutate({
											invoiceId: invoice.id,
											sendTo: primaryEmail ?? "",
										})}
										disabled={sendEmailMutation.isPending || !primaryEmail}
										className="ml-1 underline hover:no-underline disabled:opacity-50 flex items-center gap-1"
									>
										{sendEmailMutation.isPending ? <Loader2 size={11}/> : <Mail size={11}/>}
										Send via QuickBooks
									</button>
								</span>
							)}
							{qbStatus?.connected && invoice.qb_sync_status === "failed" && (
								<span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error/20 text-error-text border border-error/30">
									<AlertCircle size={11} />
									QB Sync Failed
									<button
										onClick={() => syncToQB(invoiceId!)}
										disabled={isSyncingQB}
										className="ml-1 underline hover:no-underline disabled:opacity-50"
										title="Retry sync"
									>
										{isSyncingQB ? "Retrying..." : "Retry"}
									</button>
								</span>
							)}
							{qbStatus?.connected && invoice.qb_sync_status === "not_synced" && (
								<span className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium bg-zinc-500/20 text-text-tertiary border border-border-strong/30">
									<Clock size={11} />
									QB Pending
									<button
										onClick={() => syncToQB(invoiceId!)}
										disabled={isSyncingQB}
										className="ml-1 underline hover:no-underline disabled:opacity-50"
										title="Sync to QuickBooks"
									>
										{isSyncingQB ? "Syncing..." : "Sync"}
									</button>
									<button
										onClick={() => sendEmailMutation.mutate({
											invoiceId: invoice.id,
											sendTo: primaryEmail ?? "",
										})}
										disabled={sendEmailMutation.isPending || !primaryEmail}
										className="ml-1 underline hover:no-underline disabled:opacity-50 flex items-center gap-1"
									>
										{sendEmailMutation.isPending ? <Loader2 size={14}/> : <Mail size={14}/>}
										Send via QuickBooks
									</button>
								</span>
							)}
						</div>
						{invoice.memo && (
							<p
								className="text-text-secondary text-sm break-words min-w-0 line-clamp-2"
								title={invoice.memo}
							>
								{invoice.memo}
							</p>
						)}
					</div>
					<p className="text-text-tertiary text-sm">
						{invoice.status === "Draft"
							? `Created ${formatDate(invoice.created_at)}`
							: `Issued ${formatDate(invoice.issue_date ?? invoice.created_at)}`}
						{invoice.due_date &&
							` · Due ${formatDate(invoice.due_date)}`}
					</p>
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							InvoiceStatusColors[invoice.status]
						}`}
					>
						{InvoiceStatusLabels[invoice.status]}
					</span>

					{(invoice.status === "Draft" || invoice.status === "Issued") && (
							<button
								title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
								disabled={!EDIT_INVOICE}
								onClick={() => {
									if (!EDIT_INVOICE) return;
									setIsSendModalOpen(true);
								}}
								className="flex items-center gap-2 px-3 py-1.5 bg-primary-hover hover:enabled:bg-blue-700 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								<Send size={14} />
								Send
							</button>
					)}
					{payable && (
							<button
								title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
								disabled={!EDIT_INVOICE}
								onClick={openPaymentModal}
								className="flex items-center gap-2 px-3 py-1.5 bg-confirm hover:bg-confirm-hover rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								<CreditCard size={14} />
								Record Payment
							</button>
					)}

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
							<div className="absolute right-0 mt-2 w-60 bg-base border border-border-subtle rounded-lg shadow-xl z-50">
								<div className="py-1">
									{editable && (
											<button
												title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_INVOICE}
												onClick={() => {
													if (!EDIT_INVOICE) return;
													setIsEditModalOpen(
														true
													);
													setIsOptionsMenuOpen(
														false
													);
												}}
												className="w-full px-4 py-2 text-left text-sm hover:enabled:bg-surface transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<Edit2
													size={
														16
													}
												/>
												Edit Invoice
											</button>
									)}
									<button
										onClick={
											handleDownloadPdf
										}
										disabled={
											isPdfLoading
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{isPdfLoading ? (
											<Loader2
												size={
													16
												}
												className="animate-spin"
											/>
										) : (
											<Download
												size={
													16
												}
											/>
										)}
										{isPdfLoading
											? "Generating..."
											: "Download PDF"}
									</button>
									{invoice.status === "Draft" && (
											<button
												title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_INVOICE}
												onClick={() => {
													if (!EDIT_INVOICE) return;
													handleStatusTransition("Issued");
													setIsOptionsMenuOpen(false);
												}}
												className="w-full px-4 py-2 text-left text-sm hover:enabled:bg-surface text-primary-text hover:text-primary-text transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<CheckCircle size={16} />
												Mark as Issued
											</button>
									)}
									{(invoice.status === "Sent" || invoice.status === "Viewed" || invoice.status === "PartiallyPaid") && (
											<button
												title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_INVOICE}
												onClick={() => {
													if (!EDIT_INVOICE) return;
													handleStatusTransition("Disputed");
													setIsOptionsMenuOpen(false);
												}}
												className="w-full px-4 py-2 text-left text-sm hover:enabled:bg-surface text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<AlertTriangle size={16} />
												Mark as Disputed
											</button>
									)}
									{invoice.status ===
										"Disputed" && (
											<button
												title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_INVOICE}
												onClick={() => {
													if (!EDIT_INVOICE) return;
													handleStatusTransition(
														"Sent"
													);
													setIsOptionsMenuOpen(
														false
													);
												}}
												className="w-full px-4 py-2 text-left text-sm hover:enabled:bg-surface transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<CheckCircle
													size={
														16
													}
												/>
												Resolve
												Dispute
											</button>
									)}
									{invoice.status !==
										"Void" &&
										invoice.status !==
											"Paid" && (
											<>
												<div className="my-1 border-t border-border-subtle" />
												<button
													title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
													disabled={!EDIT_INVOICE}
													onClick={() => {
														if (!EDIT_INVOICE) return;
														handleVoid();
														setIsOptionsMenuOpen(
															false
														);
													}}
													className="w-full px-4 py-2 text-left text-sm hover:enabled:bg-surface text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
												>
													<XCircle
														size={
															16
														}
													/>
													Void
													Invoice
												</button>
											</>
										)}
									{(deletable && DELETE_INVOICE) && (
										<>
											<div className="my-1 border-t border-border-subtle" />
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
													isDeleting
												}
												className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
													deleteConfirm
														? "bg-red-600 hover:bg-red-700 text-white"
														: "text-error-text hover:bg-surface hover:text-error-text"
												} disabled:opacity-40 disabled:cursor-not-allowed`}
											>
												<Trash2
													size={
														16
													}
												/>
												{isDeleting
													? "Deleting..."
													: deleteConfirm
														? "Click Again to Confirm"
														: "Delete Invoice"}
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Payment Progress Bar */}
			{(amountPaid > 0 || invoice.status === "PartiallyPaid") && (
				<div className="p-4 bg-base border border-border-subtle rounded-lg">
					<div className="flex items-center justify-between text-sm mb-2">
						<span className="text-text-tertiary">
							Payment Progress
						</span>
						<span className="text-white font-medium tabular-nums">
							{formatCurrency(amountPaid)} of{" "}
							{formatCurrency(total)}
						</span>
					</div>
					<div className="w-full bg-surface rounded-full h-2">
						<div
							className="bg-green-500 h-2 rounded-full transition-all duration-500"
							style={{
								width: `${Math.min(100, paymentProgress * 100)}%`,
							}}
						/>
					</div>
					<div className="flex items-center justify-between text-xs mt-1.5 text-text-muted">
						<span>
							{(paymentProgress * 100).toFixed(0)}% paid
						</span>
						{balanceDue > 0 && (
							<span className="text-warning-text">
								{formatCurrency(balanceDue)}{" "}
								remaining
							</span>
						)}
					</div>
				</div>
			)}

			{/* Info + Client */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-6">
					<Card title="Invoice Details">
						{/* Date/terms — inline flex wrap, each field sizes to content */}
						<div className="flex flex-wrap gap-x-6 gap-y-3 mb-6">
							<div className="min-w-0">
								<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
									Created
								</p>
								<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
									<Calendar
										size={13}
										className="text-text-muted flex-shrink-0"
									/>
									{formatDate(
										invoice.created_at
									)}
								</p>
							</div>
							{invoice.status !== "Draft" &&
								invoice.issue_date != null && (
									<div className="min-w-0">
										<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
											Issue Date
										</p>
										<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
											<Calendar
												size={
													13
												}
												className="text-text-muted flex-shrink-0"
											/>
											{formatDate(
												invoice.issue_date
											)}
										</p>
									</div>
								)}
							{invoice.due_date != null && (
								<div className="min-w-0">
									<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
										Due Date
									</p>
									<p
										className={`text-sm flex items-center gap-1.5 whitespace-nowrap ${
											overdue
												? "text-error-text"
												: "text-white"
										}`}
									>
										<Clock
											size={13}
											className={
												overdue
													? "text-red-500 flex-shrink-0"
													: "text-text-muted flex-shrink-0"
											}
										/>
										{formatDate(
											invoice.due_date
										)}
										{overdue && (
											<span className="text-error-text font-medium ml-1">
												Overdue
											</span>
										)}
									</p>
								</div>
							)}
							{invoice.payment_terms_days != null && (
								<div className="min-w-0">
									<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
										Payment Terms
									</p>
									<p className="text-white text-sm whitespace-nowrap">
										{invoice.payment_terms_days ===
										0
											? "Due on Receipt"
											: `Net ${invoice.payment_terms_days}`}
									</p>
								</div>
							)}
							{invoice.sent_at != null && (
								<div className="min-w-0">
									<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
										Sent
									</p>
									<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
										<Send
											size={13}
											className="text-text-muted flex-shrink-0"
										/>
										{formatDateTime(
											invoice.sent_at
										)}
									</p>
								</div>
							)}
							{invoice.paid_at != null && (
								<div className="min-w-0">
									<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
										Paid
									</p>
									<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
										<CheckCircle
											size={13}
											className="text-green-500 flex-shrink-0"
										/>
										{formatDateTime(
											invoice.paid_at
										)}
									</p>
								</div>
							)}
							{invoice.void_reason != null && (
								<div className="w-full">
									<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
										Void Reason
									</p>
									<p className="text-text-secondary text-sm italic break-words">
										{
											invoice.void_reason
										}
									</p>
								</div>
							)}
						</div>

						{invoice.internal_notes != null && (
							<div className="pt-4 border-t border-border-subtle">
								<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-2">
									Internal Notes
								</p>
								<p className="text-text-secondary text-sm break-words whitespace-pre-wrap">
									{invoice.internal_notes}
								</p>
							</div>
						)}
					</Card>

					{/* Line Items */}
					<Card title="Line Items">
						{lineItems.length === 0 ? (
							<div className="text-center py-8">
								<FileText
									size={40}
									className="mx-auto text-text-faint mb-3"
								/>
								<p className="text-text-tertiary text-sm">
									No line items
								</p>
							</div>
						) : (
							<div>
								{/* Header row */}
								<div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-xs uppercase tracking-wide font-semibold text-text-tertiary">
									<div className="col-span-5 min-w-0">
										Item / Description
									</div>
									<div className="col-span-2 min-w-0 text-center">
										Type
									</div>
									<div className="col-span-1 min-w-0 text-right">
										Qty
									</div>
									<div className="col-span-2 min-w-0 text-right">
										Unit Price
									</div>
									<div className="col-span-2 min-w-0 text-right">
										Amount
									</div>
								</div>
								{/* Data rows — items-start keeps numeric cols top-aligned when description wraps */}
								{lineItems.map((item, index) => {
									const sourceVisitId =
										item.source_visit_id;
									const sourceJobId =
										item.source_job_id;
									let sourceLabel:
										| string
										| null = null;
									let isVisitSource = false;

									if (sourceVisitId != null) {
										const iv = (
											invoice.visits ??
											[]
										).find(
											(v) =>
												v.visit_id ===
												sourceVisitId
										);
										if (iv != null) {
											sourceLabel = `${iv.visit.job.job_number} · Visit ${formatDate(iv.visit.scheduled_start_at)}`;
											isVisitSource = true;
										}
									} else if (
										sourceJobId != null
									) {
										const ij = (
											invoice.jobs ??
											[]
										).find(
											(j) =>
												j.job_id ===
												sourceJobId
										);
										if (ij != null) {
											sourceLabel = `${ij.job.job_number} · ${ij.job.name}`;
										}
									}

									return (
										<div
											key={
												item.id ??
												index
											}
											className="border-b border-border-subtle hover:bg-surface/30 transition-colors"
										>
											{/* Primary row — name + all numeric columns */}
											<div className="grid grid-cols-12 gap-2 pt-3 pb-1 items-center">
												<div className="col-span-5 min-w-0 text-sm">
													<p className="text-white font-medium break-words">
														{
															item.name
														}
													</p>
												</div>
												<div className="col-span-2 min-w-0 flex justify-center">
													{item.item_type !=
														null && (
														<span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-xs font-medium bg-surface-raised text-text-secondary border border-border-strong">
															{
																item.item_type
															}
														</span>
													)}
												</div>
												<div className="col-span-1 min-w-0 text-right text-sm text-white tabular-nums" title={String(item.quantity)}>
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
												<div className="col-span-2 min-w-0 text-right text-sm text-white tabular-nums">
													{formatCurrency(
														Number(
															item.unit_price
														)
													)}
												</div>
												<div className="col-span-2 min-w-0 text-right text-sm text-white font-semibold tabular-nums">
													{formatCurrency(
														Number(
															item.total
														)
													)}
												</div>
											</div>
											{/* Sub-row — only renders when secondary content exists */}
											{((item.description != null && item.description !== "") ||
												sourceLabel != null ||
												item.tax_group?.name ||
												item.taxable === false) && (
												<div className="space-y-1 pb-2.5 min-w-0">
													{item.description != null && item.description !== "" && (
														<p className="text-xs text-text-tertiary leading-relaxed break-words">
															{item.description}
														</p>
													)}
													{(sourceLabel != null || item.tax_group?.name || item.taxable === false) && (
														<div className="flex flex-wrap items-center gap-1.5">
															{sourceLabel != null && (
																<span
																	className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap leading-none ${
																		isVisitSource
																			? "bg-primary/10 text-primary-text border-primary/20"
																			: "bg-surface-raised/60 text-text-tertiary border-border-strong/50"
																	}`}
																>
																	{isVisitSource ? (
																		<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
																			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
																			<circle cx="12" cy="10" r="3" />
																		</svg>
																	) : (
																		<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
																			<rect x="2" y="7" width="20" height="14" rx="2" />
																			<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
																		</svg>
																	)}
																	<span className="truncate">{sourceLabel}</span>
																</span>
															)}
															{item.tax_group?.name ? (
																<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-raised/60 border border-border-strong/50 text-[10px] font-medium text-text-muted whitespace-nowrap leading-none">
																	{item.tax_group.name}
																	{groupRatesMap.has(item.tax_group.name)
																		? ` · ${groupRatesMap.get(item.tax_group.name)!
																			.map(r => `${r.name} ${formatRatePercentLabel(r.rate)}`)
																			.join(" + ")}`
																		: ""}
																</span>
															) : (
																<span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-raised/40 border border-border-strong/30 text-[10px] text-text-faint whitespace-nowrap leading-none">
																	No Tax
																</span>
															)}
														</div>
													)}
												</div>
											)}
										</div>
									);
								})}

								{/* Totals */}
								<div className="mt-4 space-y-2 pt-2">
									{invoice.subtotal !=
										null && (
										<div className="flex justify-between text-sm">
											<span className="text-text-tertiary">
												Subtotal
											</span>
											<span className="text-white tabular-nums">
												{formatCurrency(
													Number(
														invoice.subtotal
													)
												)}
											</span>
										</div>
									)}
									{(() => {
										const rates = collapsedTaxRates.length > 0 ? collapsedTaxRates : lineItemCollapsedRates;
										const totalTaxCents = rates.reduce((s, r) => s + r.amountCents, 0);
										if (rates.length > 0) {
											return (
												<>
													{rates.map((rate) => (
														<div key={rate.id} className="flex justify-between text-sm">
															<span className="text-text-tertiary">
																{rate.name} ({formatRatePercentLabel(rate.rate)})
															</span>
															<span className="text-white tabular-nums">
																{formatCurrency(rate.amountCents / 100)}
															</span>
														</div>
													))}
													{rates.length > 1 && (
														<div className="flex justify-between text-sm">
															<span className="text-text-tertiary font-medium">
																Total Tax
															</span>
															<span className="text-white tabular-nums font-medium">
																{formatCurrency(totalTaxCents / 100)}
															</span>
														</div>
													)}
												</>
											);
										}
										if (invoice.tax_rate != null && Number(invoice.tax_rate) > 0) {
											return (
												<div className="flex justify-between text-sm">
													<span className="text-text-tertiary">
														Tax ({formatRatePercentLabel(Number(invoice.tax_rate))})
													</span>
													<span className="text-white tabular-nums">
														{formatCurrency(Number(invoice.tax_amount ?? 0))}
													</span>
												</div>
											);
										}
										return null;
									})()}
									{invoice.discount_amount !=
										null &&
										Number(
											invoice.discount_amount
										) > 0 && (
											<div className="flex justify-between text-sm">
												<span className="text-text-tertiary">
													Discount
												</span>
												<span className="text-success-text tabular-nums">
													−{" "}
													{formatCurrency(
														Number(
															invoice.discount_amount
														)
													)}
												</span>
											</div>
										)}
									<div className="flex justify-between pt-2 border-t border-border">
										<span className="text-white font-semibold">
											Total
										</span>
										<span className="text-white font-bold text-lg tabular-nums">
											{formatCurrency(
												total
											)}
										</span>
									</div>
									{amountPaid > 0 && (
										<>
											<div className="flex justify-between text-sm">
												<span className="text-text-tertiary">
													Amount
													Paid
												</span>
												<span className="text-success-text tabular-nums">
													−{" "}
													{formatCurrency(
														amountPaid
													)}
												</span>
											</div>
											<div className="flex justify-between pt-2 border-t border-border">
												<span className="text-white font-semibold">
													Balance
													Due
												</span>
												<span
													className={`font-bold text-lg tabular-nums ${
														balanceDue >
														0
															? overdue
																? "text-error-text"
																: "text-warning-text"
															: "text-success-text"
													}`}
												>
													{formatCurrency(
														balanceDue
													)}
												</span>
											</div>
										</>
									)}
								</div>
							</div>
						)}
					</Card>
				</div>

				{/* Right Column */}
				<div className="space-y-6">
					<ClientDetailsCard
						client_id={invoice.client_id}
						client={invoice.client}
					/>

					<Card
						title="Payments"
						headerAction={
							payable ? (
									<button
										title={!EDIT_INVOICE ? "You don't have permission to perform this action" : undefined}
										disabled={!EDIT_INVOICE}
										onClick={openPaymentModal}
										className="flex items-center gap-1.5 px-3 py-1.5 bg-confirm hover:bg-confirm-hover rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
									>
										<Plus size={13} />
										Record
									</button>
							) : undefined
						}
					>
						{payments.length === 0 ? (
							<div className="text-center py-6">
								<DollarSign
									size={32}
									className="mx-auto text-text-faint mb-2"
								/>
								<p className="text-text-muted text-sm">
									No payments recorded
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{payments.map((payment) => (
									<div
										key={payment.id}
										className="flex items-start justify-between gap-3 p-3 bg-surface/50 rounded-lg border border-border/50 group"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-white font-semibold text-sm tabular-nums">
													{formatCurrency(
														Number(
															payment.amount
														)
													)}
												</span>
												{payment.method !=
													null && (
													<span className="text-xs px-1.5 py-0.5 bg-surface-raised text-text-secondary rounded border border-border-strong">
														{PaymentMethodLabels[
															payment
																.method
														] ??
															payment.method}
													</span>
												)}
											</div>
											<p className="text-text-muted text-xs mt-0.5">
												{formatDate(
													payment.paid_at
												)}
												{payment.recorded_by_dispatcher !=
													null && (
													<>
														{" "}
														·{" "}
														{
															payment
																.recorded_by_dispatcher
																.name
														}
													</>
												)}
												{payment.recorded_by_tech !=
													null && (
													<>
														{" "}
														·{" "}
														{
															payment
																.recorded_by_tech
																.name
														}{" "}
														(tech)
													</>
												)}
											</p>
											{payment.note !=
												null &&
												payment.note !==
													"" && (
													<p className="text-text-tertiary text-xs mt-1 italic break-words">
														{
															payment.note
														}
													</p>
												)}
										</div>
										<button
											onClick={() =>
												handleDeletePayment(
													payment.id
												)
											}
											className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error-text transition-all"
											title="Remove payment"
										>
											<Trash2
												size={
													13
												}
											/>
										</button>
									</div>
								))}
							</div>
						)}
					</Card>

					{/* Recurring Plan — sidebar link, shown when invoice is plan-generated */}
					{invoice.recurring_plan != null && (
						<button
							onClick={() =>
								navigate(
									`/dispatch/recurring-plans/${invoice.recurring_plan!.id}`
								)
							}
							className="w-full p-3 bg-base hover:bg-surface rounded-lg border border-border/60 hover:border-primary/40 transition-all text-left group flex items-center gap-2"
						>
							<div className="flex-1 min-w-0">
								<p className="text-text-muted text-[10px] uppercase tracking-wide font-semibold mb-1.5">
									Recurring Plan
								</p>
								<div className="flex items-center gap-2 min-w-0">
									<Repeat
										size={13}
										className="text-primary-text flex-shrink-0"
									/>
									<span className="text-white text-sm font-medium group-hover:text-primary-text transition-colors truncate">
										{
											invoice
												.recurring_plan
												.name
										}
									</span>
								</div>
							</div>
							<ChevronRight
								size={13}
								className="text-text-muted group-hover:text-primary-text transition-colors flex-shrink-0"
							/>
						</button>
					)}
				</div>
			</div>

			{/* Linked Jobs / Visits — grouped by job */}
			{linkedJobGroups.length > 0 && (
				<Card title="Linked Jobs &amp; Visits">
					<div className="flex flex-col gap-3">
						{linkedJobGroups.map((group) => (
							<div
								key={group.jobId}
								className="flex flex-wrap items-start gap-2"
							>
								{/* Job chip */}
								{group.isDirectlyLinked ? (
									<button
										onClick={() =>
											navigate(
												`/dispatch/jobs/${group.jobId}`
											)
										}
										className="inline-flex items-center gap-2 px-3 py-2 bg-surface/60 hover:bg-surface border border-border-strong/50 hover:border-zinc-400 rounded-lg transition-all text-left group flex-shrink-0"
									>
										<Briefcase
											size={13}
											className="text-text-tertiary flex-shrink-0 group-hover:text-primary-text transition-colors"
										/>
										<div className="flex flex-col justify-center min-h-[38px]">
											<p className="text-white text-sm font-medium group-hover:text-primary-text transition-colors leading-tight whitespace-nowrap">
												{
													group.jobNumber
												}{" "}
												·{" "}
												{
													group.jobName
												}
											</p>
											{group.billedAmount !=
												null &&
												group.billedAmount >
													0 && (
													<p className="text-text-muted text-xs leading-tight mt-0.5 whitespace-nowrap">
														Billed{" "}
														{formatCurrency(
															group.billedAmount
														)}
													</p>
												)}
										</div>
										<ChevronRight
											size={13}
											className="text-text-muted group-hover:text-primary-text transition-colors flex-shrink-0"
										/>
									</button>
								) : (
									<span className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[54px] bg-surface/30 border border-border/40 rounded-lg text-text-tertiary text-sm flex-shrink-0">
										<Briefcase
											size={13}
											className="text-text-faint flex-shrink-0"
										/>
										{group.jobNumber} ·{" "}
										{group.jobName}
									</span>
								)}

								{/* Visit chips */}
								{group.visits.map((v) => (
									<button
										key={v.visitId}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${v.jobId}/visits/${v.visitId}`
											)
										}
										className="inline-flex items-center gap-2 px-3 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 rounded-lg transition-all text-left group flex-shrink-0"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											className="text-primary/60 flex-shrink-0 group-hover:text-primary-text transition-colors"
										>
											<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
											<circle
												cx="12"
												cy="10"
												r="3"
											/>
										</svg>
										<div className="flex flex-col justify-center min-h-[38px]">
											<p className="text-white text-sm font-medium group-hover:text-primary-text transition-colors leading-tight whitespace-nowrap">
												Visit{" "}
												{formatDate(
													v.scheduledStartAt
												)}
											</p>
											{v.billedAmount >
												0 && (
												<p className="text-text-muted text-xs leading-tight mt-0.5 whitespace-nowrap">
													Billed{" "}
													{formatCurrency(
														v.billedAmount
													)}
												</p>
											)}
										</div>
										<ChevronRight
											size={13}
											className="text-primary/40 group-hover:text-primary-text transition-colors flex-shrink-0"
										/>
									</button>
								))}
							</div>
						))}
					</div>
				</Card>
			)}

			{/* Notes */}
			<InvoiceNoteManager invoiceId={invoiceId!} />

			{/* Record Payment Modal */}
			{isPaymentModalOpen && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
					<div className="bg-base border border-border-subtle rounded-xl w-full max-w-md shadow-2xl">
						<div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
							<div className="flex flex-col">
								<h3 className="text-white font-semibold text-base">
									Record Payment
								</h3>
								<span className="text-xs text-text-muted mt-0.5">
									Balance due:{" "}
									<span
										className={`font-semibold ${
											overdue
												? "text-error-text"
												: "text-warning-text"
										}`}
									>
										{formatCurrency(
											balanceDue
										)}
									</span>
								</span>
							</div>
							<button
								onClick={closePaymentModal}
								className="text-text-muted hover:text-white transition-colors text-sm"
							>
								✕
							</button>
						</div>

						<div className="px-5 py-5 space-y-3">
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-xs text-text-tertiary">
										Amount{" "}
										<span className="text-error-text">
											*
										</span>
									</label>
									<button
										type="button"
										onClick={() =>
											setPaymentForm(
												(
													f
												) => ({
													...f,
													amount: balanceDue,
												})
											)
										}
										className="text-xs text-primary-text hover:text-primary-text transition-colors"
									>
										Full
									</button>
								</div>
								<input
									placeholder="$0.00"
									type="number"
									min="0.01"
									step="0.01"
									value={
										paymentForm.amount ||
										""
									}
									onChange={(e) =>
										setPaymentForm(
											(f) => ({
												...f,
												amount:
													parseFloat(
														e
															.target
															.value
													) ||
													0,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Payment Method
								</label>
								<select
									value={
										paymentForm.method ??
										""
									}
									onChange={(e) => {
										const raw =
											e.target
												.value;
										const typed =
											raw ===
												"cash" ||
											raw ===
												"check" ||
											raw ===
												"card" ||
											raw ===
												"bank_transfer" ||
											raw ===
												"other"
												? (raw as PaymentMethod)
												: undefined;
										setPaymentForm(
											(f) => ({
												...f,
												method: typed,
											})
										);
									}}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								>
									<option value="">
										— Select method —
									</option>
									<option value="cash">
										Cash
									</option>
									<option value="check">
										Check
									</option>
									<option value="card">
										Card
									</option>
									<option value="bank_transfer">
										Bank Transfer
									</option>
									<option value="other">
										Other
									</option>
								</select>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Note
								</label>
								<input
									type="text"
									placeholder="e.g. Check #1234"
									value={
										paymentForm.note ??
										""
									}
									onChange={(e) =>
										setPaymentForm(
											(f) => ({
												...f,
												note: e
													.target
													.value,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>
						</div>

						<div className="flex gap-2 px-5 pb-5 pt-2">
							<button
								onClick={closePaymentModal}
								className="flex-1 px-4 py-2 bg-surface hover:bg-surface-raised border border-border rounded-md text-sm transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleRecordPayment}
								disabled={
									!paymentForm.amount ||
									isRecordingPayment
								}
								className="flex-1 px-4 py-2 bg-confirm hover:bg-confirm-hover rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{isRecordingPayment
									? "Recording..."
									: "Record"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Edit Invoice Modal */}
			{editable && isEditModalOpen && (
				<EditInvoice
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					invoice={invoice}
				/>
			)}

			<SendDocumentModal
				isOpen={isSendModalOpen}
				onClose={() => setIsSendModalOpen(false)}
				onSend={handleSendConfirm}
				docType="invoice"
				docNumber={invoice.invoice_number}
				clientName={invoice.client?.name ?? ""}
				contactEmail={invoice.client?.contacts?.[0]?.contact?.email}
				contactName={invoice.client?.contacts?.[0]?.contact?.name}
			/>
		</div>
	);
}
