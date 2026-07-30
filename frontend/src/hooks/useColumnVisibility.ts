import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../auth/authStore";

export interface ColumnOption {
	key: string;
	label: string;
}

export function buildHeaderLabels(columns: ColumnOption[]): Record<string, string> {
	return Object.fromEntries(columns.map((c) => [c.key, c.label]));
}

export function buildColumnAlign(
	columns: ColumnOption[],
	rightKeys: readonly string[],
): Record<string, "left" | "right"> {
	return Object.fromEntries(
		columns.map((c) => [c.key, rightKeys.includes(c.key) ? "right" : "left"]),
	);
}

const STORAGE_PREFIX = "report-cols:";

function loadHidden(key: string, initialHidden?: string[]): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return new Set(initialHidden);
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? new Set(parsed.filter((k) => typeof k === "string"))
			: new Set(initialHidden);
	} catch {
		return new Set(initialHidden);
	}
}


export function useColumnVisibility(
	storageKey: string,
	columns: ColumnOption[],
	initialHidden?: string[],
) {
	// Scope column prefs per user so they don't bleed across accounts on Switch User
	const userId = useAuthStore((s) => s.user?.userId) ?? "anon";
	const key = `${STORAGE_PREFIX}${userId}:${storageKey}`;
	const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(key, initialHidden));

	// Ref keeps initial-only semantics; a raw array dep would re-run on every
	// render when callers pass an inline literal.
	const initialHiddenRef = useRef(initialHidden);
	initialHiddenRef.current = initialHidden;

	useEffect(() => {
		setHidden(loadHidden(key, initialHiddenRef.current));
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

	const hideAll = useCallback(
		() => setHidden(new Set(columns.map((c) => c.key))),
		[columns],
	);

	const columnVisibility = useMemo(
		() => Object.fromEntries(columns.map((c) => [c.key, !hidden.has(c.key)])),
		[columns, hidden],
	);

	const visibleColumns = useMemo(
		() => columns.filter((c) => !hidden.has(c.key)),
		[columns, hidden],
	);

	return { hidden, setHidden, toggle, reset, hideAll, columnVisibility, visibleColumns };
}

export function clearColumnVisibility(storageKey: string) {
	const userId = useAuthStore.getState().user?.userId ?? "anon";
	try {
		localStorage.removeItem(`${STORAGE_PREFIX}${userId}:${storageKey}`);
	} catch {
		void 0;
	}
}
