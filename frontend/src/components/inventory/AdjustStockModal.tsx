import { useEffect, useRef, useState } from "react";
import Drawer from "../ui/Drawer";
import { useAdjustStockMutation } from "../../hooks/useInventory";
import { useToast } from "../ui/useToast";
import type { InventoryItem } from "../../types/inventory";
import { unitLabel } from "../../lib/units";
import { isStorableStockQty, roundToStockQtyScale } from "./stockQtyPrecision";

// Warehouse stock adjustment for untracked items only — dispatcher enters the
// corrected on-hand count and the delta is derived for PATCH /:id/stock.
// Serialized/batch on-hand changes through Receive / serial actions instead.
//
// Drawer owns mount/unmount, so this doesn't early-return on !isOpen; the
// input is re-seeded from item.quantity each time the modal opens instead.

const CANCEL_BTN =
	"inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-surface border border-border-input rounded-md text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors";

export default function AdjustStockModal({
	item,
	isOpen,
	onClose,
}: {
	item: InventoryItem;
	isOpen: boolean;
	onClose: () => void;
}) {
	const [target, setTarget] = useState<string>(String(item.quantity));
	const [error, setError] = useState<string | null>(null);
	const adjust = useAdjustStockMutation();
	const toast = useToast();

	// Fresh input every open: Drawer keeps this mounted through the close
	// transition, so without a reset a reopen after a successful adjustment
	// showed the previous target. Keyed on open + item, not on item.quantity —
	// a background refetch while the modal is open must not overwrite what the
	// dispatcher is typing.
	const quantityRef = useRef(item.quantity);
	quantityRef.current = item.quantity;
	useEffect(() => {
		if (!isOpen) return;
		setTarget(String(quantityRef.current));
		setError(null);
	}, [isOpen, item.id]);

	// A blank field is not a zero: Number("") is 0, which would have let Save
	// zero the warehouse count from an accidentally cleared input.
	const trimmed = target.trim();
	const parsed = Number(trimmed);
	const valid =
		trimmed !== "" && Number.isFinite(parsed) && parsed >= 0 && isStorableStockQty(parsed);
	const validationError =
		trimmed !== "" && !valid ? "Quantity must be 0 or more, to two decimal places." : null;
	// Rounded before use: `parsed - item.quantity` on two Decimal-derived
	// numbers can drift into something like `2.9999999999998`, which the
	// backend's own 2-dp bound would then reject.
	const delta = valid ? roundToStockQtyScale(parsed - item.quantity) : 0;
	const canSave = valid && delta !== 0 && !adjust.isPending;

	const handleConfirm = async () => {
		if (!canSave) return;
		setError(null);
		try {
			await adjust.mutateAsync({ itemId: item.id, delta });
			toast.success("Stock adjusted");
			onClose();
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to adjust stock";
			setError(message);
			toast.error(message);
		}
	};

	return (
		<Drawer isOpen={isOpen} onClose={onClose} title="Adjust Stock" side="center">
			<div className="p-5">
				<p className="text-xs text-text-muted">
					Current on-hand:{" "}
					<span className="tabular-nums font-medium">{item.quantity}</span>{" "}
					{unitLabel(item.unit, item.quantity)}. Set the corrected count — a stock movement records the
					difference.
				</p>
				<label
					htmlFor="adjust-stock-target"
					className="block mt-4 text-[10px] font-semibold text-text-muted uppercase tracking-wider"
				>
					New on-hand quantity
				</label>
				<input
					id="adjust-stock-target"
					type="number"
					min={0}
					step={0.01}
					inputMode="decimal"
					value={target}
					autoFocus
					onChange={(e) => setTarget(e.target.value)}
					className="mt-1 w-full h-[38px] px-3 rounded-md bg-base border border-border text-text-primary text-sm focus:border-primary focus:outline-none"
				/>
				<div className="mt-2 text-xs text-text-muted h-4">
					{valid && delta !== 0 && (
						<span
							className={
								delta > 0 ? "text-success-text" : "text-warning-text"
							}
						>
							{delta > 0 ? "+" : ""}
							{delta} {unitLabel(item.unit, Math.abs(delta))}
						</span>
					)}
				</div>
				{(validationError ?? error) && (
					<div className="mt-1 text-xs text-error-text">{validationError ?? error}</div>
				)}
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className={CANCEL_BTN}>
						Cancel
					</button>
					{/* Disabled, not a no-op click: with nothing valid to save there is
					    nothing for a click to explain, and the message above already
					    says why when the value is unusable. */}
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!canSave}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded-md transition-colors disabled:opacity-50"
					>
						{adjust.isPending ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</Drawer>
	);
}
