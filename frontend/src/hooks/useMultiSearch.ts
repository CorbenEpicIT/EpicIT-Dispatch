import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function useMultiSearch(paramKey: string) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [duplicateTerm, setDuplicateTerm] = useState<string | null>(null);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (flashTimer.current) clearTimeout(flashTimer.current);
	}, []);

	const terms = searchParams.getAll(paramKey);

	const addTerm = useCallback(
		(v: string): boolean => {
			const trimmed = v.trim();
			if (!trimmed) return false;

			if (terms.includes(trimmed)) {
				if (flashTimer.current) clearTimeout(flashTimer.current);
				setDuplicateTerm(trimmed);
				flashTimer.current = setTimeout(() => setDuplicateTerm(null), 600);
				return false;
			}

			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.append(paramKey, trimmed);
				return next;
			});
			return true;
		},
		[paramKey, terms, setSearchParams]
	);

	const removeTerm = useCallback(
		(v: string) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				const remaining = next.getAll(paramKey).filter((t) => t !== v);
				next.delete(paramKey);
				remaining.forEach((t) => next.append(paramKey, t));
				return next;
			});
		},
		[paramKey, setSearchParams]
	);

	const clearAll = useCallback(() => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete(paramKey);
			return next;
		});
	}, [paramKey, setSearchParams]);

	return { terms, addTerm, removeTerm, clearAll, duplicateTerm };
}
