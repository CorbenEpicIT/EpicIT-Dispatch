import ReportingSection from "../../components/reports/sections/ReportSection";
import KPISection from "../../components/reports/sections/KPISection";
import { usePermission } from "../../hooks/usePermission";
import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import PageHeader from "../../components/ui/PageHeader";

export type ReportTab = "report" | "kpi";

const STORAGE_KEY = "adminPage_activeTab";

const TABS: { id: ReportTab; label: string; permission?: string }[] = [
	{ id: "report", label: "Reporting", permission: "view_reports" },
	{ id: "kpi", label: "KPI", permission: "view_reports" },
];

export default function ReportingPage() {
	const VIEW_REPORTS = usePermission("view_reports");

	const permMap = {
		view_reports: VIEW_REPORTS,
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
			<PageHeader title="Insights" >
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
			{activeTab === "report" && (
				<div role="tabpanel" id="tabpanel-report" aria-labelledby="tab-report">
					<ReportingSection />
				</div>
			)}
			{activeTab === "kpi" && (
				<div role="tabpanel" id="tabpanel-kpi" aria-labelledby="tab-kpi">
					<KPISection />
				</div>
			)}
		</div>
	);
}
