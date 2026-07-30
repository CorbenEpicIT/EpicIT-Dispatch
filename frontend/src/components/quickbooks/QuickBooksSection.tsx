import QBItemMappingCard from "./QBItemMappingCard"
import QBConnectionCard from "./QBConnectionCard";
import QBTaxCodeMappingCard from "./QBTaxCodeMappingCard";
import { useQBStatusQuery } from "../../hooks/useQuickbooks"
import { QUICKBOOKS_ENABLED } from "../../config/features";

export default function QuickBooksSection() {
    const { data: qbStatus } = useQBStatusQuery();

    // QuickBooks integration is temporarily disabled (see config/features).
    if (!QUICKBOOKS_ENABLED) {
        return (
            <div className="rounded-lg border border-border-subtle bg-surface px-5 py-5">
                <p className="text-sm text-text-muted leading-relaxed">
                    The QuickBooks integration is temporarily unavailable. It will be
                    re-enabled in an upcoming release.
                </p>
            </div>
        );
    }

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