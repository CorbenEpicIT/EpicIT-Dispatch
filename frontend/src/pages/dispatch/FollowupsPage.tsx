import { useState } from "react";
import SequencesSection from "../../components/followups/SequencesSection";
import TemplatesSection from "../../components/followups/TemplatesSection";
import ActivitySection from "../../components/followups/ActivitySection";
import PageHeader from "../../components/ui/PageHeader";

type FollowupsTab = "sequences" | "templates" | "activity";

const STORAGE_KEY = "followupsPage_activeTab";

const TABS: { id: FollowupsTab; label: string }[] = [
	{ id: "sequences", label: "Sequences" },
	{ id: "templates", label: "Templates" },
	{ id: "activity", label: "Activity" },
];

export default function FollowupsPage() {
	const [activeTab, setActiveTab] = useState<FollowupsTab>(() => {
		const stored = sessionStorage.getItem(STORAGE_KEY) as FollowupsTab | null;
		if (stored && TABS.some((tab) => tab.id === stored)) return stored;
		return "sequences";
	});

	const handleTabChange = (tab: FollowupsTab) => {
		sessionStorage.setItem(STORAGE_KEY, tab);
		setActiveTab(tab);
	};

	return (
		<div className="text-text-primary">
			<PageHeader title="Followups" />

			{/* Tab bar */}
			<div
				role="tablist"
				aria-label="Followups sections"
				className="flex items-center border-b border-border-subtle mb-5"
			>
				{TABS.map((tab) => (
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

			{activeTab === "sequences" && (
				<div role="tabpanel" id="tabpanel-sequences" aria-labelledby="tab-sequences">
					<SequencesSection />
				</div>
			)}
			{activeTab === "templates" && (
				<div role="tabpanel" id="tabpanel-templates" aria-labelledby="tab-templates">
					<TemplatesSection />
				</div>
			)}
			{activeTab === "activity" && (
				<div role="tabpanel" id="tabpanel-activity" aria-labelledby="tab-activity">
					<ActivitySection />
				</div>
			)}
		</div>
	);
}
