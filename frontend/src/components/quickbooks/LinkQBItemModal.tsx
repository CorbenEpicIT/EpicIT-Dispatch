import type { InventoryItem } from "../../types/inventory"
import { useLinkQBItemMutation } from "../../hooks/useQuickbooks"

interface LinkQBItemModalProps {
    item: InventoryItem,
    onClose: () => void,
    isOpen: boolean,
}

export default function LinkQBItemModal({ item, onClose, isOpen }: LinkQBItemModalProps) {
    const linkMutation = useLinkQBItemMutation();

    if (!isOpen) return null;

    const handleLink = async (inventory_item_id: string, qb_item_id: string) => {
        try {
            await linkMutation.mutateAsync({ inventory_item_id, qb_item_id });
        } catch (error) {
            console.error("Error linking QuickBooks item:", error);
        }
    };

    return (
        <div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
            <h2 className="text-lg font-semibold mb-4">Link QuickBooks Item</h2>
        </div>
    );
}