import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Phone, X, Coffee, LogOut, LogIn } from "lucide-react";
import { useAuthStore } from "../../auth/authStore";
import { useJobVisitsByTechIdQuery, useCreateJobNoteMutation } from "../../hooks/useJobs";
import { useTechnicianByIdQuery, useGoAvailableMutation, useGoOfflineMutation, useGoOnBreakMutation, useMarkDoneMutation } from "../../hooks/useTechnicians";
import TechVisitCard from "../../components/technicianComponents/TechVisitCard";
import AddNotePhotoModal from "../../components/technicianComponents/AddNotePhotoModal";
import type { NotePhoto } from "../../components/technicianComponents/AddNotePhotoModal";
import type { JobVisit, VisitStatus } from "../../types/jobs";
import { formatTime, FALLBACK_TIMEZONE } from "../../util/util";

// ─── constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: VisitStatus[] = ["Driving", "OnSite", "InProgress", "Paused", "Delayed"];
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

const BREAK_REASONS = [
	{ value: "Lunch", label: "Lunch Break" },
	{ value: "Rest", label: "Rest Break" },
	{ value: "EquipmentIssue", label: "Equipment Issue" },
	{ value: "Other", label: "Other" },
];

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
	const goAvailableMutation = useGoAvailableMutation();
	const goOfflineMutation = useGoOfflineMutation();
	const goOnBreakMutation = useGoOnBreakMutation();
	const markDoneMutation = useMarkDoneMutation();

	const [vehicleBannerDismissed, setVehicleBannerDismissed] = useState(false);

	const [showNotePhotoModal, setShowNotePhotoModal] = useState(false);
	const [notePhotoTargetVisitId, setNotePhotoTargetVisitId] = useState<string | null>(null);
	const [showBreakPicker, setShowBreakPicker] = useState(false);
	const [breakError, setBreakError] = useState<string | null>(null);
	const [confirmingEndShift, setConfirmingEndShift] = useState(false);
	const endShiftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => { if (endShiftTimerRef.current) clearTimeout(endShiftTimerRef.current); };
	}, []);

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
		nextDayVisits,
		primaryHeroVisit,
	} = useMemo(() => {
		const now = Date.now();
		const upNextThresholdMs = UP_NEXT_MINUTES * 60_000;

		const userId = user?.userId;
		// Filter from ALL visits (not just today's) — a visit started on a previous
		// day that's still InProgress would otherwise fall into a dead zone.
		const actives = visits
			.filter((v) => ACTIVE_STATUSES.includes(v.status))
			.sort((a, b) => {
				const aIn = a.time_entries?.some((e) => e.tech_id === userId && e.clocked_out_at === null) ? 0 : 1;
				const bIn = b.time_entries?.some((e) => e.tech_id === userId && e.clocked_out_at === null) ? 0 : 1;
				return aIn - bIn;
			});
		const scheduled = todayVisits.filter((v) => v.status === "Scheduled");
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
			scheduled
				.filter((v) => new Date(v.scheduled_start_at).getTime() >= now)
				.sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())[0]
			?? null;

		const nextFuture = futureVisits[0] ?? null;
		const nextDayDate = nextFuture ? new Date(nextFuture.scheduled_start_at) : null;
		const nextDay = nextDayDate
			? futureVisits.filter((v) =>
					isSameDay(new Date(v.scheduled_start_at), nextDayDate, tz)
				)
			: [];

		const primaryHero = overdue[0] ?? nextToday ?? nextFuture ?? null;

		return {
			activeVisits: actives,
			overdueVisits: overdue,
			upNextVisits: upNext,
			upcomingVisits: upcoming,
			nextTodayVisit: nextToday,
			nextFutureVisit: nextFuture,
			nextDayVisits: nextDay,
			primaryHeroVisit: primaryHero,
		};
	}, [visits, todayVisits, futureVisits, tz, user?.userId]);

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
	const isClockedInAnywhere = useMemo(
		() => visits.some((v) => v.time_entries?.some((e) => !e.clocked_out_at)),
		[visits],
	);

	const handleStartBreak = async (reason: string) => {
		if (!user?.userId) return;
		setBreakError(null);
		try {
			await goOnBreakMutation.mutateAsync({ techId: user.userId, reason });
			setShowBreakPicker(false);
		} catch (err) {
			setBreakError(err instanceof Error ? err.message : "Failed to start break — try again.");
		}
	};

	// ── hero type ───────────────────────────────────────────────────────────

	type HeroType = "wrapping-up" | "primary" | "empty";

	const heroType: HeroType =
		techProfile?.status === "WrappingUp" ? "wrapping-up"
		: primaryHeroVisit                   ? "primary"
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

	// Offline → Start Shift gate
	if (techProfile?.status === "Offline") {
		return (
			<div className="px-4 sm:px-6 pt-5 max-w-lg w-full flex flex-col items-center justify-center min-h-[60vh] gap-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-white mb-1">
						Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
						{techProfile.name.split(" ")[0]}
					</h1>
					<p className="text-sm text-zinc-500">Ready to start your shift?</p>
				</div>
				<button
					onClick={() => user?.userId && goAvailableMutation.mutate(user.userId)}
					disabled={goAvailableMutation.isPending}
					className="flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-base transition-colors disabled:opacity-50"
				>
					<LogIn size={18} />
					{goAvailableMutation.isPending ? "Starting…" : "Start Shift"}
				</button>
			</div>
		);
	}

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
			<div className="mb-5 flex flex-col gap-2">
				<a
					href="tel:"
					className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors w-full"
				>
					<Phone size={15} />
					Call Dispatch
				</a>
				{/* Break + End Shift row */}
				<div className="flex gap-2">
					{techProfile?.status === "Break" ? (
						<button
							onClick={() => user?.userId && goAvailableMutation.mutate(user.userId)}
							disabled={goAvailableMutation.isPending}
							className="flex-1 flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-lg bg-green-700 hover:bg-green-600 text-sm text-white font-medium transition-colors disabled:opacity-50"
						>
							<Coffee size={15} />
							{goAvailableMutation.isPending ? "Returning…" : "End Break"}
						</button>
					) : !isClockedInAnywhere && (
						<button
							onClick={() => setShowBreakPicker(true)}
							disabled={goOnBreakMutation.isPending}
							className="flex-1 flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
						>
							<Coffee size={15} />
							Take Break
						</button>
					)}
					{!isClockedInAnywhere && techProfile?.status !== "Break" && (
						<button
							onClick={() => {
								if (!user?.userId) return;
								if (!confirmingEndShift) {
									setConfirmingEndShift(true);
									if (endShiftTimerRef.current) clearTimeout(endShiftTimerRef.current);
									endShiftTimerRef.current = setTimeout(() => setConfirmingEndShift(false), 4000);
									return;
								}
								if (endShiftTimerRef.current) clearTimeout(endShiftTimerRef.current);
								setConfirmingEndShift(false);
								goOfflineMutation.mutate(user.userId);
							}}
							disabled={goOfflineMutation.isPending}
							className={`flex-1 flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
								confirmingEndShift
									? "bg-red-900/40 border border-red-500/50 text-red-300 motion-safe:animate-pulse"
									: "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
							}`}
						>
							<LogOut size={15} />
							{goOfflineMutation.isPending ? "Ending…" : confirmingEndShift ? "Confirm End Shift" : "End Shift"}
						</button>
					)}
				</div>
			</div>

			{/* Break reason picker modal */}
			{showBreakPicker && (
				<div
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
					onClick={() => { setShowBreakPicker(false); setBreakError(null); }}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="break-picker-title"
						className="w-full max-w-sm mx-4 mb-20 sm:mb-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3 max-h-[90dvh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<p id="break-picker-title" className="text-sm font-semibold text-white text-center">Why are you taking a break?</p>
						{breakError && (
							<p role="alert" className="text-xs text-red-400 text-center px-2">{breakError}</p>
						)}
						{BREAK_REASONS.map((r) => (
							<button
								key={r.value}
								onClick={() => handleStartBreak(r.value)}
								disabled={goOnBreakMutation.isPending}
								className="w-full min-h-[44px] py-3 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors disabled:opacity-40"
							>
								{r.label}
							</button>
						))}
						<button
							onClick={() => { setShowBreakPicker(false); setBreakError(null); }}
							className="w-full min-h-[44px] py-3 rounded-xl text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* ── Responsive grid: hero left, schedule right on lg+ ── */}
			<div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
				{/* ── Hero section: all active visits ──────────────────────────────── */}
				<div className="mb-6 space-y-3 lg:mb-0">
					{activeVisits.length === 0 && (
						<>
							{heroType === "wrapping-up" && (
								<WrappingUpCard
									onAvailable={() =>
										user?.userId && markDoneMutation.mutateAsync(user.userId)
									}
									isLoading={markDoneMutation.isPending}
								/>
							)}
							{primaryHeroVisit ? (
								<TechVisitCard
									visit={primaryHeroVisit}
									techId={user?.userId ?? ""}
									tz={tz}
									showDateTime={true}
								/>
							) : heroType !== "wrapping-up" && (
								<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
									<p className="text-sm text-zinc-600">
										No visits scheduled. Check with dispatch.
									</p>
								</div>
							)}
						</>
					)}

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

function WrappingUpCard({ onAvailable, isLoading }: { onAvailable: () => void; isLoading: boolean }) {
	return (
		<div
			style={{
				padding: "1px 1px 1px 3px",
				background: "linear-gradient(to right, #2dd4bf 0%, #3f3f46 45%, #3f3f46 100%)",
				borderRadius: "12px",
			}}
		>
			<div className="rounded-[11px] bg-zinc-900 px-4 py-4 space-y-3">
				<div className="flex items-center gap-2">
					<div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
					<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-teal-400">
						Wrapping Up
					</span>
				</div>
				<p className="text-sm text-zinc-400">
					Job complete. Mark yourself available when you're ready.
				</p>
				<button
					onClick={onAvailable}
					disabled={isLoading}
					className="w-full py-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-sm font-medium hover:bg-teal-500/20 transition-colors disabled:opacity-40"
				>
					I'm Available
				</button>
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
