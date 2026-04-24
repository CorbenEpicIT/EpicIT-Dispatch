import { Eye, EyeOff } from "lucide-react";
import TechFilter from "./TechFilter";
import type { Technician } from "../../../types/technicians";

interface DashboardCalendarToolbarProps {
	showVisits: boolean;
	showOccurrences: boolean;
	onToggleVisits: () => void;
	onToggleOccurrences: () => void;
	technicians: Technician[];
	selectedTechs: Set<string>;
	onTechFilterChange: (next: Set<string>) => void;
	techColorMap: Map<string, string>;
}

export default function DashboardCalendarToolbar({
	showVisits,
	showOccurrences,
	onToggleVisits,
	onToggleOccurrences,
	technicians,
	selectedTechs,
	onTechFilterChange,
	techColorMap,
}: DashboardCalendarToolbarProps) {
	return (
		<div className="flex items-center gap-2 flex-wrap">
			<button
				onClick={onToggleVisits}
				className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
					showVisits
						? "bg-blue-600 text-white"
						: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
				}`}
			>
				{showVisits ? <Eye size={14} /> : <EyeOff size={14} />}
				Visits
			</button>
			<button
				onClick={onToggleOccurrences}
				className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
					showOccurrences
						? "bg-purple-600 text-white"
						: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
				}`}
			>
				{showOccurrences ? <Eye size={14} /> : <EyeOff size={14} />}
				Occurrences
			</button>
			{technicians.length > 0 && (
				<TechFilter
					technicians={technicians}
					selected={selectedTechs}
					onChange={onTechFilterChange}
					techColorMap={techColorMap}
				/>
			)}
		</div>
	);
}
