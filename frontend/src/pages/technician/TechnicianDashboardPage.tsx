import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../auth/authStore";
import {
	useJobVisitsByTechIdQuery,
	useCompleteJobVisitMutation,
	useClockInMutation,
	useClockOutMutation,
} from "../../hooks/useJobs";
import type { JobVisit, VisitTechTimeEntry, VisitStatus } from "../../types/jobs";
import { FALLBACK_TIMEZONE } from "../../util/util";

// ─── constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: VisitStatus[] = ["Driving", "OnSite", "InProgress", "Paused"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date | string | null | undefined, tz: string): string {
	if (!d) return "—";
	return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

function formatNextDayHeader(d: Date, tz: string): string {
	return d
		.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz })
		.toUpperCase();
}

/** Compare two Dates by calendar day in the org's timezone. */
function isSameDay(a: Date, b: Date, tz: string): boolean {
	return (
		a.toLocaleDateString("en-CA", { timeZone: tz }) ===
		b.toLocaleDateString("en-CA", { timeZone: tz })
	);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TechnicianDashboardPage() {
	const { user } = useAuthStore();
	const navigate = useNavigate();

	const { data: visits = [], isLoading, error } = useJobVisitsByTechIdQuery(user?.userId ?? "");
	const clockInMutation = useClockInMutation();
	const clockOutMutation = useClockOutMutation();
	const completeMutation = useCompleteJobVisitMutation();

	const [cardState, setCardState] = useState<Record<string, string | null>>({});
	const [cardError, setCardError] = useState<Record<string, string | null>>({});

	// ── date bucketing ──────────────────────────────────────────────────────

	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const { todayVisits, futureVisits } = useMemo(() => {
		const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

		const today = visits
			.filter((v) =>
				new Date(v.scheduled_start_at).toLocaleDateString("en-CA", { timeZone: tz }) === todayStr,
			)
			.sort(
				(a, b) =>
					new Date(a.scheduled_start_at).getTime() -
					new Date(b.scheduled_start_at).getTime(),
			);

		const future = visits
			.filter((v) =>
				new Date(v.scheduled_start_at).toLocaleDateString("en-CA", { timeZone: tz }) > todayStr,
			)
			.sort(
				(a, b) =>
					new Date(a.scheduled_start_at).getTime() -
					new Date(b.scheduled_start_at).getTime(),
			);

		return { todayVisits: today, futureVisits: future };
	}, [visits, tz]);

	// ── derived visit state ─────────────────────────────────────────────────

	const { activeVisits, nextTodayVisit, nextFutureVisit, nextDayVisits } = useMemo(() => {
		const actives = todayVisits.filter((v) => ACTIVE_STATUSES.includes(v.status));
		const nextToday =
			todayVisits
				.filter((v) => v.status === "Scheduled" || v.status === "Delayed")
				.sort(
					(a, b) =>
						new Date(a.scheduled_start_at).getTime() -
						new Date(b.scheduled_start_at).getTime(),
				)[0] ?? null;
		const nextFuture = futureVisits[0] ?? null;

		const nextDayDate = nextFuture ? new Date(nextFuture.scheduled_start_at) : null;
		const nextDay = nextDayDate
			? futureVisits.filter((v) =>
					isSameDay(new Date(v.scheduled_start_at), nextDayDate, tz),
				)
			: [];

		return {
			activeVisits: actives,
			nextTodayVisit: nextToday,
			nextFutureVisit: nextFuture,
			nextDayVisits: nextDay,
		};
	}, [todayVisits, futureVisits, tz]);

	const doneCount = todayVisits.filter(
		(v) => v.status === "Completed" || v.status === "Cancelled",
	).length;

	// ── actions ─────────────────────────────────────────────────────────────

	const getMyOpenEntry = (visit: JobVisit): VisitTechTimeEntry | undefined =>
		visit.time_entries?.find((e) => e.tech_id === user?.userId && e.clocked_out_at === null);

	const getOpenEntries = (visit: JobVisit): VisitTechTimeEntry[] =>
		visit.time_entries?.filter((e) => e.clocked_out_at === null) ?? [];

	const handleBeginVisit = async (visit: JobVisit) => {
		if (!user?.userId) return;
		setCardError((p) => ({ ...p, [visit.id]: null }));
		try {
			await clockInMutation.mutateAsync({ visitId: visit.id, techId: user.userId });
		} catch (err: any) {
			const msg: string = err?.message ?? "";
			if (msg.startsWith("ALREADY_CLOCKED_IN:")) {
				const otherId = msg.split(":")[1];
				const other = visits.find((v) => v.id === otherId);
				setCardError((p) => ({
					...p,
					[visit.id]: `Already clocked in to "${other?.name ?? "another visit"}". Leave that visit first.`,
				}));
			} else {
				setCardError((p) => ({ ...p, [visit.id]: "Failed to begin — try again." }));
			}
		}
	};

	const handleLeaveVisit = async (visit: JobVisit) => {
		if (!user?.userId) return;
		setCardError((p) => ({ ...p, [visit.id]: null }));
		try {
			const result = await clockOutMutation.mutateAsync({ visitId: visit.id, techId: user.userId });
			if (result.is_last_tech) {
				setCardState((p) => ({ ...p, [visit.id]: "prompt-complete" }));
			}
		} catch {
			setCardError((p) => ({ ...p, [visit.id]: "Failed to leave — try again." }));
		}
	};

	const handleCompleteFromPrompt = async (visit: JobVisit) => {
		const open = getOpenEntries(visit);
		if (open.length > 0) {
			setCardState((p) => ({ ...p, [visit.id]: "force-complete-warning" }));
			return;
		}
		await doComplete(visit);
	};

	const doComplete = async (visit: JobVisit) => {
		try {
			await completeMutation.mutateAsync(visit.id);
			setCardState((p) => ({ ...p, [visit.id]: null }));
		} catch {
			setCardError((p) => ({ ...p, [visit.id]: "Failed to complete — try again." }));
		}
	};

	const dismissPrompt = (visitId: string) =>
		setCardState((p) => ({ ...p, [visitId]: null }));

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
					<div key={i} className="h-[52px] bg-zinc-800/50 rounded-lg animate-pulse" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="px-4 sm:px-6 pt-5 max-w-lg w-full">
				<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
					<p className="text-sm text-red-400">Failed to load schedule.</p>
				</div>
			</div>
		);
	}

	// ── render ───────────────────────────────────────────────────────────────

	return (
		<div className="px-4 sm:px-6 pt-5 pb-10 max-w-lg w-full lg:max-w-4xl lg:px-8">
			{/* Page header */}
			<div className="mb-5">
				<h1 className="text-xl font-bold text-white tracking-tight">My Dashboard</h1>
				<p className="text-sm text-zinc-500 mt-0.5">
					{new Date().toLocaleDateString("en-US", {
						weekday: "long",
						month: "long",
						day: "numeric",
						timeZone: tz,
					})}
				</p>
			</div>

			{/* ── Responsive grid: hero left, schedule right on lg+ ── */}
			<div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">

			{/* ── Hero section: all active visits ──────────────────────────────── */}
			<div className="mb-6 space-y-3 lg:mb-0">
				{activeVisits.length === 0 && (
					heroType === "empty" ? (
						<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
							<p className="text-sm text-zinc-600">No visits scheduled. Check with dispatch.</p>
						</div>
					) : heroType === "next-today" && nextTodayVisit ? (
						<NextUpCard
							visit={nextTodayVisit}
							dayLabel="Today"
							dayLabelClass="text-blue-400"
							timeClass="text-blue-400"
							tz={tz}
							onNavigate={() => navigate(`/technician/visits/${nextTodayVisit.id}`)}
						/>
					) : nextFutureVisit ? (
						<NextUpCard
							visit={nextFutureVisit}
							dayLabel={new Date(nextFutureVisit.scheduled_start_at)
								.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })
								.toUpperCase()}
							dayLabelClass="text-violet-400"
							timeClass="text-violet-400"
							tz={tz}
							onNavigate={() => navigate(`/technician/visits/${nextFutureVisit.id}`)}
						/>
					) : null
				)}

				{activeVisits.map((visit) => {
					const myOpenEntry = getMyOpenEntry(visit);
					const isClockedIn = myOpenEntry != null;
					const openEntries = getOpenEntries(visit);
					const state = cardState[visit.id] ?? null;
					const error = cardError[visit.id] ?? null;
					const isClockingIn = clockInMutation.isPending;
					const isClockingOut = clockOutMutation.isPending;
					const isCompleting = completeMutation.isPending;

					return (
						<div
							key={visit.id}
							className="rounded-xl"
							style={{
								padding: "1px 1px 1px 3px",
								background: isClockedIn
									? "linear-gradient(to right, #22c55e 0%, #3f3f46 45%, #3f3f46 100%)"
									: "linear-gradient(to right, #3b82f6 0%, #3f3f46 45%, #3f3f46 100%)",
							}}
						>
							<div className="rounded-[11px] bg-zinc-900 px-4 py-4 transition-colors duration-200">
								{/* Badge */}
								<div className="flex items-center gap-2 mb-3">
									{isClockedIn ? (
										<span className="relative flex h-2 w-2 flex-shrink-0">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
											<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
										</span>
									) : (
										<span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500/60" />
									)}
									<span className={`text-[10px] font-bold tracking-[0.1em] uppercase ${isClockedIn ? "text-green-400" : "text-blue-400"}`}>
										{isClockedIn ? "Clocked In" : visit.status}
									</span>
								</div>

								{/* Visit info */}
								<p className="text-[15px] font-bold text-white leading-snug mb-0.5">
									{visit.name ?? "Visit"}
								</p>
								{visit.job?.client?.name && (
									<p className="text-xs text-zinc-500 mb-0.5">{visit.job.client.name}</p>
								)}
								{visit.job?.address && (
									<p className="text-xs text-zinc-400 mb-2">📍 {visit.job.address}</p>
								)}

								{/* Clock-in time */}
								{isClockedIn && myOpenEntry && (
									<p className="text-xs text-zinc-400 mb-2">
										<span className="text-zinc-600 mr-1">Since</span>
										{formatTime(myOpenEntry.clocked_in_at, tz)}
									</p>
								)}

								{/* Others on site */}
								{openEntries.length > 0 && (
									<p className="text-[11px] text-zinc-500 mb-2">
										On site: {openEntries.map((e) => e.tech.name).join(", ")}
									</p>
								)}

								{/* Action area */}
								{state === "prompt-complete" ? (
									<div className="space-y-2">
										<p className="text-xs text-zinc-400 text-center">Complete this visit?</p>
										<div className="flex gap-2">
											<button
												onClick={() => dismissPrompt(visit.id)}
												className="flex-1 py-2 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-400 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-150"
											>
												Not Yet
											</button>
											<button
												onClick={() => handleCompleteFromPrompt(visit)}
												disabled={isCompleting}
												className="flex-1 py-2 rounded-lg bg-green-700 text-xs font-semibold text-green-100 hover:bg-green-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
											>
												{isCompleting ? "Completing…" : "Complete ✓"}
											</button>
										</div>
									</div>
								) : state === "force-complete-warning" ? (
									<div className="space-y-2">
										<p className="text-[11px] text-amber-400 text-center font-semibold">
											{openEntries.map((e) => e.tech.name).join(", ")} still clocked in
										</p>
										<p className="text-[11px] text-zinc-500 text-center">
											Completing will clock them out automatically.
										</p>
										<div className="flex gap-2">
											<button
												onClick={() => dismissPrompt(visit.id)}
												className="flex-1 py-2 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-400 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-150"
											>
												Cancel
											</button>
											<button
												onClick={() => doComplete(visit)}
												disabled={isCompleting}
												className="flex-1 py-2 rounded-lg bg-amber-700 text-xs font-semibold text-amber-100 hover:bg-amber-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
											>
												{isCompleting ? "Completing…" : "Force Complete"}
											</button>
										</div>
									</div>
								) : (
									<div className="flex gap-2">
										{isClockedIn ? (
											<button
												onClick={() => handleLeaveVisit(visit)}
												disabled={isClockingOut || isCompleting}
												className="flex-1 py-2 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
											>
												{isClockingOut ? "Leaving…" : "Leave Visit"}
											</button>
										) : (
											<button
												onClick={() => handleBeginVisit(visit)}
												disabled={isClockingIn}
												className="flex-1 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 active:scale-[0.98] transition-all duration-150 disabled:opacity-40"
											>
												{isClockingIn ? "Starting…" : "Begin Visit"}
											</button>
										)}
										<button
											onClick={() => navigate(`/technician/visits/${visit.id}`)}
											className="px-3 py-2 rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-500 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-150"
										>
											Details
										</button>
									</div>
								)}

								{error && (
									<p className="text-[11px] text-red-400 mt-2 text-center">{error}</p>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{/* ── Right column: schedule sections ── */}
			<div className="space-y-6">

			{/* ── Today's schedule ──────────────────────────────────────────── */}
			<div>
				<div className="flex items-center justify-between mb-3">
					<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
						Today · {todayVisits.length}{" "}
						{todayVisits.length === 1 ? "visit" : "visits"}
					</span>
					{doneCount > 0 && (
						<span className="text-[10px] font-semibold text-green-500/80">
							{doneCount} done
						</span>
					)}
				</div>

				{todayVisits.length === 0 ? (
					<p className="text-sm text-zinc-600 py-2">Nothing scheduled today.</p>
				) : (
					<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800/80">
						{todayVisits.map((visit) => (
							<ScheduleRow
								key={visit.id}
								visit={visit}
								tz={tz}
								onClick={() => navigate(`/technician/visits/${visit.id}`)}
							/>
						))}
					</div>
				)}
			</div>

			{/* ── Next scheduled day ────────────────────────────────────────── */}
			{nextDayVisits.length > 0 && (
				<div className="mb-6 lg:mb-0">
					<div className="flex items-center justify-between mb-3">
						<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
							{formatNextDayHeader(new Date(nextDayVisits[0].scheduled_start_at), tz)}
						</span>
						<span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500">
							{nextDayVisits.length}{" "}
							{nextDayVisits.length === 1 ? "visit" : "visits"}
						</span>
					</div>
					<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
						<div
							onClick={() => navigate(`/technician/visits/${nextDayVisits[0].id}`)}
							className="flex items-center gap-3 px-3 py-3 min-h-[52px] cursor-pointer hover:bg-zinc-800/40 transition-colors duration-150"
						>
							<div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-zinc-700" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-semibold text-zinc-400 truncate">
									{nextDayVisits[0].name ?? "Visit"}
								</p>
								<p className="text-xs text-zinc-600 truncate">
									{nextDayVisits[0].job?.client?.name ?? "—"}
								</p>
							</div>
							<span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
								{formatTime(nextDayVisits[0].scheduled_start_at, tz)}
							</span>
						</div>
						{nextDayVisits.length > 1 && (
							<button
								onClick={() => navigate("/technician/visits")}
								className="w-full px-3 py-2 border-t border-zinc-800/60 text-center hover:bg-zinc-800/40 transition-colors duration-150"
							>
								<span className="text-[11px] text-zinc-500">
									+{nextDayVisits.length - 1} more
								</span>
							</button>
						)}
					</div>
				</div>
			)}

			</div>{/* end right column */}
			</div>{/* end lg grid */}
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

function NextUpCard({ visit, dayLabel, dayLabelClass, timeClass, tz, onNavigate }: NextUpCardProps) {
	return (
		<div
			onClick={onNavigate}
			className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 cursor-pointer hover:border-zinc-700 active:scale-[0.99] transition-all duration-150"
		>
			<div className="flex items-center gap-1 mb-2">
				<span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
					Next Up ·&nbsp;
				</span>
				<span className={`text-[10px] font-bold tracking-[0.1em] uppercase ${dayLabelClass}`}>
					{dayLabel}
				</span>
			</div>
			<p className="text-[15px] font-bold text-white leading-snug mb-0.5">
				{visit.name ?? "Visit"}
			</p>
			{visit.job?.client?.name && (
				<p className="text-xs text-zinc-500 mb-0.5">{visit.job.client.name}</p>
			)}
			{visit.job?.address && (
				<p className="text-xs text-zinc-400 mb-3">📍 {visit.job.address}</p>
			)}
			<div className="flex items-end justify-between">
				<p className={`text-2xl font-bold tabular-nums tracking-tight ${timeClass}`}>
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
	onClick: () => void;
}

function ScheduleRow({ visit, tz, onClick }: ScheduleRowProps) {
	const isActive = ACTIVE_STATUSES.includes(visit.status);
	const isDone = visit.status === "Completed" || visit.status === "Cancelled";

	return (
		<div
			onClick={onClick}
			className={`flex items-center gap-3 min-h-[52px] cursor-pointer transition-colors duration-150 ${
				isActive
					? "bg-blue-950/25 border-l-[3px] border-l-blue-500 pl-[9px] pr-3 py-3"
					: "px-3 py-3 hover:bg-zinc-800/40"
			}`}
		>
			<div
				className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
					isDone ? "bg-green-500/60" : isActive ? "bg-blue-400" : "bg-zinc-600"
				}`}
			/>
			<div className="flex-1 min-w-0">
				<p
					className={`text-sm font-semibold truncate leading-snug ${
						isDone ? "text-zinc-600 line-through" : "text-zinc-100"
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
					<span className="text-[11px] text-green-600/70 font-medium">Done</span>
				) : isActive ? (
					<span className="text-[11px] text-blue-400 font-medium">Active</span>
				) : (
					<span className="text-xs text-zinc-500 tabular-nums">
						{formatTime(visit.scheduled_start_at, tz)}
					</span>
				)}
			</div>
		</div>
	);
}
