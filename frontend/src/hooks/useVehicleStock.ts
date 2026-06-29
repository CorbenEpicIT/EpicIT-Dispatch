import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as vehicleApi from "../api/vehicles";
import type { VehicleStockConflict, VehicleUsageTodayGroup, VehicleRestockRecord, CompleteRestockInput, AdjustStockInput, VehicleStockAdjustment, RestockRequest, FillPlan, ApplyFillInput, BulkRestockInput, TomorrowRequirementVisit } from "../types/vehicles";

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
				qc.invalidateQueries({ queryKey: ["allInventory"] }),
			]);
		},
	});
};

export const useVehicleUsageTodayQuery = (vehicleId: string) =>
	useQuery<VehicleUsageTodayGroup[]>({
		queryKey: ["vehicles", vehicleId, "usage-today"],
		queryFn: () => vehicleApi.getUsageToday(vehicleId),
		enabled: !!vehicleId,
		staleTime: 30_000,
	});

export const useVehicleRestockTodayQuery = (vehicleId: string) =>
	useQuery<VehicleRestockRecord | null>({
		queryKey: ["vehicles", vehicleId, "restock-today"],
		queryFn: () => vehicleApi.getVehicleRestockToday(vehicleId),
		enabled: !!vehicleId,
		staleTime: 30_000,
	});

export const useVehicleRestockHistoryQuery = (vehicleId: string, enabled: boolean) =>
	useQuery<VehicleRestockRecord[]>({
		queryKey: ["vehicles", vehicleId, "restock-history"],
		queryFn: () => vehicleApi.getVehicleRestockHistory(vehicleId),
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
		onSuccess: async (_data, variables) => {
			const isWarehouseExchange = variables.type === "warehouse_exchange";
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
				qc.invalidateQueries({ queryKey: ["vehicles"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "stock-adjustments"] }),
				...(isWarehouseExchange ? [qc.invalidateQueries({ queryKey: ["allInventory"] })] : []),
			]);
		},
	});
};

export const useRestockRequestsQuery = (status?: string, vehicleId?: string) =>
	useQuery<RestockRequest[]>({
		queryKey: ["restock-requests", { status, vehicleId }],
		queryFn: () => vehicleApi.getRestockRequests(status, vehicleId),
		staleTime: 30_000,
	});

export const useAcknowledgeRestockRequestMutation = (vehicleId?: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (requestId: string) => vehicleApi.acknowledgeRestockRequest(requestId),
		onSuccess: async () => {
			const work = [qc.invalidateQueries({ queryKey: ["restock-requests"] })];
			if (vehicleId) work.push(qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] }));
			await Promise.all(work);
		},
	});
};

export const useDismissRestockRequestMutation = (vehicleId?: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (requestId: string) => vehicleApi.dismissRestockRequest(requestId),
		onSuccess: async () => {
			const work = [qc.invalidateQueries({ queryKey: ["restock-requests"] })];
			if (vehicleId) work.push(qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] }));
			await Promise.all(work);
		},
	});
};

export const useTomorrowRequirementsQuery = (vehicleId: string) =>
	useQuery<TomorrowRequirementVisit[]>({
		queryKey: ["vehicles", vehicleId, "tomorrow-requirements"],
		queryFn: () => vehicleApi.getTomorrowRequirements(vehicleId),
		staleTime: 60_000,
	});

export const useCompleteRestockMutation = (vehicleId: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: CompleteRestockInput) => vehicleApi.completeRestock(vehicleId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-today"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] }),
				qc.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] }),
				qc.invalidateQueries({ queryKey: ["allInventory"] }),
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
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicles", vehicleId, "restock-requests"] }),
				qc.invalidateQueries({ queryKey: ["restock-requests"] }),
			]);
		},
	});
};
