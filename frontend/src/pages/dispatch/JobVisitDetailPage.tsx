import { useParams, useNavigate } from "react-router-dom";
import {
	Edit2,
	Clock,
	Users,
	DollarSign,
	CheckCircle2,
	XCircle,
	Pause,
	Play,
	MoreVertical,
	Receipt,
	Calendar,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
	useJobVisitByIdQuery,
	useStartJobVisitMutation,
	usePauseJobVisitMutation,
	useResumeJobVisitMutation,
	useCompleteJobVisitMutation,
	useCancelJobVisitMutation,
	useJobByIdQuery,
} from "../../hooks/useJobs";
import { useInvoicesByVisitIdQuery } from "../../hooks/useInvoices";
import { InvoiceStatusColors, InvoiceStatusLabels, type InvoiceStatus } from "../../types/invoices";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import EditJobVisit from "../../components/jobs/EditJobVisit";
import JobNoteManager from "../../components/jobs/JobNoteManager";
import { VisitStatusColors, type VisitStatus, type VisitLineItem } from "../../types/jobs";
import { formatCurrency, formatDateTime, formatTime } from "../../util/util";

export default function JobVisitDetailPage() {
	const { jobId, visitId } = useParams<{ jobId: string; visitId: string }>();
	const navigate = useNavigate();
	const { data: visit, isLoading: visitLoading } = useJobVisitByIdQuery(visitId!);
	const { data: job, isLoading: jobLoading } = useJobByIdQuery(jobId!);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
	const optionsMenuRef = useRef<HTMLDivElement>(null);

	const { data: linkedInvoices = [] } = useInvoicesByVisitIdQuery(jobId!, visitId!);

	const startVisitMutation = useStartJobVisitMutation();
	const pauseVisitMutation = usePauseJobVisitMutation();
	const resumeVisitMutation = useResumeJobVisitMutation();
	const completeVisitMutation = useCompleteJobVisitMutation();
	const cancelVisitMutation = useCancelJobVisitMutation();

	const isLoading = visitLoading || jobLoading;

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				optionsMenuRef.current &&
				!optionsMenuRef.current.contains(event.target as Node)
			) {
				setIsOptionsMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Loading visit details...</div>
			</div>
		);
	}

	if (!visit) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-white text-lg">Visit not found</div>
			</div>
		);
	}

	const handleStartVisit = async () => {
		try {
			await startVisitMutation.mutateAsync(visitId!);
			setIsOptionsMenuOpen(false);
		} catch (error) {
			console.error("Failed to start visit:", error);
		}
	};

	const handlePauseVisit = async () => {
		try {
			await pauseVisitMutation.mutateAsync(visitId!);
			setIsOptionsMenuOpen(false);
		} catch (error) {
			console.error("Failed to pause visit:", error);
		}
	};

	const handleResumeVisit = async () => {
		try {
			await resumeVisitMutation.mutateAsync(visitId!);
			setIsOptionsMenuOpen(false);
		} catch (error) {
			console.error("Failed to resume visit:", error);
		}
	};

	const handleCompleteVisit = async () => {
		if (
			window.confirm(
				"Are you sure you want to mark this visit as completed? This will record the actual end time."
			)
		) {
			try {
				await completeVisitMutation.mutateAsync(visitId!);
				setIsOptionsMenuOpen(false);
			} catch (error) {
				console.error("Failed to complete visit:", error);
			}
		}
	};

	const handleCancelVisit = async () => {
		const reason = window.prompt("Please provide a reason for cancelling this visit:");
		if (reason) {
			try {
				await cancelVisitMutation.mutateAsync({
					visitId: visitId!,
					cancellationReason: reason,
				});
				setIsOptionsMenuOpen(false);
			} catch (error) {
				console.error("Failed to cancel visit:", error);
			}
		}
	};

	const lineItems: VisitLineItem[] = visit.line_items || [];
	const hasLineItems = lineItems.length > 0;

	const formatConstraintTime = (time: string | null | undefined): string => {
		if (!time) return "";
		const [hours, minutes] = time.split(":").map(Number);
		const period = hours >= 12 ? "PM" : "AM";
		const displayHours = hours % 12 || 12;
		const displayMinutes = minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : "";
		return `${displayHours}${displayMinutes} ${period}`;
	};

	const formatVisitConstraints = (): string => {
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
				arrivalStr = "Arrive anytime";
				break;
			case "at":
				arrivalStr = `Arrive at ${formatConstraintTime(arrival_time)}`;
				break;
			case "between":
				arrivalStr = `Arrive between ${formatConstraintTime(arrival_window_start)} - ${formatConstraintTime(arrival_window_end)}`;
				break;
			case "by":
				arrivalStr = `Arrive by ${formatConstraintTime(arrival_window_end)}`;
				break;
		}

		let finishStr = "";
		switch (finish_constraint) {
			case "when_done":
				finishStr = "finish when done";
				break;
			case "at":
				finishStr = `finish at ${formatConstraintTime(finish_time)}`;
				break;
			case "by":
				finishStr = `finish by ${formatConstraintTime(finish_time)}`;
				break;
		}

		return `${arrivalStr}, ${finishStr}`;
	};

	const calculateDuration = (): number | null => {
		if (visit.actual_start_at && visit.actual_end_at) {
			return Math.round(
				(new Date(visit.actual_end_at).getTime() -
					new Date(visit.actual_start_at).getTime()) /
					(1000 * 60)
			);
		}
		if (visit.scheduled_start_at && visit.scheduled_end_at) {
			return Math.round(
				(new Date(visit.scheduled_end_at).getTime() -
					new Date(visit.scheduled_start_at).getTime()) /
					(1000 * 60)
			);
		}
		return null;
	};

	const formatDuration = (minutes: number | null): string => {
		if (minutes === null) return "N/A";
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours === 0) return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
		if (mins === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
		return `${hours} ${hours === 1 ? "hour" : "hours"} ${mins} ${mins === 1 ? "minute" : "minutes"}`;
	};

	const duration = calculateDuration();

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<h1 className="text-3xl font-bold text-white mb-2">
						{visit.name || "Job Visit"}
					</h1>
					<p className="text-zinc-400 text-sm">
						{formatDateTime(visit.scheduled_start_at)}
					</p>
				</div>

				<div className="justify-self-end flex items-center gap-3">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							VisitStatusColors[
								visit.status as VisitStatus
							] ||
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{visit.status}
					</span>

					<div className="relative" ref={optionsMenuRef}>
						<button
							onClick={() =>
								setIsOptionsMenuOpen(
									!isOptionsMenuOpen
								)
							}
							className="p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical size={20} />
						</button>

						{isOptionsMenuOpen && (
							<div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
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
										<Edit2 size={16} />
										Edit Visit
									</button>

									{visit.status ===
										"Scheduled" && (
										<button
											onClick={
												handleStartVisit
											}
											disabled={
												startVisitMutation.isPending
											}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
										>
											<Play
												size={
													16
												}
											/>
											Start Visit
										</button>
									)}

									{visit.status ===
										"InProgress" && (
										<>
											<button
												onClick={
													handlePauseVisit
												}
												disabled={
													pauseVisitMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<Pause
													size={
														16
													}
												/>
												Pause
												Visit
											</button>
											<button
												onClick={
													handleCompleteVisit
												}
												disabled={
													completeVisitMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<CheckCircle2
													size={
														16
													}
												/>
												Complete
												Visit
											</button>
										</>
									)}

									{visit.status ===
										"Paused" && (
										<button
											onClick={
												handleResumeVisit
											}
											disabled={
												resumeVisitMutation.isPending
											}
											className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
										>
											<Play
												size={
													16
												}
											/>
											Resume Visit
										</button>
									)}

									{(visit.status ===
										"Scheduled" ||
										visit.status ===
											"InProgress" ||
										visit.status ===
											"Paused") && (
										<>
											<div className="border-t border-zinc-800 my-1" />
											<button
												onClick={
													handleCancelVisit
												}
												disabled={
													cancelVisitMutation.isPending
												}
												className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50"
											>
												<XCircle
													size={
														16
													}
												/>
												Cancel
												Visit
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Visit Information (2/3) + Client Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					<Card title="Visit Information" className="h-full">
						<div className="space-y-4">
							{visit.description && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Description
									</h3>
									<p className="text-white break-words">
										{visit.description}
									</p>
								</div>
							)}

							<div>
								<h3 className="text-zinc-400 text-sm mb-1">
									Schedule Constraints
								</h3>
								<p className="text-white font-medium">
									{formatVisitConstraints()}
								</p>
							</div>

							<div>
								<h3 className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
									<Clock size={14} />
									Scheduled Time
								</h3>
								<div className="space-y-1">
									<p className="text-white">
										{formatDateTime(
											visit.scheduled_start_at
										)}{" "}
										-{" "}
										{formatTime(
											visit.scheduled_end_at
										)}
									</p>

									{visit.arrival_constraint ===
										"at" &&
										visit.arrival_time && (
											<p className="text-zinc-400 text-sm">
												Arrival:{" "}
												{formatConstraintTime(
													visit.arrival_time
												)}
											</p>
										)}
									{visit.arrival_constraint ===
										"between" &&
										visit.arrival_window_start &&
										visit.arrival_window_end && (
											<p className="text-zinc-400 text-sm">
												Arrival
												Window:{" "}
												{formatConstraintTime(
													visit.arrival_window_start
												)}{" "}
												-{" "}
												{formatConstraintTime(
													visit.arrival_window_end
												)}
											</p>
										)}
									{visit.arrival_constraint ===
										"by" &&
										visit.arrival_window_end && (
											<p className="text-zinc-400 text-sm">
												Arrive
												by:{" "}
												{formatConstraintTime(
													visit.arrival_window_end
												)}
											</p>
										)}
									{visit.finish_constraint ===
										"at" &&
										visit.finish_time && (
											<p className="text-zinc-400 text-sm">
												Finish
												at:{" "}
												{formatConstraintTime(
													visit.finish_time
												)}
											</p>
										)}
									{visit.finish_constraint ===
										"by" &&
										visit.finish_time && (
											<p className="text-zinc-400 text-sm">
												Finish
												by:{" "}
												{formatConstraintTime(
													visit.finish_time
												)}
											</p>
										)}
								</div>
							</div>

							{duration !== null && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Job Duration
									</h3>
									<p className="text-white font-medium">
										{formatDuration(
											duration
										)}
									</p>
								</div>
							)}

							{(visit.actual_start_at ||
								visit.actual_end_at) && (
								<div className="pt-4 border-t border-zinc-700">
									<h3 className="text-zinc-400 text-sm mb-2">
										Actual Times
									</h3>
									<div className="space-y-1">
										{visit.actual_start_at && (
											<p className="text-white text-sm">
												Started:{" "}
												{formatDateTime(
													visit.actual_start_at
												)}
											</p>
										)}
										{visit.actual_end_at && (
											<p className="text-white text-sm">
												Ended:{" "}
												{formatDateTime(
													visit.actual_end_at
												)}
											</p>
										)}
									</div>
								</div>
							)}

							{visit.cancellation_reason && (
								<div className="pt-4 border-t border-zinc-700">
									<h3 className="text-zinc-400 text-sm mb-1">
										Cancellation Reason
									</h3>
									<p className="text-white">
										{
											visit.cancellation_reason
										}
									</p>
								</div>
							)}
						</div>
					</Card>
				</div>

				<div className="lg:col-span-1">
					{job ? (
						<ClientDetailsCard
							client_id={job.client_id}
							client={job.client}
						/>
					) : (
						<Card title="Client Details" className="h-full">
							<p className="text-zinc-500 text-sm">
								Loading client details...
							</p>
						</Card>
					)}
				</div>
			</div>

			{/* Visit Financial Summary */}
			<Card title="Visit Financial Summary">
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
							No line items have been added to this visit
							yet.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						<div className="lg:col-span-2">
							<h3 className="text-zinc-400 text-xs uppercase tracking-wide font-semibold mb-4">
								Line Items
							</h3>
							<div className="space-y-1">
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
												<span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700 text-zinc-300 border border-zinc-600">
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
							</div>
						</div>

						<div className="lg:col-span-1 space-y-6">
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
										Visit Date:
									</span>
									<span className="text-white font-medium">
										{
											formatDateTime(
												visit.scheduled_start_at
											).split(
												" at "
											)[0]
										}
									</span>
								</div>
							</div>

							<div className="flex items-center justify-between px-4 py-3 bg-blue-500/10 rounded-lg border-2 border-blue-500/30">
								<div>
									<p className="text-zinc-300 text-xs uppercase tracking-wide font-semibold mb-0.5">
										Visit Total
									</p>
									<p className="text-xs text-blue-300">
										Total charges
									</p>
								</div>
								<p className="text-2xl font-bold text-blue-400 tabular-nums">
									{formatCurrency(
										lineItems.reduce(
											(
												sum,
												item
											) =>
												sum +
												Number(
													item.total
												),
											0
										)
									)}
								</p>
							</div>

							<div className="px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
								<p className="text-xs text-zinc-400 italic">
									Line items represent work
									performed during this visit.
								</p>
							</div>
						</div>
					</div>
				)}
			</Card>

			<div className="flex flex-col lg:flex-row gap-6 items-start">
				<div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
				{/* Linked Invoices */}
				<Card
					title="Linked Invoices" className="h-full"
				headerAction={
					linkedInvoices.length > 0 ? (
						<span className="text-sm text-zinc-400">
							{linkedInvoices.length} invoice{linkedInvoices.length !== 1 ? "s" : ""}
						</span>
					) : undefined
				}
			>
				{linkedInvoices.length === 0 ? (
					<div className="flex items-center gap-2 text-zinc-500 text-sm py-1">
						<Receipt size={14} className="flex-shrink-0" />
						<span>No invoices linked to this visit</span>
					</div>
				) : (
					<div className="flex flex-wrap gap-3">
						{linkedInvoices.map((invoice) => {
							const visitBilling = invoice.visits?.find((v) => v.visit_id === visitId);
							const billedAmount = visitBilling
								? Number(visitBilling.billed_amount)
								: null;
							return (
								<button
									key={invoice.id}
									onClick={() => navigate(`/dispatch/invoices/${invoice.id}`)}
									className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 hover:border-blue-500 hover:bg-zinc-750 transition-all cursor-pointer text-left group w-full"
								>
									<div className="flex items-center justify-between gap-6 mb-2">
										<span className="text-white font-semibold text-sm group-hover:text-blue-400 transition-colors tabular-nums">
											{invoice.invoice_number}
										</span>
										<span
											className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
												InvoiceStatusColors[invoice.status as InvoiceStatus] ??
												"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
											}`}
										>
											{InvoiceStatusLabels[invoice.status as InvoiceStatus] ?? invoice.status}
										</span>
									</div>
									<div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
										<Calendar size={11} />
										<span>
											{new Date(invoice.issue_date).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									</div>
									<div className="flex items-baseline gap-2">
										{billedAmount !== null ? (
											<>
												<span className="text-white font-semibold text-sm tabular-nums">
													{formatCurrency(billedAmount)}
												</span>
												<span className="text-xs text-zinc-500">billed this visit</span>
											</>
										) : (
											<span className="text-white font-semibold text-sm tabular-nums">
												{formatCurrency(Number(invoice.total))}
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>
				)}
			</Card>

				</div>
				<div className="flex-1 min-w-0 flex flex-col">
				{/* Assigned Technicians */}
			<Card
				title="Assigned Technicians" className="h-full"
				headerAction={
					visit.visit_techs && visit.visit_techs.length > 0 ? (
						<span className="text-sm text-zinc-400">
							{visit.visit_techs.length}{" "}
							{visit.visit_techs.length === 1
								? "technician"
								: "technicians"}
						</span>
					) : undefined
				}
			>
				{!visit.visit_techs || visit.visit_techs.length === 0 ? (
					<div className="text-center py-8">
						<Users
							size={40}
							className="mx-auto text-zinc-600 mb-3"
						/>
						<h3 className="text-zinc-400 text-sm font-medium mb-1">
							No Technicians Assigned
						</h3>
						<p className="text-zinc-500 text-xs">
							Edit this visit to assign technicians.
						</p>
					</div>
				) : (
					<div className="flex flex-wrap gap-3">
						{visit.visit_techs.map((vt) => (
							<button
						
								key={vt.tech_id}
								onClick={() => navigate(`/dispatch/technicians/${vt.tech_id}`)}
								className="relative bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 hover:border-zinc-600 rounded-lg p-3 transition-all cursor-pointer text-left group w-52 flex-shrink-0"
							>
								<div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${vt.tech.status === "Available" ? "bg-green-400" : vt.tech.status === "Busy" ? "bg-red-400" : vt.tech.status === "Offline" ? "bg-zinc-500" : "bg-blue-400"}`} />
								<div className="flex items-center gap-2 mb-2">
									<div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
										{vt.tech.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
									</div>
									<div className="flex-1 min-w-0 pr-3">
										<h4 className="text-white font-medium text-sm truncate group-hover:text-blue-400 transition-colors">{vt.tech.name}</h4>
										<p className="text-zinc-400 text-xs truncate">{vt.tech.title}</p>
									</div>
								</div>
								<div className="space-y-1 text-xs">
									{vt.tech.email && <p className="text-zinc-400 truncate">{vt.tech.email}</p>}
									{vt.tech.phone && <p className="text-zinc-400">{vt.tech.phone}</p>}
								</div>
							</button>
						))}
					</div>
				)}
				</Card>
				</div>
			</div>

			<JobNoteManager jobId={jobId!} visits={[visit]} visitId={visitId!} />

			{visit && job && isEditModalOpen && (
				<EditJobVisit
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					visit={visit}
					jobId={jobId!}
				/>
			)}
		</div>
	);
}
