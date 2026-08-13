import {
	useMutation,
	useQuery,
	useQueryClient,
	keepPreviousData,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import type {
	InventoryItem,
	InventoryTag,
	InventorySortOption,
	CreateInventoryItemInput,
	UpdateInventoryItemInput,
	ProvisionalItem,
	MovementsPage,
	ItemUsage,
	ItemForecastResult,
	ValueHistory,
	PriceHistory,
	ItemConsumptionTrend,
} from "../types/inventory";

import * as inventoryApi from "../api/inventory";
import * as orgApi from "../api/org";
import { qk, invalidate } from "../lib/queryKeys";
import { useScanDispatcher } from "./useScanDispatcher";

// ============================================================================
// INVENTORY QUERIES
// ============================================================================

export const useAllInventoryQuery = (
	sort?: InventorySortOption,
): UseQueryResult<InventoryItem[], Error> => {
	return useQuery({
		queryKey: qk.inventory.list(sort ? { sort } : undefined),
		queryFn: () => inventoryApi.getAllInventory(false, sort),
	});
};

export const useLowStockInventoryQuery = (): UseQueryResult<InventoryItem[], Error> => {
	return useQuery({
		queryKey: qk.inventory.list({ lowStock: true }),
		queryFn: () => inventoryApi.getAllInventory(true),
	});
};

// Single-item fetch for the item product/detail page (GET /inventory/:id).
export const useInventoryItemQuery = (
	itemId: string | undefined,
): UseQueryResult<InventoryItem, Error> => {
	return useQuery({
		queryKey: qk.inventory.detail(itemId ?? ""),
		queryFn: () => inventoryApi.getInventoryItem(itemId!),
		enabled: !!itemId,
	});
};

// Cursor-paginated stock-movement ledger for the detail page's history section.
// keepPreviousData keeps the current page visible while the next one loads, so
// the "Load more" button doesn't flash the list back to a spinner.
export const useInventoryMovementsQuery = (
	itemId: string | undefined,
	cursor?: string,
	opts?: { createdAfter?: string },
): UseQueryResult<MovementsPage, Error> => {
	return useQuery({
		queryKey: [...qk.inventory.movements(itemId ?? "", opts), cursor ?? "first"],
		queryFn: () => inventoryApi.getInventoryMovements(itemId!, cursor, undefined, opts?.createdAfter),
		enabled: !!itemId,
		placeholderData: keepPreviousData,
	});
};

// ── History & Reports tab (item detail page) ─────────────────────────────────

// Offset-paginated usage report — jobs/clients this item was consumed on.
export const useItemUsageQuery = (
	itemId: string | undefined,
	opts?: { limit?: number; offset?: number },
): UseQueryResult<ItemUsage, Error> => {
	return useQuery({
		queryKey: qk.inventory.usage(itemId ?? "", opts),
		queryFn: () => inventoryApi.getItemUsage(itemId!, opts),
		enabled: !!itemId,
		placeholderData: keepPreviousData,
	});
};

// `forecast` in the resolved data can legitimately be `null` — that's a valid
// result, not a query error — and `reason` says which cause it was (inactive
// item vs active item with no forecastable row). See ItemForecastResult in
// types/inventory.
export const useItemForecastQuery = (
	itemId: string | undefined,
): UseQueryResult<ItemForecastResult, Error> => {
	return useQuery({
		queryKey: qk.inventory.forecast(itemId ?? ""),
		queryFn: () => inventoryApi.getItemForecast(itemId!),
		enabled: !!itemId,
	});
};

// keepPreviousData keeps the current series on screen while a new range loads,
// so switching the tab's range control doesn't flash the chart to a spinner
// (same reason useItemConsumptionTrendQuery does it).
export const useItemValueHistoryQuery = (
	itemId: string | undefined,
	opts?: { createdAfter?: string },
): UseQueryResult<ValueHistory, Error> => {
	return useQuery({
		queryKey: qk.inventory.valueHistory(itemId ?? "", opts),
		queryFn: () => inventoryApi.getItemValueHistory(itemId!, opts?.createdAfter),
		enabled: !!itemId,
		placeholderData: keepPreviousData,
	});
};

// Cost/price history for the History-tab trend chart. keepPreviousData for the
// same reason as the value-history query: the tab's range control changes the
// server-side window, and the chart shouldn't flash to a spinner to show it.
export const useItemPriceHistoryQuery = (
	itemId: string | undefined,
	opts?: { createdAfter?: string; bucket?: "week" | "month"; range?: number },
): UseQueryResult<PriceHistory, Error> => {
	return useQuery({
		queryKey: qk.inventory.priceHistory(itemId ?? "", opts),
		queryFn: () => inventoryApi.getItemPriceHistory(itemId!, opts),
		enabled: !!itemId,
		placeholderData: keepPreviousData,
	});
};

// Bucketed consumption totals for the History-tab trend chart. keepPreviousData
// keeps the current series visible while the next bucket/range loads, so the
// week/month toggle transitions smoothly instead of flashing a spinner.
export const useItemConsumptionTrendQuery = (
	itemId: string | undefined,
	opts?: { bucket?: "week" | "month"; range?: number },
): UseQueryResult<ItemConsumptionTrend, Error> => {
	return useQuery({
		queryKey: qk.inventory.consumptionTrend(itemId ?? "", opts),
		queryFn: () => inventoryApi.getItemConsumptionTrend(itemId!, opts),
		enabled: !!itemId,
		placeholderData: keepPreviousData,
	});
};

// ============================================================================
// INVENTORY MUTATIONS
// ============================================================================

// low_stock_threshold is edited through the full item form
// (useUpdateInventoryItemMutation) — the threshold-only modal and its dedicated
// mutation are gone, since every field it held already lives in that form.

export const useCreateInventoryItemMutation = (): UseMutationResult<
	InventoryItem,
	Error,
	CreateInventoryItemInput
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateInventoryItemInput) =>
			inventoryApi.createInventoryItem(data),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useUpdateInventoryItemMutation = (): UseMutationResult<
	InventoryItem,
	Error,
	{ itemId: string; data: UpdateInventoryItemInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ itemId, data }: { itemId: string; data: UpdateInventoryItemInput }) =>
			inventoryApi.updateInventoryItem(itemId, data),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
			invalidate.vehicleStock(queryClient);
		},
	});
};

export const useDeleteInventoryItemMutation = (): UseMutationResult<
	void,
	Error,
	string
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (itemId: string) => inventoryApi.deleteInventoryItem(itemId),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useAdjustStockMutation = (): UseMutationResult<
	InventoryItem,
	Error,
	{ itemId: string; delta: number }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ itemId, delta }: { itemId: string; delta: number }) =>
			inventoryApi.adjustStock(itemId, delta),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
			invalidate.vehicleStock(queryClient);
		},
	});
};

export const useUploadInventoryImageMutation = (): UseMutationResult<
	string,
	Error,
	File
> => {
	return useMutation({
		mutationFn: (file: File) => inventoryApi.uploadInventoryImage(file),
	});
};

export const useScanInventoryItem = (): UseMutationResult<
	InventoryItem,
	Error,
	string
> => {
	return useMutation({
		mutationFn: (code: string) => inventoryApi.scanInventoryItem(code),
	});
};

// Thin wrapper over useScanDispatcher — every call site (dispatch inventory,
// vehicle stock, supplier-purchase catalog) only cares about found/not-found,
// so this keeps their signature unchanged while routing through the
// scan-anything resolver (item today; serial/batch once Workstream B lands).
export const useBarcodeScanHandler = (
	onFound: (item: InventoryItem) => void,
	onNotFound: (code: string) => void,
): { handleScan: (code: string) => Promise<void>; isScanning: boolean } => {
	return useScanDispatcher({ onItem: onFound, onNotFound });
};

// ============================================================================
// TAG QUERIES + MUTATIONS
// ============================================================================

export const useInventoryTagsQuery = (): UseQueryResult<InventoryTag[], Error> => {
	return useQuery({
		queryKey: qk.inventory.tags,
		queryFn: () => inventoryApi.getInventoryTags(),
	});
};

export const useCreateInventoryTagMutation = (): UseMutationResult<InventoryTag, Error, string> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (label: string) => inventoryApi.createInventoryTag(label),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: qk.inventory.tags });
		},
	});
};

export const useUpdateInventoryTagMutation = (): UseMutationResult<
	InventoryTag,
	Error,
	{ tagId: string; label: string }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tagId, label }) => inventoryApi.updateInventoryTag(tagId, label),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: qk.inventory.tags });
		},
	});
};

export const useDeleteInventoryTagMutation = (): UseMutationResult<void, Error, string> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tagId: string) => inventoryApi.deleteInventoryTag(tagId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: qk.inventory.tags });
			invalidate.warehouse(queryClient);
		},
	});
};

export const useSetItemTagsMutation = (): UseMutationResult<
	InventoryItem,
	Error,
	{ itemId: string; tagIds: string[] }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, tagIds }) => inventoryApi.setItemTags(itemId, tagIds),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

// ============================================================================
// PROVISIONAL ITEM QUERIES + MUTATIONS
// ============================================================================

export const useProvisionalItemsQuery = (enabled = true) =>
	useQuery<ProvisionalItem[]>({
		queryKey: qk.inventory.provisional,
		queryFn: () => orgApi.getProvisionalItems(),
		staleTime: 30_000,
		enabled,
	});

export const useApproveItemMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, initial_warehouse_qty }: { itemId: string; initial_warehouse_qty?: number }) =>
			orgApi.approveItem(itemId, initial_warehouse_qty !== undefined ? { initial_warehouse_qty } : undefined),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: qk.inventory.provisional });
			await invalidate.warehouse(qc);
		},
	});
};

export const useMergeItemMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, targetId }: { itemId: string; targetId: string }) =>
			orgApi.mergeItem(itemId, targetId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: qk.inventory.provisional });
			await invalidate.warehouse(qc);
		},
	});
};

export const useRejectItemMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (itemId: string) => orgApi.rejectItem(itemId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: qk.inventory.provisional });
		},
	});
};
