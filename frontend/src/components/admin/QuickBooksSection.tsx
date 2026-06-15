import QBItemMappingCard from "../quickbooks/QBItemMappingCard"
import QBConnectionCard from "../quickbooks/QBConnectionCard";
import { useQBStatusQuery } from "../../hooks/useQuickbooks"

export default function QuickBooksSection() {
    const { data: qbStatus } = useQBStatusQuery();

    return (
        <div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
            <QBConnectionCard />
            {qbStatus?.connected && (
                <QBItemMappingCard />
            )}
        </div>
    );
}