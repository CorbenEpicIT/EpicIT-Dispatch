import { useCallback, useState } from "react";
import { useAuthStore } from "../auth/authStore";

export type InventoryViewMode = "card" | "list";

const STORAGE_PREFIX = "inventory-view-mode:";

function loadViewMode(key: string): InventoryViewMode {
	try {
		const raw = localStorage.getItem(key);
		return raw === "list" ? "list" : "card";
	} catch {
		return "card";
	}
}

// Per-user view-mode preference, scoped like report column visibility so it
// doesn't bleed across accounts on Switch User.
export function useInventoryViewMode(): [InventoryViewMode, (mode: InventoryViewMode) => void] {
	const userId = useAuthStore((s) => s.user?.userId) ?? "anon";
	const key = `${STORAGE_PREFIX}${userId}`;
	const [viewMode, setViewModeState] = useState<InventoryViewMode>(() => loadViewMode(key));

	const setViewMode = useCallback(
		(mode: InventoryViewMode) => {
			setViewModeState(mode);
			try {
				localStorage.setItem(key, mode);
			} catch {
				void 0;
			}
		},
		[key],
	);

	return [viewMode, setViewMode];
}
