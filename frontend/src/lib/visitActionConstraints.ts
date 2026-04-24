// frontend/src/lib/visitActionConstraints.ts
import type { VisitStatus } from "../types/jobs";

export type TechnicianStatus = {
	isClockedIn: boolean;
	clockedInVisitId: string | null;
	isDriving: boolean;
	drivingVisitId: string | null;
};

export type ActionConstraint = { enabled: boolean; reason: string | null };

export type VisitActionConstraints = {
	drive: ActionConstraint & { requiresSwitchConfirm: boolean };
	arrive: ActionConstraint;
	clockIn: ActionConstraint;
};

const DISABLED_REASON = "Clock out of your current job first";

export function getActionConstraints(
	visit: { id: string; status: VisitStatus },
	techStatus: TechnicianStatus,
): VisitActionConstraints {
	const driveEnabled =
		(visit.status === "Scheduled" || visit.status === "Delayed") &&
		!techStatus.isClockedIn;

	const requiresSwitchConfirm =
		driveEnabled &&
		techStatus.isDriving &&
		techStatus.drivingVisitId !== visit.id;

	const arriveEnabled = visit.status === "Driving" && !techStatus.isClockedIn;

	const clockInEnabled =
		(visit.status === "OnSite" ||
			visit.status === "InProgress" ||
			visit.status === "Paused") &&
		!techStatus.isClockedIn;

	return {
		drive: {
			enabled: driveEnabled,
			reason: !driveEnabled && techStatus.isClockedIn ? DISABLED_REASON : null,
			requiresSwitchConfirm,
		},
		arrive: {
			enabled: arriveEnabled,
			reason: !arriveEnabled && techStatus.isClockedIn ? DISABLED_REASON : null,
		},
		clockIn: {
			enabled: clockInEnabled,
			reason: !clockInEnabled && techStatus.isClockedIn ? DISABLED_REASON : null,
		},
	};
}
