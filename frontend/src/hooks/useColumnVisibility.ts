import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../auth/authStore";

export interface ColumnOption {
	key: string;
	label: string;
}

const STORAGE_PREFIX = "report-cols:";

function loadHidden(key: string): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === "string")) : new Set();
	} catch {
		return new Set();
	}
}


export function useColumnVisibility(storageKey: string, columns: ColumnOption[]) {
	// Scope column prefs per user so they don't bleed across accounts on Switch User
	const userId = useAuthStore((s) => s.user?.userId) ?? "anon";
	const key = `${STORAGE_PREFIX}${userId}:${storageKey}`;
	const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(key));

	useEffect(() => {
		setHidden(loadHidden(key));
	}, [key]);

	useEffect(() => {
		try {
			localStorage.setItem(key, JSON.stringify([...hidden]));
		} catch {
			void 0;
		}
	}, [key, hidden]);

	const toggle = useCallback(
		(key: string) => {
			setHidden((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					// Keep at least one column visible.
					const visibleCount = columns.filter((c) => !next.has(c.key)).length;
					if (visibleCount <= 1) return prev;
					next.add(key);
				}
				return next;
			});
		},
		[columns],
	);

	const reset = useCallback(() => setHidden(new Set()), []);

	const columnVisibility = useMemo(
		() => Object.fromEntries(columns.map((c) => [c.key, !hidden.has(c.key)])),
		[columns, hidden],
	);

	return { hidden, toggle, reset, columnVisibility };
}
