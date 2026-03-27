import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import type {
	InventoryItem,
	InventorySortOption,
	CreateInventoryItemInput,
	UpdateInventoryItemInput,
} from "../types/inventory";

import * as inventoryApi from "../api/inventory";

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
