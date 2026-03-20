import { useState, useCallback, useMemo } from "react";
import type { BaseLineItem, EditableLineItem } from "../../types/common";

interface UseLineItemsOptions {
	initialItems?: BaseLineItem[] | EditableLineItem[];
	minItems?: number;
	mode?: "create" | "edit";
}

interface UseLineItemsReturn {
	lineItems: BaseLineItem[];
	setLineItems: React.Dispatch<React.SetStateAction<BaseLineItem[]>>;
	activeLineItems: BaseLineItem[];
	addLineItem: () => void;
	removeLineItem: (id: string) => void;
	updateLineItem: (id: string, field: keyof BaseLineItem, value: string | number) => void;
	// "start from existing" / template pre-fill
	// Accepts the core fields plus optional source attribution fields
	seedLineItems: (
		items: Array<
			Pick<
				BaseLineItem,
				"name" | "description" | "quantity" | "unit_price" | "item_type"
			> & {
				source_job_id?: string | null;
				source_visit_id?: string | null;
			}
		>
	) => void;
	subtotal: number;
	resetLineItems: () => void;
	dirtyLineItemFields: Record<string, boolean>;
	undoLineItemField: (id: string, field: keyof BaseLineItem) => void;
	clearLineItemField: (id: string, field: keyof BaseLineItem) => void;
	originalLineItems: Map<string, BaseLineItem>;
}

const blankItem = (): BaseLineItem => ({
	id: crypto.randomUUID(),
	name: "",
	description: "",
	quantity: 1,
	unit_price: 0,
	item_type: "",
	total: 0,
});

export const useLineItems = (options: UseLineItemsOptions = {}): UseLineItemsReturn => {
	const { initialItems = [], minItems = 1, mode = "create" } = options;

	const getInitialItems = (): BaseLineItem[] => {
		if (initialItems.length > 0) return initialItems as BaseLineItem[];
		if (mode === "create") return [blankItem()];
		return [];
	};

	const [lineItems, setLineItems] = useState<BaseLineItem[]>(getInitialItems());
	const [originalLineItems, setOriginalLineItems] = useState<Map<string, BaseLineItem>>(
		new Map()
	);
	const [dirtyLineItemFields, setDirtyLineItemFields] = useState<Record<string, boolean>>({});

	const setLineItemsWithOriginals = useCallback(
		(items: BaseLineItem[] | ((prev: BaseLineItem[]) => BaseLineItem[])) => {
			setLineItems((prev) => {
				const newItems = typeof items === "function" ? items(prev) : items;

				const originals = new Map<string, BaseLineItem>();
				newItems.forEach((item) => {
					const shouldStore =
						mode === "create" ||
						(mode === "edit" &&
							!("isNew" in item && item.isNew));
					if (shouldStore) {
						originals.set(item.id, {
							id: item.id,
							name: item.name,
							description: item.description,
							quantity: item.quantity,
							unit_price: item.unit_price,
							item_type: item.item_type,
							total: item.total,
							...(item.source_job_id !== undefined && {
								source_job_id: item.source_job_id,
							}),
							...(item.source_visit_id !== undefined && {
								source_visit_id: item.source_visit_id,
							}),
						});
					}
				});
				setOriginalLineItems(originals);

				return newItems;
			});
		},
		[mode]
	);

	const addLineItem = useCallback(() => {
		const newItem: BaseLineItem = {
			...blankItem(),
			...(mode === "edit" && { isNew: true }),
		};

		setLineItems((prev) => [...prev, newItem]);

	}, [mode]);

	const seedLineItems = useCallback(
		(
			seeds: Array<
				Pick<
					BaseLineItem,
					| "name"
					| "description"
					| "quantity"
					| "unit_price"
					| "item_type"
				> & {
					source_job_id?: string | null;
					source_visit_id?: string | null;
				}
			>
		) => {
			const items: BaseLineItem[] = seeds.map((s) => {
				const id = crypto.randomUUID();
				return {
					id,
					name: s.name,
					description: s.description,
					quantity: Number(s.quantity),
					unit_price: Number(s.unit_price),
					item_type: s.item_type,
					total: Number(s.quantity) * Number(s.unit_price),
					// Preserve source attribution if provided
					...(s.source_job_id !== undefined && {
						source_job_id: s.source_job_id,
					}),
					...(s.source_visit_id !== undefined && {
						source_visit_id: s.source_visit_id,
					}),
				} as BaseLineItem;
			});

			// If no seeds provided fall back to one blank item
			const next = items.length > 0 ? items : [blankItem()];

			const originals = new Map<string, BaseLineItem>();
			next.forEach((item) => originals.set(item.id, { ...item }));

			setLineItems(next);
			setOriginalLineItems(originals);
			setDirtyLineItemFields({});
		},
		[]
	);

	const removeLineItem = useCallback(
		(id: string) => {
			if (lineItems.length <= minItems) return;

			setLineItems((prev) => {
				if (mode === "edit") {
					return prev.map((item) =>
						item.id === id ? { ...item, isDeleted: true } : item
					);
				}
				return prev.filter((item) => item.id !== id);
			});

			if (mode === "create") {
				setOriginalLineItems((prev) => {
					const updated = new Map(prev);
					updated.delete(id);
					return updated;
				});
				setDirtyLineItemFields((prev) => {
					const updated = { ...prev };
					Object.keys(updated).forEach((key) => {
						if (key.startsWith(`li:${id}:`))
							delete updated[key];
					});
					return updated;
				});
			}
		},
		[lineItems.length, minItems, mode]
	);

	const updateLineItem = useCallback(
		(id: string, field: keyof BaseLineItem, value: string | number) => {
			setLineItems((prev) =>
				prev.map((item) => {
					if (item.id !== id) return item;
					const updated = { ...item, [field]: value };
					if (field === "quantity" || field === "unit_price") {
						updated.total =
							Number(updated.quantity) *
							Number(updated.unit_price);
					}
					return updated;
				})
			);

			const original = originalLineItems.get(id);
			if (original) {
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:${field}`]: original[field] !== value,
				}));
			}
		},
		[originalLineItems]
	);

	const undoLineItemField = useCallback(
		(id: string, field: keyof BaseLineItem) => {
			const original = originalLineItems.get(id);
			if (!original) return;

			setLineItems((prev) =>
				prev.map((item) => {
					if (item.id !== id) return item;
					const updated = { ...item, [field]: original[field] };
					if (field === "quantity" || field === "unit_price") {
						updated.total =
							Number(updated.quantity) *
							Number(updated.unit_price);
					}
					return updated;
				})
			);
			setDirtyLineItemFields((prev) => ({
				...prev,
				[`li:${id}:${field}`]: false,
			}));
		},
		[originalLineItems]
	);

	const clearLineItemField = useCallback(
		(id: string, field: keyof BaseLineItem) => {
			setLineItems((prev) =>
				prev.map((item) =>
					item.id !== id ? item : { ...item, [field]: "" }
				)
			);
			const original = originalLineItems.get(id);
			if (original) {
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:${field}`]: original[field] !== "",
				}));
			}
		},
		[originalLineItems]
	);

	const activeLineItems = useMemo(
		() => lineItems.filter((item) => !("isDeleted" in item && item.isDeleted)),
		[lineItems]
	);

	const subtotal = useMemo(
		() => activeLineItems.reduce((sum, item) => sum + item.total, 0),
		[activeLineItems]
	);

	const resetLineItems = useCallback(() => {
		setLineItems(getInitialItems());
		setOriginalLineItems(new Map());
		setDirtyLineItemFields({});
	}, [mode]);

	return {
		lineItems,
		setLineItems: setLineItemsWithOriginals,
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		seedLineItems,
		subtotal,
		resetLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
		originalLineItems,
	};
};
