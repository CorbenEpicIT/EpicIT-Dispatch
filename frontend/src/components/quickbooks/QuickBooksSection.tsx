import QBItemMappingCard from "./QBItemMappingCard"
import QBConnectionCard from "./QBConnectionCard";
import QBTaxCodeMappingCard from "./QBTaxCodeMappingCard";
import { useQBStatusQuery } from "../../hooks/useQuickbooks"

export default function QuickBooksSection() {
    const { data: qbStatus } = useQBStatusQuery();

    return (
        <div className="rounded-lg border border-border-subtle bg-surface px-5 py-5">
            <QBConnectionCard />
            {qbStatus?.connected && (
                <>
                    <br/>
                    <QBItemMappingCard />
                    <br/>
                    <QBTaxCodeMappingCard />
                </> 
            )}
        </div>
    );
}