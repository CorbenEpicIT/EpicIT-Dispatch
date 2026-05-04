import { LayoutGrid, LayoutList } from "lucide-react";

type ViewMode = "card" | "list";

interface ViewToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
	return (
		<div className="flex items-center gap-1 h-9 bg-zinc-800 border border-zinc-700 rounded-md p-1" role="group" aria-label="View mode">
			<button
				onClick={() => onChange("card")}
				aria-label="Card view"
				aria-pressed={value === "card"}
				className={`h-full px-2.5 flex items-center justify-center rounded cursor-pointer transition-colors ${
					value === "card" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
				}`}
			>
				<LayoutGrid size={15} />
			</button>
			<button
				onClick={() => onChange("list")}
				aria-label="List view"
				aria-pressed={value === "list"}
				className={`h-full px-2.5 flex items-center justify-center rounded cursor-pointer transition-colors ${
					value === "list" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
				}`}
			>
				<LayoutList size={15} />
			</button>
		</div>
	);
}
