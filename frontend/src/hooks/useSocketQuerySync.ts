import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "../lib/socket";
import { qk, invalidate } from "../lib/queryKeys";
import type {
	InventoryUpdatedEvent,
	JobUpdatedEvent,
	JobNoteCreatedEvent,
	JobVisitCreatedEvent,
	JobVisitUpdatedEvent,
	JobVisitDeletedEvent,
	VisitStatusEvent,
} from "../types/socketEvents";

const JOB_VISITS_KEY = ["jobVisits"] as const;
const TECHNICIANS_KEY = ["technicians"] as const;

// Single canonical event→invalidation map — mounted once in DispatchLayout and
// TechnicianLayout so every socket-driven cache update lives in one place.
export function useSocketQuerySync(): void {
	const qc = useQueryClient();

	useEffect(() => {
		const onInventoryUpdated = (event: InventoryUpdatedEvent) => {
			if (event.itemId) {
				qc.invalidateQueries({ queryKey: qk.inventory.detail(event.itemId) });
				qc.invalidateQueries({ queryKey: qk.inventory.list() });
			} else {
				invalidate.warehouse(qc);
			}
			invalidate.vehicleStock(qc, event.vehicleId);
			qc.invalidateQueries({ queryKey: qk.inventory.provisional });
		};
		const onJobVisitChanged = (_event: JobVisitUpdatedEvent | VisitStatusEvent) => {
			qc.invalidateQueries({ queryKey: JOB_VISITS_KEY });
			qc.invalidateQueries({ queryKey: TECHNICIANS_KEY });
		};
		const onJobUpdated = (_event: JobUpdatedEvent) => {
			qc.invalidateQueries({ queryKey: JOB_VISITS_KEY });
		};
		const onJobVisitCreatedOrDeleted = (_event: JobVisitCreatedEvent | JobVisitDeletedEvent) => {
			qc.invalidateQueries({ queryKey: JOB_VISITS_KEY });
		};
		const onJobNoteCreated = (_event: JobNoteCreatedEvent) => {
			qc.invalidateQueries({ queryKey: JOB_VISITS_KEY });
		};

		socket.on("inventory:updated", onInventoryUpdated);
		socket.on("job_visit:status_changed", onJobVisitChanged);
		socket.on("job_visit:updated", onJobVisitChanged);
		socket.on("job:updated", onJobUpdated);
		socket.on("job_visit:created", onJobVisitCreatedOrDeleted);
		socket.on("job_visit:deleted", onJobVisitCreatedOrDeleted);
		socket.on("job_note:created", onJobNoteCreated);

		return () => {
			socket.off("inventory:updated", onInventoryUpdated);
			socket.off("job_visit:status_changed", onJobVisitChanged);
			socket.off("job_visit:updated", onJobVisitChanged);
			socket.off("job:updated", onJobUpdated);
			socket.off("job_visit:created", onJobVisitCreatedOrDeleted);
			socket.off("job_visit:deleted", onJobVisitCreatedOrDeleted);
			socket.off("job_note:created", onJobNoteCreated);
		};
	}, [qc]);
}
