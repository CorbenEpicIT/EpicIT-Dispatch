import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LabelTemplateId, LabelSymbology, LabelCalibration, FillDirection } from "../lib/labels";

export interface LabelQueueItem {
	/** Unique per queue entry — the source entity's id (item id, serial id, or batch id). */
	id: string;
	/** Bare code as stored on the entity — QRLabel prefixes it (SN:/LOT:) for serial/batch kinds. */
	code: string;
	/** Which entity this label represents — drives the QR payload prefix. */
	kind: "item" | "serial" | "batch";
	primaryLabel: string;
	secondaryLabel?: string;
	/** How many copies of this label to print. */
	copies: number;
	/**
	 * Tracking flags — only meaningful for kind:"item" entries, carried so the
	 * print page can flag a general SKU code queued for a serialized/batch item
	 * and offer a per-unit chooser. Undefined for serial/batch entries (they are
	 * already a specific unit/lot).
	 */
	isSerialized?: boolean;
	isBatchTracked?: boolean;
}

/** What a caller passes to add/addMany — copies defaults to 1 for new entries. */
export type LabelQueueItemInput = Omit<LabelQueueItem, "copies"> & { copies?: number };

interface LabelQueueState {
	items: LabelQueueItem[];
	templateId: LabelTemplateId;
	/** Encoding for item labels. Serial/batch always render QR — see LabelSheet. */
	symbology: LabelSymbology;
	/** Cell index (0-based) to start printing at — lets a partially-used sheet keep working. */
	startOffset: number;
	/** Per-template printer-drift fine-tune, in mm. */
	calibration: Partial<Record<LabelTemplateId, LabelCalibration>>;
	/** Sheet fill order — "row" (default) or "column". Grid templates only. */
	fillDirection: FillDirection;
	/** Restrict printing to a single 0-based column; null uses every column. */
	lockedColumn: number | null;
	/**
	 * Monotonic counter bumped on every add/addMany, even upserts that don't
	 * change items.length. Lets a toast react to "something was queued" without
	 * diffing the array — an upsert (re-add after rename) still fires feedback.
	 */
	lastAddSeq: number;
	/** Human label of the most recent add — powers the confirmation toast text. */
	lastAddLabel: string | null;
	add: (item: LabelQueueItemInput) => void;
	addMany: (items: LabelQueueItemInput[]) => void;
	remove: (id: string) => void;
	clear: () => void;
	setTemplate: (id: LabelTemplateId) => void;
	setStartOffset: (n: number) => void;
	setSymbology: (s: LabelSymbology) => void;
	setCopies: (id: string, copies: number) => void;
	setCalibration: (templateId: LabelTemplateId, calibration: LabelCalibration) => void;
	resetCalibration: (templateId: LabelTemplateId) => void;
	setFillDirection: (d: FillDirection) => void;
	setLockedColumn: (col: number | null) => void;
}

export const useLabelQueueStore = create<LabelQueueState>()(
	persist(
		(set, get) => ({
			items: [],
			templateId: "avery5160",
			symbology: "qr",
			startOffset: 0,
			calibration: {},
			fillDirection: "row",
			lockedColumn: null,
			lastAddSeq: 0,
			lastAddLabel: null,
			// Upsert by id, not a pure dedupe-skip — re-adding an item (e.g. after a
			// rename) must refresh its queued label text/code, not silently no-op.
			// Copies are preserved across an upsert — re-adding must not reset the count.
			add: (item) => get().addMany([item]),
			addMany: (newItems) =>
				set((s) => {
					const items = [...s.items];
					for (const item of newItems) {
						const idx = items.findIndex((i) => i.id === item.id);
						if (idx === -1) items.push({ ...item, copies: Math.max(1, item.copies ?? 1) });
						else items[idx] = { ...item, copies: items[idx].copies };
					}
					if (newItems.length === 0) return { items };
					return {
						items,
						lastAddSeq: s.lastAddSeq + 1,
						lastAddLabel:
							newItems.length === 1
								? newItems[0].primaryLabel
								: `${newItems.length} labels`,
					};
				}),
			remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
			clear: () => set({ items: [] }),
			setTemplate: (templateId) => set({ templateId }),
			setStartOffset: (startOffset) => set({ startOffset: Math.max(0, startOffset) }),
			setSymbology: (symbology) => set({ symbology }),
			setCopies: (id, copies) =>
				set((s) => ({
					items: s.items.map((i) => (i.id === id ? { ...i, copies: Math.max(1, copies) } : i)),
				})),
			setCalibration: (templateId, calibration) =>
				set((s) => ({ calibration: { ...s.calibration, [templateId]: calibration } })),
			resetCalibration: (templateId) =>
				set((s) => {
					const calibration = { ...s.calibration };
					delete calibration[templateId];
					return { calibration };
				}),
			setFillDirection: (fillDirection) => set({ fillDirection }),
			setLockedColumn: (lockedColumn) => set({ lockedColumn }),
		}),
		{
			name: "label-print-settings",
			// Queue contents and start-offset stay ephemeral — only durable print preferences persist.
			partialize: (s) => ({
				templateId: s.templateId,
				symbology: s.symbology,
				calibration: s.calibration,
				fillDirection: s.fillDirection,
				lockedColumn: s.lockedColumn,
			}),
		},
	),
);
