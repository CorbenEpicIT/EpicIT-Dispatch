import { useState } from "react";
import UsersSection from "../../components/admin/UsersSection";
import SettingsSection from "../../components/admin/SettingsSection";

type AdminTab = "users" | "settings";

const STORAGE_KEY = "adminPage_activeTab";

const TABS: { id: AdminTab; label: string }[] = [
	{ id: "users", label: "Users" },
	{ id: "settings", label: "Settings" },
];

export default function AdminPage() {
	const [activeTab, setActiveTab] = useState<AdminTab>(() => {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		return stored === "users" || stored === "settings" ? stored : "users";
	});

	const handleTabChange = (tab: AdminTab) => {
		sessionStorage.setItem(STORAGE_KEY, tab);
		setActiveTab(tab);
	};

	return (
		<div>
			{/* Tab bar */}
			<div role="tablist" aria-label="Admin sections" className="flex items-center border-b border-border-subtle mb-5">
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
								? "border-primary text-white"
								: "border-transparent text-text-tertiary hover:text-text-primary"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			{activeTab === "users" && (
				<div role="tabpanel" id="tabpanel-users" aria-labelledby="tab-users">
					<UsersSection />
				</div>
			)}
			{activeTab === "settings" && (
				<div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
					<SettingsSection />
				</div>
			)}
		</div>
	);
}
