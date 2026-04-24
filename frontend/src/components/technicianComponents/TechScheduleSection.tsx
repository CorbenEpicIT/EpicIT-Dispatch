import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { JobVisit } from "../../types/jobs";
import { VisitStatusColors, VisitStatusLabels } from "../../types/jobs";

interface Props {
	todayVisits: JobVisit[];
	tomorrowVisits: JobVisit[];
	isLoading: boolean;
	error: Error | null;
}

function formatTimeRange(visit: JobVisit): string {
	const start = new Date(visit.scheduled_start_at);
	const end = new Date(visit.scheduled_end_at);
	const fmt = (d: Date) =>
		d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
	return `${fmt(start)} – ${fmt(end)}`;
}

export default function TechScheduleSection({ todayVisits, tomorrowVisits, isLoading, error }: Props) {
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
					<div key={i} className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
				<p className="text-sm text-red-400">Failed to load schedule</p>
			</div>
		);
	}

	if (sortedToday.length === 0 && tomorrowVisits.length === 0) {
		return <p className="text-sm text-zinc-500 italic">Nothing scheduled. Check with dispatch.</p>;
	}

	return (
		<div className="space-y-6">
			{/* TODAY */}
			<div>
				<div className="flex items-center gap-2 mb-3">
					<span className="text-xs font-semibold tracking-widest uppercase text-zinc-400">Today</span>
					{todayVisits.length > 0 && (
						<span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
							{todayVisits.length} {todayVisits.length === 1 ? "visit" : "visits"}
						</span>
					)}
				</div>

				{sortedToday.length === 0 ? (
					<p className="text-sm text-zinc-500 italic">No visits scheduled for today</p>
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
											? "bg-blue-950/40 border border-blue-800 border-l-blue-500"
											: isAnytime
											? "bg-zinc-900 border border-zinc-800 border-l-zinc-600"
											: "bg-zinc-900 border border-zinc-800 border-l-blue-500",
									].join(" ")}
								>
									<div className="flex justify-between items-start mb-1 gap-2">
										<span className="text-sm font-semibold text-zinc-100 leading-snug">
											{visit.name ?? "Visit"}
										</span>
										<span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${VisitStatusColors[visit.status]}`}>
											{VisitStatusLabels[visit.status]}
										</span>
									</div>
									<p className="text-xs text-zinc-400 mb-0.5">{visit.job?.client?.name ?? "—"}</p>
									{visit.job?.address && (
										<p className="text-xs text-blue-400 mb-0.5">{visit.job.address}</p>
									)}
									<p className="text-xs text-zinc-500 italic">
										{isAnytime ? "Anytime today" : formatTimeRange(visit)}
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
						<span className="text-xs font-semibold tracking-widest uppercase text-zinc-400">Tomorrow</span>
					</div>
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex justify-between items-center gap-3">
						<div className="min-w-0">
							<p className="text-sm font-semibold text-zinc-100 truncate">
								{tomorrowEarliest.name ?? "Visit"}
							</p>
							<p className="text-xs text-zinc-500 mt-0.5 truncate">
								{tomorrowEarliest.arrival_constraint === "anytime"
									? "Anytime"
									: new Date(tomorrowEarliest.scheduled_start_at).toLocaleTimeString("en-US", {
											hour: "numeric",
											minute: "2-digit",
										}).toLowerCase()}
								{tomorrowEarliest.job?.address ? ` · ${tomorrowEarliest.job.address}` : ""}
							</p>
						</div>
						{tomorrowVisits.length > 1 && (
							<span className="text-xs text-blue-400 font-medium whitespace-nowrap shrink-0">
								+{tomorrowVisits.length - 1} more
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
