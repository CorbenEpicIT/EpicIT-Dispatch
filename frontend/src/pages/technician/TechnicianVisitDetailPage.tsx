import { useParams } from "react-router-dom";
import { Clock, Play, Pause, CheckCircle2, Users, Car, MapPin, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useJobVisitByIdQuery, useVisitTransitionMutation } from "../../hooks/useJobs";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import JobNoteManager from "../../components/jobs/JobNoteManager";
import TechnicianQuoteModal from "../../components/quotes/TechnicianQuoteModal";
import { VisitStatusColors, type VisitStatus, type LifecycleAction } from "../../types/jobs";
import { QuoteStatusColors } from "../../types/quotes";
import { formatDateTime, formatTime } from "../../util/util";
import { useAuthStore } from "../../auth/authStore";

const CONFIRM_ACTIONS = new Set<LifecycleAction>(["drive", "arrive", "complete"]);

export default function TechnicianVisitDetailPage() {
	const { visitId } = useParams<{ visitId: string }>();
	const { user } = useAuthStore();
	const { data: visit, isLoading } = useJobVisitByIdQuery(visitId!);
	const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);

	const transitionMutation = useVisitTransitionMutation();
	const [showQuoteModal, setShowQuoteModal] = useState(false);

	// Reset confirm state when visit status changes
	useEffect(() => {
		setPendingAction(null);
	}, [visit?.status]);

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

	const handleTransition = async (action: LifecycleAction) => {
		if (CONFIRM_ACTIONS.has(action) && pendingAction !== action) {
			setPendingAction(action);
			return;
		}
		try {
			await transitionMutation.mutateAsync({ visitId: visitId!, action });
			setPendingAction(null);
		} catch (error) {
			console.error("Failed to transition visit:", error);
		}
	};

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
	const job = visit.job;

	return (
		<div className="text-white space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-3 mb-6 sm:grid sm:grid-cols-2 sm:gap-4 sm:items-center">
				<div>
					<h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
						{visit.name || "Job Visit"}
					</h1>
					<p className="text-zinc-400 text-sm">
						{formatDateTime(visit.scheduled_start_at)}
					</p>
					{job && (
						<p className="text-zinc-500 text-sm mt-1">
							#{job.job_number} · {job.name}
						</p>
					)}
				</div>

				<div className="flex flex-col gap-2 sm:justify-self-end sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							VisitStatusColors[visit.status as VisitStatus] ||
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{visit.status}
					</span>

					{visit.visit_techs?.some((vt) => vt.tech?.email === user?.name) && visit.status === "Scheduled" && (
						<button
							onClick={() => handleTransition("drive")}
							disabled={transitionMutation.isPending}
							className={`flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto rounded-md text-sm font-medium disabled:opacity-50 transition-colors ${
								pendingAction === "drive"
									? "bg-cyan-500 hover:bg-cyan-400 animate-pulse"
									: "bg-cyan-700 hover:bg-cyan-600"
							}`}
						>
							<Car size={16} />
							{pendingAction === "drive" ? "Confirm Driving" : "I'm Driving"}
						</button>
					)}

					{visit.visit_techs?.some((vt) => vt.tech?.email === user?.name) && visit.status === "Driving" && (
						<button
							onClick={() => handleTransition("arrive")}
							disabled={transitionMutation.isPending}
							className={`flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto rounded-md text-sm font-medium disabled:opacity-50 transition-colors ${
								pendingAction === "arrive"
									? "bg-purple-500 hover:bg-purple-400 animate-pulse"
									: "bg-purple-700 hover:bg-purple-600"
							}`}
						>
							<MapPin size={16} />
							{pendingAction === "arrive" ? "Confirm Arrived" : "I've Arrived"}
						</button>
					)}

					{visit.visit_techs?.some((vt) => vt.tech?.email === user?.name) && visit.status === "OnSite" && (
						<button
							onClick={() => handleTransition("start")}
							disabled={transitionMutation.isPending}
							className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
						>
							<Play size={16} />
							Start Visit
						</button>
					)}

					{visit.visit_techs?.some((vt) => vt.tech?.email === user?.name) && visit.status === "InProgress" && (
						<>
							<button
								onClick={() => handleTransition("pause")}
								disabled={transitionMutation.isPending}
								className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto bg-amber-600 hover:bg-amber-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
							>
								<Pause size={16} />
								Pause
							</button>
							<button
								onClick={() => handleTransition("complete")}
								disabled={transitionMutation.isPending}
								className={`flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto rounded-md text-sm font-medium disabled:opacity-50 transition-colors ${
									pendingAction === "complete"
										? "bg-green-500 hover:bg-green-400 animate-pulse"
										: "bg-green-700 hover:bg-green-600"
								}`}
							>
								<CheckCircle2 size={16} />
								{pendingAction === "complete" ? "Confirm Complete" : "Complete"}
							</button>
						</>
					)}

					{visit.visit_techs?.some((vt) => vt.tech?.email === user?.name) && visit.status === "Paused" && (
						<button
							onClick={() => handleTransition("resume")}
							disabled={transitionMutation.isPending}
							className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] w-full sm:w-auto bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
						>
							<Play size={16} />
							Resume
						</button>
					)}
				</div>
			</div>

			{/* Visit Information (2/3) + Client/Job Details (1/3) */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-4">
					<Card title="Visit Information">
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
										{formatDateTime(visit.scheduled_start_at)}{" "}
										-{" "}
										{formatTime(visit.scheduled_end_at)}
									</p>

									{visit.arrival_constraint === "at" &&
										visit.arrival_time && (
											<p className="text-zinc-400 text-sm">
												Arrival:{" "}
												{formatConstraintTime(visit.arrival_time)}
											</p>
										)}
									{visit.arrival_constraint === "between" &&
										visit.arrival_window_start &&
										visit.arrival_window_end && (
											<p className="text-zinc-400 text-sm">
												Arrival Window:{" "}
												{formatConstraintTime(visit.arrival_window_start)}{" "}
												-{" "}
												{formatConstraintTime(visit.arrival_window_end)}
											</p>
										)}
									{visit.arrival_constraint === "by" &&
										visit.arrival_window_end && (
											<p className="text-zinc-400 text-sm">
												Arrive by:{" "}
												{formatConstraintTime(visit.arrival_window_end)}
											</p>
										)}
									{visit.finish_constraint === "at" &&
										visit.finish_time && (
											<p className="text-zinc-400 text-sm">
												Finish at:{" "}
												{formatConstraintTime(visit.finish_time)}
											</p>
										)}
									{visit.finish_constraint === "by" &&
										visit.finish_time && (
											<p className="text-zinc-400 text-sm">
												Finish by:{" "}
												{formatConstraintTime(visit.finish_time)}
											</p>
										)}
								</div>
							</div>

							{duration !== null && (
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">
										Duration
									</h3>
									<p className="text-white font-medium">
										{formatDuration(duration)}
									</p>
								</div>
							)}

							{(visit.actual_start_at || visit.actual_end_at) && (
								<div className="pt-4 border-t border-zinc-700">
									<h3 className="text-zinc-400 text-sm mb-2">
										Actual Times
									</h3>
									<div className="space-y-1">
										{visit.actual_start_at && (
											<p className="text-white text-sm">
												Started:{" "}
												{formatDateTime(visit.actual_start_at)}
											</p>
										)}
										{visit.actual_end_at && (
											<p className="text-white text-sm">
												Ended:{" "}
												{formatDateTime(visit.actual_end_at)}
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
									<p className="text-white">{visit.cancellation_reason}</p>
								</div>
							)}

							{visit.visit_techs && visit.visit_techs.length > 0 && (
								<div className="pt-4 border-t border-zinc-700">
									<h3 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
										<Users size={14} />
										Assigned Technicians
									</h3>
									<div className="flex flex-wrap gap-2">
										{visit.visit_techs.map((vt) => (
											<span
												key={vt.tech_id}
												className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-zinc-800 border border-zinc-700 text-zinc-300"
											>
												{vt.tech?.name ?? vt.tech_id}
											</span>
										))}
									</div>
								</div>
							)}

						</div>
					</Card>

					{job?.quote && (
						<Card title="Quote">
							<div className="space-y-3">
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">Quote</h3>
									<p className="text-white font-medium">
										#{job.quote.quote_number} · {job.quote.title}
									</p>
								</div>
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">Status</h3>
									<span
										className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
											QuoteStatusColors[job.quote.status as keyof typeof QuoteStatusColors] ??
											"bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
										}`}
									>
										{job.quote.status}
									</span>
								</div>
								<div>
									<h3 className="text-zinc-400 text-sm mb-1">Total</h3>
									<p className="text-white font-medium">
										${Number(job.quote.total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
									</p>
								</div>
								<button
									onClick={() => setShowQuoteModal(true)}
									className="w-full flex items-center justify-center gap-2 mt-1 px-3 py-2 rounded-md text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors"
								>
									<ChevronRight size={14} />
									View Full Quote
								</button>
							</div>
						</Card>
					)}
					{showQuoteModal && job?.quote?.id && (
						<TechnicianQuoteModal
							quoteId={job.quote.id}
							onClose={() => setShowQuoteModal(false)}
						/>
					)}
				</div>

				<div className="lg:col-span-1 space-y-4">
					{job ? (
						<>
							<ClientDetailsCard
								client_id={job.client_id}
								client={job.client}
								showDispatchLink={false}
							/>
							<Card title="Job Details">
								<div className="space-y-3">
									<div>
										<h3 className="text-zinc-400 text-sm mb-1">Job</h3>
										<p className="text-white font-medium">
											#{job.job_number} · {job.name}
										</p>
									</div>
									{job.address && (
										<div>
											<h3 className="text-zinc-400 text-sm mb-1">
												Address
											</h3>
											<p className="text-white">{job.address}</p>
										</div>
									)}
									{job.description && (
										<div>
											<h3 className="text-zinc-400 text-sm mb-1">
												Description
											</h3>
											<p className="text-white text-sm break-words">
												{job.description}
											</p>
										</div>
									)}
								</div>
							</Card>
						</>
					) : (
						<Card title="Job Details">
							<p className="text-zinc-500 text-sm">Loading job details...</p>
						</Card>
					)}
				</div>
			</div>

			{/* Notes */}
			<JobNoteManager jobId={visit.job_id} visitId={visitId} />
		</div>
	);
}
