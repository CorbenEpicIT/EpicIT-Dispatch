import { useParams, useNavigate } from "react-router-dom";
import {
	Edit2,
	User,
	Calendar,
	MapPin,
	DollarSign,
	MoreVertical,
	FileText,
	Briefcase,
	TrendingUp,
	Phone,
	Mail,
	Globe,
	ArrowRight,
	RotateCcw,
} from "lucide-react";
import { useRequestByIdQuery, useUpdateRequestMutation } from "../../hooks/useRequests";
import { useCreateQuoteMutation } from "../../hooks/useQuotes";
import { useCreateJobMutation } from "../../hooks/useJobs";
import Card from "../../components/ui/Card";
import EditRequest from "../../components/requests/EditRequest";
import ConvertToQuote from "../../components/requests/ConvertToQuote";
import ConvertToJob from "../../components/requests/ConvertToJob";
import NoteManager from "../../components/requests/RequestNoteManager";
import { useState, useRef, useEffect } from "react";

export default function RequestDetailPage() {
	const { requestId } = useParams<{ requestId: string }>();
	const navigate = useNavigate();
	const { data: request, isLoading } = useRequestByIdQuery(requestId!);
	const { mutateAsync: updateRequest } = useUpdateRequestMutation();
	const { mutateAsync: createQuote } = useCreateQuoteMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();

	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isConvertToQuoteModalOpen, setIsConvertToQuoteModalOpen] = useState(false);
	const [isConvertToJobModalOpen, setIsConvertToJobModalOpen] = useState(false);
	const [hasManualStatusChange, setHasManualStatusChange] = useState(false);
	const [hasAutoUpdated, setHasAutoUpdated] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	// Safeguarded auto-update: New → Reviewing after 10 seconds
	// BUT: Skip if user manually changed the status or already auto-updated
	useEffect(() => {
		if (!request || request.status !== "New" || hasManualStatusChange || hasAutoUpdated)
			return;

		const timeoutId = setTimeout(() => {
			if (!hasManualStatusChange && !hasAutoUpdated) {
				setHasAutoUpdated(true);
				updateRequest({
					id: request.id,
					data: { status: "Reviewing" },
				});
			}
		}, 5000); // Always wait 5 seconds from page open

		return () => {
			clearTimeout(timeoutId);
		};
	}, [request?.id, request?.status, hasManualStatusChange, hasAutoUpdated, updateRequest]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
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
				<div className="text-white text-lg">Loading request details...</div>
			</div>
		);
	}

	if (!request) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Request not found</div>
			</div>
		);
	}

	const primaryContact = request.client?.contacts?.find((cc) => cc.is_primary)?.contact;

	// Limit quotes and jobs to 5 entries
	const displayedQuotes = request.quotes?.slice(0, 5) || [];
	const hasMoreQuotes = (request.quotes?.length || 0) > 5;
	const totalQuotes = request.quotes?.length || 0;

	const displayedJobs = request.jobs?.slice(0, 5) || [];
	const hasMoreJobs = (request.jobs?.length || 0) > 5;
	const totalJobs = request.jobs?.length || 0;

	const getStatusColor = (status: string) => {
		switch (status) {
			case "New":
				return "bg-blue-500/20 text-blue-400 border-blue-500/30";
			case "Reviewing":
				return "bg-purple-500/20 text-purple-400 border-purple-500/30";
			case "Quoted":
				return "bg-amber-500/20 text-amber-400 border-amber-500/30";
			case "QuoteApproved":
				return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
			case "QuoteRejected":
				return "bg-rose-500/20 text-rose-400 border-rose-500/30";
			case "ConvertedToJob":
				return "bg-green-500/20 text-green-400 border-green-500/30";
			case "Cancelled":
				return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
			case "Unscheduled":
				return "bg-gray-500/20 text-gray-400 border-gray-500/30";
			case "Scheduled":
				return "bg-blue-500/20 text-blue-400 border-blue-500/30";
			case "InProgress":
				return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
			case "Completed":
				return "bg-green-500/20 text-green-400 border-green-500/30";
			default:
				return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority?.toLowerCase()) {
			case "emergency":
				return "text-red-500";
			case "urgent":
				return "text-orange-400";
			case "high":
				return "text-red-400";
			case "medium":
				return "text-amber-400";
			case "low":
				return "text-green-400";
			default:
				return "text-blue-400";
		}
	};

	const getSourceIcon = (source?: string | null) => {
		switch (source?.toLowerCase()) {
			case "phone":
				return <Phone size={14} />;
			case "email":
				return <Mail size={14} />;
			case "web":
				return <Globe size={14} />;
			default:
				return <FileText size={14} />;
		}
	};

	const handleEdit = () => {
		setShowActionsMenu(false);
		setIsEditModalOpen(true);
	};

	const handleConvertToQuote = () => {
		setShowActionsMenu(false);
		setIsConvertToQuoteModalOpen(true);
	};

	const handleConvertToJob = () => {
		setShowActionsMenu(false);
		setIsConvertToJobModalOpen(true);
	};

	const handleResetToNew = async () => {
		setShowActionsMenu(false);
		setHasManualStatusChange(true); // Mark as manually changed
		await updateRequest({
			id: request.id,
			data: { status: "New" },
		});
	};

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<h1 className="text-3xl font-bold text-white">{request.title}</h1>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(
							request.status
						)}`}
					>
						{request.status}
					</span>

					{/* Actions Menu */}
					<div className="relative" ref={menuRef}>
						<button
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
										Edit Request
									</button>
									<button
										onClick={
											handleConvertToQuote
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<FileText
											size={16}
										/>
										Convert to Quote
									</button>
									<button
										onClick={
											handleConvertToJob
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Briefcase
											size={16}
										/>
										Convert to Job
									</button>

									{/* Reset to New - Only show for Reviewing status */}
									{request.status ===
										"Reviewing" && (
										<>
											<div className="border-t border-zinc-800 my-1"></div>
											<button
												onClick={
													handleResetToNew
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 text-zinc-400"
											>
												<RotateCcw
													size={
														16
													}
												/>
												Reset
												to
												New
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Request Information (2/3) and Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Request Information*/}
				<div className="lg:col-span-2">
					<Card title="Request Information" className="h-full">
						<div className="space-y-4">
							<div>
								<h3 className="text-zinc-400 text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words">
									{request.description ||
										"No description provided"}
								</p>
							</div>

							{request.address && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<MapPin size={14} />
										Address
									</h3>
									<p className="text-white break-words">
										{request.address}
									</p>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<TrendingUp
											size={14}
										/>
										Priority
									</h3>
									<p
										className={`font-medium capitalize ${getPriorityColor(request.priority)}`}
									>
										{request.priority}
									</p>
								</div>
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>
										Created
									</h3>
									<p className="text-white">
										{new Date(
											request.created_at
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

							{request.estimated_value && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										<DollarSign
											size={14}
										/>
										Estimated Value
									</h3>
									<p className="text-white font-medium">
										$
										{Number(
											request.estimated_value
										).toLocaleString(
											"en-US",
											{
												minimumFractionDigits: 2,
												maximumFractionDigits: 2,
											}
										)}
									</p>
								</div>
							)}

							{request.source && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
										{getSourceIcon(
											request.source
										)}
										Source
									</h3>
									<div className="flex items-center gap-2">
										<span className="text-white capitalize">
											{
												request.source
											}
										</span>
										{request.source_reference && (
											<>
												<span className="text-zinc-600">
													•
												</span>
												<span className="text-zinc-400 text-sm">
													{
														request.source_reference
													}
												</span>
											</>
										)}
									</div>
								</div>
							)}

							{request.requires_quote && (
								<div>
									<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
										Quote Required
									</span>
								</div>
							)}

							{request.cancelled_at && (
								<div className="pt-4 border-t border-zinc-700">
									<h3 className="text-zinc-400 text-sm mb-2">
										Cancellation Details
									</h3>
									<div className="space-y-2">
										<p className="text-sm text-zinc-300">
											Cancelled
											on:{" "}
											{new Date(
												request.cancelled_at
											).toLocaleDateString(
												"en-US",
												{
													year: "numeric",
													month: "short",
													day: "numeric",
													hour: "numeric",
													minute: "2-digit",
												}
											)}
										</p>
										{request.cancellation_reason && (
											<p className="text-sm text-zinc-400">
												Reason:{" "}
												{
													request.cancellation_reason
												}
											</p>
										)}
									</div>
								</div>
							)}
						</div>
					</Card>
				</div>

				{/* Client Details */}
				<div className="lg:col-span-1">
					<Card
						title="Client Details"
						headerAction={
							request.client?.is_active !== undefined && (
								<span
									className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
										request.client
											.is_active
											? "bg-green-500/20 text-green-400 border-green-500/30"
											: "bg-red-500/20 text-red-400 border-red-500/30"
									}`}
								>
									{request.client.is_active
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
									{request.client?.name ||
										"Unknown Client"}
								</p>
							</div>

							{request.client?.address && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Address
									</h3>
									<p className="text-white text-sm break-words">
										{
											request
												.client
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
										`/dispatch/clients/${request.client_id}`
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

			{/* Related Quotes and Jobs*/}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Related Quotes*/}
				<Card
					title="Related Quotes"
					headerAction={
						<span className="text-sm text-zinc-400">
							{totalQuotes} quote
							{totalQuotes !== 1 ? "s" : ""}
						</span>
					}
				>
					{displayedQuotes.length === 0 ? (
						<div className="text-center py-8">
							<FileText
								size={40}
								className="mx-auto text-zinc-600 mb-3"
							/>
							<h3 className="text-zinc-400 text-sm font-medium mb-1">
								No Quotes
							</h3>
							<p className="text-zinc-500 text-xs">
								No quotes have been created for this
								request yet.
							</p>
						</div>
					) : (
						<>
							<div className="space-y-3">
								{displayedQuotes.map((quote) => (
									<button
										key={quote.id}
										onClick={() =>
											navigate(
												`/dispatch/quotes/${quote.id}`
											)
										}
										className="w-full p-4 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
													{
														quote.quote_number
													}
												</h4>
												<p className="text-zinc-400 text-xs mb-2">
													{quote.title ||
														"Quote"}
												</p>
												<div className="flex items-center gap-2 text-xs text-zinc-500">
													<Calendar
														size={
															12
														}
													/>
													<span>
														{new Date(
															quote.created_at
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
												<span className="text-green-400 font-semibold text-sm whitespace-nowrap">
													$
													{Number(
														quote.total
													).toLocaleString(
														"en-US",
														{
															minimumFractionDigits: 2,
															maximumFractionDigits: 2,
														}
													)}
												</span>
												<div className="flex flex-col items-end gap-1">
													<span
														className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
															quote.status
														)}`}
													>
														{
															quote.status
														}
													</span>
													{!quote.is_active && (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-400 border border-zinc-600">
															Superseded
														</span>
													)}
												</div>
											</div>
										</div>
									</button>
								))}
							</div>
							{hasMoreQuotes && (
								<button
									onClick={() =>
										navigate(
											`/dispatch/quotes?request=${requestId}`
										)
									}
									className="w-full mt-3 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
								>
									View All Quotes (
									{totalQuotes})
									<ArrowRight size={14} />
								</button>
							)}
						</>
					)}
				</Card>

				{/* Related Jobs*/}
				<Card
					title="Related Jobs"
					headerAction={
						<span className="text-sm text-zinc-400">
							{totalJobs} job{totalJobs !== 1 ? "s" : ""}
						</span>
					}
				>
					{displayedJobs.length === 0 ? (
						<div className="text-center py-8">
							<Briefcase
								size={40}
								className="mx-auto text-zinc-600 mb-3"
							/>
							<h3 className="text-zinc-400 text-sm font-medium mb-1">
								No Jobs
							</h3>
							<p className="text-zinc-500 text-xs">
								No jobs have been created for this
								request yet.
							</p>
						</div>
					) : (
						<>
							<div className="space-y-3">
								{displayedJobs.map((job) => (
									<button
										key={job.id}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${job.id}`
											)
										}
										className="w-full p-4 bg-zinc-800 hover:bg-zinc-750 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer text-left group"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<h4 className="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
													{
														job.job_number
													}
												</h4>
												<p className="text-zinc-400 text-xs mb-2">
													{
														job.name
													}
												</p>
												<div className="flex items-center gap-2 text-xs text-zinc-500">
													<Calendar
														size={
															12
														}
													/>
													<span>
														{new Date(
															job.created_at
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
													job.status
												)}`}
											>
												{
													job.status
												}
											</span>
										</div>
									</button>
								))}
							</div>
							{hasMoreJobs && (
								<button
									onClick={() =>
										navigate(
											`/dispatch/jobs?request=${requestId}`
										)
									}
									className="w-full mt-3 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
								>
									View All Jobs ({totalJobs})
									<ArrowRight size={14} />
								</button>
							)}
						</>
					)}
				</Card>
			</div>

			{/* Notes*/}
			<NoteManager requestId={requestId!} />

			{request && (
				<>
					<EditRequest
						isModalOpen={isEditModalOpen}
						setIsModalOpen={setIsEditModalOpen}
						request={request}
					/>

					<ConvertToQuote
						isModalOpen={isConvertToQuoteModalOpen}
						setIsModalOpen={setIsConvertToQuoteModalOpen}
						request={request}
						onConvert={async (quoteData) => {
							const newQuote =
								await createQuote(quoteData);
							if (!newQuote?.id) {
								throw new Error(
									"Quote creation failed: no ID returned"
								);
							}
							navigate(`/dispatch/quotes/${newQuote.id}`);
							return newQuote.id;
						}}
					/>

					<ConvertToJob
						isModalOpen={isConvertToJobModalOpen}
						setIsModalOpen={setIsConvertToJobModalOpen}
						request={request}
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
