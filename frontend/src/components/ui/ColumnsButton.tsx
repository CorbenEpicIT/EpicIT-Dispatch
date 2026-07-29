import { useEffect, useRef, useState } from "react";
import { Columns3, Check } from "lucide-react";
import type { ColumnOption } from "../../hooks/useColumnVisibility";

interface ColumnsButtonProps {
	columns: ColumnOption[];
	hidden: Set<string>;
	onToggle: (key: string) => void;
	onReset: () => void;
}

//Reusable Column Selector for Reports
export default function ColumnsButton({ columns, hidden, onToggle, onReset }: ColumnsButtonProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const hiddenCount = hidden.size;
	const isActive = hiddenCount > 0;
	const visibleCount = columns.length - hiddenCount;

	return (
		<div className="relative" ref={containerRef}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="menu"
				className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors cursor-pointer whitespace-nowrap ${
					isActive
						? "bg-primary-bg border-primary text-primary-text"
						: "bg-surface border-border text-text-tertiary hover:text-text-primary"
				}`}
			>
				<Columns3 size={14} className="shrink-0" />
				<span>{isActive ? `Columns · ${hiddenCount} hidden` : "Columns"}</span>
			</button>

			{open && (
				<div
					role="menu"
					aria-label="Toggle columns"
					className="absolute right-0 mt-1.5 min-w-52 bg-canvas border border-border-strong rounded-lg shadow-2xl shadow-black/50 z-50 overflow-hidden"
				>
					<div className="py-1 px-1">
						{columns.map((col) => {
							const visible = !hidden.has(col.key);
							// Block hiding the last visible column.
							const disabled = visible && visibleCount <= 1;
							return (
								<button
									key={col.key}
									role="menuitemcheckbox"
									aria-checked={visible}
									disabled={disabled}
									onClick={() => onToggle(col.key)}
									className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm rounded text-left ${
										disabled
											? "text-text-muted cursor-not-allowed"
											: "text-text-secondary hover:bg-surface/70 cursor-pointer"
									}`}
								>
									<span>{col.label}</span>
									<span
										className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
											visible
												? "bg-primary border-primary text-white"
												: "border-border"
										}`}
									>
										{visible && <Check size={12} strokeWidth={3} />}
									</span>
								</button>
							);
						})}
					</div>
					<div className="border-t border-border px-1 py-1">
						<button
							type="button"
							onClick={onReset}
							disabled={!isActive}
							className={`w-full px-3 py-1.5 text-sm rounded text-left ${
								isActive
									? "text-text-secondary hover:bg-surface/70 cursor-pointer"
									: "text-text-muted cursor-not-allowed"
							}`}
						>
							Show all
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
