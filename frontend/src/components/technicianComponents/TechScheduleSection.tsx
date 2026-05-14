import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { JobVisit } from "../../types/jobs";
import { VisitStatusColors, VisitStatusLabels } from "../../types/jobs";
import { formatTime, FALLBACK_TIMEZONE } from "../../util/util";

interface Props {
	todayVisits: JobVisit[];
	tomorrowVisits: JobVisit[];
	tz?: string;
	isLoading: boolean;
	error: Error | null;
}

function formatTimeRange(visit: JobVisit, tz: string): string {
	return `${formatTime(visit.scheduled_start_at, tz)} – ${formatTime(visit.scheduled_end_at, tz)}`.toLowerCase();
}

export default function TechScheduleSection({ todayVisits, tomorrowVisits, tz = FALLBACK_TIMEZONE, isLoading, error }: Props) {
	const navigate = useNavigate();

	const sortedToday = useMemo(() => {
		const timed = todayVisits
			.filter((v) => v.arrival_constraint !== "anytime")
			.sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
		const anytime = todayVisits.filter((v) => v.arrival_constraint === "anytime");
		return [...timed, ...anytime];
	}, [todayVisits]);

	const activeVisitId = useMemo(() => {
		return sortedToday.find((v) => v.status !== "Completed" && v.status !== "Cancelled")?.id ?? null;
	}, [sortedToday]);

	const tomorrowEarliest = useMemo(() => {
		const timed = tomorrowVisits
			.filter((v) => v.arrival_constraint !== "anytime")
			.sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
		return timed[0] ?? tomorrowVisits[0] ?? null;
	}, [tomorrowVisits]);

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-20 bg-surface rounded-lg animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 bg-error/10 border border-error/20 rounded-lg">
				<p className="text-sm text-error-text">Failed to load schedule</p>
			</div>
		);
	}

	if (sortedToday.length === 0 && tomorrowVisits.length === 0) {
		return <p className="text-sm text-text-muted italic">Nothing scheduled. Check with dispatch.</p>;
	}

	return (
		<div className="space-y-6">
			{/* TODAY */}
			<div>
				<div className="flex items-center gap-2 mb-3">
					<span className="text-xs font-semibold tracking-widest uppercase text-text-tertiary">Today</span>
					{todayVisits.length > 0 && (
						<span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text-tertiary">
							{todayVisits.length} {todayVisits.length === 1 ? "visit" : "visits"}
						</span>
					)}
				</div>

				{sortedToday.length === 0 ? (
					<p className="text-sm text-text-muted italic">No visits scheduled for today</p>
				) : (
					<div className="space-y-2">
						{sortedToday.map((visit) => {
							const isActive = visit.id === activeVisitId;
							const isAnytime = visit.arrival_constraint === "anytime";
							return (
								<div
									key={visit.id}
									onClick={() => navigate(`/technician/visits/${visit.id}`)}
									className={[
										"rounded-lg p-3 border-l-[3px] cursor-pointer active:opacity-80 hover:brightness-110 transition-[filter]",
										isActive
											? "bg-blue-950/40 border border-primary-active border-l-blue-500"
											: isAnytime
											? "bg-base border border-border-subtle border-l-zinc-600"
											: "bg-base border border-border-subtle border-l-blue-500",
									].join(" ")}
								>
									<div className="flex justify-between items-start mb-1 gap-2">
										<span className="text-sm font-semibold text-text-primary leading-snug">
											{visit.name ?? "Visit"}
										</span>
										<span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${VisitStatusColors[visit.status]}`}>
											{VisitStatusLabels[visit.status]}
										</span>
									</div>
									<p className="text-xs text-text-tertiary mb-0.5">{visit.job?.client?.name ?? "—"}</p>
									{visit.job?.address && (
										<p className="text-xs text-primary-text mb-0.5">{visit.job.address}</p>
									)}
									<p className="text-xs text-text-muted italic">
										{isAnytime ? "Anytime today" : formatTimeRange(visit, tz)}
									</p>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* TOMORROW */}
			{tomorrowVisits.length > 0 && tomorrowEarliest && (
				<div>
					<div className="flex items-center gap-2 mb-3">
						<span className="text-xs font-semibold tracking-widest uppercase text-text-tertiary">Tomorrow</span>
					</div>
					<div className="bg-base border border-border-subtle rounded-lg p-3 flex justify-between items-center gap-3">
						<div className="min-w-0">
							<p className="text-sm font-semibold text-text-primary truncate">
								{tomorrowEarliest.name ?? "Visit"}
							</p>
							<p className="text-xs text-text-muted mt-0.5 truncate">
								{tomorrowEarliest.arrival_constraint === "anytime"
									? "Anytime"
									: formatTime(tomorrowEarliest.scheduled_start_at, tz).toLowerCase()}
								{tomorrowEarliest.job?.address ? ` · ${tomorrowEarliest.job.address}` : ""}
							</p>
						</div>
						{tomorrowVisits.length > 1 && (
							<span className="text-xs text-primary-text font-medium whitespace-nowrap shrink-0">
								+{tomorrowVisits.length - 1} more
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
