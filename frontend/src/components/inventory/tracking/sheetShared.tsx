import { AlertTriangle } from "lucide-react";

// Shared primitives for the field-side tracking sheets (SerialSheet, LotSheet).
// Both render the same centered-modal detail layout, so the label/value row, the
// date formatter, and the inline error banner live here rather than duplicated.

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-2 border-b border-border-subtle/60 last:border-0">
			<span className="text-xs text-text-muted shrink-0">{label}</span>
			<span className="text-sm text-text-primary text-right min-w-0 truncate">
				{value}
			</span>
		</div>
	);
}

// Inline error banner for a query that failed inside an open sheet — surfaces
// the failure instead of letting it read as an empty list.
export function SheetError({ message }: { message: string }) {
	return (
		<div
			role="alert"
			className="mx-5 my-6 flex items-start gap-2 rounded-lg border border-error-border bg-error-bg px-3 py-2.5"
		>
			<AlertTriangle size={14} className="mt-0.5 shrink-0 text-error-text" />
			<p className="text-xs text-error-text">{message}</p>
		</div>
	);
}
