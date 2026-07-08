import { useCallback, useRef } from "react";
import {
	useMutation,
	useQuery,
	useQueryClient,
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
} from "../types/inventory";

import * as inventoryApi from "../api/inventory";
import * as orgApi from "../api/org";

// ============================================================================
// INVENTORY QUERIES
// ============================================================================

export const useAllInventoryQuery = (
	sort?: InventorySortOption,
): UseQueryResult<InventoryItem[], Error> => {
	return useQuery({
		queryKey: ["allInventory", sort],
		queryFn: () => inventoryApi.getAllInventory(false, sort),
	});
};

export const useLowStockInventoryQuery = (): UseQueryResult<InventoryItem[], Error> => {
	return useQuery({
		queryKey: ["allInventory", "low-stock"],
		queryFn: () => inventoryApi.getAllInventory(true),
	});
};

// ============================================================================
// INVENTORY MUTATIONS
// ============================================================================

export const useUpdateItemThresholdMutation = (): UseMutationResult<
	InventoryItem,
	Error,
	{ itemId: string; threshold: number | null }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ itemId, threshold }: { itemId: string; threshold: number | null }) =>
			inventoryApi.updateItemThreshold(itemId, threshold),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock"] });
		},
		onError: (error: Error) => {
			console.error("Failed to update inventory threshold:", error);
		},
	});
};

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
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
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
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock"] });
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
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
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
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock"] });
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

// Shared scan-then-branch wrapper — every call site (dispatch inventory, vehicle
// stock, supplier-purchase catalog) needs the same mutateAsync/try-catch shape;
// only what happens on found/not-found differs, so that stays caller-owned.
export const useBarcodeScanHandler = (
	onFound: (item: InventoryItem) => void,
	onNotFound: (code: string) => void,
): { handleScan: (code: string) => Promise<void>; isScanning: boolean } => {
	const scanMutation = useScanInventoryItem();
	// Synchronous guard — React state (isPending) doesn't update fast enough to
	// block a scanner double-fire that lands two codes in the same tick.
	const inFlightRef = useRef(false);

	const handleScan = useCallback(
		async (code: string) => {
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			try {
				const item = await scanMutation.mutateAsync(code);
				onFound(item);
			} catch {
				onNotFound(code);
			} finally {
				inFlightRef.current = false;
			}
		},
		[scanMutation, onFound, onNotFound],
	);

	return { handleScan, isScanning: scanMutation.isPending };
};

// ============================================================================
// TAG QUERIES + MUTATIONS
// ============================================================================

export const useInventoryTagsQuery = (): UseQueryResult<InventoryTag[], Error> => {
	return useQuery({
		queryKey: ["inventoryTags"],
		queryFn: () => inventoryApi.getInventoryTags(),
	});
};

export const useCreateInventoryTagMutation = (): UseMutationResult<InventoryTag, Error, string> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (label: string) => inventoryApi.createInventoryTag(label),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["inventoryTags"] });
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
			queryClient.invalidateQueries({ queryKey: ["inventoryTags"] });
		},
	});
};

export const useDeleteInventoryTagMutation = (): UseMutationResult<void, Error, string> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tagId: string) => inventoryApi.deleteInventoryTag(tagId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["inventoryTags"] });
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
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
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
		},
	});
};

// ============================================================================
// PROVISIONAL ITEM QUERIES + MUTATIONS
// ============================================================================

export const useProvisionalItemsQuery = (enabled = true) =>
	useQuery<ProvisionalItem[]>({
		queryKey: ["inventory", "provisional"],
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
			await qc.invalidateQueries({ queryKey: ["inventory", "provisional"] });
			await qc.invalidateQueries({ queryKey: ["inventory"] });
		},
	});
};

export const useMergeItemMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, targetId }: { itemId: string; targetId: string }) =>
			orgApi.mergeItem(itemId, targetId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["inventory", "provisional"] });
			await qc.invalidateQueries({ queryKey: ["inventory"] });
		},
	});
};

export const useRejectItemMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (itemId: string) => orgApi.rejectItem(itemId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["inventory", "provisional"] });
		},
	});
};
