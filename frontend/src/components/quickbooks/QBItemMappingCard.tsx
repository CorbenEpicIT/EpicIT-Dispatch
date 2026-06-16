import { useMemo, useState } from "react";
import {
    useQBMappedItemsQuery,
    useQBItemsQuery,
    usePushQBItemMutation,
    useUnlinkQBItemMutation,
} from "../../hooks/useQuickbooks";
import { useAllInventoryQuery } from "../../hooks/useInventory";
import type { InventoryItem } from "../../types/inventory";
import LinkQBItemModal from "./LinkQBItemModal";

export default function QBItemMappingCard() {
    const { data: mappedItems } = useQBMappedItemsQuery();
    const { data: qbItems } = useQBItemsQuery();
    const { data: inventoryItems } = useAllInventoryQuery();
    const push = usePushQBItemMutation();
    const unlink = useUnlinkQBItemMutation();
    const [linkItem, setLinkItem] = useState<InventoryItem | null>(null);

    // inventory_item_id -> linked QB external_id
    const mappedByItemId = useMemo(
        () => new Map((mappedItems ?? []).map((m) => [m.inventory_item_id, m.external_id])),
        [mappedItems],
    );
    // QB Id -> QB item name (to show what an item is linked to)
    const qbNameById = useMemo(
        () => new Map((qbItems ?? []).map((q) => [q.Id, q.Name])),
        [qbItems],
    );

    return (
        <div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
            <h2 className="mb-1 text-lg font-semibold text-text-primary">QuickBooks Item Mapping</h2>
            <p className="mb-4 text-xs text-text-muted">
                Link inventory items to QuickBooks items so synced invoice lines post to the right product
                instead of the generic “Services”.
            </p>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                    <thead>
                        <tr className="border-b border-border-subtle">
                            <th className="px-5 py-2.5 text-left text-xs font-medium text-text-muted">Inventory Item</th>
                            <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">QuickBooks Item</th>
                        </tr>
                    </thead>
                    <tbody>
                        {inventoryItems?.length ? (
                            inventoryItems.map((item, idx) => {
                                const externalId = mappedByItemId.get(item.id);
                                const linked = externalId != null;
                                return (
                                    <tr
                                        key={item.id}
                                        className={`border-b border-border-subtle/50 transition-colors hover:bg-surface/40 ${idx === inventoryItems.length - 1 ? "border-b-0" : ""}`}
                                    >
                                        <td className="px-5 py-3 text-sm font-medium text-text-primary">
                                            {item.name}
                                            {item.sku && <span className="ml-2 text-xs text-text-muted">{item.sku}</span>}
                                        </td>
                                        <td className="px-3 py-3">
                                            {linked ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success-text">
                                                        Linked: {qbNameById.get(externalId!) ?? `#${externalId}`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => unlink.mutate({ inventory_item_id: item.id })}
                                                        disabled={unlink.isPending}
                                                        className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Unlink
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLinkItem(item)}
                                                        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised"
                                                    >
                                                        Link
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => push.mutate({ itemId: item.id })}
                                                        disabled={push.isPending}
                                                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Push to QB
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={2} className="px-5 py-8 text-center text-sm text-text-muted">
                                    No inventory items yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {linkItem && (
                <LinkQBItemModal item={linkItem} isOpen={!!linkItem} onClose={() => setLinkItem(null)} />
            )}
        </div>
    );
}
