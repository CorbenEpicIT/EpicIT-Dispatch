import { usePermission } from "../../hooks/usePermission";
import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader";
import FieldPurchasesSection from "../../components/fieldPurchases/FieldPurchaseSection";
import PurchaseSection from "../../components/purchases/PurchaseSection";

export type ReportTab = "purchasing" | "field_purchases";

const STORAGE_KEY = "purchase_activeTab";

const TABS: { id: ReportTab; label: string; permission?: string }[] = [
    { id: "purchasing", label: "Purchase Orders", permission: "view_purchases" },
    { id: "field_purchases", label: "Field Purchases", permission: "view_purchases" },
];

export default function ReportingPage() {
    const VIEW_PURCHASES = usePermission("view_purchases");

    const permMap = {
        view_purchases: VIEW_PURCHASES,
    }
    const visibleTabs = TABS.filter((tab) => permMap[tab.permission as keyof typeof permMap]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<ReportTab>(() => {
        const requested = searchParams.get("tab") as ReportTab | null;
        if (requested && visibleTabs.some((tab) => tab.id === requested)) return requested;
        const stored = sessionStorage.getItem(STORAGE_KEY) as ReportTab | null;
        if (stored && visibleTabs.some(tab => tab.id === stored)) return stored;
        return visibleTabs[0]?.id ?? "users";
    });
    const handleTabChange = (tab: ReportTab) => {
        sessionStorage.setItem(STORAGE_KEY, tab);
        setSearchParams({ tab }, { replace: true });
        setActiveTab(tab);
    };

    return (
        <div className="text-text-primary">
            <PageHeader title="Purchases" >
                {/**Nothing here for now */}
            </PageHeader>
            {/* Tab bar */}
            <div role="tablist" aria-label="Admin sections" className="flex items-center border-b border-border-subtle mb-5">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        id={`tab-${tab.id}`}
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`tabpanel-${tab.id}`}
                        onClick={() => handleTabChange(tab.id)}
                        className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                            activeTab === tab.id
                                ? "border-primary text-text-primary"
                                : "border-transparent text-text-tertiary hover:text-text-primary"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            {activeTab === "purchasing" && (
                <div role="tabpanel" id="tabpanel-report" aria-labelledby="tab-report">
                    <PurchaseSection />
                </div>
            )}
            {activeTab === "field_purchases" && (
                <div role="tabpanel" id="tabpanel-kpi" aria-labelledby="tab-kpi">
                    <FieldPurchasesSection />
                </div>
            )}
        </div>
    );
}
