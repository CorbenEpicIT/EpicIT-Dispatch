import { useParams, useNavigate } from "react-router-dom";
import {
	Edit2,
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
	RotateCcw,
	Link2Off,
} from "lucide-react";
import { useRequestByIdQuery, useUpdateRequestMutation } from "../../hooks/useRequests";
import { useCreateQuoteMutation } from "../../hooks/useQuotes";
import { useCreateJobMutation } from "../../hooks/useJobs";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
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

	// Auto-update: New → Reviewing after 5 seconds
	useEffect(() => {
		if (!request || request.status !== "New" || hasManualStatusChange || hasAutoUpdated)
			return;

		const timeoutId = setTimeout(() => {
			if (!hasManualStatusChange && !hasAutoUpdated) {
				setHasAutoUpdated(true);
				updateRequest({ id: request.id, data: { status: "Reviewing" } });
			}
		}, 5000);

		return () => clearTimeout(timeoutId);
	}, [request?.id, request?.status, hasManualStatusChange, hasAutoUpdated, updateRequest]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
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

	const firstQuote = request.quotes?.[0] ?? null;
	const firstJob = request.jobs?.[0] ?? null;

	const getStatusColor = (status: string) => {
		switch (status) {
			case "New":
				return "bg-primary/20 text-primary-text border-primary/30";
			case "Reviewing":
				return "bg-reviewing/20 text-reviewing-text border-reviewing/30";
			case "Quoted":
				return "bg-warning/20 text-warning-text border-warning/30";
			case "QuoteApproved":
				return "bg-emerald-500/20 text-success-text border-emerald-500/30";
			case "QuoteRejected":
				return "bg-rejected/20 text-rejected-text border-rejected/30";
			case "ConvertedToJob":
				return "bg-success/20 text-success-text border-success/30";
			case "Cancelled":
				return "bg-zinc-500/20 text-text-tertiary border-border-strong/30";
			case "Unscheduled":
				return "bg-gray-500/20 text-gray-400 border-gray-500/30";
			case "Scheduled":
				return "bg-primary/20 text-primary-text border-primary/30";
			case "InProgress":
				return "bg-yellow-500/20 text-warning-text border-yellow-500/30";
			case "Completed":
				return "bg-success/20 text-success-text border-success/30";
			default:
				return "bg-zinc-500/20 text-text-tertiary border-border-strong/30";
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority?.toLowerCase()) {
			case "emergency":
				return "text-red-500";
			case "urgent":
				return "text-orange-400";
			case "high":
				return "text-error-text";
			case "medium":
				return "text-warning-text";
			case "low":
				return "text-success-text";
			default:
				return "text-primary-text";
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
		setHasManualStatusChange(true);
		await updateRequest({ id: request.id, data: { status: "New" } });
	};

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<h1 className="text-3xl font-bold text-white">{request.title}</h1>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(request.status)}`}
					>
						{request.status}
					</span>

					<div className="relative" ref={menuRef}>
						<button
							onClick={() =>
								setShowActionsMenu(!showActionsMenu)
							}
							className="p-2 hover:bg-surface rounded-md transition-colors border border-border hover:border-border-strong"
						>
							<MoreVertical size={20} />
						</button>

						{showActionsMenu && (
							<div className="absolute right-0 mt-2 w-56 bg-base border border-border-subtle rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={handleEdit}
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2"
									>
										<Edit2 size={16} />{" "}
										Edit Request
									</button>
									<button
										onClick={
											handleConvertToQuote
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2"
									>
										<FileText
											size={16}
										/>{" "}
										Convert to Quote
									</button>
									<button
										onClick={
											handleConvertToJob
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2"
									>
										<Briefcase
											size={16}
										/>{" "}
										Convert to Job
									</button>
									{request.status ===
										"Reviewing" && (
										<>
											<div className="border-t border-border-subtle my-1" />
											<button
												onClick={
													handleResetToNew
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-surface transition-colors flex items-center gap-2 text-text-tertiary"
											>
												<RotateCcw
													size={
														16
													}
												/>{" "}
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
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
				<div className="lg:col-span-2">
					<Card title="Request Information">
						<div className="space-y-4">
							<div>
								<h3 className="text-text-tertiary text-sm mb-1">
									Description
								</h3>
								<p className="text-white break-words">
									{request.description ||
										"No description provided"}
								</p>
							</div>

							{request.address && (
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<MapPin size={14} />{" "}
										Address
									</h3>
									<p className="text-white break-words">
										{request.address}
									</p>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<TrendingUp
											size={14}
										/>{" "}
										Priority
									</h3>
									<p
										className={`font-medium capitalize ${getPriorityColor(request.priority)}`}
									>
										{request.priority}
									</p>
								</div>
								<div>
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<Calendar
											size={14}
										/>{" "}
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
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										<DollarSign
											size={14}
										/>{" "}
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
									<h3 className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
										{getSourceIcon(
											request.source
										)}{" "}
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
												<span className="text-text-faint">
													•
												</span>
												<span className="text-text-tertiary text-sm">
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
									<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning-text border border-warning/30">
										Quote Required
									</span>
								</div>
							)}

							{request.cancelled_at && (
								<div className="pt-4 border-t border-border">
									<h3 className="text-text-tertiary text-sm mb-2">
										Cancellation Details
									</h3>
									<div className="space-y-2">
										<p className="text-sm text-text-secondary">
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
											<p className="text-sm text-text-tertiary">
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

				<div className="lg:col-span-1">
					<ClientDetailsCard
						client_id={request.client_id}
						client={request.client}
					/>
				</div>
			</div>

			{/* Relations Row: Quote + Job */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
				{/* Related Quote */}
				{firstQuote ? (
					<button
						onClick={() =>
							navigate(
								`/dispatch/quotes/${firstQuote.id}`
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
									{firstQuote.quote_number}
								</h4>
								<p className="text-text-tertiary text-xs mb-2">
									{firstQuote.title ||
										"Quote"}
								</p>
								<div className="flex items-center gap-2 text-xs text-text-muted">
									<Calendar size={12} />
									<span>
										{new Date(
											firstQuote.created_at
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
										firstQuote.total
									).toLocaleString("en-US", {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}
								</span>
								<span
									className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(firstQuote.status)}`}
								>
									{firstQuote.status}
								</span>
							</div>
						</div>
					</button>
				) : (
					<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
						<div className="grid grid-cols-3 gap-4">
							<div className="col-span-2 flex flex-col gap-2">
								<p className="text-text-muted text-xs uppercase tracking-wide font-semibold">
									Related Quote
								</p>
								<div className="flex items-center gap-2 text-text-faint text-sm">
									<Link2Off
										size={14}
										className="flex-shrink-0"
									/>
									<span>
										No quote created yet
									</span>
								</div>
							</div>
							<div className="col-span-1 flex items-center justify-end">
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleConvertToQuote();
									}}
									className="flex items-center gap-2 px-3 py-1.5 bg-primary-hover hover:bg-blue-700 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
								>
									<FileText size={12} />{" "}
									Convert to Quote
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Related Job */}
				{firstJob ? (
					<button
						onClick={() =>
							navigate(`/dispatch/jobs/${firstJob.id}`)
						}
						className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
					>
						<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
							Related Job
						</p>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h4 className="text-white font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
									{firstJob.job_number}
								</h4>
								<p className="text-text-tertiary text-xs mb-2">
									{firstJob.name}
								</p>
								<div className="flex items-center gap-2 text-xs text-text-muted">
									<Calendar size={12} />
									<span>
										{new Date(
											firstJob.created_at
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
								className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(firstJob.status)}`}
							>
								{firstJob.status}
							</span>
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
									onClick={(e) => {
										e.stopPropagation();
										handleConvertToJob();
									}}
									className="flex items-center gap-2 px-3 py-1.5 bg-primary-hover hover:bg-blue-700 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
								>
									<Briefcase size={12} />{" "}
									Convert to Job
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

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
							if (!newQuote?.id)
								throw new Error(
									"Quote creation failed: no ID returned"
								);
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
							if (!newJob?.id)
								throw new Error(
									"Job creation failed: no ID returned"
								);
							navigate(`/dispatch/jobs/${newJob.id}`);
							return newJob.id;
						}}
					/>
				</>
			)}
		</div>
	);
}
