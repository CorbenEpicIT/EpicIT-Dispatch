import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
	title: string;
	defaultOpen?: boolean;
	children: ReactNode;
}

export default function CollapsibleSection({
	title,
	defaultOpen = true,
	children,
}: CollapsibleSectionProps) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className="border-b border-border-subtle">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-text-primary hover:bg-surface-raised/40 transition-colors cursor-pointer"
			>
				<span>{title}</span>
				<ChevronDown
					size={16}
					className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && <div className="px-5 pb-4">{children}</div>}
		</div>
	);
}
