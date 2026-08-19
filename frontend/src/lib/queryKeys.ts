import type { QueryClient } from "@tanstack/react-query";
import type { InventorySortOption } from "../types/inventory";

// ============================================================================
// Query key factory
//
// Every list-style key accepts its filter arg optionally: calling it with no
// arg returns the shared prefix (used for invalidation, matches all filtered
// variants); calling it with an arg returns the full key (used by the query
// itself). This keeps "invalidate everything under X" and "this exact query"
// expressible from the same function.
// ============================================================================

const inventoryRoot = ["inventory"] as const;

interface InventoryListOpts {
	sort?: InventorySortOption;
	lowStock?: boolean;
}

export const qk = {
	inventory: {
		all: inventoryRoot,
		list: (opts?: InventoryListOpts) =>
			opts ? ([...inventoryRoot, "list", opts] as const) : ([...inventoryRoot, "list"] as const),
		detail: (id: string) => [...inventoryRoot, "detail", id] as const,
		tags: [...inventoryRoot, "tags"] as const,
		provisional: [...inventoryRoot, "provisional"] as const,
		// movements/valueHistory take an opts object for the same reason
		// consumptionTrend does: the History tab's range control is a SERVER-side
		// filter, so two ranges are two different result sets and must not share
		// one cache entry. Omitting opts keeps the old key shape, and because the
		// range lands in a trailing segment, prefix invalidation still matches.
		movements: (itemId: string, opts?: { createdAfter?: string }) =>
			opts
				? ([...inventoryRoot, "detail", itemId, "movements", opts] as const)
				: ([...inventoryRoot, "detail", itemId, "movements"] as const),
		usage: (itemId: string, opts?: { limit?: number; offset?: number }) =>
			opts
				? ([...inventoryRoot, "detail", itemId, "usage", opts] as const)
				: ([...inventoryRoot, "detail", itemId, "usage"] as const),
		forecast: (itemId: string) => [...inventoryRoot, "detail", itemId, "forecast"] as const,
		valueHistory: (itemId: string, opts?: { createdAfter?: string }) =>
			opts
				? ([...inventoryRoot, "detail", itemId, "value-history", opts] as const)
				: ([...inventoryRoot, "detail", itemId, "value-history"] as const),
		// Carries both range shapes because the endpoint does: createdAfter windows
		// the step series, bucket/range drive the charged-price aggregate.
		priceHistory: (
			itemId: string,
			opts?: { createdAfter?: string; bucket?: "week" | "month"; range?: number },
		) =>
			opts
				? ([...inventoryRoot, "detail", itemId, "price-history", opts] as const)
				: ([...inventoryRoot, "detail", itemId, "price-history"] as const),
		consumptionTrend: (itemId: string, opts?: { bucket?: "week" | "month"; range?: number }) =>
			opts
				? ([...inventoryRoot, "detail", itemId, "consumption-trend", opts] as const)
				: ([...inventoryRoot, "detail", itemId, "consumption-trend"] as const),
		serials: (itemId: string) => [...inventoryRoot, "detail", itemId, "serials"] as const,
		batches: (itemId: string) => [...inventoryRoot, "detail", itemId, "batches"] as const,
		trackingSummary: (itemId: string) => [...inventoryRoot, "detail", itemId, "tracking-summary"] as const,
			vehicleStock: (itemId: string) => [...inventoryRoot, "detail", itemId, "vehicle-stock"] as const,
		trackingEligibility: (itemId: string) =>
			[...inventoryRoot, "detail", itemId, "tracking-eligibility"] as const,
		labels: [...inventoryRoot, "labels"] as const,
		batchImpact: (batchId: string) => [...inventoryRoot, "batch-impact", batchId] as const,
		serialHistory: (serialId: string) => [...inventoryRoot, "serial-history", serialId] as const,
		reconciliation: () => [...inventoryRoot, "reconciliation"] as const,
	},
	vehicles: {
		all: ["vehicles"] as const,
		list: (status?: string) =>
			status ? (["vehicles", "list", status] as const) : (["vehicles", "list"] as const),
		detail: (id: string) => ["vehicles", "detail", id] as const,
		stock: (id: string) => ["vehicles", "detail", id, "stock"] as const,
		fillPlan: (id: string) => ["vehicles", "detail", id, "fill-plan"] as const,
		usageToday: (id: string) => ["vehicles", "detail", id, "usage-today"] as const,
		restockToday: (id: string) => ["vehicles", "detail", id, "restock-today"] as const,
		restockHistory: (id: string) => ["vehicles", "detail", id, "restock-history"] as const,
		stockAdjustments: (id: string) => ["vehicles", "detail", id, "stock-adjustments"] as const,
		tomorrowRequirements: (id: string) => ["vehicles", "detail", id, "tomorrow-requirements"] as const,
		readiness: (id: string, date?: string) =>
			date
				? (["vehicles", "detail", id, "readiness", date] as const)
				: (["vehicles", "detail", id, "readiness"] as const),
		stockConflicts: ["vehicles", "stock-conflicts"] as const,
	},
	restockRequests: {
		all: ["restock-requests"] as const,
		list: (filter?: { status?: string; vehicleId?: string }) =>
			filter ? (["restock-requests", filter] as const) : (["restock-requests"] as const),
	},
	fleetReadiness: (date: string) => ["fleet-readiness", date] as const,
};

// ============================================================================
// Invalidation groups — one call site, no more hunting for which keys a
// mutation is supposed to touch.
// ============================================================================

export const invalidate = {
	warehouse: (qc: QueryClient) => qc.invalidateQueries({ queryKey: qk.inventory.all }),

	vehicleStock: (qc: QueryClient, vehicleId?: string) =>
		Promise.all([
			qc.invalidateQueries({ queryKey: qk.vehicles.list() }),
			vehicleId
				? qc.invalidateQueries({ queryKey: qk.vehicles.detail(vehicleId) })
				: qc.invalidateQueries({ queryKey: qk.vehicles.all }),
		]),

	restockRequests: (qc: QueryClient) => qc.invalidateQueries({ queryKey: qk.restockRequests.all }),

	// Warehouse + vehicle + conflicts — the group most stock-movement mutations need.
	stockData: (qc: QueryClient, vehicleId?: string) =>
		Promise.all([
			invalidate.warehouse(qc),
			invalidate.vehicleStock(qc, vehicleId),
			qc.invalidateQueries({ queryKey: qk.vehicles.stockConflicts }),
		]),
};
