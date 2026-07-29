import { useCallback, useRef } from "react";

import type { InventoryItem } from "../types/inventory";
import type { ResolvedSerial, ResolvedBatch } from "../types/tracking";
import { useResolveCodeMutation } from "./useTracking";

export interface ScanDispatcherHandlers {
	onItem: (item: InventoryItem) => void;
	/** Omitted → falls back to onItem(serial.item), so a unit label opens its parent item today. */
	onSerial?: (serial: ResolvedSerial) => void;
	/** Omitted → falls back to onItem(batch.item), so a lot label opens its parent item today. */
	onBatch?: (batch: ResolvedBatch) => void;
	onNotFound: (code: string) => void;
}

// Scan-anything dispatcher — resolves a code via /inventory/resolve and routes
// to the matching handler. Every scan surface in the app (dispatch inventory,
// vehicle stock, technician PartsUsed) should go through this hook so a
// serial/batch label picked up anywhere behaves consistently once Workstream
// B lands, without each call site needing to know about the new code shapes.
export function useScanDispatcher(handlers: ScanDispatcherHandlers): {
	handleScan: (code: string) => Promise<void>;
	isScanning: boolean;
} {
	const resolveMutation = useResolveCodeMutation();
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;
	// Synchronous guard — mirrors useBarcodeScanHandler's inFlightRef so a
	// scanner double-fire can't land two codes in the same tick.
	const inFlightRef = useRef(false);

	const handleScan = useCallback(
		async (code: string) => {
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			try {
				const result = await resolveMutation.mutateAsync(code);
				const h = handlersRef.current;
				if (result.type === "item") {
					h.onItem(result.item);
				} else if (result.type === "serial") {
					(h.onSerial ?? ((s: ResolvedSerial) => h.onItem(s.item)))(result);
				} else {
					(h.onBatch ?? ((b: ResolvedBatch) => h.onItem(b.item)))(result);
				}
			} catch {
				handlersRef.current.onNotFound(code);
			} finally {
				inFlightRef.current = false;
			}
		},
		[resolveMutation],
	);

	return { handleScan, isScanning: resolveMutation.isPending };
}
