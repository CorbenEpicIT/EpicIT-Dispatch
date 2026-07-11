import { useMemo, useState } from "react";
import type { InventoryItem } from "../../types/inventory";
import {
	useLinkQBItemMutation,
	useQBItemsQuery,
	useQBMappedItemsQuery,
} from "../../hooks/useQuickbooks";
import FullPopup from "../ui/FullPopup";

interface LinkQBItemModalProps {
	item: InventoryItem;
	onClose: () => void;
	isOpen: boolean;
}

export default function LinkQBItemModal({ item, onClose, isOpen }: LinkQBItemModalProps) {
	const { data: qbItems } = useQBItemsQuery(isOpen);
	const { data: mappedItems } = useQBMappedItemsQuery(isOpen);
	const linkMutation = useLinkQBItemMutation();
	const [selectedQbId, setSelectedQbId] = useState("");

	// Only offer QB items that aren't already linked to some inventory item
	const availableQbItems = useMemo(() => {
		const mappedExternalIds = new Set((mappedItems ?? []).map((m) => m.external_id));
		return (qbItems ?? []).filter((q) => !mappedExternalIds.has(q.Id));
	}, [qbItems, mappedItems]);

	const handleLink = async () => {
		if (!selectedQbId) return;
		try {
			await linkMutation.mutateAsync({ inventory_item_id: item.id, qb_item_id: selectedQbId });
			setSelectedQbId("");
			onClose();
		} catch (error) {
			console.error("Error linking QuickBooks item:", error);
		}
	};

	const content = (
		<div className="flex flex-col px-5 py-5">
			<h2 className="mb-1 text-lg font-semibold text-text-primary">Link to QuickBooks Item</h2>
			<p className="mb-4 text-xs text-text-muted">
				Map <span className="font-medium text-text-secondary">{item.name}</span> to an existing
				QuickBooks item so synced invoice lines use the right product.
			</p>

			<label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
				QuickBooks Item
			</label>
			<select
				value={selectedQbId}
				onChange={(e) => setSelectedQbId(e.target.value)}
				className="w-full rounded-md border border-border bg-surface-raised px-2.5 py-2 text-sm text-text-primary transition-colors focus:border-primary focus:outline-none"
			>
				<option value="">Select a QuickBooks item…</option>
				{availableQbItems.map((q) => (
					<option key={q.Id} value={q.Id}>
						{q.Name}
						{q.Sku ? ` (${q.Sku})` : ""}
						{q.UnitPrice != null ? ` — $${q.UnitPrice}` : ""}
					</option>
				))}
			</select>

			{linkMutation.isError && (
				<p className="mt-2 text-xs text-error-text">
					{(linkMutation.error as Error)?.message || "Failed to link item."}
				</p>
			)}

			<div className="mt-5 flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={handleLink}
					disabled={!selectedQbId || linkMutation.isPending}
					className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
				>
					{linkMutation.isPending ? "Linking…" : "Link"}
				</button>
			</div>
		</div>
	);

	return <FullPopup content={content} isModalOpen={isOpen} onClose={onClose} size="md" />;
}
