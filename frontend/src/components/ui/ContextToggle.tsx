import { Briefcase, Repeat } from "lucide-react";

export type JobsView = "jobs" | "templates";

interface ContextToggleProps {
	value: JobsView;
	onChange: (value: JobsView) => void;
}

export default function ContextToggle({ value, onChange }: ContextToggleProps) {
	return (
		<div className="flex items-center bg-zinc-700 gap-px rounded-md overflow-hidden border border-zinc-700 shrink-0" role="group" aria-label="View context">
			<button
				onClick={() => onChange("jobs")}
				aria-pressed={value === "jobs"}
				className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
					value === "jobs"
						? "bg-blue-600 text-white"
						: "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
				}`}
			>
				<Briefcase size={14} />
				<span>Jobs</span>
			</button>
			<button
				onClick={() => onChange("templates")}
				aria-pressed={value === "templates"}
				className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold cursor-pointer transition-colors ${
					value === "templates"
						? "bg-purple-600 text-white"
						: "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
				}`}
			>
				<Repeat size={14} />
				<span>Plans</span>
			</button>
		</div>
	);
}
