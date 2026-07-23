import { useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import type { InventoryItem } from "../../../types/inventory";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";
import { useEnsureItemCodeMutation } from "../../../hooks/useTracking";

interface AddToLabelQueueButtonProps {
	item: InventoryItem;
	/** Navigate to the print page immediately after queuing (single-item flows). */
	navigateOnAdd?: boolean;
	/** Fired after a successful queue-add — lets a caller embedding this in a dropdown close it. */
	onAdded?: () => void;
	className?: string;
	title?: string;
	children?: React.ReactNode;
}

// Item barcodes predate label printing — most existing items have none.
// This lazily assigns an ITM- code via /ensure-code before queuing so the
// button works from any item regardless of when it was created.
export default function AddToLabelQueueButton({
	item,
	navigateOnAdd = false,
	onAdded,
	className,
	title,
	children,
}: AddToLabelQueueButtonProps) {
	const navigate = useNavigate();
	const add = useLabelQueueStore((s) => s.add);
	const ensureCode = useEnsureItemCodeMutation();

	const handleClick = async () => {
		const code = item.barcode ?? (await ensureCode.mutateAsync(item.id)).barcode;
		if (!code) return;
		add({
			id: item.id,
			code,
			kind: "item",
			primaryLabel: item.name,
			secondaryLabel: item.sku ?? undefined,
			isSerialized: item.is_serialized,
			isBatchTracked: item.is_batch_tracked,
		});
		onAdded?.();
		if (navigateOnAdd) navigate("/dispatch/inventory/labels/print");
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={ensureCode.isPending}
			title={title}
			className={
				className ??
				"w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-40"
			}
		>
			<QrCode size={13} />
			{children ?? "Add to Label Queue"}
		</button>
	);
}
