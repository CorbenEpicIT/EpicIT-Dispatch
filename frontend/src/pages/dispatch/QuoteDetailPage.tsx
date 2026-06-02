import { useParams, useNavigate } from "react-router-dom";
import {
	Calendar,
	DollarSign,
	MapPin,
	MoreVertical,
	Edit2,
	Send,
	CheckCircle,
	Briefcase,
	Trash2,
	Link2Off,
	Download,
	Loader2,
} from "lucide-react";
import { useQuoteByIdQuery, useUpdateQuoteMutation, useDeleteQuoteMutation, useSendQuoteMutation } from "../../hooks/useQuotes";
import { useCreateJobMutation } from "../../hooks/useJobs";
import { QuoteStatusColors } from "../../types/quotes";
import type { QuoteStatus } from "../../types/quotes";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import EditQuote from "../../components/quotes/EditQuote";
import ConvertToJob from "../../components/quotes/ConvertToJob";
import NoteManager from "../../components/quotes/QuoteNoteManager";
import { useState, useRef, useEffect } from "react";
import { formatCurrency } from "../../util/util";
import { downloadQuotePdf } from "../../api/quotes";
import FinancialSummary from "../../components/pagesections/FinancialSummary";
import SendDocumentModal from "../../components/ui/SendDocumentModal";
import { usePermission } from "../../hooks/usePermission";

export default function QuoteDetailPage() {
	const { quoteId } = useParams<{ quoteId: string }>();
	const navigate = useNavigate();
	const { data: quote, isLoading } = useQuoteByIdQuery(quoteId!);
	const { mutateAsync: updateQuote } = useUpdateQuoteMutation();
	const { mutateAsync: sendQuote } = useSendQuoteMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const deleteQuote = useDeleteQuoteMutation();

	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isConvertToJobModalOpen, setIsConvertToJobModalOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [isPdfLoading, setIsPdfLoading] = useState(false);
	const [isSendModalOpen, setIsSendModalOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	// permissions
	const EDIT_QUOTE = usePermission("edit_quotes");
	const DELETE_QUOTE = usePermission("delete_quotes");
	const CREATE_JOB = usePermission("create_jobs");
	//const SEND_QUOTE = usePermission(""); No dedicated send quote permission, will consider how to handle this later

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
				setDeleteConfirm(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Loading quote details...</div>
			</div>
		);
	}

	if (!quote) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Quote not found</div>
			</div>
		);
	}

	const getStatusColor = (status: string) =>
		QuoteStatusColors[status as QuoteStatus] ||
		"bg-neutral/20 text-text-tertiary border-border-strong/30";

	const handleEdit = () => {
		if (!EDIT_QUOTE) return;
		setShowActionsMenu(false);
		setIsEditModalOpen(true);
	};
	const handleSendToClient = () => { // no specific permissions yet
		setShowActionsMenu(false);
		setIsSendModalOpen(true);
	};

	const handleSendConfirm = async (email: string) => {
		await sendQuote({ id: quote.id, recipientEmail: email });
	};
	const handleMarkAsIssued = async () => {
		if (!EDIT_QUOTE) return;
		setShowActionsMenu(false);
		try {
			await updateQuote({ id: quote.id, data: { status: "Issued" } });
		} catch (error) {
			console.error("Failed to mark as issued:", error);
		}
	};

	const handleMarkAsApproved = async () => {
		if (!EDIT_QUOTE) return;
		setShowActionsMenu(false);
		try {
			await updateQuote({ id: quote.id, data: { status: "Approved" } });
		} catch (error) {
			console.error("Failed to mark as approved:", error);
		}
	};
	const handleConvertToJob = () => {
		if (!CREATE_JOB) return;
		setShowActionsMenu(false);
		setIsConvertToJobModalOpen(true);
	};

	const handleDownloadPdf = async () => {
		setShowActionsMenu(false);
		setIsPdfLoading(true);
		try {
			await downloadQuotePdf(quote.id, quote.quote_number);
		} catch (error) {
			console.error("Failed to download PDF:", error);
		} finally {
			setIsPdfLoading(false);
		}
	};

	const handleDelete = async () => {
		if (!DELETE_QUOTE) return;
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			await deleteQuote.mutateAsync({ id: quote.id, hardDelete: false });
			navigate("/dispatch/quotes");
		} catch (error) {
			console.error("Failed to delete quote:", error);
		}
	};

	return (
		<div className="text-text-primary space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-3xl font-bold text-text-primary">
							{quote.quote_number}
						</h1>
						{!quote.is_active && (
							<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-surface-raised text-text-tertiary border border-border-strong">
								Superseded
							</span>
						)}
					</div>
					<p className="text-text-tertiary text-sm">{quote.title}</p>
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(quote.status)}`}
					>
						{quote.status}
					</span>

					<div className="relative" ref={menuRef}>
						<button
							onClick={() => {
								setShowActionsMenu(
									!showActionsMenu
								);
								setDeleteConfirm(false);
							}}
							className="p-2 hover:bg-surface rounded-md transition-colors border border-border hover:border-border-strong"
						>
							<MoreVertical size={20} />
						</button>

						{showActionsMenu && (
							<div className="absolute right-0 mt-2 w-56 bg-base border border-border-subtle rounded-lg shadow-xl z-50">
								<div className="py-1">
										<button
											title={!EDIT_QUOTE ? "You don't have permission to perform this action" : undefined}
											disabled={!EDIT_QUOTE}
											onClick={handleEdit}
											className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
										>
											<Edit2 size={16} />{" "}
											Edit Quote
										</button>
									{quote.status === "Draft" && (
											<button
												title={!EDIT_QUOTE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_QUOTE}
												onClick={handleMarkAsIssued}
												className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 text-primary-text hover:text-primary-text disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<CheckCircle size={16} />
												Mark as Issued
											</button>
									)}
									{quote.status !== "Approved" && quote.status !== "Rejected" && quote.status !== "Revised" && quote.status !== "Expired" && quote.status !== "Cancelled" && (
										// for now anyone with view access can send to client
										<button
											onClick={handleSendToClient}
											className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2"
										>
											<Send size={16} />
											Send to Client
										</button>
									)}
									<button
										onClick={handleDownloadPdf}
										disabled={isPdfLoading}
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
									>
										{isPdfLoading ? (
											<Loader2 size={16} className="animate-spin" />
										) : (
											<Download size={16} />
										)}
										{isPdfLoading ? "Generating..." : "Download PDF"}
									</button>
									{(quote.status === "Issued" || quote.status === "Sent" || quote.status === "Viewed") && (
											<button
												title={!EDIT_QUOTE ? "You don't have permission to perform this action" : undefined}
												disabled={!EDIT_QUOTE}
												onClick={handleMarkAsApproved}
												className="w-full px-4 py-2 text-left text-sm hover:bg-surface text-success-text hover:text-success-text transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<CheckCircle size={16} />
												Mark as Approved
											</button>
									)}
										<button
											title={!CREATE_JOB ? "You don't have permission to perform this action" : undefined}
											onClick={
												handleConvertToJob
											}
											disabled={
												!!quote.job || !CREATE_JOB
											}
											className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
										>
											<Briefcase
												size={16}
											/>
											{quote.job
												? "Job Already Created"
												: "Convert to Job"}
										</button>
									{DELETE_QUOTE && (
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
													deleteQuote.isPending || !DELETE_QUOTE
												}
												className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
													deleteConfirm
														? "bg-error hover:bg-error-strong text-on-primary"
														: "text-error-text hover:bg-surface hover:text-error-text"
												} disabled:opacity-40 disabled:cursor-not-allowed`}
											>
												<Trash2 size={16} />
												{deleteQuote.isPending
													? "Deleting..."
													: deleteConfirm
														? "Click Again to Confirm"
														: "Delete Quote"}
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Quote Information (2/3) + Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
				<div className="lg:col-span-2">
					<Card title="Quote Information">
						<div className="space-y-4">
							<div>
								<h3 className="text-text-tertiary text-sm mb-1">
									Description
								</h3>
								<p className="text-text-primary break-words whitespace-pre-wrap">
									{quote.description ||
										"No description provided"}
								</p>
							</div>

							{quote.address && (
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<MapPin size={14} />{" "}
										Address
									</h3>
									<p className="text-text-primary break-words">
										{quote.address}
									</p>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>{" "}
										Created
									</h3>
									<p className="text-text-primary">
										{new Date(
											quote.created_at
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
								{quote.valid_until && (
									<div>
										<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
											<Calendar
												size={
													14
												}
											/>{" "}
											Valid Until
										</h3>
										<p className="text-text-primary">
											{new Date(
												quote.valid_until
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

							<div>
								<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
									<DollarSign size={14} />{" "}
									Quote Total
								</h3>
								<p className="text-text-primary font-medium text-2xl">
									{formatCurrency(
										Number(quote.total)
									)}
								</p>
							</div>
						</div>
					</Card>
				</div>

				<div className="lg:col-span-1">
					<ClientDetailsCard
						client_id={quote.client_id}
						client={quote.client}
					/>
				</div>
			</div>

			{/* Financial Summary */}
			<FinancialSummary
				lineItems={quote.line_items ?? []}
				taxSnapshot={quote.tax_snapshot}
				legacyTaxRate={quote.tax_rate != null ? Number(quote.tax_rate) : null}
				legacyTaxAmount={quote.tax_amount != null ? Number(quote.tax_amount) : null}
				subtotal={quote.subtotal != null ? Number(quote.subtotal) : null}
				discountAmount={quote.discount_amount != null ? Number(quote.discount_amount) : null}
				discountType={quote.discount_type ?? null}
				discountValue={quote.discount_value != null ? Number(quote.discount_value) : null}
				metaLabel="Quote #"
				metaValue={quote.quote_number}
				noLineItemsDescription="No line items have been added to this quote yet."
				totalsContent={
					<div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg border border-border">
						<div>
							<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-0.5">
								Quote Total
							</p>
							<p className="text-xs text-text-muted">Final amount</p>
						</div>
						<p className="text-2xl font-bold text-primary-text tabular-nums">
							{formatCurrency(Number(quote.total))}
						</p>
					</div>
				}
			/>

			{/* Relations Row: Request + Job */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
				{/* Related Request */}
				{quote.request ? (
					<button
						onClick={() =>
							navigate(
								`/dispatch/requests/${quote.request?.id}`
							)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Request
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-text-primary font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
									{quote.request.title}
								</h4>
								<div className="flex items-center gap-2 text-xs text-text-muted mt-2">
									<Calendar size={12} />
									<span>
										{new Date(
											quote
												.request
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
								className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(quote.request.status)}`}
							>
								{quote.request.status}
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

				{/* Related Job */}
				{quote.job ? (
					<button
						onClick={() =>
							navigate(`/dispatch/jobs/${quote.job!.id}`)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Job
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-text-primary font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
									{quote.job.job_number}
								</h4>
								<p className="text-text-tertiary text-xs mb-2">
									{quote.job.name}
								</p>
								<div className="flex items-center gap-2 text-xs text-text-muted">
									<Calendar size={12} />
									<span>
										{new Date(
											quote.job
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
								{quote.job.estimated_total !=
									null && (
									<span className="text-success-text font-semibold text-sm whitespace-nowrap">
										{formatCurrency(
											Number(
												quote
													.job
													.estimated_total
											)
										)}
									</span>
								)}
								<span
									className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(quote.job.status)}`}
								>
									{quote.job.status}
								</span>
							</div>
						</div>
					</button>
				) : (
					<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
						<div className="grid grid-cols-3 gap-4">
							<div className="col-span-2 flex flex-col gap-2">
								<p className="text-text-muted text-xs uppercase tracking-wide font-semibold">
									Related Job
								</p>
								<div className="flex items-center gap-2 text-text-faint text-sm">
									<Link2Off
										size={14}
										className="flex-shrink-0"
									/>
									<span>
										No job created yet
									</span>
								</div>
							</div>
							<div className="col-span-1 flex items-center justify-end">
									<button
										title={!CREATE_JOB ? "You don't have permission to perform this action" : undefined}
										disabled={!CREATE_JOB}
										onClick={(e) => {
											if (!CREATE_JOB) return;
											e.stopPropagation();
											handleConvertToJob();
										}}
										className="flex items-center gap-2 px-3 py-1.5 bg-primary-hover hover:bg-primary-active rounded-md text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
									>
										<Briefcase size={12} />{" "}
										Convert to Job
									</button>
							</div>
						</div>
					</div>
				)}
			</div>

			<NoteManager quoteId={quoteId!} />

			{quote && (
				<>
					<EditQuote
						isModalOpen={isEditModalOpen}
						setIsModalOpen={setIsEditModalOpen}
						quote={quote}
					/>
					<ConvertToJob
						isModalOpen={isConvertToJobModalOpen}
						setIsModalOpen={setIsConvertToJobModalOpen}
						quote={quote}
						onConvert={async (jobData) => {
							const newJob = await createJob(jobData);
							if (!newJob?.id)
								throw new Error(
									"Job creation failed: no ID returned"
								);
							navigate(`/dispatch/jobs/${newJob.id}`);
							return newJob.id;
						}}
					/>
					<SendDocumentModal
						isOpen={isSendModalOpen}
						onClose={() => setIsSendModalOpen(false)}
						onSend={handleSendConfirm}
						docType="quote"
						docNumber={quote.quote_number}
						clientName={quote.client?.name ?? ""}
						contactEmail={quote.client?.contacts?.[0]?.contact?.email}
						contactName={quote.client?.contacts?.[0]?.contact?.name}
					/>
				</>
			)}
		</div>
	);
}
