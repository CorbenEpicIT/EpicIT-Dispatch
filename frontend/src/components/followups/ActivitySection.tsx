import { useState } from "react";
import { Loader2 } from "lucide-react";
import { usePermission } from "../../hooks/usePermission";
import { useEnrollmentsQuery, useStopEnrollmentMutation } from "../../hooks/useFollowups";
import { FollowupEnrollmentStatusValues, FollowupEnrollmentStatusLabels, type FollowupEnrollmentStatus } from "../../types/followups";
import { formatDateTime } from "../../util/util";
import { EnrollmentStatusBadge, OpenedBadge, useFeedback, FeedbackBanner, INPUT } from "./shared";

type StatusOption = "all" | FollowupEnrollmentStatus;

export default function ActivitySection() {
	const [statusFilter, setStatusFilter] = useState<StatusOption>("all");
	const { feedback, showFeedback } = useFeedback();

	const { data: enrollments, isLoading, error } = useEnrollmentsQuery(
		statusFilter === "all" ? undefined : { status: statusFilter }
	);
	const stopMutation = useStopEnrollmentMutation();

	const MANAGE_FOLLOWUPS = usePermission("manage_followups");

	const handleStop = async (id: string) => {
		if (!window.confirm("Stop this enrollment? No further emails will be sent.")) return;
		try {
			await stopMutation.mutateAsync(id);
			showFeedback("success", "Enrollment stopped.");
		} catch (e) {
			showFeedback("error", e instanceof Error ? e.message : "Failed to stop enrollment.");
		}
	};

	const displayEnrollments = enrollments ?? [];

	return (
		<div className="rounded-lg border border-border-subtle bg-base">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
				<div>
					<h2 className="text-sm font-semibold text-text-primary">Activity</h2>
					<p className="mt-0.5 text-xs text-text-muted">Client enrollments across all sequences.</p>
				</div>
				<div className="flex items-center gap-2">
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value as StatusOption)}
						className={`${INPUT} h-8 w-auto`}
					>
						<option value="all">All statuses</option>
						{FollowupEnrollmentStatusValues.map((s) => (
							<option key={s} value={s}>
								{FollowupEnrollmentStatusLabels[s]}
							</option>
						))}
					</select>
				</div>
			</div>

			<FeedbackBanner feedback={feedback} />

			{isLoading && (
				<div className="flex items-center justify-center px-5 py-10">
					<Loader2 size={20} className="animate-spin text-text-muted" />
				</div>
			)}

			{error && !isLoading && (
				<div className="px-5 py-6">
					<p className="text-sm text-error-text">{error.message}</p>
				</div>
			)}

			{!isLoading && !error && displayEnrollments.length === 0 && (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-text-muted">No enrollments match this filter.</p>
				</div>
			)}

			{!isLoading && !error && displayEnrollments.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[760px]">
						<thead>
							<tr className="border-b border-border-subtle">
								<th className="px-5 py-2.5 text-left text-xs font-medium text-text-muted">Client</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Sequence
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Status
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Step
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Next Send
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Opened
								</th>
								<th className="w-20 px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{displayEnrollments.map((enrollment, idx) => {
								// "Opened" reflects whether the recipient opened ANY email in
								// the sequence, not just the most recent send.
								const lastSendOpened = !!enrollment.sends?.some((s) => s.opened_at);
								return (
									<tr
										key={enrollment.id}
										className={`border-b border-border-subtle/50 transition-colors hover:bg-surface/40 ${
											idx === displayEnrollments.length - 1 ? "border-b-0" : ""
										}`}
									>
										<td className="px-5 py-3 text-sm font-medium text-text-primary">
											{enrollment.client?.name ?? "Unknown Client"}
										</td>
										<td className="px-3 py-3 text-xs text-text-secondary">
											{enrollment.sequence?.name ?? "Unknown Sequence"}
										</td>
										<td className="px-3 py-3">
											<EnrollmentStatusBadge status={enrollment.status} />
										</td>
										<td className="px-3 py-3 text-sm tabular-nums text-text-primary">
											{enrollment.current_step_order > 0
												? enrollment.current_step_order
												: "—"}
										</td>
										<td className="px-3 py-3 text-xs text-text-secondary">
											{enrollment.next_send_at ? (
												formatDateTime(enrollment.next_send_at)
											) : (
												<span className="text-text-muted">—</span>
											)}
										</td>
										<td className="px-3 py-3">
											{lastSendOpened ? (
												<OpenedBadge />
											) : (
												<span className="text-xs text-text-muted">—</span>
											)}
										</td>
										<td className="px-3 py-3">
											{MANAGE_FOLLOWUPS && enrollment.status === "active" && (
												<button
													type="button"
													onClick={() => handleStop(enrollment.id)}
													disabled={stopMutation.isPending}
													className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-error-text transition-colors hover:border-error-border hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
												>
													Stop
												</button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

		</div>
	);
}
