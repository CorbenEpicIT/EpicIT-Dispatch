import type { LucideIcon } from "lucide-react";
import { DollarSign, Gauge, HardHat, Users } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";

interface ReportLink {
	title: string;
	description: string;
	to: string;
}

interface ReportCategory {
	id: "financial" | "operational" | "technician" | "client";
	label: string;
	icon: LucideIcon;
	entries: ReportLink[];
}

// Hub Categories
const REPORT_CATEGORIES: ReportCategory[] = [
	{ id: "financial", label: "Financial Reports", icon: DollarSign, entries: [] },
	{
		id: "operational",
		label: "Operational Reports",
		icon: Gauge,
		entries: [
			{
				title: "Reorder Forecast",
				description: "Predicted stockouts by usage",
				to: "/dispatch/inventory/reorder-forecast",
			},
		],
	},
	{
		id: "technician",
		label: "Technician Reports",
		icon: HardHat,
		entries: [
			{
				title: "Timesheets Report",
				description: "Hours logged per technician and job",
				to: "/dispatch/timesheets",
			},
		],
	},
	{ id: "client", label: "Client Reports", icon: Users, entries: [] },
];

function CategoryCard({ category }: { category: ReportCategory }) {
	const Icon = category.icon;

	return (
		<div className="bg-base border border-border-subtle rounded-xl overflow-hidden">
			<div className="flex items-center gap-2 p-4 border-b border-border-subtle">
				<Icon size={16} className="text-text-tertiary" />
				<h3 className="font-semibold text-text-primary">{category.label}</h3>
			</div>
			<div className="p-2 flex flex-col gap-0.5">
				{category.entries.length === 0 ? (
					<p className="text-sm text-text-muted px-3 py-2.5">No reports yet</p>
				) : (
					category.entries.map((entry) => (
						<Link
							key={entry.to}
							to={entry.to}
							className="block rounded-lg px-3 py-2.5 border border-transparent hover:bg-surface hover:border-border-subtle hover:shadow-sm transition-all"
						>
							<p className="text-sm font-semibold text-text-primary">{entry.title}</p>
							<p className="text-xs text-text-muted mt-0.5">{entry.description}</p>
						</Link>
					))
				)}
			</div>
		</div>
	);
}

export default function ReportingPage() {
	return (
		<div className="text-text-primary">
			<PageHeader title="Reporting" />
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
				{REPORT_CATEGORIES.map((category) => (
					<CategoryCard key={category.id} category={category} />
				))}
			</div>
		</div>
	);
}
