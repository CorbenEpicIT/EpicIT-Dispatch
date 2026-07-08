import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { ReportColumnCategory } from "../../reports/reportSources";

interface CategorizedColumnPickerProps {
	categories: ReportColumnCategory[];
	hidden: Set<string>;
	onToggle: (key: string) => void;
	onReset: () => void;
	onDeselectAll: () => void;
}

export default function CategorizedColumnPicker({
	categories,
	hidden,
	onToggle,
	onReset,
	onDeselectAll,
}: CategorizedColumnPickerProps) {
	const [query, setQuery] = useState("");

	const totalColumns = useMemo(
		() => categories.reduce((sum, c) => sum + c.columns.length, 0),
		[categories],
	);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return categories;
		return categories
			.map((c) => ({
				...c,
				columns: c.columns.filter((col) => col.label.toLowerCase().includes(q)),
			}))
			.filter((c) => c.columns.length > 0);
	}, [categories, query]);

	const allHidden = hidden.size === totalColumns;

	return (
		<div>
			<div className="flex items-center justify-end gap-3 mb-2">
				<button
					type="button"
					onClick={onReset}
					disabled={hidden.size === 0}
					className={`text-sm rounded ${
						hidden.size === 0
							? "text-text-muted cursor-not-allowed"
							: "text-primary-text hover:underline cursor-pointer"
					}`}
				>
					Select all
				</button>
				<button
					type="button"
					onClick={onDeselectAll}
					disabled={allHidden}
					className={`text-sm rounded ${
						allHidden
							? "text-text-muted cursor-not-allowed"
							: "text-primary-text hover:underline cursor-pointer"
					}`}
				>
					Deselect all
				</button>
			</div>

			<div className="relative mb-3">
				<Search
					size={14}
					className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
				/>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search columns..."
					className="w-full h-9 pl-8 pr-2.5 bg-base border border-border rounded-md text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
				/>
			</div>

			<div className="flex flex-col gap-3">
				{filtered.map((category) => (
					<div key={category.id}>
						<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5">
							{category.label}
						</p>
						<div className="flex flex-col gap-0.5">
							{category.columns.map((col) => {
								const visible = !hidden.has(col.key);
								return (
									<button
										key={col.key}
										type="button"
										role="menuitemcheckbox"
										aria-checked={visible}
										onClick={() => onToggle(col.key)}
										className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm rounded text-left text-text-secondary hover:bg-surface-raised/60 cursor-pointer"
									>
										<span>{col.label}</span>
										<span
											className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
												visible ? "bg-primary border-primary text-white" : "border-border"
											}`}
										>
											{visible && <Check size={12} strokeWidth={3} />}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
				{filtered.length === 0 && (
					<p className="text-sm text-text-muted py-2">No columns match "{query}"</p>
				)}
			</div>
		</div>
	);
}
