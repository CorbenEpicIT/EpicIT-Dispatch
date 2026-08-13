import { useState } from "react";
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
// caller keys it on item.quantity to get a fresh input each time it opens.

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

	const parsed = Number(target);
	const valid = Number.isFinite(parsed) && parsed >= 0 && isStorableStockQty(parsed);
	// Rounded before use: `parsed - item.quantity` on two Decimal-derived
	// numbers can drift into something like `2.9999999999998`, which the
	// backend's own 2-dp bound would then reject.
	const delta = valid ? roundToStockQtyScale(parsed - item.quantity) : 0;

	const handleConfirm = async () => {
		if (!valid) {
			setError("Quantity must be 0 or more, to two decimal places.");
			return;
		}
		if (delta === 0) {
			onClose();
			return;
		}
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
				{error && <div className="mt-1 text-xs text-error-text">{error}</div>}
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className={CANCEL_BTN}>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={adjust.isPending}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded-md transition-colors disabled:opacity-50"
					>
						{adjust.isPending ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</Drawer>
	);
}
