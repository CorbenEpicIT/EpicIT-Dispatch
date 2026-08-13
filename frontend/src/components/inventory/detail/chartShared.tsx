import type { ReactNode } from "react";

// Shared chrome for the History tab's chart cards. Caveat disclosure is a
// hook, so it lives in chartNotes.tsx instead.

/** Header chip: a fact about the whole series that the plot can't state itself. */
export function ChartChip({ children }: { children: ReactNode }) {
	return (
		<span className="text-xs font-medium text-text-muted bg-surface border border-border-subtle rounded-full px-2 py-0.5">
			{children}
		</span>
	);
}

/** The frosted tooltip surface every chart on this tab hovers with. */
export function ChartTooltipShell({ title, children }: { title: ReactNode; children: ReactNode }) {
	return (
		<div className="rounded-lg px-3 py-2 bg-base/90 backdrop-blur-md shadow-lg border border-border-subtle">
			<p className="text-xs text-text-tertiary mb-1">{title}</p>
			{children}
		</div>
	);
}
