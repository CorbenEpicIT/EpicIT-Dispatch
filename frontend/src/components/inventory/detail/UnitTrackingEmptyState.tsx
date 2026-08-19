import type { InventoryItem } from "../../../types/inventory";
import Card from "../../ui/Card";

// The Tracking tab's right half for an item with no serial/batch tracking —
// paired against QuantityTracking (UntrackedAllocationCard) on the left so
// the tab visibly answers "this item IS tracked, just not that way" instead
// of a bare "Not tracked" dead end. Dashed border marks it as the OFF side
// of the pair without a second color or icon-badge doing that job — the
// "Not enabled" chip mirrors TrackingBadges' own archived-chip classes so
// this tab and the item header agree on what a muted/off tracking chip
// looks like.
export default function UnitTrackingEmptyState({
	item,
	canManage,
	onEnableTracking,
}: {
	item: InventoryItem;
	canManage: boolean;
	onEnableTracking: () => void;
}) {
	return (
		<Card title="Serial & Batch Tracking" className="border-dashed">
			<span className="inline-flex w-fit shrink-0 items-center rounded border border-border-strong bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-text-tertiary">
				Not enabled
			</span>

			<p className="mt-3 text-sm text-text-secondary">
				{item.name} isn't serialized or batch-tracked, so there's no
				per-unit or per-lot history to show — quantity tracking (left) is
				the only record of this item's stock.
			</p>
			<p className="mt-2 text-sm text-text-secondary">
				Turning it on lets individual units carry their own warranty,
				recall, and expiry history.
			</p>

			{canManage && (
				<button
					type="button"
					onClick={onEnableTracking}
					className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary-text"
				>
					Enable tracking
				</button>
			)}
		</Card>
	);
}
