import { useSearchParams } from "react-router-dom";
import type { DocumentTabDef } from "./DocumentTabs";

/**
 * Tab lives in the URL, not component state, so a state is linkable — the same
 * contract InventoryItemDetailPage established, lifted here so quote and
 * invoice cannot each invent their own. Unknown or absent values fall back to
 * the first tab rather than rendering nothing.
 *
 * The first tab's id is omitted from the query string: `?tab=overview` and no
 * param mean the same thing, and only one of them should be shareable.
 */
export function useDocumentTab<T extends string>(
	tabs: readonly DocumentTabDef<T>[]
): [T, (tab: T) => void] {
	const [searchParams, setSearchParams] = useSearchParams();
	const param = searchParams.get("tab");
	const active: T = tabs.some((t) => t.id === param) ? (param as T) : tabs[0].id;

	const setActive = (tab: T) => {
		const next = new URLSearchParams(searchParams);
		if (tab === tabs[0].id) next.delete("tab");
		else next.set("tab", tab);
		// push, not replace — the back button should return to the previous tab
		setSearchParams(next);
	};

	return [active, setActive];
}
