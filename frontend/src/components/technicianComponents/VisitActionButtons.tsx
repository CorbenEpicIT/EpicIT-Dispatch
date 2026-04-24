import { useState, useRef, useCallback, useEffect } from "react";
import { Car, MapPin, Clock, Pause, CheckCircle2, Play, AlertTriangle, Info } from "lucide-react";
import { useTechVisitActions } from "../../hooks/useTechVisitActions";
import type { JobVisit, VisitStatus } from "../../types/jobs";

interface VisitActionButtonsProps {
	visit: JobVisit;
	techId: string;
	variant?: "card" | "detail";
}

export default function VisitActionButtons({
	visit,
	techId,
	variant = "card",
}: VisitActionButtonsProps) {
	const {
		isClockedIn,
		openEntries,
		uiState,
		confirmingAction,
		isLoading,
		clockError,
		handleDrive,
		handleArrive,
		handleClockIn,
		handleClockOut,
		handlePause,
		handleConfirmPause,
		handleComplete,
		handleConfirmComplete,
		handleDeclineComplete,
		dismiss,
		constraints,
		handleConfirmSwitch,
	} = useTechVisitActions(visit, techId);

	const [tooltip, setTooltip] = useState<string | null>(null);
	const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
	}, []);

	const showTooltip = useCallback((reason: string) => {
		if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
		setTooltip(reason);
		tooltipTimer.current = setTimeout(() => setTooltip(null), 2500);
	}, []);

	const status = visit.status as VisitStatus;
	const iconSize = variant === "detail" ? 16 : 14;
	const btn =
		variant === "detail"
			? "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all duration-150 active:scale-[0.98]"
			: "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-semibold disabled:opacity-40 transition-all duration-150 active:scale-[0.98]";

	// ── Overlays ────────────────────────────────────────────────────────────────

	if (uiState === "pause-warning") {
		const otherNames = openEntries
			.filter((e) => e.tech_id !== techId)
			.map((e) => e.tech.name)
			.join(", ");
		return (
			<div className="space-y-2">
				<div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
					<AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
					<p className="text-xs text-amber-300">
						Pausing will clock out {otherNames}. Their time will be recorded.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						onClick={dismiss}
						className={`${btn} bg-zinc-800 text-zinc-400 hover:bg-zinc-700`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmPause}
						disabled={isLoading}
						className={`${btn} bg-amber-700 hover:bg-amber-600 text-white`}
					>
						{isLoading ? "Pausing…" : "Pause Anyway"}
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "force-complete") {
		const otherNames = openEntries.map((e) => e.tech.name).join(", ");
		return (
			<div className="space-y-2">
				<div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
					<AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
					<p className="text-xs text-amber-300">
						{otherNames} still clocked in. Completing will clock them out automatically.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						onClick={dismiss}
						className={`${btn} bg-zinc-800 text-zinc-400 hover:bg-zinc-700`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmComplete}
						disabled={isLoading}
						className={`${btn} bg-amber-700 hover:bg-amber-600 text-white`}
					>
						{isLoading ? "Completing…" : "Force Complete"}
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "prompt-complete") {
		return (
			<div className="space-y-2">
				<p className="text-xs text-zinc-400 text-center">Complete this visit?</p>
				<div className="flex gap-2">
					<button
						onClick={handleDeclineComplete}
						className={`${btn} bg-zinc-800 text-zinc-400 hover:bg-zinc-700`}
					>
						Not Yet
					</button>
					<button
						onClick={handleConfirmComplete}
						disabled={isLoading}
						className={`${btn} bg-emerald-700 hover:bg-emerald-600 text-emerald-100`}
					>
						{isLoading ? "Completing…" : "Complete ✓"}
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "paused-info") {
		return (
			<div className="space-y-2">
				<div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700">
					<Info size={14} className="text-zinc-400 shrink-0 mt-0.5" />
					<p className="text-xs text-zinc-400">
						Visit is now paused — no active technicians on site.
					</p>
				</div>
				<div className="flex">
					<button
						onClick={dismiss}
						className={`${btn} bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300`}
					>
						Dismiss
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "switch-confirm") {
		return (
			<div className="space-y-2">
				<p className="text-xs text-zinc-400 text-center">
					You're already heading to another visit. Switch destination?
				</p>
				<div className="flex gap-2">
					<button
						onClick={dismiss}
						className={`${btn} bg-zinc-800 text-zinc-400 hover:bg-zinc-700`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmSwitch}
						disabled={isLoading}
						className={`${btn} bg-blue-700 hover:bg-blue-600 text-white`}
					>
						{isLoading ? "Switching…" : "Switch"}
					</button>
				</div>
			</div>
		);
	}

	// ── Button matrix ────────────────────────────────────────────────────────────

	const tooltipEl = tooltip ? (
		<div role="status" className="px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 text-center">
			{tooltip}
		</div>
	) : null;

	if (status === "Scheduled" || status === "Delayed") {
		const driveDisabled = !constraints.drive.enabled;
		return (
			<div className="space-y-1.5">
				{tooltipEl}
				<div className="flex">
					<button
						onClick={
							driveDisabled
								? () => constraints.drive.reason && showTooltip(constraints.drive.reason)
								: handleDrive
						}
						disabled={isLoading}
						className={`${btn} ${
							driveDisabled
								? "bg-blue-700 text-white opacity-50 cursor-not-allowed"
								: confirmingAction === "drive"
								? "bg-blue-600 text-white border border-blue-400 motion-safe:animate-pulse"
								: "bg-blue-700 hover:bg-blue-600 text-white"
						}`}
					>
						<Car size={iconSize} />
						{confirmingAction === "drive" ? "Confirm Driving" : "I'm Driving"}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	if (status === "Driving") {
		const arriveDisabled = !constraints.arrive.enabled;
		return (
			<div className="space-y-1.5">
				{tooltipEl}
				<div className="flex">
					<button
						onClick={
							arriveDisabled
								? () => constraints.arrive.reason && showTooltip(constraints.arrive.reason)
								: handleArrive
						}
						disabled={isLoading}
						className={`${btn} ${
							arriveDisabled
								? "bg-blue-700 text-white opacity-50 cursor-not-allowed"
								: confirmingAction === "arrive"
								? "bg-blue-600 text-white border border-blue-400 motion-safe:animate-pulse"
								: "bg-blue-700 hover:bg-blue-600 text-white"
						}`}
					>
						<MapPin size={iconSize} />
						{confirmingAction === "arrive" ? "Confirm Arrived" : "I've Arrived"}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	if (status === "OnSite") {
		const clockInDisabled = !constraints.clockIn.enabled;
		return (
			<div className="space-y-1.5">
				{tooltipEl}
				<div className="flex">
					<button
						onClick={
							clockInDisabled
								? () => constraints.clockIn.reason && showTooltip(constraints.clockIn.reason)
								: handleClockIn
							}
						disabled={isLoading && !clockInDisabled}
						className={`${btn} ${
							clockInDisabled
								? "bg-blue-600 text-white opacity-50 cursor-not-allowed"
								: "bg-blue-600 hover:bg-blue-500 text-white"
						}`}
					>
						<Clock size={iconSize} />
						{isLoading && !clockInDisabled ? "Clocking In…" : "Clock In & Begin"}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	if (status === "InProgress") {
		const clockInDisabled = !constraints.clockIn.enabled;
		return (
			<div className="space-y-2">
				{tooltipEl}
				<div className="flex gap-2">
					{isClockedIn ? (
						<button
							onClick={handleClockOut}
							disabled={isLoading}
							className={`${btn} bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300`}
						>
							<Clock size={iconSize} />
							{isLoading ? "Clocking Out…" : "Clock Out"}
						</button>
					) : (
						<button
							onClick={
								clockInDisabled
									? () => constraints.clockIn.reason && showTooltip(constraints.clockIn.reason)
									: handleClockIn
							}
							disabled={isLoading && !clockInDisabled}
							className={`${btn} ${
								clockInDisabled
									? "bg-blue-600 text-white opacity-50 cursor-not-allowed"
									: "bg-blue-600 hover:bg-blue-500 text-white"
							}`}
						>
							<Clock size={iconSize} />
							{isLoading && !clockInDisabled ? "Clocking In…" : "Clock In"}
						</button>
					)}
				</div>
				<div className="flex gap-2">
					{isClockedIn && (
						<button
							onClick={handlePause}
							disabled={isLoading}
							className={`${btn} bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300`}
						>
							<Pause size={iconSize} />
							{variant === "detail" ? "Pause Visit" : "Pause"}
						</button>
					)}
					<button
						onClick={handleComplete}
						disabled={isLoading}
						className={`${btn} ${
							confirmingAction === "complete"
								? "bg-emerald-400 text-black motion-safe:animate-pulse"
								: "bg-emerald-700 hover:bg-emerald-600 text-white"
						}`}
					>
						{confirmingAction !== "complete" && <CheckCircle2 size={iconSize} />}
						{confirmingAction === "complete" ? "Confirm Complete" : "Complete"}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	if (status === "Paused") {
		const clockInDisabled = !constraints.clockIn.enabled;
		return (
			<div className="space-y-1.5">
				{tooltipEl}
				<div className="flex">
					<button
						onClick={
							clockInDisabled
								? () => constraints.clockIn.reason && showTooltip(constraints.clockIn.reason)
								: handleClockIn
						}
						disabled={isLoading && !clockInDisabled}
						className={`${btn} ${
							clockInDisabled
								? "bg-blue-600 text-white opacity-50 cursor-not-allowed"
								: "bg-blue-600 hover:bg-blue-500 text-white"
						}`}
					>
						<Play size={iconSize} />
						{isLoading && !clockInDisabled ? "Resuming…" : "Clock In & Resume"}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	return null;
}
