import { useState } from "react";
import { PackageX, RotateCcw, Trash2 } from "lucide-react";
import Drawer from "../../ui/Drawer";
import ConfirmDialog from "../../ui/ConfirmDialog";
import SerialDetailBody from "./SerialDetailBody";
import LabelQueueButton from "../labels/LabelQueueButton";
import { useSerialActions } from "../../../hooks/useSerialActions";
import { usePermission } from "../../../hooks/usePermission";

// Drawer, not a route — the Tracking tab's filter/cursor/selection state would
// be lost navigating to a standalone page for every unit opened.

const BTN =
	"flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-surface border border-border-input rounded-md transition-colors";

// Reasons that still count as "never left the receiving dock". Mirrors the
// standalone page's gate; the backend re-checks authoritatively either way.
const RECEIVE_REASONS = new Set(["receive", "initial", "supplier_purchase"]);

export default function SerialDetailDrawer({
	serialId,
	onClose,
}: {
	/** Open when set. Null closes the drawer. */
	serialId: string | null;
	onClose: () => void;
}) {
	const canManage = usePermission("manage_inventory");
	const serialActions = useSerialActions(serialId ?? "");
	const [confirmAction, setConfirmAction] = useState<null | "lost" | "returned" | "delete">(
		null,
	);
	const [actionError, setActionError] = useState<string | null>(null);
	// Captured when the button is pressed so the dialog copy survives the unit
	// disappearing from cache mid-confirm (the delete case).
	const [confirmSerialNumber, setConfirmSerialNumber] = useState("");

	const copy = confirmAction
		? serialActions.confirmCopy(confirmAction, confirmSerialNumber)
		: null;

	const runConfirm = async () => {
		if (!confirmAction) return;
		setActionError(null);
		try {
			if (confirmAction === "delete") {
				await serialActions.remove();
				// Unit is gone — nothing left to show, so closing is the whole cleanup.
				setConfirmAction(null);
				onClose();
			} else {
				await serialActions.update(confirmAction);
				setConfirmAction(null);
			}
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Action failed");
		}
	};

	return (
		<>
			<Drawer isOpen={serialId !== null} onClose={onClose} title="Serial unit">
				<div className="p-5">
					{serialId && (
						<SerialDetailBody
							serialId={serialId}
							dense
							canEditNote={canManage}
							renderActions={({ serial, timeline }) => {
								// Status changes only offered in-warehouse (backend rejects
								// elsewhere). Delete further requires the unit never moved
								// beyond receive.
								const canChangeStatus =
									canManage && serial.status === "in_warehouse";
								const canDelete =
									canChangeStatus &&
									!serial.consumed_at &&
									!serial.current_vehicle &&
									timeline.every((e) =>
										RECEIVE_REASONS.has(e.reason),
									);

								const ask = (action: "lost" | "returned" | "delete") => {
									setConfirmSerialNumber(serial.serial_number);
									setActionError(null);
									setConfirmAction(action);
								};

								return (
									<>
										{canChangeStatus && (
											<>
												<button
													type="button"
													onClick={() => ask("returned")}
													className={`${BTN} text-text-secondary hover:text-text-primary hover:border-border-strong`}
												>
													<RotateCcw size={13} />
													Mark Returned
												</button>
												<button
													type="button"
													onClick={() => ask("lost")}
													className={`${BTN} text-warning-text hover:border-border-strong`}
												>
													<PackageX size={13} />
													Mark Lost
												</button>
											</>
										)}
										{canDelete && (
											<button
												type="button"
												onClick={() => ask("delete")}
												className={`${BTN} text-error-text hover:border-error-border`}
											>
												<Trash2 size={13} />
												Delete
											</button>
										)}
										{/* Running total across the whole queue — per-unit
										    actions live in the body's Label card instead. */}
										<LabelQueueButton
											className={`${BTN} text-text-secondary hover:text-text-primary hover:border-border-strong`}
										/>
									</>
								);
							}}
						/>
					)}
				</div>
			</Drawer>

			<ConfirmDialog
				open={confirmAction !== null}
				title={copy?.title ?? ""}
				body={copy?.body ?? ""}
				confirmLabel={copy?.cta ?? ""}
				tone={confirmAction === "delete" ? "destructive" : "primary"}
				pending={serialActions.isPending}
				error={actionError}
				onConfirm={runConfirm}
				onCancel={() => {
					setConfirmAction(null);
					setActionError(null);
				}}
			/>
			{/* No LabelQueueToast here: both mount points (InventoryItemDetailPage,
			    BatchDetailPage) already render one, and a second watcher fired a
			    second toast for every queue-add made from this drawer. */}
		</>
	);
}
