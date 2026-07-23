import { useUpdateSerialMutation, useDeleteSerialMutation } from "./useTracking";

export type SerialConfirmAction = "lost" | "returned" | "delete";

interface SerialConfirmCopyEntry {
	title: string;
	body: (serialNumber: string) => string;
	cta: string;
}

// Copy for the three destructive/status-changing serial actions. body is a
// function of the serial number since every call site interpolates it.
export const SERIAL_CONFIRM_COPY: Record<SerialConfirmAction, SerialConfirmCopyEntry> = {
	lost: {
		title: "Mark unit as lost",
		body: (serialNumber) =>
			`This records a stock movement removing ${serialNumber} from the warehouse and sets its status to Lost. Marking lost is permanent — a lost unit can't be restored anywhere in the app.`,
		cta: "Mark Lost",
	},
	returned: {
		title: "Mark unit as returned",
		body: (serialNumber) =>
			`This records a stock movement removing ${serialNumber} from the warehouse and sets its status to Returned.`,
		cta: "Mark Returned",
	},
	delete: {
		title: "Delete serial unit",
		body: (serialNumber) =>
			`This permanently deletes ${serialNumber} and adjusts the warehouse count by one. Only allowed because it has never left the warehouse.`,
		cta: "Delete",
	},
};

export interface UseSerialActionsResult {
	/** True while either the status-change or delete mutation is in flight. */
	isPending: boolean;
	/** in_warehouse → lost/returned via a stock movement (backend-enforced). */
	update: (status: "lost" | "returned") => Promise<void>;
	/** Hard-delete a never-moved, in-warehouse unit. */
	remove: () => Promise<void>;
	/** Resolves SERIAL_CONFIRM_COPY for the given action + serial number. */
	confirmCopy: (
		action: SerialConfirmAction,
		serialNumber: string,
	) => { title: string; body: string; cta: string };
}

// Encapsulates the two serial mutations that drive SerialDetailPage's confirm
// dialog (status change + delete) plus their shared copy. Callers keep their
// own pending/error UI state and try/catch — this only centralizes which
// mutation to call and what the dialog should say, so a future table-row
// action menu can drive the identical flow without re-deriving copy.
export function useSerialActions(serialId: string): UseSerialActionsResult {
	const updateSerial = useUpdateSerialMutation(serialId);
	const deleteSerial = useDeleteSerialMutation(serialId);

	return {
		isPending: updateSerial.isPending || deleteSerial.isPending,
		update: async (status) => {
			await updateSerial.mutateAsync({ status });
		},
		remove: async () => {
			await deleteSerial.mutateAsync();
		},
		confirmCopy: (action, serialNumber) => {
			const entry = SERIAL_CONFIRM_COPY[action];
			return { title: entry.title, body: entry.body(serialNumber), cta: entry.cta };
		},
	};
}
