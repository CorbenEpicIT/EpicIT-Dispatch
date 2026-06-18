import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as vehicleApi from "../api/vehicles";
import type { VehicleStockConflict, VehicleUsageTodayGroup, VehicleEodRecord, CompleteEodInput, AdjustStockInput, VehicleStockAdjustment, RestockRequest, FillPlan, ApplyFillInput, BulkRestockInput, ConfirmReceiptInput } from "../types/vehicles";

export const useVehicleStockConflictsQuery = () =>
	useQuery<VehicleStockConflict[]>({
		queryKey: ["vehicles", "stock-conflicts"],
		queryFn: vehicleApi.getStockConflicts,
		staleTime: 30_000,
	});

export const useFillPlanQuery = (vehicleId: string, enabled: boolean) =>
	useQuery<FillPlan>({
		queryKey: ["vehicles", vehicleId, "fill-plan"],
		queryFn: () => vehicleApi.getFillPlan(vehicleId),
		enabled: !!vehicleId && enabled,
		staleTime: 0,
	});

export const useApplyFillMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: ApplyFillInput) => vehicleApi.applyFill(vehicleId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
				qc.invalidateQueries({ queryKey: ["vehicles"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "fill-plan"] }),
			]);
		},
	});
};

export const useVehicleUsageTodayQuery = (vehicleId: string) =>
	useQuery<VehicleUsageTodayGroup[]>({
		queryKey: ["vehicles", vehicleId, "usage-today"],
		queryFn: () => vehicleApi.getUsageToday(vehicleId),
		enabled: !!vehicleId,
	});

export const useVehicleEodTodayQuery = (vehicleId: string) =>
	useQuery<VehicleEodRecord | null>({
		queryKey: ["vehicles", vehicleId, "eod-today"],
		queryFn: () => vehicleApi.getVehicleEodToday(vehicleId),
		enabled: !!vehicleId,
	});

export const useVehicleEodHistoryQuery = (vehicleId: string, enabled: boolean) =>
	useQuery<VehicleEodRecord[]>({
		queryKey: ["vehicles", vehicleId, "eod-history"],
		queryFn: () => vehicleApi.getVehicleEodHistory(vehicleId),
		enabled: !!vehicleId && enabled,
		staleTime: 60_000,
	});

export const useVehicleStockAdjustmentHistoryQuery = (vehicleId: string, enabled: boolean) =>
	useQuery<VehicleStockAdjustment[]>({
		queryKey: ["vehicles", vehicleId, "stock-adjustments"],
		queryFn: () => vehicleApi.getVehicleStockAdjustmentHistory(vehicleId),
		enabled: !!vehicleId && enabled,
		staleTime: 30_000,
	});

export const useAdjustStockMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: AdjustStockInput) => vehicleApi.adjustStock(vehicleId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
				qc.invalidateQueries({ queryKey: ["vehicles"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "stock-adjustments"] }),
			]);
		},
	});
};

export const useRestockRequestsQuery = (status?: string, vehicleId?: string, discrepant?: boolean) =>
	useQuery<RestockRequest[]>({
		queryKey: ["restock-requests", { status, vehicleId, discrepant }],
		queryFn: () => vehicleApi.getRestockRequests(status, vehicleId, discrepant),
		staleTime: 30_000,
	});

export const useFulfillRestockRequestMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ requestId, qty }: { requestId: string; qty?: number }) =>
			vehicleApi.fulfillRestockRequest(requestId, qty),
		onSuccess: async (request) => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["restock-requests"] }),
				qc.invalidateQueries({ queryKey: ["vehicle-stock", request.stock_item?.vehicle_id] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
				qc.invalidateQueries({ queryKey: ["allInventory"] }),
			]);
		},
	});
};

export const useDismissRestockRequestMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (requestId: string) => vehicleApi.dismissRestockRequest(requestId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["restock-requests"] });
		},
	});
};

export const useAcknowledgeDiscrepancyMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (requestId: string) => vehicleApi.acknowledgeDiscrepancy(requestId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["restock-requests"] });
		},
	});
};

export const useCompleteEodMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: CompleteEodInput) => vehicleApi.completeEod(vehicleId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "eod-today"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
			]);
		},
	});
};

export const useVehicleRestockRequestsQuery = (vehicleId: string) =>
	useQuery<RestockRequest[]>({
		queryKey: ["vehicles", vehicleId, "restock-requests"],
		queryFn: () => vehicleApi.getVehicleRestockRequests(vehicleId),
		enabled: !!vehicleId,
		staleTime: 30_000,
	});

export const useBulkRestockMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: BulkRestockInput) => vehicleApi.createRestockRequestsBulk(vehicleId, input),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] });
		},
	});
};

export const useConfirmReceiptMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: ConfirmReceiptInput) => vehicleApi.confirmRestockReceipts(vehicleId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] }),
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
			]);
		},
	});
};
