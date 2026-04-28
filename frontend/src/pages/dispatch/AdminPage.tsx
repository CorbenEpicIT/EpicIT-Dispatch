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
		<div className="text-white">
			{/* Tab bar */}
			<div className="flex items-center gap-0 border-b border-zinc-800 mb-5">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						onClick={() => handleTabChange(tab.id)}
						className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
							activeTab === tab.id
								? "border-blue-500 text-white"
								: "border-transparent text-zinc-400 hover:text-zinc-200"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			{activeTab === "users" && <UsersSection />}
			{activeTab === "settings" && <SettingsSection />}
		</div>
	);
}
