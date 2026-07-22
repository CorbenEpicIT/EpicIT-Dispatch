import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import type { InventoryItem } from "../types/inventory";
import type {
	ResolveCodeResult,
	ReceiveInventoryInput,
	ReceiveInventoryResponse,
	SerialsListResponse,
	SerialUnitRow,
	UpdateSerialInput,
	BatchesListResponse,
	UpdateItemTrackingInput,
	UpdateBatchInput,
	BatchDetail,
	BatchImpactReport,
	SerialHistoryResponse,
	ReconciliationReport,
	TrackingSummary,
} from "../types/tracking";
import * as trackingApi from "../api/tracking";
import { qk, invalidate } from "../lib/queryKeys";

export const useResolveCodeMutation = (): UseMutationResult<ResolveCodeResult, Error, string> => {
	return useMutation({
		mutationFn: (code: string) => trackingApi.resolveCode(code),
	});
};

export const useEnsureItemCodeMutation = (): UseMutationResult<InventoryItem, Error, string> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (itemId: string) => trackingApi.ensureItemCode(itemId),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useReceiveInventoryMutation = (
	itemId: string,
): UseMutationResult<ReceiveInventoryResponse, Error, ReceiveInventoryInput> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: ReceiveInventoryInput) => trackingApi.receiveInventory(itemId, input),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

// Flips is_serialized / is_batch_tracked on an existing item. The backend only
// allows this when on-hand stock is zero and the item isn't provisional — a
// rejection surfaces as a thrown Error the caller can display. Invalidates the
// whole inventory tree (list + detail) since the badges/tracking page gating
// read off these flags.
export const useUpdateItemTrackingMutation = (
	itemId: string,
): UseMutationResult<InventoryItem, Error, UpdateItemTrackingInput> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateItemTrackingInput) =>
			trackingApi.updateItemTracking(itemId, input),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useSerialsQuery = (
	itemId: string,
	filters?: { status?: string; vehicleId?: string; cursor?: string; search?: string },
): UseQueryResult<SerialsListResponse, Error> => {
	return useQuery({
		queryKey: [...qk.inventory.serials(itemId), filters],
		queryFn: () => trackingApi.getItemSerials(itemId, filters),
		enabled: !!itemId,
		staleTime: 30_000,
	});
};

export const useBatchesQuery = (
	itemId: string,
	filters?: { search?: string },
): UseQueryResult<BatchesListResponse, Error> => {
	return useQuery({
		queryKey: [...qk.inventory.batches(itemId), filters],
		queryFn: () => trackingApi.getItemBatches(itemId, filters),
		enabled: !!itemId,
		staleTime: 30_000,
	});
};

// Header rollups for the Serials & Batches page (StatCard row) — cheap
// aggregate query, safe to keep mounted alongside whichever tab is active.
export const useTrackingSummaryQuery = (itemId: string): UseQueryResult<TrackingSummary, Error> => {
	return useQuery({
		queryKey: qk.inventory.trackingSummary(itemId),
		queryFn: () => trackingApi.getTrackingSummary(itemId),
		enabled: !!itemId,
		staleTime: 30_000,
	});
};

// The PATCH endpoint takes only a batchId. Invalidates the whole inventory
// tree, which covers the batches list and batch-impact report (both live
// under qk.inventory.all).
export const useUpdateBatchMutation = (): UseMutationResult<
	BatchDetail,
	Error,
	{ batchId: string; input: UpdateBatchInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ batchId, input }: { batchId: string; input: UpdateBatchInput }) =>
			trackingApi.updateBatch(batchId, input),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

// Hard-delete an empty lot record (no warehouse/vehicle qty, no serials, no
// consumption history — the backend re-checks all of that authoritatively).
// Invalidates the whole inventory tree, which covers the batches list (live
// under qk.inventory.all).
export const useDeleteBatchMutation = (): UseMutationResult<void, Error, string> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (batchId: string) => trackingApi.deleteBatch(batchId),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useBatchImpactQuery = (batchId: string): UseQueryResult<BatchImpactReport, Error> => {
	return useQuery({
		queryKey: qk.inventory.batchImpact(batchId),
		queryFn: () => trackingApi.getBatchImpact(batchId),
		enabled: !!batchId,
		staleTime: 30_000,
	});
};

export const useSerialHistoryQuery = (
	serialId: string,
): UseQueryResult<SerialHistoryResponse, Error> => {
	return useQuery({
		queryKey: qk.inventory.serialHistory(serialId),
		queryFn: () => trackingApi.getSerialHistory(serialId),
		enabled: !!serialId,
		staleTime: 30_000,
	});
};

// Edit a serial's status (in_warehouse → lost/returned, via a stock movement)
// and/or its note. Invalidates the whole inventory tree, which covers the
// serial-history detail, the item's serials list, and warehouse counts (all
// live under qk.inventory.all).
export const useUpdateSerialMutation = (
	serialId: string,
): UseMutationResult<SerialUnitRow, Error, UpdateSerialInput> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateSerialInput) => trackingApi.updateSerial(serialId, input),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

// Hard-delete a never-moved, in-warehouse serial. Backend re-checks eligibility
// and compensates the warehouse count via a movement before deleting.
export const useDeleteSerialMutation = (
	serialId: string,
): UseMutationResult<void, Error, void> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => trackingApi.deleteSerial(serialId),
		onSuccess: () => {
			invalidate.warehouse(queryClient);
		},
	});
};

export const useReconciliationQuery = (): UseQueryResult<ReconciliationReport, Error> => {
	return useQuery({
		queryKey: qk.inventory.reconciliation(),
		queryFn: () => trackingApi.getTrackingReconciliation(),
		staleTime: 30_000,
	});
};
