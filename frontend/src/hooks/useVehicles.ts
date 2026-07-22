import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { Vehicle, CreateVehicleInput, UpdateVehicleInput, VehicleReadiness } from "../types/vehicles";
import * as vehiclesApi from "../api/vehicles";
import { qk, invalidate } from "../lib/queryKeys";

// ── Vehicle queries ────────────────────────────────────────────────────────────

export const useVehiclesQuery = (status?: string): UseQueryResult<Vehicle[], Error> => {
	return useQuery({
		queryKey: qk.vehicles.list(status),
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
			invalidate.vehicleStock(queryClient);
		},
	});
};

export const useUpdateVehicleMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<Vehicle, Error, { id: string; data: UpdateVehicleInput }>({
		mutationFn: ({ id, data }) => vehiclesApi.updateVehicle(id, data),
		onSuccess: (_result, { id }) => {
			invalidate.vehicleStock(queryClient, id);
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
			invalidate.vehicleStock(queryClient);
		},
	});
};

// ── Readiness queries & mutations ─────────────────────────────────────────────

export const useVehicleReadinessQuery = (vehicleId: string | undefined, date?: string) =>
	useQuery({
		queryKey: qk.vehicles.readiness(vehicleId ?? "", date),
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
			qc.setQueryData(qk.vehicles.readiness(vehicleId, body.date), data);
			qc.invalidateQueries({ queryKey: qk.fleetReadiness(body.date) });
		},
	});
};

export const useRevokeReadinessMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ vehicleId, date }: { vehicleId: string; date: string }) =>
			vehiclesApi.revokeVehicleReadiness(vehicleId, date),
		onSuccess: (data: VehicleReadiness, { vehicleId, date }) => {
			qc.setQueryData(qk.vehicles.readiness(vehicleId, date), data);
			qc.invalidateQueries({ queryKey: qk.fleetReadiness(date) });
		},
	});
};
