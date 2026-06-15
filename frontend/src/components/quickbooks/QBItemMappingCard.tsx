import { 
    useQBMappedItemsQuery, 
    useQBItemsQuery,
} from "../../hooks/useQuickbooks";
import { useAllInventoryQuery } from "../../hooks/useInventory";


export default function QBItemMappingCard() {
    const { data: mappedItems } = useQBMappedItemsQuery();
    const { data: qbItems } = useQBItemsQuery();
    const { data: inventoryItems } = useAllInventoryQuery();

    return (
        <div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
            <h2 className="text-lg font-semibold mb-4">QuickBooks Item Mapping</h2>
            {/* Add your component content here */}
        </div>
    );
}