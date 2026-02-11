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
	User,
	Mail,
	Phone,
	Trash2,
} from "lucide-react";
import { useQuoteByIdQuery, useDeleteQuoteMutation } from "../../hooks/useQuotes";
import { useCreateJobMutation } from "../../hooks/useJobs";
import { QuoteStatusColors } from "../../types/quotes";
import type { QuoteStatus } from "../../types/quotes";
import Card from "../../components/ui/Card";
import EditQuote from "../../components/quotes/EditQuote";
import ConvertToJob from "../../components/quotes/ConvertToJob";
import NoteManager from "../../components/quotes/QuoteNoteManager";
import { useState, useRef, useEffect } from "react";
import { formatCurrency } from "../../util/util";

export default function QuoteDetailPage() {
	const { quoteId } = useParams<{ quoteId: string }>();
	const navigate = useNavigate();
	const { data: quote, isLoading } = useQuoteByIdQuery(quoteId!);
	const { mutateAsync: createJob } = useCreateJobMutation();
	const deleteQuote = useDeleteQuoteMutation();

	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isConvertToJobModalOpen, setIsConvertToJobModalOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
				setDeleteConfirm(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
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

	const primaryContact = quote.client?.contacts?.find((cc) => cc.is_primary)?.contact;

	const getStatusColor = (status: string) => {
		return (
			QuoteStatusColors[status as QuoteStatus] ||
			"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
		);
	};

	const handleEdit = () => {
		setShowActionsMenu(false);
		setIsEditModalOpen(true);
	};

	const handleSendToClient = () => {
		setShowActionsMenu(false);
		// TODO: Implement send to client functionality
		console.log("Send to client");
	};

	const handleMarkAsApproved = () => {
		setShowActionsMenu(false);
		// TODO: Implement mark as approved functionality
		console.log("Mark as approved");
	};

	const handleConvertToJob = () => {
		setShowActionsMenu(false);
		setIsConvertToJobModalOpen(true);
	};

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}

		try {
			await deleteQuote.mutateAsync({
				id: quote.id,
				hardDelete: false,
			});
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
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(
							quote.status
						)}`}
					>
						{quote.status}
					</span>

					{/* Actions Menu */}
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
										<Edit2 size={16} />
										Edit Quote
									</button>
									<button
										onClick={
											handleSendToClient
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Send size={16} />
										Send to Client
									</button>
									<button
										onClick={
											handleMarkAsApproved
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<CheckCircle
											size={16}
										/>
										Mark as Approved
									</button>
									<button
										onClick={
											handleConvertToJob
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
										disabled={
											!!quote.job
										}
									>
										<Briefcase
											size={16}
										/>
										{quote.job
											? "Job Already Created"
											: "Convert to Job"}
									</button>

									{/* Divider */}
									<div className="my-1 border-t border-zinc-800"></div>

									{/* Delete Button */}
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

			{/* ... rest of the component stays exactly the same ... */}

			{/* Quote Information (2/3) and Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Quote Information - 2/3 width */}
				<div className="lg:col-span-2">
					<Card title="Quote Information" className="h-full">
						<div className="space-y-4">
							<div>
								<h3 className="text-zinc-400 text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words">
									{quote.description ||
										"No description provided"}
								</p>
							</div>

							{quote.address && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<MapPin size={14} />
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
										/>
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
											/>
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
									<DollarSign size={14} />
									Quote Total
								</h3>
								<p className="text-white font-medium text-2xl">
									$
									{Number(
										quote.total
									).toLocaleString("en-US", {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}
								</p>
							</div>
						</div>
					</Card>
				</div>

				{/* Client Details - 1/3 width */}
				<div className="lg:col-span-1">
					<Card
						title="Client Details"
						headerAction={
							quote.client?.is_active !== undefined && (
								<span
									className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
										quote.client
											.is_active
											? "bg-green-500/20 text-green-400 border-green-500/30"
											: "bg-red-500/20 text-red-400 border-red-500/30"
									}`}
								>
									{quote.client.is_active
										? "Active"
										: "Inactive"}
								</span>
							)
						}
						className="h-full"
					>
						<div className="space-y-4">
							<div>
								<h3 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
									<User size={14} />
									Client Name
								</h3>
								<p>
									{quote.client?.name ||
										"Unknown Client"}
								</p>
							</div>

							{quote.client?.address && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Address
									</h3>
									<p className="text-white text-sm break-words">
										{
											quote.client
												.address
										}
									</p>
								</div>
							)}

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
												<a className="text-white truncate">
													{
														primaryContact.email
													}
												</a>
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
												<a className="text-white">
													{
														primaryContact.phone
													}
												</a>
											</div>
										)}
									</div>
								</div>
							)}

							<button
								onClick={() =>
									navigate(
										`/dispatch/clients/${quote.client_id}`
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

			<Card title="Financial Summary">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Left Column - Line Items Table (2/3 width) */}
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
								{quote.line_items.map(
									(item, index) => (
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
												{
													item.quantity
												}
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
									)
								)}
							</div>
						)}
					</div>

					{/* Right Column - Financial Breakdown (1/3 width) */}
					<div className="lg:col-span-1 space-y-6">
						{/* Quote Metadata */}
						<div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-zinc-400">
									Total Items:
								</span>
								<span className="text-white font-medium tabular-nums">
									{quote.line_items?.length ||
										0}
								</span>
							</div>
							<div className="flex justify-between text-sm">
								<span className="text-zinc-400">
									Quote Number:
								</span>
								<span className="text-white font-medium">
									{quote.quote_number}
								</span>
							</div>
						</div>

						{/* Financial Breakdown */}
						<div className="space-y-3">
							{/* Subtotal */}
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

							{/* Tax */}
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

							{/* Discount */}
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

							{/* Divider */}
							<div className="border-t border-zinc-700 my-2"></div>

							{/* Quote Total */}
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

			{/* Related Request and Job - Half Width Layout */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Related Request - Half Width */}
				<Card title="Related Request">
					{!quote.request ? (
						<div className="text-center py-8">
							<FileText
								size={40}
								className="mx-auto text-zinc-600 mb-3"
							/>
							<h3 className="text-zinc-400 text-sm font-medium mb-1">
								No Request
							</h3>
							<p className="text-zinc-500 text-xs">
								This quote was not created from a
								request.
							</p>
						</div>
					) : (
						<button
							onClick={() =>
								navigate(
									`/dispatch/requests/${quote.request?.id}`
								)
							}
							className="w-full p-4 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
										{
											quote
												.request
												.title
										}
									</h4>
									<div className="flex items-center gap-2 text-xs text-zinc-500 mt-2">
										<Calendar
											size={12}
										/>
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
									className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
										quote.request.status
									)}`}
								>
									{quote.request.status}
								</span>
							</div>
						</button>
					)}
				</Card>

				{/* Related Job - Half Width */}
				<Card title="Related Job">
					{!quote.job ? (
						<div className="text-center py-8">
							<Briefcase
								size={40}
								className="mx-auto text-zinc-600 mb-3"
							/>
							<h3 className="text-zinc-400 text-sm font-medium mb-1">
								No Job Created
							</h3>
							<p className="text-zinc-500 text-xs mb-4">
								This quote has not been converted to
								a job yet.
							</p>
							<button
								onClick={handleConvertToJob}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
							>
								<Briefcase size={14} />
								Convert to Job
							</button>
						</div>
					) : (
						<button
							onClick={() =>
								navigate(
									`/dispatch/jobs/${quote.job!.id}`
								)
							}
							className="w-full p-4 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
										{
											quote.job
												.job_number
										}
									</h4>
									<p className="text-zinc-400 text-xs mb-2">
										{quote.job.name}
									</p>
									<div className="flex items-center gap-2 text-xs text-zinc-500">
										<Calendar
											size={12}
										/>
										<span>
											{new Date(
												quote
													.job
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
									className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
										quote.job.status
									)}`}
								>
									{quote.job.status}
								</span>
							</div>
						</button>
					)}
				</Card>
			</div>

			{/* Notes - Full Width */}
			<NoteManager quoteId={quoteId!} />

			{/* Modals */}
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
							if (!newJob?.id) {
								throw new Error(
									"Job creation failed: no ID returned"
								);
							}
							navigate(`/dispatch/jobs/${newJob.id}`);
							return newJob.id;
						}}
					/>
				</>
			)}
		</div>
	);
}
