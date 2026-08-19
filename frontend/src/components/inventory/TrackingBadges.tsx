import type { InventoryItem } from "../../types/inventory";

interface TrackingBadgesProps {
	item: InventoryItem;
	/** When given, the Serialized chip becomes a button that opens the unit list/detail view. */
	onSerialClick?: () => void;
	/** When given, the Batch chip becomes a button that opens the lot list/detail view. */
	onBatchClick?: () => void;
	/** Tracking is off but history survives — renders a muted "Tracked (archived)" chip instead of nothing. */
	archived?: boolean;
}

// Serialized / Batch-tracked chips. Mirrors the detail page's Tracking tab
// badges so tracking mode reads identically everywhere.
// Each chip is independently clickable (a dual-tracked item shows both at
// once, so wrapping the whole pair in one button would misattribute taps).
export function TrackingBadges({
	item,
	onSerialClick,
	onBatchClick,
	archived = false,
}: TrackingBadgesProps) {
	if (!item.is_serialized && !item.is_batch_tracked) {
		return archived ? (
			<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border-strong bg-surface-raised text-text-tertiary shrink-0">
				Tracked (archived)
			</span>
		) : null;
	}

	const serialClasses =
		"text-[10px] font-semibold px-1.5 py-0.5 rounded border border-primary/30 bg-primary/15 text-primary-text shrink-0";
	const batchClasses =
		"text-[10px] font-semibold px-1.5 py-0.5 rounded border border-reviewing/30 bg-reviewing/15 text-reviewing-text shrink-0";

	return (
		<>
			{item.is_serialized &&
				(onSerialClick ? (
					<button
						type="button"
						onClick={onSerialClick}
						aria-label={`Serialized — view units for ${item.name}`}
						className={`${serialClasses} transition-colors hover:bg-primary/25`}
					>
						Serialized
					</button>
				) : (
					<span className={serialClasses}>Serialized</span>
				))}
			{item.is_batch_tracked &&
				(onBatchClick ? (
					<button
						type="button"
						onClick={onBatchClick}
						aria-label={`Batch — view lots for ${item.name}`}
						className={`${batchClasses} transition-colors hover:bg-reviewing/25`}
					>
						Batch
					</button>
				) : (
					<span className={batchClasses}>Batch</span>
				))}
		</>
	);
}
