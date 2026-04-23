import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import {
	Edit2,
	Calendar,
	DollarSign,
	FileText,
	MoreVertical,
	Trash2,
	Send,
	CheckCircle,
	XCircle,
	AlertTriangle,
	ChevronRight,
	Plus,
	Clock,
	Repeat,
	CreditCard,
	Briefcase,
} from "lucide-react";
import {
	useInvoiceByIdQuery,
	useUpdateInvoiceMutation,
	useDeleteInvoiceMutation,
	useCreateInvoicePaymentMutation,
	useDeleteInvoicePaymentMutation,
} from "../../hooks/useInvoices";
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

// ── Optimistic payment helpers ────────────────────────────────────────────────

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
	const [paymentForm, setPaymentForm] = useState<CreateInvoicePaymentInput>({
		amount: 0,
		method: undefined,
		note: "",
	});

	const optionsMenuRef = useRef<HTMLDivElement>(null);

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
		if (!invoiceId) return;
		try {
			await updateInvoice({ id: invoiceId, updates: { status: newStatus } });
		} catch (error) {
			console.error("Failed to update status:", error);
		}
	};

	const handleVoid = async () => {
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
								<span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
									<AlertTriangle size={11} />
									Overdue
								</span>
							)}
						</div>
						{invoice.memo && (
							<p className="text-zinc-300 text-sm  truncate min-w-0">
								{invoice.memo}
							</p>
						)}
					</div>
					<p className="text-zinc-400 text-sm">
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

					{invoice.status === "Draft" && (
						<button
							onClick={() =>
								handleStatusTransition("Sent")
							}
							className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
						>
							<Send size={14} />
							Send
						</button>
					)}
					{payable && (
						<button
							onClick={openPaymentModal}
							className="flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-md text-sm font-medium transition-colors"
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
							className="p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical size={20} />
						</button>

						{isOptionsMenuOpen && (
							<div className="absolute right-0 mt-2 w-60 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									{editable && (
										<button
											onClick={() => {
												setIsEditModalOpen(
													true
												);
												setIsOptionsMenuOpen(
													false
												);
											}}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
										>
											<Edit2
												size={
													16
												}
											/>
											Edit Invoice
										</button>
									)}
									{invoice.status ===
										"Sent" && (
										<button
											onClick={() => {
												handleStatusTransition(
													"Disputed"
												);
												setIsOptionsMenuOpen(
													false
												);
											}}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-2"
										>
											<AlertTriangle
												size={
													16
												}
											/>
											Mark as
											Disputed
										</button>
									)}
									{invoice.status ===
										"Disputed" && (
										<button
											onClick={() => {
												handleStatusTransition(
													"Sent"
												);
												setIsOptionsMenuOpen(
													false
												);
											}}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
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
												<div className="my-1 border-t border-zinc-800" />
												<button
													onClick={() => {
														handleVoid();
														setIsOptionsMenuOpen(
															false
														);
													}}
													className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors flex items-center gap-2"
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
									{deletable && (
										<>
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
													isDeleting
												}
												className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
													deleteConfirm
														? "bg-red-600 hover:bg-red-700 text-white"
														: "text-red-400 hover:bg-zinc-800 hover:text-red-300"
												} disabled:opacity-50 disabled:cursor-not-allowed`}
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
				<div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
					<div className="flex items-center justify-between text-sm mb-2">
						<span className="text-zinc-400">
							Payment Progress
						</span>
						<span className="text-white font-medium tabular-nums">
							{formatCurrency(amountPaid)} of{" "}
							{formatCurrency(total)}
						</span>
					</div>
					<div className="w-full bg-zinc-800 rounded-full h-2">
						<div
							className="bg-green-500 h-2 rounded-full transition-all duration-500"
							style={{
								width: `${Math.min(100, paymentProgress * 100)}%`,
							}}
						/>
					</div>
					<div className="flex items-center justify-between text-xs mt-1.5 text-zinc-500">
						<span>
							{(paymentProgress * 100).toFixed(0)}% paid
						</span>
						{balanceDue > 0 && (
							<span className="text-amber-400">
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
								<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
									Created
								</p>
								<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
									<Calendar size={13} className="text-zinc-500 flex-shrink-0" />
									{formatDate(invoice.created_at)}
								</p>
							</div>
							{invoice.status !== "Draft" && invoice.issue_date != null && (
								<div className="min-w-0">
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Issue Date
									</p>
									<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
										<Calendar size={13} className="text-zinc-500 flex-shrink-0" />
										{formatDate(invoice.issue_date)}
									</p>
								</div>
							)}
							{invoice.due_date != null && (
								<div className="min-w-0">
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Due Date
									</p>
									<p
										className={`text-sm flex items-center gap-1.5 whitespace-nowrap ${
											overdue
												? "text-red-400"
												: "text-white"
										}`}
									>
										<Clock
											size={13}
											className={
												overdue
													? "text-red-500 flex-shrink-0"
													: "text-zinc-500 flex-shrink-0"
											}
										/>
										{formatDate(
											invoice.due_date
										)}
										{overdue && (
											<span className="text-red-400 font-medium ml-1">
												Overdue
											</span>
										)}
									</p>
								</div>
							)}
							{invoice.payment_terms_days != null && (
								<div className="min-w-0">
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
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
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Sent
									</p>
									<p className="text-white text-sm flex items-center gap-1.5 whitespace-nowrap">
										<Send
											size={13}
											className="text-zinc-500 flex-shrink-0"
										/>
										{formatDateTime(
											invoice.sent_at
										)}
									</p>
								</div>
							)}
							{invoice.paid_at != null && (
								<div className="min-w-0">
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
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
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Void Reason
									</p>
									<p className="text-zinc-300 text-sm italic">
										{
											invoice.void_reason
										}
									</p>
								</div>
							)}
						</div>

						{invoice.internal_notes != null && (
							<div className="pt-4 border-t border-zinc-800">
								<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-2">
									Internal Notes
								</p>
								<p className="text-zinc-300 text-sm">
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
									className="mx-auto text-zinc-600 mb-3"
								/>
								<p className="text-zinc-400 text-sm">
									No line items
								</p>
							</div>
						) : (
							<div>
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
								{lineItems.map((item, index) => {
									// Resolve source label using typed source fields
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
											className="grid grid-cols-12 gap-2 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
										>
											<div className="col-span-5 text-sm">
												<p className="text-white font-medium">
													{
														item.name
													}
												</p>
												{item.description !=
													null &&
													item.description !==
														"" && (
														<p className="text-zinc-400 text-xs mt-0.5">
															{
																item.description
															}
														</p>
													)}
												{sourceLabel !=
													null && (
													<p className="flex items-center gap-1 mt-1">
														<span
															className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
																isVisitSource
																	? "bg-blue-500/10 text-blue-400 border-blue-500/20"
																	: "bg-zinc-700/60 text-zinc-400 border-zinc-600/50"
															}`}
														>
															{isVisitSource ? (
																<svg
																	width="9"
																	height="9"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	strokeWidth="2"
																>
																	<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
																	<circle
																		cx="12"
																		cy="10"
																		r="3"
																	/>
																</svg>
															) : (
																<svg
																	width="9"
																	height="9"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	strokeWidth="2"
																>
																	<rect
																		x="2"
																		y="7"
																		width="20"
																		height="14"
																		rx="2"
																	/>
																	<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
																</svg>
															)}
															{
																sourceLabel
															}
														</span>
													</p>
												)}
											</div>
											<div className="col-span-1 flex items-center justify-center">
												{item.item_type !=
													null && (
													<span className="px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300 border border-zinc-600">
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
									);
								})}

								{/* Totals */}
								<div className="mt-4 space-y-2 pt-2">
									{invoice.subtotal !=
										null && (
										<div className="flex justify-between text-sm">
											<span className="text-zinc-400">
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
									{invoice.tax_rate != null &&
										Number(
											invoice.tax_rate
										) > 0 && (
											<div className="flex justify-between text-sm">
												<span className="text-zinc-400">
													Tax
													(
													{(
														Number(
															invoice.tax_rate
														) *
														100
													).toFixed(
														1
													)}
													%)
												</span>
												<span className="text-white tabular-nums">
													{formatCurrency(
														Number(
															invoice.tax_amount ??
																0
														)
													)}
												</span>
											</div>
										)}
									{invoice.discount_amount !=
										null &&
										Number(
											invoice.discount_amount
										) > 0 && (
											<div className="flex justify-between text-sm">
												<span className="text-zinc-400">
													Discount
												</span>
												<span className="text-green-400 tabular-nums">
													−{" "}
													{formatCurrency(
														Number(
															invoice.discount_amount
														)
													)}
												</span>
											</div>
										)}
									<div className="flex justify-between pt-2 border-t border-zinc-700">
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
												<span className="text-zinc-400">
													Amount
													Paid
												</span>
												<span className="text-green-400 tabular-nums">
													−{" "}
													{formatCurrency(
														amountPaid
													)}
												</span>
											</div>
											<div className="flex justify-between pt-2 border-t border-zinc-700">
												<span className="text-white font-semibold">
													Balance
													Due
												</span>
												<span
													className={`font-bold text-lg tabular-nums ${
														balanceDue >
														0
															? overdue
																? "text-red-400"
																: "text-amber-400"
															: "text-green-400"
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
									onClick={openPaymentModal}
									className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-md text-xs font-medium transition-colors"
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
									className="mx-auto text-zinc-600 mb-2"
								/>
								<p className="text-zinc-500 text-sm">
									No payments recorded
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{payments.map((payment) => (
									<div
										key={payment.id}
										className="flex items-start justify-between gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 group"
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
													<span className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-300 rounded border border-zinc-600">
														{PaymentMethodLabels[
															payment
																.method
														] ??
															payment.method}
													</span>
												)}
											</div>
											<p className="text-zinc-500 text-xs mt-0.5">
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
													<p className="text-zinc-400 text-xs mt-1 italic">
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
											className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all"
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
										className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-500/50 hover:border-zinc-400 rounded-lg transition-all text-left group flex-shrink-0"
									>
										<Briefcase
											size={13}
											className="text-zinc-400 flex-shrink-0 group-hover:text-blue-400 transition-colors"
										/>
										<div>
											<p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors leading-tight whitespace-nowrap">
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
													<p className="text-zinc-500 text-xs leading-tight mt-0.5 whitespace-nowrap">
														Billed{" "}
														{formatCurrency(
															group.billedAmount
														)}
													</p>
												)}
										</div>
										<ChevronRight
											size={13}
											className="text-zinc-500 group-hover:text-blue-400 transition-colors flex-shrink-0"
										/>
									</button>
								) : (
									<span className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-800/30 border border-zinc-700/40 rounded-lg text-zinc-400 text-sm flex-shrink-0">
										<Briefcase
											size={13}
											className="text-zinc-600 flex-shrink-0"
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
										className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 rounded-lg transition-all text-left group flex-shrink-0"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											className="text-blue-500/60 flex-shrink-0 group-hover:text-blue-400 transition-colors"
										>
											<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
											<circle
												cx="12"
												cy="10"
												r="3"
											/>
										</svg>
										<div>
											<p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors leading-tight whitespace-nowrap">
												Visit{" "}
												{formatDate(
													v.scheduledStartAt
												)}
											</p>
											{v.billedAmount >
												0 && (
												<p className="text-zinc-500 text-xs leading-tight mt-0.5 whitespace-nowrap">
													Billed{" "}
													{formatCurrency(
														v.billedAmount
													)}
												</p>
											)}
										</div>
										<ChevronRight
											size={13}
											className="text-blue-500/40 group-hover:text-blue-400 transition-colors flex-shrink-0"
										/>
									</button>
								))}
							</div>
						))}
					</div>
				</Card>
			)}

			{/* Recurring Plan Link */}
			{invoice.recurring_plan != null && (
				<button
					onClick={() =>
						navigate(
							`/dispatch/recurring-plans/${invoice.recurring_plan!.id}`
						)
					}
					className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all text-left group"
				>
					<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold mb-2">
						Recurring Plan
					</p>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Repeat
								size={14}
								className="text-blue-400"
							/>
							<span className="text-white font-medium group-hover:text-blue-400 transition-colors">
								{invoice.recurring_plan.name}
							</span>
						</div>
						<ChevronRight
							size={16}
							className="text-zinc-400 group-hover:text-blue-400 transition-colors"
						/>
					</div>
				</button>
			)}

			{/* Notes */}
			<InvoiceNoteManager invoiceId={invoiceId!} />

			{/* Record Payment Modal */}
			{isPaymentModalOpen && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
					<div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md shadow-2xl">
						<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
							<div className="flex flex-col">
								<h3 className="text-white font-semibold text-base">
									Record Payment
								</h3>
								<span className="text-xs text-zinc-500 mt-0.5">
									Balance due:{" "}
									<span
										className={`font-semibold ${
											overdue
												? "text-red-400"
												: "text-amber-400"
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
								className="text-zinc-500 hover:text-white transition-colors text-sm"
							>
								✕
							</button>
						</div>

						<div className="px-5 py-5 space-y-3">
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-xs text-zinc-400">
										Amount{" "}
										<span className="text-red-400">
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
										className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
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
									className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>

							<div>
								<label className="block text-xs text-zinc-400 mb-1">
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
									className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
								<label className="block text-xs text-zinc-400 mb-1">
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
									className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div className="flex gap-2 px-5 pb-5 pt-2">
							<button
								onClick={closePaymentModal}
								className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleRecordPayment}
								disabled={
									!paymentForm.amount ||
									isRecordingPayment
								}
								className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
		</div>
	);
}
