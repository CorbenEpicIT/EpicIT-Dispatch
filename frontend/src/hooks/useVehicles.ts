import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type {
	Vehicle,
	VehicleStockItem,
	VehicleStockUsage,
	CreateVehicleInput,
	UpdateVehicleInput,
	AddVehicleStockItemInput,
	UpdateVehicleStockItemInput,
	AddPartsUsedInput,
	SupplierPartUsedInput,
	RestockRequestInput,
	VehicleReadiness,
} from "../types/vehicles";
import type { VisitLineItem } from "../types/jobs";
import * as vehiclesApi from "../api/vehicles";

// ── Vehicle queries ────────────────────────────────────────────────────────────

export const useVehiclesQuery = (status?: string): UseQueryResult<Vehicle[], Error> => {
	return useQuery({
		queryKey: ["vehicles", { status }],
		queryFn: () => vehiclesApi.getVehicles(status),
		staleTime: 30_000,
	});
};

// ── Vehicle mutations ─────────────────────────────────────────────────────────

export const useCreateVehicleMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<Vehicle, Error, CreateVehicleInput>({
		mutationFn: vehiclesApi.createVehicle,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vehicles"] });
		},
	});
};

export const useUpdateVehicleMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<Vehicle, Error, { id: string; data: UpdateVehicleInput }>({
		mutationFn: ({ id, data }) => vehiclesApi.updateVehicle(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vehicles"] });
		},
	});
};

// ── Vehicle stock queries ──────────────────────────────────────────────────────

export const useVehicleStockQuery = (vehicleId: string | null | undefined): UseQueryResult<VehicleStockItem[], Error> => {
	return useQuery({
		queryKey: ["vehicle-stock", vehicleId],
		queryFn: () => vehiclesApi.getVehicleStock(vehicleId!),
		enabled: !!vehicleId,
		staleTime: 30_000,
	});
};

// ── Vehicle stock mutations ───────────────────────────────────────────────────

export const useAddVehicleStockItemMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<VehicleStockItem, Error, { vehicleId: string; data: AddVehicleStockItemInput }>({
		mutationFn: ({ vehicleId, data }) => vehiclesApi.addVehicleStockItem(vehicleId, data),
		onSuccess: (_result, { vehicleId }) => {
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] });
		},
	});
};

export const useUpdateVehicleStockItemMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<VehicleStockItem, Error, { vehicleId: string; itemId: string; data: UpdateVehicleStockItemInput }>({
		mutationFn: ({ vehicleId, itemId, data }) => vehiclesApi.updateVehicleStockItem(vehicleId, itemId, data),
		onSuccess: (_result, { vehicleId }) => {
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] });
		},
	});
};

export const useDeleteVehicleStockItemMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<void, Error, { vehicleId: string; itemId: string }>({
		mutationFn: ({ vehicleId, itemId }) => vehiclesApi.deleteVehicleStockItem(vehicleId, itemId),
		onSuccess: (_result, { vehicleId }) => {
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] });
		},
	});
};

export const useRestockRequestMutation = () => {
	const qc = useQueryClient();
	return useMutation<void, Error, { vehicleId: string; itemId: string; data: RestockRequestInput }>({
		mutationFn: ({ vehicleId, itemId, data }) => vehiclesApi.createRestockRequest(vehicleId, itemId, data),
		onSuccess: async (_data, variables) => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["vehicles", variables.vehicleId, "restock-requests"] }),
				qc.invalidateQueries({ queryKey: ["restock-requests"] }),
			]);
		},
	});
};

// ── Parts used mutation ───────────────────────────────────────────────────────

export const useAddPartsUsedMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<
		{ lineItem: VisitLineItem; usage: VehicleStockUsage },
		Error,
		{ visitId: string; vehicleId: string; data: AddPartsUsedInput }
	>({
		mutationFn: ({ visitId, data }) => vehiclesApi.addPartsUsed(visitId, data),
		onSuccess: (_result, { visitId, vehicleId }) => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits", visitId] });
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] });
			queryClient.invalidateQueries({ queryKey: ["vehicles", "stock-conflicts"] });
		},
	});
};

export const useAddSupplierPartUsedMutation = (visitId: string, vehicleId: string | null) => {
	const qc = useQueryClient();
	return useMutation<
		{ lineItem: VisitLineItem; usage: VehicleStockUsage | null },
		Error,
		SupplierPartUsedInput
	>({
		mutationFn: (input: SupplierPartUsedInput) => vehiclesApi.addSupplierPartUsed(visitId, input),
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["jobVisits", visitId] }),
				qc.invalidateQueries({ queryKey: ["jobVisits"] }),
				...(vehicleId ? [qc.invalidateQueries({ queryKey: ["vehicle-stock", vehicleId] })] : []),
			]);
		},
	});
};

// ── Technician vehicle assignment ─────────────────────────────────────────────

export const useSetTechnicianVehicleMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<void, Error, { technicianId: string; vehicleId: string | null }>({
		mutationFn: ({ technicianId, vehicleId }) => vehiclesApi.setTechnicianVehicle(technicianId, vehicleId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
		},
	});
};

// ── Readiness queries & mutations ─────────────────────────────────────────────

export const useVehicleReadinessQuery = (vehicleId: string | undefined, date?: string) =>
	useQuery({
		queryKey: ["vehicle-readiness", vehicleId, date],
		queryFn: () => vehiclesApi.getVehicleReadiness(vehicleId!, date),
		enabled: !!vehicleId,
		staleTime: 30_000,
	});

export const useConfirmReadinessMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			vehicleId,
			body,
		}: {
			vehicleId: string;
			body: { date: string; notes?: string };
		}) => vehiclesApi.confirmVehicleReadiness(vehicleId, body),
		onSuccess: (data: VehicleReadiness, { vehicleId, body }) => {
			qc.setQueryData(["vehicle-readiness", vehicleId, body.date], data);
			qc.invalidateQueries({ queryKey: ["fleet-readiness", body.date] });
		},
	});
};

export const useRevokeReadinessMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ vehicleId, date }: { vehicleId: string; date: string }) =>
			vehiclesApi.revokeVehicleReadiness(vehicleId, date),
		onSuccess: (data: VehicleReadiness, { vehicleId, date }) => {
			qc.setQueryData(["vehicle-readiness", vehicleId, date], data);
			qc.invalidateQueries({ queryKey: ["fleet-readiness", date] });
		},
	});
};
