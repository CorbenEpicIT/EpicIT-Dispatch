import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Phone, X } from "lucide-react";
import { useAuthStore } from "../../auth/authStore";
import { useJobVisitsByTechIdQuery, useCreateJobNoteMutation } from "../../hooks/useJobs";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import TechVisitCard from "../../components/technicianComponents/TechVisitCard";
import AddNotePhotoModal from "../../components/technicianComponents/AddNotePhotoModal";
import type { NotePhoto } from "../../components/technicianComponents/AddNotePhotoModal";
import type { JobVisit, VisitStatus } from "../../types/jobs";
import { formatTime, FALLBACK_TIMEZONE } from "../../util/util";

// ─── constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: VisitStatus[] = ["Driving", "OnSite", "InProgress", "Paused"];
const UP_NEXT_MINUTES = 30;

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatNextDayHeader(d: Date, tz: string): string {
	return d
		.toLocaleDateString("en-US", {
			weekday: "long",
			month: "short",
			day: "numeric",
			timeZone: tz,
		})
		.toUpperCase();
}

/** Compare two Dates by calendar day in the org's timezone. */
function isSameDay(a: Date, b: Date, tz: string): boolean {
	return (
		a.toLocaleDateString("en-CA", { timeZone: tz }) ===
		b.toLocaleDateString("en-CA", { timeZone: tz })
	);
}

export default function TechnicianDashboardPage() {
	const { user } = useAuthStore();
	const navigate = useNavigate();

	const {
		data: visits = [],
		isLoading,
		error,
	} = useJobVisitsByTechIdQuery(user?.userId ?? "");
	const { data: techProfile } = useTechnicianByIdQuery(user?.userId ?? null);
	const insertNoteMutation = useCreateJobNoteMutation();

	const [vehicleBannerDismissed, setVehicleBannerDismissed] = useState(false);
	const [showNotePhotoModal, setShowNotePhotoModal] = useState(false);
	const [notePhotoTargetVisitId, setNotePhotoTargetVisitId] = useState<string | null>(null);

	// ── date bucketing ──────────────────────────────────────────────────────

	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const { todayVisits, futureVisits } = useMemo(() => {
		const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

		const today = visits
			.filter(
				(v) =>
					new Date(v.scheduled_start_at).toLocaleDateString("en-CA", {
						timeZone: tz,
					}) === todayStr
			)
			.sort(
				(a, b) =>
					new Date(a.scheduled_start_at).getTime() -
					new Date(b.scheduled_start_at).getTime()
			);

		const future = visits
			.filter(
				(v) =>
					new Date(v.scheduled_start_at).toLocaleDateString("en-CA", {
						timeZone: tz,
					}) > todayStr
			)
			.sort(
				(a, b) =>
					new Date(a.scheduled_start_at).getTime() -
					new Date(b.scheduled_start_at).getTime()
			);

		return { todayVisits: today, futureVisits: future };
	}, [visits, tz]);

	// ── derived visit state ─────────────────────────────────────────────────

	const {
		activeVisits,
		overdueVisits,
		upNextVisits,
		upcomingVisits,
		nextTodayVisit,
		nextFutureVisit,
		nextDayVisits,
	} = useMemo(() => {
		const now = Date.now();
		const upNextThresholdMs = UP_NEXT_MINUTES * 60_000;

		const actives = todayVisits.filter((v) => ACTIVE_STATUSES.includes(v.status));
		const scheduled = todayVisits.filter(
			(v) => v.status === "Scheduled" || v.status === "Delayed"
		);
		const overdue = scheduled.filter(
			(v) => new Date(v.scheduled_start_at).getTime() < now
		);
		const upNext = scheduled.filter((v) => {
			const diff = new Date(v.scheduled_start_at).getTime() - now;
			return diff >= 0 && diff < upNextThresholdMs;
		});
		const upcoming = scheduled.filter(
			(v) => new Date(v.scheduled_start_at).getTime() - now >= upNextThresholdMs
		);

		const nextToday =
			scheduled.sort(
				(a, b) =>
					new Date(a.scheduled_start_at).getTime() -
					new Date(b.scheduled_start_at).getTime()
			)[0] ?? null;

		const nextFuture = futureVisits[0] ?? null;
		const nextDayDate = nextFuture ? new Date(nextFuture.scheduled_start_at) : null;
		const nextDay = nextDayDate
			? futureVisits.filter((v) =>
					isSameDay(new Date(v.scheduled_start_at), nextDayDate, tz)
				)
			: [];

		return {
			activeVisits: actives,
			overdueVisits: overdue,
			upNextVisits: upNext,
			upcomingVisits: upcoming,
			nextTodayVisit: nextToday,
			nextFutureVisit: nextFuture,
			nextDayVisits: nextDay,
		};
	}, [todayVisits, futureVisits, tz]);

	const doneCount = todayVisits.filter(
		(v) => v.status === "Completed" || v.status === "Cancelled"
	).length;

	// ── actions ─────────────────────────────────────────────────────────────

	const handleAddNotePhoto = async (
		visitId: string,
		jobId: string,
		content: string,
		photos: NotePhoto[],
	) => {
		await insertNoteMutation.mutateAsync({
			jobId,
			data: {
				content,
				visit_id: visitId,
				photos: photos.map((p) => ({
					photo_url: p.photo_url,
					photo_label: p.photo_label,
				})),
			},
		});
	};

	const noVehicle = techProfile && !techProfile.current_vehicle_id;

	// ── hero type ───────────────────────────────────────────────────────────

	type HeroType = "next-today" | "next-future" | "empty";
	const heroType: HeroType = nextTodayVisit
		? "next-today"
		: nextFutureVisit
			? "next-future"
			: "empty";

	// ── loading / error ─────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="px-4 sm:px-6 pt-5 pb-8 max-w-lg w-full space-y-4 lg:max-w-4xl lg:px-8">
				<div className="h-7 w-36 bg-zinc-800 rounded animate-pulse" />
				<div className="h-4 w-28 bg-zinc-800/50 rounded animate-pulse" />
				<div className="h-28 bg-zinc-800 rounded-xl animate-pulse mt-2" />
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-[52px] bg-zinc-800/50 rounded-lg animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="px-4 sm:px-6 pt-5 max-w-lg w-full">
				<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
					<p className="text-sm text-red-400">
						Failed to load schedule.
					</p>
				</div>
			</div>
		);
	}

	// ── render ───────────────────────────────────────────────────────────────

	return (
		<div className="px-4 sm:px-6 pt-5 pb-10 max-w-lg w-full lg:max-w-4xl lg:px-8">
			{/* Vehicle warning banner */}
			{noVehicle && !vehicleBannerDismissed && (
				<div className="flex items-center justify-between gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
					<button
						onClick={() => navigate("/technician/vehicle")}
						className="flex items-center gap-2 flex-1 text-left text-sm"
					>
						<AlertTriangle size={15} className="shrink-0" />
						No vehicle selected — tap to set up your truck
					</button>
					<button
						onClick={() => setVehicleBannerDismissed(true)}
						className="text-amber-500/60 hover:text-amber-400"
					>
						<X size={15} />
					</button>
				</div>
			)}

			{/* Page header */}
			<div className="flex items-center justify-between mb-4">
				<div>
					<h1 className="text-xl font-bold text-white tracking-tight">
						My Dashboard
					</h1>
					<p className="text-sm text-zinc-500 mt-0.5">
						{new Date().toLocaleDateString("en-US", {
							weekday: "long",
							month: "long",
							day: "numeric",
							timeZone: tz,
						})}
					</p>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					<span className="px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-400 text-xs font-medium tabular-nums">
						{todayVisits.length}{" "}
						{todayVisits.length === 1 ? "visit" : "visits"}
					</span>
					{doneCount > 0 && (
						<span className="px-2.5 py-1 rounded-md bg-zinc-800 text-green-400 text-xs font-medium tabular-nums">
							{doneCount} done
						</span>
					)}
				</div>
			</div>

			{/* Quick actions row */}
			<div className="mb-5">
				<a
					href="tel:"
					className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors w-full"
				>
					<Phone size={15} />
					Call Dispatch
				</a>
			</div>

			{/* ── Responsive grid: hero left, schedule right on lg+ ── */}
			<div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
				{/* ── Hero section: all active visits ──────────────────────────────── */}
				<div className="mb-6 space-y-3 lg:mb-0">
					{activeVisits.length === 0 &&
						(heroType === "empty" ? (
							<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
								<p className="text-sm text-zinc-600">
									No visits scheduled. Check
									with dispatch.
								</p>
							</div>
						) : heroType === "next-today" && nextTodayVisit ? (
							<NextUpCard
								visit={nextTodayVisit}
								dayLabel="Today"
								dayLabelClass="text-blue-400"
								timeClass="text-blue-400"
								tz={tz}
								onNavigate={() =>
									navigate(
										`/technician/visits/${nextTodayVisit.id}`
									)
								}
							/>
						) : nextFutureVisit ? (
							<NextUpCard
								visit={nextFutureVisit}
								dayLabel={new Date(
									nextFutureVisit.scheduled_start_at
								)
									.toLocaleDateString(
										"en-US",
										{
											weekday: "short",
											month: "short",
											day: "numeric",
											timeZone: tz,
										}
									)
									.toUpperCase()}
								dayLabelClass="text-violet-400"
								timeClass="text-violet-400"
								tz={tz}
								onNavigate={() =>
									navigate(
										`/technician/visits/${nextFutureVisit.id}`
									)
								}
							/>
						) : null)}

					{activeVisits.map((visit) => (
						<TechVisitCard
							key={visit.id}
							visit={visit}
							techId={user?.userId ?? ""}
							tz={tz}
							onAddNotePhoto={() => {
								setNotePhotoTargetVisitId(visit.id);
								setShowNotePhotoModal(true);
							}}
						/>
					))}
				</div>

				{/* ── Right column: schedule sections ── */}
				<div className="space-y-6">
					{/* ── Today's schedule with buckets ─────────────────────────────── */}
					<div>
						<div className="flex items-center justify-between mb-3">
							<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
								Today · {todayVisits.length}{" "}
								{todayVisits.length === 1
									? "visit"
									: "visits"}
							</span>
							{doneCount > 0 && (
								<span className="text-[10px] font-semibold text-green-500/80">
									{doneCount} done
								</span>
							)}
						</div>

						{todayVisits.length === 0 ? (
							<p className="text-sm text-zinc-600 py-2">
								Nothing scheduled today.
							</p>
						) : (
							<div className="space-y-3">
								{/* Overdue bucket */}
								{overdueVisits.length > 0 && (
									<div>
										<p className="text-[10px] font-bold uppercase tracking-widest text-red-500/80 mb-1.5 px-0.5">
											Overdue
										</p>
										<div className="rounded-xl border border-red-500/20 bg-zinc-900 overflow-hidden divide-y divide-zinc-800/80">
											{overdueVisits.map(
												(
													visit
												) => (
													<ScheduleRow
														key={
															visit.id
														}
														visit={
															visit
														}
														tz={
															tz
														}
														isOverdue
														onClick={() =>
															navigate(
																`/technician/visits/${visit.id}`
															)
														}
													/>
												)
											)}
										</div>
									</div>
								)}

								{/* Up Next bucket */}
								{upNextVisits.length > 0 && (
									<div>
										<p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80 mb-1.5 px-0.5">
											Up Next
										</p>
										<div className="rounded-xl border border-amber-500/20 bg-zinc-900 overflow-hidden divide-y divide-zinc-800/80">
											{upNextVisits.map(
												(
													visit
												) => (
													<ScheduleRow
														key={
															visit.id
														}
														visit={
															visit
														}
														tz={
															tz
														}
														isUpNext
														onClick={() =>
															navigate(
																`/technician/visits/${visit.id}`
															)
														}
													/>
												)
											)}
										</div>
									</div>
								)}

								{/* Upcoming bucket */}
								{upcomingVisits.length > 0 && (
									<div>
										<p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5 px-0.5">
											Upcoming
										</p>
										<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800/80">
											{upcomingVisits.map(
												(
													visit
												) => (
													<ScheduleRow
														key={
															visit.id
														}
														visit={
															visit
														}
														tz={
															tz
														}
														onClick={() =>
															navigate(
																`/technician/visits/${visit.id}`
															)
														}
													/>
												)
											)}
										</div>
									</div>
								)}

								{/* Completed/Cancelled */}
								{todayVisits.filter(
									(v) =>
										v.status ===
											"Completed" ||
										v.status ===
											"Cancelled"
								).length > 0 && (
									<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800/80">
										{todayVisits
											.filter(
												(
													v
												) =>
													v.status ===
														"Completed" ||
													v.status ===
														"Cancelled"
											)
											.map(
												(
													visit
												) => (
													<ScheduleRow
														key={
															visit.id
														}
														visit={
															visit
														}
														tz={
															tz
														}
														onClick={() =>
															navigate(
																`/technician/visits/${visit.id}`
															)
														}
													/>
												)
											)}
									</div>
								)}
							</div>
						)}
					</div>

					{/* ── Next scheduled day ────────────────────────────────────────── */}
					{nextDayVisits.length > 0 && (
						<div className="mb-6 lg:mb-0">
							<div className="flex items-center justify-between mb-3">
								<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
									{formatNextDayHeader(
										new Date(
											nextDayVisits[0]
												.scheduled_start_at
										),
										tz
									)}
								</span>
								<span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500">
									{nextDayVisits.length}{" "}
									{nextDayVisits.length === 1
										? "visit"
										: "visits"}
								</span>
							</div>
							<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
								<div
									onClick={() =>
										navigate(
											`/technician/visits/${nextDayVisits[0].id}`
										)
									}
									className="flex items-center gap-3 px-3 py-3 min-h-[52px] cursor-pointer hover:bg-zinc-800/40 transition-colors duration-150"
								>
									<div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-zinc-700" />
									<div className="flex-1 min-w-0">
										<p className="text-sm font-semibold text-zinc-400 truncate">
											{nextDayVisits[0]
												.name ??
												"Visit"}
										</p>
										<p className="text-xs text-zinc-600 truncate">
											{nextDayVisits[0]
												.job
												?.client
												?.name ??
												"—"}
										</p>
									</div>
									<span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
										{formatTime(
											nextDayVisits[0]
												.scheduled_start_at,
											tz
										)}
									</span>
								</div>
								{nextDayVisits.length > 1 && (
									<button
										onClick={() =>
											navigate(
												"/technician/visits"
											)
										}
										className="w-full px-3 py-2 border-t border-zinc-800/60 text-center hover:bg-zinc-800/40 transition-colors duration-150"
									>
										<span className="text-[11px] text-zinc-500">
											+
											{nextDayVisits.length -
												1}{" "}
											more
										</span>
									</button>
								)}
							</div>
						</div>
					)}
				</div>
				{/* end right column */}
			</div>
			{/* end lg grid */}

			{/* Unified Add Note/Photo modal */}
			{showNotePhotoModal && (
				<AddNotePhotoModal
					visits={
						notePhotoTargetVisitId
							? activeVisits.filter((v) => v.id === notePhotoTargetVisitId)
							: activeVisits
					}
					preselectedVisitId={notePhotoTargetVisitId}
					onClose={() => {
						setShowNotePhotoModal(false);
						setNotePhotoTargetVisitId(null);
					}}
					onSubmit={handleAddNotePhoto}
				/>
			)}
		</div>
	);
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface NextUpCardProps {
	visit: JobVisit;
	dayLabel: string;
	dayLabelClass: string;
	timeClass: string;
	tz: string;
	onNavigate: () => void;
}

function NextUpCard({
	visit,
	dayLabel,
	dayLabelClass,
	timeClass,
	tz,
	onNavigate,
}: NextUpCardProps) {
	return (
		<div
			onClick={onNavigate}
			className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 cursor-pointer hover:border-zinc-700 active:scale-[0.99] transition-all duration-150"
		>
			<div className="flex items-center gap-1 mb-2">
				<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
					Next Up ·&nbsp;
				</span>
				<span
					className={`text-[10px] font-bold tracking-[0.1em] uppercase ${dayLabelClass}`}
				>
					{dayLabel}
				</span>
			</div>
			<p className="text-[15px] font-bold text-white leading-snug mb-0.5">
				{visit.name ?? "Visit"}
			</p>
			{visit.job?.client?.name && (
				<p className="text-xs text-zinc-500 mb-0.5">
					{visit.job.client.name}
				</p>
			)}
			{visit.job?.address && (
				<p className="text-xs text-zinc-400 mb-3">📍 {visit.job.address}</p>
			)}
			<div className="flex items-end justify-between">
				<p
					className={`text-2xl font-bold tabular-nums tracking-tight ${timeClass}`}
				>
					{formatTime(visit.scheduled_start_at, tz)}
				</p>
				<span className="text-zinc-700 text-sm mb-0.5">›</span>
			</div>
		</div>
	);
}

interface ScheduleRowProps {
	visit: JobVisit;
	tz: string;
	isOverdue?: boolean;
	isUpNext?: boolean;
	onClick: () => void;
}

function ScheduleRow({ visit, tz, isOverdue, isUpNext, onClick }: ScheduleRowProps) {
	const isActive = ACTIVE_STATUSES.includes(visit.status);
	const isDone = visit.status === "Completed" || visit.status === "Cancelled";
	const diffMin = isUpNext
		? Math.max(
				0,
				Math.round(
					(new Date(visit.scheduled_start_at).getTime() -
						Date.now()) /
						60_000
				)
			)
		: 0;

	return (
		<div
			onClick={onClick}
			className={`flex items-center gap-3 min-h-[52px] cursor-pointer transition-colors duration-150 ${
				isActive
					? "bg-blue-950/25 border-l-[3px] border-l-blue-500 pl-[9px] pr-3 py-3"
					: isOverdue
						? "border-l-[3px] border-l-red-500 pl-[9px] pr-3 py-3 hover:bg-zinc-800/40"
						: isUpNext
							? "border-l-[3px] border-l-amber-500/50 pl-[9px] pr-3 py-3 hover:bg-zinc-800/40"
							: "px-3 py-3 hover:bg-zinc-800/40"
			}`}
		>
			<div
				className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
					isDone
						? "bg-green-500/60"
						: isActive
							? "bg-blue-400"
							: isOverdue
								? "bg-red-400"
								: isUpNext
									? "bg-amber-400"
									: "bg-zinc-600"
				}`}
			/>
			<div className="flex-1 min-w-0">
				<p
					className={`text-sm font-semibold truncate leading-snug ${
						isDone
							? "text-zinc-600 line-through"
							: "text-zinc-100"
					}`}
				>
					{visit.name ?? "Visit"}
				</p>
				<p className="text-xs text-zinc-600 truncate">
					{visit.job?.client?.name ?? "—"}
				</p>
			</div>
			<div className="flex-shrink-0 text-right">
				{isDone ? (
					<span className="text-[11px] text-green-600/70 font-medium">
						Done
					</span>
				) : isActive ? (
					<span className="text-[11px] text-blue-400 font-medium">
						Active
					</span>
				) : isOverdue ? (
					<span className="text-[11px] text-red-400 font-medium">
						Overdue · {formatTime(visit.scheduled_start_at, tz)}
					</span>
				) : isUpNext ? (
					<span className="text-[11px] text-amber-400 font-medium tabular-nums">
						In {diffMin} min
					</span>
				) : (
					<span className="text-xs text-zinc-500 tabular-nums">
						{formatTime(visit.scheduled_start_at, tz)}
					</span>
				)}
			</div>
		</div>
	);
}
