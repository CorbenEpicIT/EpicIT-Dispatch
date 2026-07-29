import { useState, useCallback, useMemo, useRef } from "react";
import type { BaseLineItem, EditableLineItem } from "../../types/common";

interface UseLineItemsOptions {
	initialItems?: BaseLineItem[] | EditableLineItem[];
	minItems?: number;
	mode?: "create" | "edit";
	defaultTaxGroupId?: string | null;
}

type SeedInput = Array<
	Pick<BaseLineItem, "name" | "description" | "quantity" | "unit_price" | "item_type"> & {
		source_job_id?: string | null;
		source_visit_id?: string | null;
		taxable?: boolean;
		tax_group_id?: string | null;
	}
>;

interface UseLineItemsReturn {
	lineItems: BaseLineItem[];
	setLineItems: React.Dispatch<React.SetStateAction<BaseLineItem[]>>;
	activeLineItems: BaseLineItem[];
	addLineItem: () => void;
	removeLineItem: (id: string) => void;
	updateLineItem: (id: string, field: keyof BaseLineItem, value: string | number | boolean) => void;
	updateLineItemSource: (id: string, sourceJobId: string | null, sourceVisitId: string | null) => void;
	undoLineItemSource: (id: string) => void;
	setLineItemTaxGroup: (id: string, groupId: string | null, taxable: boolean) => void;
	setAllLineItemsTaxGroup: (groupId: string | null, taxable: boolean) => void;
	// "start from existing" / template pre-fill — REPLACES all items
	seedLineItems: (items: SeedInput) => void;
	// append items to existing list without replacing — used for visit import/restore
	appendLineItems: (items: SeedInput) => void;
	subtotal: number;
	resetLineItems: () => void;
	dirtyLineItemFields: Record<string, boolean>;
	undoLineItemField: (id: string, field: keyof BaseLineItem) => void;
	clearLineItemField: (id: string, field: keyof BaseLineItem) => void;
	originalLineItems: Map<string, BaseLineItem>;
}

const blankItem = (defaultTaxGroupId?: string | null): BaseLineItem => ({
	id: crypto.randomUUID(),
	name: "",
	description: "",
	quantity: 1,
	unit_price: 0,
	item_type: "",
	total: 0,
	taxable: true,
	tax_group_id: defaultTaxGroupId ?? null,
});

export const useLineItems = (options: UseLineItemsOptions = {}): UseLineItemsReturn => {
	const { initialItems = [], minItems = 1, mode = "create", defaultTaxGroupId } = options;

	const getInitialItems = (): BaseLineItem[] => {
		if (initialItems.length > 0) {
			return (initialItems as BaseLineItem[]).map((item) => ({
				...item,
				taxable: item.taxable ?? true,
				tax_group_id: item.tax_group_id ?? defaultTaxGroupId ?? null,
			}));
		}
		if (mode === "create") return [blankItem(defaultTaxGroupId)];
		return [];
	};

	const [lineItems, setLineItems] = useState<BaseLineItem[]>(getInitialItems());
	const [originalLineItems, setOriginalLineItems] = useState<Map<string, BaseLineItem>>(
		new Map()
	);
	const [dirtyLineItemFields, setDirtyLineItemFields] = useState<Record<string, boolean>>({});

	// Latest-value ref — lets setLineItemsWithOriginals handle updater functions
	// without a stale closure, without triggering re-renders.
	const lineItemsRef = useRef<BaseLineItem[]>(lineItems);
	lineItemsRef.current = lineItems;

	// Stabilize initialItems — the caller may pass a default `[]` that is a new
	// reference on every render.  Reading through a ref prevents resetLineItems
	// from being recreated every render and breaking the useEffect dependency
	// chain in CreateInvoice / CreateQuote (→ infinite loop when modal is closed).
	const initialItemsRef = useRef<BaseLineItem[] | EditableLineItem[]>(initialItems);
	initialItemsRef.current = initialItems;

	const buildOriginalsMap = useCallback(
		(items: BaseLineItem[]): Map<string, BaseLineItem> => {
			const originals = new Map<string, BaseLineItem>();
			items.forEach((item) => {
				const shouldStore =
					mode === "create" || (mode === "edit" && !("isNew" in item && item.isNew));
				if (shouldStore) {
					originals.set(item.id, {
						id: item.id,
						name: item.name,
						description: item.description,
						quantity: item.quantity,
						unit_price: item.unit_price,
						item_type: item.item_type,
						total: item.total,
						taxable: item.taxable ?? true,
						tax_group_id: item.tax_group_id ?? null,
						...(item.source_job_id !== undefined && { source_job_id: item.source_job_id }),
						...(item.source_visit_id !== undefined && { source_visit_id: item.source_visit_id }),
					});
				}
			});
			return originals;
		},
		[mode],
	);

	const setLineItemsWithOriginals = useCallback(
		(items: BaseLineItem[] | ((prev: BaseLineItem[]) => BaseLineItem[])) => {
			// Compute next items synchronously using the latest-value ref for updater fns.
			// This avoids calling setOriginalLineItems inside a state updater (React violation).
			const newItems =
				typeof items === "function" ? items(lineItemsRef.current) : items;
			setLineItems(newItems);
			setOriginalLineItems(buildOriginalsMap(newItems));
		},
		[buildOriginalsMap],
	);

	const addLineItem = useCallback(() => {
		const newItem: BaseLineItem = {
			...blankItem(defaultTaxGroupId),
			...(mode === "edit" && { isNew: true }),
		};

		setLineItems((prev) => [...prev, newItem]);

	}, [mode, defaultTaxGroupId]);

	const seedLineItems = useCallback(
		(seeds: SeedInput) => {
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
					taxable: s.taxable ?? true,
					tax_group_id: s.tax_group_id ?? defaultTaxGroupId ?? null,
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
			const next = items.length > 0 ? items : [blankItem(defaultTaxGroupId)];

			const originals = new Map<string, BaseLineItem>();
			next.forEach((item) => originals.set(item.id, { ...item }));

			setLineItems(next);
			setOriginalLineItems(originals);
			setDirtyLineItemFields({});
		},
		[defaultTaxGroupId]
	);

	const appendLineItems = useCallback(
		(seeds: SeedInput) => {
			const newItems: BaseLineItem[] = seeds.map((s) => {
				const id = crypto.randomUUID();
				return {
					id,
					name: s.name,
					description: s.description,
					quantity: Number(s.quantity),
					unit_price: Number(s.unit_price),
					item_type: s.item_type,
					total: Number(s.quantity) * Number(s.unit_price),
					taxable: s.taxable ?? true,
					tax_group_id: s.tax_group_id ?? defaultTaxGroupId ?? null,
					...(s.source_job_id !== undefined && { source_job_id: s.source_job_id }),
					...(s.source_visit_id !== undefined && { source_visit_id: s.source_visit_id }),
				} as BaseLineItem;
			});
			if (newItems.length === 0) return;
			setOriginalLineItems((prev) => {
				const updated = new Map(prev);
				newItems.forEach((item) => updated.set(item.id, { ...item }));
				return updated;
			});
			setLineItems((prev) => [...prev, ...newItems]);
			// Intentionally do NOT reset dirtyLineItemFields — existing edits survive
		},
		[defaultTaxGroupId]
	);

	const removeLineItem = useCallback(
		(id: string) => {
			// Use a ref-free guard: compute active count inside the updater and bail early.
			// All side-effect setters also guard with the same condition via a captured flag.
			let didRemove = false;
			setLineItems((prev) => {
				const activeCount = prev.filter((item) => !("isDeleted" in item && item.isDeleted)).length;
				if (activeCount <= minItems) return prev;
				didRemove = true;
				if (mode === "edit") {
					return prev.map((item) =>
						item.id === id ? { ...item, isDeleted: true } : item
					);
				}
				return prev.filter((item) => item.id !== id);
			});

			// Only clean up originals/dirty tracking if removal actually occurred.
			// React 18 batches these with setLineItems inside the same event handler.
			if (didRemove && mode === "create") {
				setOriginalLineItems((prev) => {
					const updated = new Map(prev);
					updated.delete(id);
					return updated;
				});
				setDirtyLineItemFields((prev) => {
					const updated = { ...prev };
					Object.keys(updated).forEach((key) => {
						if (key.startsWith(`li:${id}:`)) delete updated[key];
					});
					return updated;
				});
			}
		},
		[minItems, mode]
	);

	const updateLineItem = useCallback(
		(id: string, field: keyof BaseLineItem, value: string | number | boolean) => {
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

	const updateLineItemSource = useCallback(
		(id: string, sourceJobId: string | null, sourceVisitId: string | null) => {
			// Use raw setLineItems to avoid resetting originals
			setLineItems((prev) =>
				prev.map((item) =>
					item.id !== id
						? item
						: { ...item, source_job_id: sourceJobId, source_visit_id: sourceVisitId }
				)
			);
			const original = originalLineItems.get(id);
			if (original) {
				const origJobId = original.source_job_id ?? null;
				const origVisitId = original.source_visit_id ?? null;
				const dirty = origJobId !== sourceJobId || origVisitId !== sourceVisitId;
				setDirtyLineItemFields((prev) => ({ ...prev, [`li:${id}:source`]: dirty }));
			}
		},
		[originalLineItems]
	);

	const undoLineItemSource = useCallback(
		(id: string) => {
			const original = originalLineItems.get(id);
			if (!original) return;
			const origJobId = original.source_job_id ?? null;
			const origVisitId = original.source_visit_id ?? null;
			setLineItems((prev) =>
				prev.map((item) =>
					item.id !== id
						? item
						: { ...item, source_job_id: origJobId, source_visit_id: origVisitId }
				)
			);
			setDirtyLineItemFields((prev) => ({ ...prev, [`li:${id}:source`]: false }));
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

	const setLineItemTaxGroup = useCallback(
		(id: string, groupId: string | null, taxable: boolean) => {
			setLineItems((prev) =>
				prev.map((item) =>
					item.id !== id ? item : { ...item, tax_group_id: groupId, taxable }
				)
			);
			const original = originalLineItems.get(id);
			if (original) {
				setDirtyLineItemFields((prev) => ({
					...prev,
					[`li:${id}:tax_group_id`]: original.tax_group_id !== groupId,
					[`li:${id}:taxable`]: (original.taxable ?? true) !== taxable,
				}));
			}
		},
		[originalLineItems]
	);

	const setAllLineItemsTaxGroup = useCallback(
		(groupId: string | null, taxable: boolean) => {
			setLineItems((prev) =>
				prev.map((item) =>
					"isDeleted" in item && item.isDeleted
						? item
						: { ...item, tax_group_id: groupId, taxable }
				)
			);
			setDirtyLineItemFields((prev) => {
				const updates: Record<string, boolean> = {};
				for (const [id, original] of originalLineItems) {
					updates[`li:${id}:tax_group_id`] = original.tax_group_id !== groupId;
					updates[`li:${id}:taxable`] = (original.taxable ?? true) !== taxable;
				}
				return { ...prev, ...updates };
			});
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
		const seedItems = initialItemsRef.current;
		let items: BaseLineItem[];
		if (seedItems.length > 0) {
			items = (seedItems as BaseLineItem[]).map((item) => ({
				...item,
				taxable: item.taxable ?? true,
				tax_group_id: item.tax_group_id ?? defaultTaxGroupId ?? null,
			}));
		} else if (mode === "create") {
			items = [blankItem(defaultTaxGroupId)];
		} else {
			items = [];
		}
		setLineItems(items);
		setOriginalLineItems(new Map());
		setDirtyLineItemFields({});
	}, [mode, defaultTaxGroupId]); // initialItems read via ref — no dep needed

	return {
		lineItems,
		setLineItems: setLineItemsWithOriginals,
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		updateLineItemSource,
		undoLineItemSource,
		setLineItemTaxGroup,
		setAllLineItemsTaxGroup,
		seedLineItems,
		appendLineItems,
		subtotal,
		resetLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
		originalLineItems,
	};
};
