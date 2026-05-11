import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Car, MapPin, Clock, Pause, CheckCircle2, Play, AlertTriangle, Info, UserCheck } from "lucide-react";
import { useTechVisitActions } from "../../hooks/useTechVisitActions";
import type { JobVisit } from "../../types/jobs";

interface VisitActionButtonsProps {
	visit: JobVisit;
	techId: string;
	variant?: "card" | "detail";
	onOverlayChange?: (active: boolean) => void;
}

const PAUSE_REASONS = [
	{ value: "AwaitingMaterials", label: "Awaiting Materials" },
	{ value: "EquipmentIssue", label: "Equipment Issue" },
	{ value: "Other", label: "Other" },
];

export default function VisitActionButtons({
	visit,
	techId,
	variant = "card",
	onOverlayChange,
}: VisitActionButtonsProps) {
	const {
		isClockedIn,
		openEntries,
		uiState,
		confirmingAction,
		isLoading,
		clockError,
		myTechVisitStatus,
		pendingPauseAction,
		handleDrive,
		handleArrive,
		handleClockIn,
		handleClockOut,
		handlePause,
		handleConfirmPause,
		handleComplete,
		handleConfirmComplete,
		handleDeclineComplete,
		handleReasonSelected,
		handleHeadingOut,
		handleAvailable,
		dismiss,
		constraints,
		handleConfirmSwitch,
	} = useTechVisitActions(visit, techId);

	const [tooltip, setTooltip] = useState<string | null>(null);
	const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useLayoutEffect(() => {
		const needsFullWidth = uiState === "pause-reason" || uiState === "prompt-complete";
		onOverlayChange?.(needsFullWidth);
	}, [uiState]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
	}, []);

	const showTooltip = useCallback((reason: string) => {
		if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
		setTooltip(reason);
		tooltipTimer.current = setTimeout(() => setTooltip(null), 2500);
	}, []);

	const iconSize = variant === "detail" ? 16 : 14;
	const btn =
		variant === "detail"
			? "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all duration-150 active:scale-[0.98]"
			: "flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-all duration-150 active:scale-[0.98]";

	// ── Overlays ────────────────────────────────────────────────────────────────

	if (uiState === "pause-reason") {
		const isCard = variant === "card";
		const isClockOut = pendingPauseAction === "clock-out";
		return (
			<div className="space-y-2">
				<div className="flex items-center gap-2 px-1 pb-2 border-b border-zinc-800">
					<Pause size={13} className="text-amber-400 shrink-0" />
					<p className="text-sm font-semibold text-white">
						{isClockOut ? "Wrap up or pause?" : "Why are you pausing?"}
					</p>
				</div>
				{isClockOut && (
					<>
						<button
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							onClick={handleConfirmComplete}
							disabled={isLoading}
							className={`w-full py-3 px-2.5 rounded-lg font-medium bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-700/40 text-emerald-400 text-center transition-colors disabled:opacity-40 leading-snug ${isCard ? "text-xs" : "text-sm"}`}
						>
							{isLoading ? "Completing…" : "Complete Visit"}
						</button>
						<p className={`text-zinc-600 text-center ${isCard ? "text-[10px]" : "text-xs"}`}>
							or pause because:
						</p>
					</>
				)}
				<div className="grid grid-cols-2 gap-1.5">
					{PAUSE_REASONS.map((r, i) => (
						<button
							key={r.value}
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus={!isClockOut && i === 0}
							onClick={() => handleReasonSelected(r.value)}
							disabled={isLoading}
							className={`py-3 px-2.5 rounded-lg font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-center transition-colors disabled:opacity-40 leading-snug${
								i === PAUSE_REASONS.length - 1 && PAUSE_REASONS.length % 2 !== 0
									? " col-span-2"
									: ""
							} ${isCard ? "text-xs" : "text-sm"}`}
						>
							{r.label}
						</button>
					))}
				</div>
				<button
					onClick={dismiss}
					className={`w-full py-3 rounded-lg font-medium bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors ${isCard ? "text-xs" : "text-sm"}`}
				>
					Cancel
				</button>
			</div>
		);
	}

	if (uiState === "departure-prompt") {
		return (
			<div className="space-y-2">
				<p className="text-xs text-zinc-300 text-center font-medium">Still on site or heading out?</p>
				<div className="flex gap-2">
					<button
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={dismiss}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white`}
					>
						Staying On Site
					</button>
					<button
						onClick={handleHeadingOut}
						disabled={isLoading}
						className={`${btn} bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40`}
					>
						{isLoading ? "Updating…" : "Heading Out"}
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "pause-warning") {
		const otherNames = openEntries
			.filter((e) => e.tech_id !== techId)
			.map((e) => e.tech.name)
			.join(", ");
		return (
			<div className="space-y-2.5">
				<div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3.5 py-3 space-y-1">
					<div className="flex items-center gap-2">
						<AlertTriangle size={13} className="text-amber-400 shrink-0" />
						<p className="text-sm font-semibold text-amber-300">Other techs on site</p>
					</div>
					<p className="text-xs text-amber-200/70 leading-relaxed">
						Pausing clocks out {otherNames}. Their time will be saved.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={dismiss}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmPause}
						disabled={isLoading}
						className={`${btn} bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40`}
					>
						{isLoading ? "Pausing…" : "Pause Anyway"}
					</button>
				</div>
			</div>
		);
	}

	if (uiState === "force-complete") {
		const otherNames = openEntries.filter((e) => e.tech_id !== techId).map((e) => e.tech.name).join(", ");
		return (
			<div className="space-y-2.5">
				<div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3.5 py-3 space-y-1">
					<div className="flex items-center gap-2">
						<AlertTriangle size={13} className="text-amber-400 shrink-0" />
						<p className="text-sm font-semibold text-amber-300">Other techs on site</p>
					</div>
					<p className="text-xs text-amber-200/70 leading-relaxed">
						{otherNames} still clocked in. Completing will clock them out automatically.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={dismiss}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmComplete}
						disabled={isLoading}
						className={`${btn} bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40`}
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
				<p className="text-xs text-zinc-300 text-center font-medium">Complete this visit?</p>
				<div className="flex gap-2">
					<button
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={handleDeclineComplete}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white`}
					>
						Keep Paused
					</button>
					<button
						onClick={handleConfirmComplete}
						disabled={isLoading}
						className={`${btn} bg-emerald-700 hover:bg-emerald-600 text-emerald-100 disabled:opacity-40`}
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
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={dismiss}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white`}
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
				<p className="text-xs text-zinc-300 text-center font-medium">
					You're already heading to another visit. Switch destination?
				</p>
				<div className="flex gap-2">
					<button
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus
						onClick={dismiss}
						className={`${btn} bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white`}
					>
						Cancel
					</button>
					<button
						onClick={handleConfirmSwitch}
						disabled={isLoading}
						className={`${btn} bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40`}
					>
						{isLoading ? "Switching…" : "Switch"}
					</button>
				</div>
			</div>
		);
	}

	// ── Button matrix — driven by myTechVisitStatus ─────────────────────────────

	const tooltipEl = tooltip ? (
		<div role="status" className="px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 text-center">
			{tooltip}
		</div>
	) : null;

	// Assigned → show "I'm Driving"
	if (myTechVisitStatus === "Assigned") {
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
						aria-label={confirmingAction === "drive" ? "Confirm — tap again to begin driving" : "I'm Driving"}
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

	// EnRoute → show "I've Arrived"
	if (myTechVisitStatus === "EnRoute") {
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
						aria-label={confirmingAction === "arrive" ? "Confirm — tap again to mark arrived" : "I've Arrived"}
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

	// OnSite — clocked in: Pause + Complete (primary), Clock Out (secondary); not clocked in: Clock In
	if (myTechVisitStatus === "OnSite") {
		if (isClockedIn) {
			return (
				<div className="space-y-2">
					{tooltipEl}
					<div className="flex gap-2">
						<button
							onClick={handlePause}
							disabled={isLoading}
							className={`${btn} bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300`}
						>
							<Pause size={iconSize} />
							{variant === "detail" ? "Pause Visit" : "Pause"}
						</button>
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
					<div className="flex">
						<button
							onClick={handleClockOut}
							disabled={isLoading}
							className={`${btn} border border-zinc-700/60 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400`}
						>
							<Clock size={iconSize} />
							{isLoading ? "Clocking Out…" : "Clock Out"}
						</button>
					</div>
					{clockError && (
						<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
					)}
				</div>
			);
		}

		const clockInDisabled = !constraints.clockIn.enabled;
		const label = visit.status === "Paused" ? "Clock In & Resume" : "Clock In & Begin";
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
						{isLoading && !clockInDisabled ? "Clocking In…" : label}
					</button>
				</div>
				{clockError && (
					<p role="alert" className="text-[11px] text-red-400 text-center">{clockError}</p>
				)}
			</div>
		);
	}

	// Done → "I'm Available"
	if (myTechVisitStatus === "Done") {
		return (
			<div className="space-y-1.5">
				<div className="flex">
					<button
						onClick={handleAvailable}
						disabled={isLoading}
						className={`${btn} bg-green-700 hover:bg-green-600 text-white`}
					>
						<UserCheck size={iconSize} />
						{isLoading ? "Updating…" : "I'm Available"}
					</button>
				</div>
			</div>
		);
	}

	return null;
}
