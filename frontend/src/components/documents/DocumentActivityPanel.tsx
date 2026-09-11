import type { ReactNode } from "react";

/**
 * Activity's two-column shell: the record on the left, the write surface on
 * the right.
 *
 * Notes, the dispute record and the change history used to stack full width at
 * identical weight, which read as a dump rather than a layout — a 1328px row
 * spent on the single sentence of an empty Notes card. Splitting them says
 * which is which: the main column is what a dispatcher READS (what happened,
 * then the log), the rail is what they WRITE.
 *
 * One layout, no branch. The main column cannot come up empty: ChangeHistory
 * always renders its titled card, filter row and bordered empty state — 226px
 * measured on a Draft quote with no log rows at all, still taller than the
 * 173px rail beside it. The underfill worth guarding against therefore runs
 * the other way (an empty Notes card beside a populated record), which
 * `self-start` answers by letting the rail end at its own height instead of
 * stretching into a half-empty card.
 *
 * Shared rather than written twice: quote and invoice owe each other the same
 * layout, and the two had already drifted once — their Notes empty states
 * rendered differently — while these panels sat in separate files.
 */
interface DocumentActivityPanelProps {
	/** The write surface. Rides the rail. */
	notes: ReactNode;
	/** May render null: LifecycleRecord does when there is nothing to record. */
	lifecycle: ReactNode;
	history: ReactNode;
}

export default function DocumentActivityPanel({
	notes,
	lifecycle,
	history,
}: DocumentActivityPanelProps) {
	return (
		<div
			role="tabpanel"
			id="tabpanel-activity"
			aria-labelledby="tab-activity"
			className="mt-6"
		>
			<h2 className="sr-only">Activity</h2>
			{/* `items-start` is load-bearing rather than tidiness: a stretched
			    grid item has nowhere to move, so the rail's `sticky` would
			    silently do nothing.

			    DOM order is the reading order in both directions — record then
			    rail, left to right at `lg` and top to bottom below it. No
			    `order-*` reshuffle: it would leave the focus order pointing
			    one way and the layout the other. */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
				<div className="lg:col-span-2 space-y-6">
					{lifecycle}
					{history}
				</div>
				{/* Sticky only from `lg`, where there is a rail to pin: the
				    scrolling ancestor is DispatchLayout's overflow container,
				    and `top-6` clears the tab strip's own breathing room. */}
				<div className="lg:col-span-1 lg:self-start lg:sticky lg:top-6">
					{notes}
				</div>
			</div>
		</div>
	);
}
