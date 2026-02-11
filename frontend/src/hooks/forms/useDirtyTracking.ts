import { useState, useCallback, useMemo } from "react";
import type { FormFieldState } from "../../types/common";

type FieldStates<T> = {
	[K in keyof T]: FormFieldState<T[K]>;
};

export function useDirtyTracking<T extends Record<string, any>>(initialValues: T) {
	const [fields, setFields] = useState<FieldStates<T>>(() =>
		Object.entries(initialValues).reduce(
			(acc, [key, value]) => ({
				...acc,
				[key]: {
					originalValue: value,
					currentValue: value,
					isDirty: false,
				},
			}),
			{} as FieldStates<T>
		)
	);

	const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
		setFields((prev) => {
			const field = prev[key];
			const isDirty =
				JSON.stringify(value) !== JSON.stringify(field.originalValue);
			if (field.currentValue === value && field.isDirty === isDirty) return prev;

			return {
				...prev,
				[key]: { ...field, currentValue: value, isDirty },
			};
		});
	}, []);

	const undoField = useCallback(<K extends keyof T>(key: K) => {
		setFields((prev) => ({
			...prev,
			[key]: {
				...prev[key],
				currentValue: prev[key].originalValue,
				isDirty: false,
			},
		}));
	}, []);

	const setOriginals = useCallback((newOriginals: Partial<T>) => {
		setFields((prev) =>
			Object.entries(newOriginals).reduce(
				(acc, [key, value]) => ({
					...acc,
					[key]: {
						originalValue: value,
						currentValue: value,
						isDirty: false,
					},
				}),
				prev
			)
		);
	}, []);

	const dirtyFields = useMemo(
		() =>
			Object.entries(fields)
				.filter(([, v]) => v.isDirty)
				.map(([k]) => k as keyof T),
		[fields]
	);

	const isDirty = useCallback((key: keyof T) => fields[key]?.isDirty ?? false, [fields]);

	const getValue = useCallback(
		<K extends keyof T>(key: K): T[K] => fields[key]?.currentValue,
		[fields]
	);

	return {
		fields,
		updateField,
		undoField,
		setOriginals,
		dirtyFields,
		isDirty,
		getValue,
		hasDirtyFields: dirtyFields.length > 0,
	};
}
