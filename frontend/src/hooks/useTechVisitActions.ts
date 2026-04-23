import { useState, useEffect, useRef, useCallback } from "react";
import {
	useClockInMutation,
	useClockOutMutation,
	useVisitTransitionMutation,
	useCompleteJobVisitMutation,
} from "./useJobs";
import type { JobVisit, VisitTechTimeEntry, VisitStatus } from "../types/jobs";
import { getActionConstraints, type VisitActionConstraints } from "../lib/visitActionConstraints";
import { useTechnicianStatus } from "./useTechnicianStatus";

export type TechVisitUiState =
	| "idle"
	| "pause-warning"
	| "force-complete"
	| "prompt-complete"
	| "paused-info"
	| "switch-confirm";

export type TechVisitConfirmingAction = "drive" | "arrive" | "complete" | null;

export interface UseTechVisitActionsReturn {
	isClockedIn: boolean;
	myOpenEntry: VisitTechTimeEntry | undefined;
	openEntries: VisitTechTimeEntry[];
	uiState: TechVisitUiState;
	confirmingAction: TechVisitConfirmingAction;
	isLoading: boolean;
	clockError: string | null;
	handleDrive: () => Promise<void>;
	handleArrive: () => Promise<void>;
	handleClockIn: () => Promise<void>;
	handleClockOut: () => Promise<void>;
	handlePause: () => void;
	handleConfirmPause: () => Promise<void>;
	handleComplete: () => void;
	handleConfirmComplete: () => Promise<void>;
	handleDeclineComplete: () => void;
	dismiss: () => void;
	constraints: VisitActionConstraints;
	handleConfirmSwitch: () => Promise<void>;
}

const CONFIRM_TIMEOUT_MS = 4000;

export function useTechVisitActions(
	visit: JobVisit | undefined,
	techId: string,
): UseTechVisitActionsReturn {
	const [uiState, setUiState] = useState<TechVisitUiState>("idle");
	const [confirmingAction, setConfirmingAction] = useState<TechVisitConfirmingAction>(null);
	const [clockError, setClockError] = useState<string | null>(null);
	const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clockInMutation = useClockInMutation();
	const clockOutMutation = useClockOutMutation();
	const transitionMutation = useVisitTransitionMutation();
	const completeMutation = useCompleteJobVisitMutation();

	const visitId = visit?.id ?? "";
	const myOpenEntry = visit?.time_entries?.find(
		(e) => e.tech_id === techId && e.clocked_out_at === null,
	);
	const isClockedIn = myOpenEntry != null;
	const techStatus = useTechnicianStatus(techId);
	const constraints = getActionConstraints(
		{ id: visitId, status: (visit?.status ?? "Scheduled") as VisitStatus },
		techStatus,
	);
	const openEntries: VisitTechTimeEntry[] =
		visit?.time_entries?.filter((e) => e.clocked_out_at === null) ?? [];

	const isLoading =
		clockInMutation.isPending ||
		clockOutMutation.isPending ||
		transitionMutation.isPending ||
		completeMutation.isPending;

	// Reset on status change — another tech may have advanced the visit
	useEffect(() => {
		setConfirmingAction(null);
		setUiState("idle");
		setClockError(null);
	}, [visit?.status]);

	const clearConfirmTimer = useCallback(() => {
		if (confirmTimerRef.current) {
			clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = null;
		}
	}, []);

	const startConfirmTimer = useCallback(() => {
		clearConfirmTimer();
		confirmTimerRef.current = setTimeout(() => {
			setConfirmingAction(null);
		}, CONFIRM_TIMEOUT_MS);
	}, [clearConfirmTimer]);

	const dismiss = useCallback(() => {
		setUiState("idle");
		setConfirmingAction(null);
		setClockError(null);
		clearConfirmTimer();
	}, [clearConfirmTimer]);

	const handleDrive = useCallback(async () => {
		if (isLoading || !visitId) return;
		if (constraints.drive.requiresSwitchConfirm) {
			setUiState("switch-confirm");
			return;
		}
		if (confirmingAction !== "drive") {
			setConfirmingAction("drive");
			startConfirmTimer();
			return;
		}
		clearConfirmTimer();
		setConfirmingAction(null);
		setClockError(null);
		try {
			await transitionMutation.mutateAsync({ visitId, action: "drive" });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "";
			if (msg.includes("CLOCKED_IN")) {
				setClockError("Clock out of your current job first.");
			} else {
				setClockError("Failed to update status — try again.");
			}
		}
	}, [isLoading, constraints.drive.requiresSwitchConfirm, confirmingAction, visitId, transitionMutation, startConfirmTimer, clearConfirmTimer]);

	const handleConfirmSwitch = useCallback(async () => {
		if (!visitId) return;
		try {
			await transitionMutation.mutateAsync({ visitId, action: "drive" });
			setUiState("idle");
		} catch {
			setUiState("idle");
		}
	}, [visitId, transitionMutation]);

	const handleArrive = useCallback(async () => {
		if (isLoading || !visitId) return;
		if (confirmingAction !== "arrive") {
			setConfirmingAction("arrive");
			startConfirmTimer();
			return;
		}
		clearConfirmTimer();
		setConfirmingAction(null);
		setClockError(null);
		try {
			await transitionMutation.mutateAsync({ visitId, action: "arrive" });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "";
			if (msg.includes("CLOCKED_IN")) {
				setClockError("Clock out of your current job first.");
			} else {
				setClockError("Failed to update status — try again.");
			}
		}
	}, [isLoading, confirmingAction, visitId, transitionMutation, startConfirmTimer, clearConfirmTimer]);

	const handleClockIn = useCallback(async () => {
		if (!visitId) return;
		setClockError(null);
		try {
			await clockInMutation.mutateAsync({ visitId, techId });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "";
			if (msg.startsWith("ALREADY_CLOCKED_IN:")) {
				setClockError("You're already clocked in to another visit — clock out there first.");
			} else {
				setClockError("Failed to clock in — try again.");
			}
		}
	}, [visitId, techId, clockInMutation]);

	const handleClockOut = useCallback(async () => {
		if (!visitId) return;
		setClockError(null);
		try {
			const result = await clockOutMutation.mutateAsync({ visitId, techId });
			if (result.is_last_tech) {
				setUiState("prompt-complete");
			}
		} catch {
			setClockError("Failed to clock out — try again.");
		}
	}, [visitId, techId, clockOutMutation]);

	const handlePause = useCallback(() => {
		if (!visitId) return;
		const othersClocked = openEntries.filter((e) => e.tech_id !== techId);
		if (othersClocked.length > 0) {
			setUiState("pause-warning");
			return;
		}
		transitionMutation.mutate({ visitId, action: "pause" });
	}, [openEntries, techId, visitId, transitionMutation]);

	const handleConfirmPause = useCallback(async () => {
		if (!visitId) return;
		try {
			await transitionMutation.mutateAsync({ visitId, action: "pause" });
			setUiState("idle");
		} catch {
			setUiState("idle");
		}
	}, [visitId, transitionMutation]);

	const handleComplete = useCallback(() => {
		if (isLoading || !visitId) return;
		if (confirmingAction !== "complete") {
			setConfirmingAction("complete");
			startConfirmTimer();
			return;
		}
		clearConfirmTimer();
		setConfirmingAction(null);
		if (openEntries.length > 0) {
			setUiState("force-complete");
			return;
		}
		completeMutation.mutate(visitId);
	}, [isLoading, confirmingAction, openEntries, visitId, completeMutation, startConfirmTimer, clearConfirmTimer]);

	const handleConfirmComplete = useCallback(async () => {
		if (!visitId) return;
		try {
			await completeMutation.mutateAsync(visitId);
			setUiState("idle");
		} catch {
			setUiState("idle");
		}
	}, [visitId, completeMutation]);

	const handleDeclineComplete = useCallback(() => {
		setUiState("paused-info");
	}, []);

	return {
		isClockedIn,
		myOpenEntry,
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
	};
}
