import { useParams, useNavigate } from "react-router-dom";
import {
	Calendar,
	DollarSign,
	FileText,
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
import SendDocumentModal from "../../components/ui/SendDocumentModal";

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
				<div className="text-white text-lg">Loading quote details...</div>
			</div>
		);
	}

	if (!quote) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Quote not found</div>
			</div>
		);
	}

	const getStatusColor = (status: string) =>
		QuoteStatusColors[status as QuoteStatus] ||
		"bg-zinc-500/20 text-zinc-400 border-zinc-500/30";

	const handleEdit = () => {
		setShowActionsMenu(false);
		setIsEditModalOpen(true);
	};
	const handleSendToClient = () => {
		setShowActionsMenu(false);
		setIsSendModalOpen(true);
	};

	const handleSendConfirm = async (email: string) => {
		await sendQuote({ id: quote.id, recipientEmail: email });
	};
	const handleMarkAsIssued = async () => {
		setShowActionsMenu(false);
		try {
			await updateQuote({ id: quote.id, data: { status: "Issued" } });
		} catch (error) {
			console.error("Failed to mark as issued:", error);
		}
	};

	const handleMarkAsApproved = async () => {
		setShowActionsMenu(false);
		try {
			await updateQuote({ id: quote.id, data: { status: "Approved" } });
		} catch (error) {
			console.error("Failed to mark as approved:", error);
		}
	};
	const handleConvertToJob = () => {
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
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-3xl font-bold text-white">
							{quote.quote_number}
						</h1>
						{!quote.is_active && (
							<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-zinc-700 text-zinc-400 border border-zinc-600">
								Superseded
							</span>
						)}
					</div>
					<p className="text-zinc-400 text-sm">{quote.title}</p>
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
										<Edit2 size={16} />{" "}
										Edit Quote
									</button>
									{quote.status === "Draft" && (
										<button
											onClick={handleMarkAsIssued}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 text-blue-400 hover:text-blue-300"
										>
											<CheckCircle size={16} />
											Mark as Issued
										</button>
									)}
									{quote.status !== "Approved" && quote.status !== "Rejected" && quote.status !== "Revised" && quote.status !== "Expired" && quote.status !== "Cancelled" && (
										<button
											onClick={handleSendToClient}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
										>
											<Send size={16} />
											Send to Client
										</button>
									)}
									<button
										onClick={handleDownloadPdf}
										disabled={isPdfLoading}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
											onClick={handleMarkAsApproved}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2"
										>
											<CheckCircle size={16} />
											Mark as Approved
										</button>
									)}
									<button
										onClick={
											handleConvertToJob
										}
										disabled={
											!!quote.job
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<Briefcase
											size={16}
										/>
										{quote.job
											? "Job Already Created"
											: "Convert to Job"}
									</button>
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
											deleteQuote.isPending
										}
										className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
											deleteConfirm
												? "bg-red-600 hover:bg-red-700 text-white"
												: "text-red-400 hover:bg-zinc-800 hover:text-red-300"
										} disabled:opacity-50 disabled:cursor-not-allowed`}
									>
										<Trash2 size={16} />
										{deleteQuote.isPending
											? "Deleting..."
											: deleteConfirm
												? "Click Again to Confirm"
												: "Delete Quote"}
									</button>
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
								<h3 className="text-zinc-400 text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words whitespace-pre-wrap">
									{quote.description ||
										"No description provided"}
								</p>
							</div>

							{quote.address && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<MapPin size={14} />{" "}
										Address
									</h3>
									<p className="text-white break-words">
										{quote.address}
									</p>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>{" "}
										Created
									</h3>
									<p className="text-white">
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
										<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
											<Calendar
												size={
													14
												}
											/>{" "}
											Valid Until
										</h3>
										<p className="text-white">
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
								<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
									<DollarSign size={14} />{" "}
									Quote Total
								</h3>
								<p className="text-white font-medium text-2xl">
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
			<Card title="Financial Summary">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					<div className="lg:col-span-2">
						<h3 className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-4">
							Line Items
						</h3>
						{!quote.line_items ||
						quote.line_items.length === 0 ? (
							<div className="text-center py-8">
								<FileText
									size={40}
									className="mx-auto text-zinc-600 mb-3"
								/>
								<h3 className="text-zinc-400 text-sm font-medium mb-1">
									No Line Items
								</h3>
								<p className="text-zinc-500 text-xs">
									No line items have been
									added to this quote yet.
								</p>
							</div>
						) : (
							<div>
								{/* Header row */}
								<div className="grid grid-cols-12 gap-2 pb-2 border-b border-zinc-700 text-xs uppercase tracking-wide font-semibold text-zinc-400">
									<div className="col-span-5 min-w-0">Item / Description</div>
									<div className="col-span-1 min-w-0 text-center">Type</div>
									<div className="col-span-2 min-w-0 text-right">Qty</div>
									<div className="col-span-2 min-w-0 text-right">Unit Price</div>
									<div className="col-span-2 min-w-0 text-right">Amount</div>
								</div>
								{/* Data rows — items-start so numeric cols don't stretch when description wraps */}
								{quote.line_items.map((item, index) => (
									<div
										key={item.id || index}
										className="grid grid-cols-12 gap-2 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors items-start"
									>
										<div className="col-span-5 min-w-0 text-sm">
											<p className="text-white font-medium break-words">
												{item.name}
											</p>
											{item.description && (
												<p className="text-zinc-400 text-xs mt-0.5 break-words">
													{item.description}
												</p>
											)}
										</div>
										<div className="col-span-1 min-w-0 flex justify-center pt-0.5">
											{item.item_type && (
												<span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300 border border-zinc-600">
													{item.item_type}
												</span>
											)}
										</div>
										<div className="col-span-2 min-w-0 text-right text-sm text-white tabular-nums pt-0.5">
											{Number(item.quantity).toLocaleString("en-US", {
												minimumFractionDigits: 0,
												maximumFractionDigits: 2,
											})}
										</div>
										<div className="col-span-2 min-w-0 text-right text-sm text-white tabular-nums pt-0.5">
											{formatCurrency(Number(item.unit_price))}
										</div>
										<div className="col-span-2 min-w-0 text-right text-sm text-white font-semibold tabular-nums pt-0.5">
											{formatCurrency(Number(item.quantity) * Number(item.unit_price))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="lg:col-span-1 space-y-6">
						<div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-2">
							<div className="flex items-center justify-between gap-4 text-sm">
								<span className="text-zinc-400 flex-shrink-0">Total Items:</span>
								<span className="text-white font-medium tabular-nums">
									{quote.line_items?.length || 0}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4 text-sm">
								<span className="text-zinc-400 flex-shrink-0">Quote #:</span>
								<span className="text-white font-medium truncate">
									{quote.quote_number}
								</span>
							</div>
						</div>

						<div className="space-y-3">
							{quote.subtotal !== null &&
								quote.subtotal !== undefined && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-zinc-400">
											Subtotal:
										</span>
										<span className="text-white font-medium tabular-nums">
											{formatCurrency(
												Number(
													quote.subtotal
												)
											)}
										</span>
									</div>
								)}

							{quote.tax_amount !== null &&
								quote.tax_amount !== undefined &&
								Number(quote.tax_amount) > 0 && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-zinc-400">
											Tax{" "}
											{quote.tax_rate
												? `(${(Number(quote.tax_rate) * 100).toFixed(2)}%)`
												: ""}
											:
										</span>
										<span className="text-white font-medium tabular-nums">
											{formatCurrency(
												Number(
													quote.tax_amount
												)
											)}
										</span>
									</div>
								)}

							{quote.discount_amount !== null &&
								quote.discount_amount !==
									undefined &&
								Number(quote.discount_amount) >
									0 && (
									<div className="flex items-center justify-between text-sm">
										<span className="text-zinc-400">
											Discount{" "}
											{quote.discount_type ===
												"percent" &&
											quote.discount_value
												? `(${Number(quote.discount_value)}%)`
												: ""}
											:
										</span>
										<span className="text-green-400 font-medium tabular-nums">
											-
											{formatCurrency(
												Number(
													quote.discount_amount
												)
											)}
										</span>
									</div>
								)}

							<div className="border-t border-zinc-700 my-2" />

							<div className="flex items-center justify-between px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700">
								<div>
									<p className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-0.5">
										Quote Total
									</p>
									<p className="text-xs text-zinc-500">
										Final amount
									</p>
								</div>
								<p className="text-2xl font-bold text-blue-400 tabular-nums">
									{formatCurrency(
										Number(quote.total)
									)}
								</p>
							</div>
						</div>
					</div>
				</div>
			</Card>

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
						className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
					>
						<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold mb-2">
							Related Request
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
									{quote.request.title}
								</h4>
								<div className="flex items-center gap-2 text-xs text-zinc-500 mt-2">
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
					<div className="p-4 bg-zinc-900/40 rounded-lg border border-dashed border-zinc-800">
						<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold mb-2">
							Related Request
						</p>
						<div className="flex items-center gap-2 text-zinc-600 text-sm">
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
						className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
					>
						<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold mb-2">
							Related Job
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
									{quote.job.job_number}
								</h4>
								<p className="text-zinc-400 text-xs mb-2">
									{quote.job.name}
								</p>
								<div className="flex items-center gap-2 text-xs text-zinc-500">
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
									<span className="text-green-400 font-semibold text-sm whitespace-nowrap">
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
					<div className="p-4 bg-zinc-900/40 rounded-lg border border-dashed border-zinc-800">
						<div className="grid grid-cols-3 gap-4">
							<div className="col-span-2 flex flex-col gap-2">
								<p className="text-zinc-500 text-xs uppercase tracking-wide font-semibold">
									Related Job
								</p>
								<div className="flex items-center gap-2 text-zinc-600 text-sm">
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
									onClick={(e) => {
										e.stopPropagation();
										handleConvertToJob();
									}}
									className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
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
