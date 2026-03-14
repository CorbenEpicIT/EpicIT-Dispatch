import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
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
import {
	InvoiceStatusColors,
	InvoiceStatusLabels,
	PaymentMethodLabels,
	type InvoiceStatus,
	isOverdue,
	isEditable,
	isDeletable,
	canRecordPayment,
	getPaymentProgress,
	type CreateInvoicePaymentInput,
} from "../../types/invoices";
import { formatCurrency, formatDate } from "../../util/util";

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
			await updateInvoice({
				id: invoiceId,
				updates: { status: newStatus },
			});
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

	const handleRecordPayment = async () => {
		if (!invoiceId || !paymentForm.amount) return;
		try {
			await recordPayment({ invoiceId, data: paymentForm });
			setIsPaymentModalOpen(false);
			setPaymentForm({ amount: 0, method: undefined, note: "" });
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

	const overdue = isOverdue(invoice);
	const editable = isEditable(invoice.status);
	const deletable = isDeletable(invoice.status);
	const payable = canRecordPayment(invoice.status);
	const paymentProgress = getPaymentProgress(invoice);

	const lineItems = invoice.line_items ?? [];
	const payments = invoice.payments ?? [];
	const total = Number(invoice.total ?? 0);
	const amountPaid = Number(invoice.amount_paid ?? 0);
	const balanceDue = Number(invoice.balance_due ?? 0);

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-start">
				<div>
					<div className="flex items-center gap-3 mb-1">
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
					<p className="text-zinc-400 text-sm">
						Issued {formatDate(invoice.issue_date)}
						{invoice.due_date &&
							` · Due ${formatDate(invoice.due_date)}`}
					</p>
					{invoice.memo && (
						<p className="text-zinc-300 text-sm mt-2 italic">
							"{invoice.memo}"
						</p>
					)}
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							InvoiceStatusColors[invoice.status]
						}`}
					>
						{InvoiceStatusLabels[invoice.status]}
					</span>

					{/* Quick Actions */}
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
							onClick={() => setIsPaymentModalOpen(true)}
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
												// TODO: open edit modal
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

			{/* Payment Progress Bar (only when has payments or partially paid) */}
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
					{/* Financial Summary Card */}
					<Card title="Invoice Details">
						<div className="grid grid-cols-2 gap-4 mb-6">
							<div>
								<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
									Issue Date
								</p>
								<p className="text-white text-sm flex items-center gap-2">
									<Calendar
										size={14}
										className="text-zinc-500"
									/>
									{formatDate(
										invoice.issue_date
									)}
								</p>
							</div>
							{invoice.due_date && (
								<div>
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Due Date
									</p>
									<p
										className={`text-sm flex items-center gap-2 ${
											overdue
												? "text-red-400"
												: "text-white"
										}`}
									>
										<Clock
											size={14}
											className={
												overdue
													? "text-red-500"
													: "text-zinc-500"
											}
										/>
										{formatDate(
											invoice.due_date
										)}
										{overdue &&
											" (Overdue)"}
									</p>
								</div>
							)}
							{invoice.payment_terms_days && (
								<div>
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Payment Terms
									</p>
									<p className="text-white text-sm">
										Net{" "}
										{
											invoice.payment_terms_days
										}
									</p>
								</div>
							)}
							{invoice.sent_at && (
								<div>
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Sent
									</p>
									<p className="text-white text-sm flex items-center gap-2">
										<Send
											size={14}
											className="text-zinc-500"
										/>
										{formatDateTime(
											invoice.sent_at
										)}
									</p>
								</div>
							)}
							{invoice.paid_at && (
								<div>
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-1">
										Paid
									</p>
									<p className="text-white text-sm flex items-center gap-2">
										<CheckCircle
											size={14}
											className="text-green-500"
										/>
										{formatDateTime(
											invoice.paid_at
										)}
									</p>
								</div>
							)}
							{invoice.void_reason && (
								<div className="col-span-2">
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

						{/* Internal Notes */}
						{invoice.internal_notes && (
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
								))}

								{/* Totals */}
								<div className="mt-4 space-y-2 pt-2">
									{invoice.subtotal !==
										undefined &&
										invoice.subtotal !==
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
									{invoice.tax_rate !==
										undefined &&
										invoice.tax_rate !==
											null &&
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
									{invoice.discount_amount !==
										undefined &&
										invoice.discount_amount !==
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

					{/* Payment History */}
					<Card
						title="Payments"
						headerAction={
							payable ? (
								<button
									onClick={() =>
										setIsPaymentModalOpen(
											true
										)
									}
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
												{payment.method && (
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
												{payment.recorded_by_dispatcher && (
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
												{payment.recorded_by_tech && (
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
											{payment.note && (
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

			{/* Linked Jobs / Visits */}
			{((invoice.jobs?.length ?? 0) > 0 || (invoice.visits?.length ?? 0) > 0) && (
				<div
					className={`grid grid-cols-1 gap-4 ${
						(invoice.jobs?.length ?? 0) > 0 &&
						(invoice.visits?.length ?? 0) > 0
							? "lg:grid-cols-2"
							: ""
					}`}
				>
					{/* Jobs */}
					{(invoice.jobs?.length ?? 0) > 0 && (
						<Card title="Linked Jobs">
							<div className="space-y-2">
								{invoice.jobs!.map((ij) => (
									<button
										key={ij.job_id}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${ij.job_id}`
											)
										}
										className="w-full p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-all text-left group"
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Briefcase
													size={
														14
													}
													className="text-zinc-500 flex-shrink-0"
												/>
												<div>
													<p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors">
														{
															ij
																.job
																.job_number
														}{" "}
														·{" "}
														{
															ij
																.job
																.name
														}
													</p>
													{ij.billed_amount !==
														null &&
														ij.billed_amount !==
															undefined && (
															<p className="text-zinc-400 text-xs">
																Billed:{" "}
																{formatCurrency(
																	Number(
																		ij.billed_amount
																	)
																)}
															</p>
														)}
												</div>
											</div>
											<ChevronRight
												size={
													14
												}
												className="text-zinc-500 group-hover:text-blue-400 transition-colors"
											/>
										</div>
									</button>
								))}
							</div>
						</Card>
					)}

					{/* Visits */}
					{(invoice.visits?.length ?? 0) > 0 && (
						<Card title="Linked Visits">
							<div className="space-y-2">
								{invoice.visits!.map((iv) => (
									<button
										key={iv.visit_id}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${iv.visit.job.id}/visits/${iv.visit_id}`
											)
										}
										className="w-full p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-all text-left group"
									>
										<div className="flex items-center justify-between">
											<div>
												<p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors">
													{
														iv
															.visit
															.job
															.job_number
													}{" "}
													·{" "}
													{
														iv
															.visit
															.job
															.name
													}
												</p>
												<p className="text-zinc-500 text-xs mt-0.5">
													{formatDate(
														iv
															.visit
															.scheduled_start_at
													)}{" "}
													·
													Billed{" "}
													{formatCurrency(
														Number(
															iv.billed_amount
														)
													)}
												</p>
											</div>
											<ChevronRight
												size={
													14
												}
												className="text-zinc-500 group-hover:text-blue-400 transition-colors"
											/>
										</div>
									</button>
								))}
							</div>
						</Card>
					)}
				</div>
			)}

			{/* Recurring Plan Link */}
			{invoice.recurring_plan && (
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
						<div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
							<h3 className="text-white font-semibold">
								Record Payment
							</h3>
							<button
								onClick={() =>
									setIsPaymentModalOpen(false)
								}
								className="text-zinc-400 hover:text-white transition-colors"
							>
								✕
							</button>
						</div>
						<div className="p-6 space-y-4">
							<div>
								<label className="block text-sm text-zinc-400 mb-1">
									Amount{" "}
									<span className="text-red-400">
										*
									</span>
								</label>
								<input
									type="number"
									min="0.01"
									step="0.01"
									placeholder={`Balance due: ${formatCurrency(balanceDue)}`}
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
								<label className="block text-sm text-zinc-400 mb-1">
									Payment Method
								</label>
								<select
									value={
										paymentForm.method ??
										""
									}
									onChange={(e) =>
										setPaymentForm(
											(f) => ({
												...f,
												method: (e
													.target
													.value ||
													undefined) as any,
											})
										)
									}
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
								<label className="block text-sm text-zinc-400 mb-1">
									Note (optional)
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
						<div className="flex gap-3 px-6 pb-6">
							<button
								onClick={() =>
									setIsPaymentModalOpen(false)
								}
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
									: "Record Payment"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
