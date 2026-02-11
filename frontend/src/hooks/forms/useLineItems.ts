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
	subtotal: number;
	resetLineItems: () => void;
	dirtyLineItemFields: Record<string, boolean>;
	undoLineItemField: (id: string, field: keyof BaseLineItem) => void;
	clearLineItemField: (id: string, field: keyof BaseLineItem) => void;
	originalLineItems: Map<string, BaseLineItem>;
}

export const useLineItems = (options: UseLineItemsOptions = {}): UseLineItemsReturn => {
	const { initialItems = [], minItems = 1, mode = "create" } = options;

	// Initialize with at least one empty item in create mode
	const getInitialItems = (): BaseLineItem[] => {
		if (initialItems.length > 0) {
			return initialItems as BaseLineItem[];
		}
		if (mode === "create") {
			return [
				{
					id: crypto.randomUUID(),
					name: "",
					description: "",
					quantity: 1,
					unit_price: 0,
					item_type: "",
					total: 0,
				},
			];
		}
		return [];
	};

	const [lineItems, setLineItems] = useState<BaseLineItem[]>(getInitialItems());

	const [originalLineItems, setOriginalLineItems] = useState<Map<string, BaseLineItem>>(
		new Map()
	);

	const [dirtyLineItemFields, setDirtyLineItemFields] = useState<Record<string, boolean>>({});

	// Initialize original values when line items are set
	const setLineItemsWithOriginals = useCallback(
		(items: BaseLineItem[] | ((prev: BaseLineItem[]) => BaseLineItem[])) => {
			setLineItems((prev) => {
				const newItems = typeof items === "function" ? items(prev) : items;

				const originals = new Map<string, BaseLineItem>();
				newItems.forEach((item) => {
					// In create mode, store the initial state when item is added
					// In edit mode, store only for existing items (not new ones)
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
			id: crypto.randomUUID(),
			name: "",
			description: "",
			quantity: 1,
			unit_price: 0,
			item_type: "",
			total: 0,
			...(mode === "edit" && { isNew: true }),
		};

		setLineItems((prev) => [...prev, newItem]);

		setOriginalLineItems((prev) => {
			const updated = new Map(prev);
			updated.set(newItem.id, { ...newItem });
			return updated;
		});
	}, [mode]);

	const removeLineItem = useCallback(
		(id: string) => {
			if (lineItems.length <= minItems) return;

			setLineItems((prev) => {
				// For edit mode with EditableLineItem - soft delete
				if (mode === "edit") {
					return prev.map((item) =>
						item.id === id ? { ...item, isDeleted: true } : item
					);
				}
				// For create mode - hard delete
				return prev.filter((item) => item.id !== id);
			});

			// Clean up originals and dirty state for removed item
			if (mode === "create") {
				setOriginalLineItems((prev) => {
					const updated = new Map(prev);
					updated.delete(id);
					return updated;
				});

				setDirtyLineItemFields((prev) => {
					const updated = { ...prev };
					Object.keys(updated).forEach((key) => {
						if (key.startsWith(`li:${id}:`)) {
							delete updated[key];
						}
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
				const isDirty = original[field] !== value;
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:${field}`]: isDirty,
				}));
			}
		},
		[originalLineItems]
	);

	const undoLineItemField = useCallback(
		(id: string, field: keyof BaseLineItem) => {
			const original = originalLineItems.get(id);
			if (original) {
				setLineItems((prev) =>
					prev.map((item) => {
						if (item.id !== id) return item;

						const updated = {
							...item,
							[field]: original[field],
						};

						// Recalculate total if reverting quantity or unit_price
						if (
							field === "quantity" ||
							field === "unit_price"
						) {
							updated.total =
								Number(updated.quantity) *
								Number(updated.unit_price);
						}

						return updated;
					})
				);

				// Clear dirty state
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:${field}`]: false,
				}));
			}
		},
		[originalLineItems]
	);

	const clearLineItemField = useCallback(
		(id: string, field: keyof BaseLineItem) => {
			setLineItems((prev) =>
				prev.map((item) => {
					if (item.id !== id) return item;

					const updated = { ...item, [field]: "" };
					return updated;
				})
			);

			// Mark as dirty since we're clearing it
			const original = originalLineItems.get(id);
			if (original) {
				const isDirty = original[field] !== "";
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:${field}`]: isDirty,
				}));
			}
		},
		[originalLineItems]
	);

	// Calculate active line items (excluding soft-deleted)
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
		subtotal,
		resetLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
		originalLineItems,
	};
};
