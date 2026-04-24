import { useParams } from "react-router-dom";
import { Clock, Play, Pause, CheckCircle2, Users } from "lucide-react";
import { useState, useEffect } from "react";
import {
	useJobVisitByIdQuery,
	useStartJobVisitMutation,
	usePauseJobVisitMutation,
	useResumeJobVisitMutation,
	useCompleteJobVisitMutation,
} from "../../hooks/useJobs";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import JobNoteManager from "../../components/jobs/JobNoteManager";
import { VisitStatusColors, type VisitStatus } from "../../types/jobs";
import { formatDateTime, formatTime } from "../../util/util";

export default function TechnicianVisitDetailPage() {
	const { visitId } = useParams<{ visitId: string }>();
	const { data: visit, isLoading } = useJobVisitByIdQuery(visitId!);
	const [confirmComplete, setConfirmComplete] = useState(false);

	const startVisitMutation = useStartJobVisitMutation();
	const pauseVisitMutation = usePauseJobVisitMutation();
	const resumeVisitMutation = useResumeJobVisitMutation();
	const completeVisitMutation = useCompleteJobVisitMutation();

	// Reset confirm state when visit status changes
	useEffect(() => {
		setConfirmComplete(false);
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

	const handleStartVisit = async () => {
		try {
			await startVisitMutation.mutateAsync(visitId!);
		} catch (error) {
			console.error("Failed to start visit:", error);
		}
	};

	const handlePauseVisit = async () => {
		try {
			await pauseVisitMutation.mutateAsync(visitId!);
		} catch (error) {
			console.error("Failed to pause visit:", error);
		}
	};

	const handleResumeVisit = async () => {
		try {
			await resumeVisitMutation.mutateAsync(visitId!);
		} catch (error) {
			console.error("Failed to resume visit:", error);
		}
	};

	const handleCompleteVisit = async () => {
		if (!confirmComplete) {
			setConfirmComplete(true);
			return;
		}
		try {
			await completeVisitMutation.mutateAsync(visitId!);
			setConfirmComplete(false);
		} catch (error) {
			console.error("Failed to complete visit:", error);
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
			<div className="grid grid-cols-2 gap-4 mb-6 items-center">
				<div>
					<h1 className="text-3xl font-bold text-white mb-2">
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

				<div className="justify-self-end flex items-center gap-3 flex-wrap">
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
							VisitStatusColors[visit.status as VisitStatus] ||
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{visit.status}
					</span>

					{visit.status === "Scheduled" && (
						<button
							onClick={handleStartVisit}
							disabled={startVisitMutation.isPending}
							className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
						>
							<Play size={16} />
							Start Visit
						</button>
					)}

					{visit.status === "InProgress" && (
						<>
							<button
								onClick={handlePauseVisit}
								disabled={pauseVisitMutation.isPending}
								className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
							>
								<Pause size={16} />
								Pause
							</button>
							<button
								onClick={handleCompleteVisit}
								disabled={completeVisitMutation.isPending}
								className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors ${
									confirmComplete
										? "bg-green-500 hover:bg-green-400 animate-pulse"
										: "bg-green-700 hover:bg-green-600"
								}`}
							>
								<CheckCircle2 size={16} />
								{confirmComplete ? "Confirm Complete" : "Complete"}
							</button>
						</>
					)}

					{visit.status === "Paused" && (
						<button
							onClick={handleResumeVisit}
							disabled={resumeVisitMutation.isPending}
							className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
						>
							<Play size={16} />
							Resume
						</button>
					)}
				</div>
			</div>

			{/* Visit Information (2/3) + Client/Job Details (1/3) */}
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
