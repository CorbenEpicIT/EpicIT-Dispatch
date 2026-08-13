import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";

const DEFAULT_CLASS =
	"inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-surface hover:bg-surface-raised border border-border text-sm font-medium text-text-secondary transition-colors";

// Shared read of the module-level labelQueueStore. Absent rather than
// disabled at zero — an empty queue has nothing to view.
export default function LabelQueueButton({ className }: { className?: string }) {
	const count = useLabelQueueStore((s) => s.items.length);
	if (count === 0) return null;

	return (
		<Link
			to="/dispatch/inventory/labels/print"
			className={className ?? DEFAULT_CLASS}
			title="View and print queued labels"
			aria-label={`Print labels — ${count} queued`}
		>
			<Printer size={14} />
			Print Labels
			{/* The badge duplicates the count already in aria-label, so it stays
			    decorative rather than reading out twice. */}
			<span
				aria-hidden="true"
				className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-on-primary text-xs font-bold px-1.5"
			>
				{count}
			</span>
		</Link>
	);
}
