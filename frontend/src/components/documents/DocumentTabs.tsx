export interface DocumentTabDef<T extends string> {
	id: T;
	label: string;
}

interface DocumentTabsProps<T extends string> {
	tabs: readonly DocumentTabDef<T>[];
	activeTab: T;
	onSelect: (tab: T) => void;
	/** Names the strip for a screen reader, e.g. "Quote sections". */
	label: string;
}

/**
 * The bordered strip that sits flush beneath the header, so the header and
 * everything under it read as one unit rather than two floating cards.
 *
 * Roving tabindex: only the selected tab is in the tab order, and
 * Left/Right/Home/End move between them — the WAI-ARIA tabs pattern. Without it
 * a strip announces itself as a tablist and then behaves like unrelated
 * buttons. Lifted from InventoryItemDetailPage rather than re-derived, and
 * shared so quote and invoice cannot each grow their own copy to rot.
 *
 * Panels stay with the caller: each page's `role="tabpanel"` /
 * `aria-labelledby="tab-<id>"` wrapper pairs with the `tab-<id>` ids minted
 * here.
 */
export default function DocumentTabs<T extends string>({
	tabs,
	activeTab,
	onSelect,
	label,
}: DocumentTabsProps<T>) {
	return (
		<div role="tablist" aria-label={label} className="flex border-b border-border">
			{tabs.map((tab, i) => (
				<button
					key={tab.id}
					id={`tab-${tab.id}`}
					type="button"
					role="tab"
					aria-selected={activeTab === tab.id}
					aria-controls={`tabpanel-${tab.id}`}
					tabIndex={activeTab === tab.id ? 0 : -1}
					onClick={() => onSelect(tab.id)}
					onKeyDown={(e) => {
						const last = tabs.length - 1;
						let nextIndex: number | null = null;
						if (e.key === "ArrowRight")
							nextIndex = i === last ? 0 : i + 1;
						else if (e.key === "ArrowLeft")
							nextIndex = i === 0 ? last : i - 1;
						else if (e.key === "Home") nextIndex = 0;
						else if (e.key === "End") nextIndex = last;
						if (nextIndex === null) return;
						e.preventDefault();
						const next = tabs[nextIndex];
						onSelect(next.id);
						// Selection follows focus, so the newly selected tab
						// has to actually receive it.
						document.getElementById(`tab-${next.id}`)?.focus();
					}}
					// The label takes `text-primary-text`, not `text-primary`.
					// `--color-primary` (#3b82f6) is not theme-swapped and
					// lands at ~3.7:1 on the light theme's white base — a 1.4.3
					// failure at 14px. `--color-primary-text` is the tuned pair
					// (#1d4ed8 / #93c5fd) and clears AA in both. The 2px
					// underline keeps `border-primary`: a UI-component border
					// only owes 3:1, and selection is carried by aria-selected
					// and weight as well as colour.
					className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-out ${
						activeTab === tab.id
							? "border-primary text-primary-text"
							: "border-transparent text-text-muted hover:text-text-secondary"
					}`}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
