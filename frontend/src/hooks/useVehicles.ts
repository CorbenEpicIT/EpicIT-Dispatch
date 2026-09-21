import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { Vehicle, CreateVehicleInput, UpdateVehicleInput, VehicleReadiness, VehicleMaintenanceRecord, CreateMaintenanceRecordInput, UpdateMaintenanceRecordInput, MaintenanceSourceLine, VehicleMaintenanceReminder, CreateMaintenanceReminderInput, UpdateMaintenanceReminderInput } from "../types/vehicles";
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

export const useVehicleMaintenanceQuery = (id: string | null | undefined): UseQueryResult<VehicleMaintenanceRecord[], Error> => {
	return useQuery({
		queryKey: qk.vehicles.maintenance(id ?? ""),
		queryFn: () => vehiclesApi.getMaintenanceRecords(id!),
		enabled: !!id,
		staleTime: 30_000,
	})
}

export const useVehicleMaintenanceReminderQuery = (id: string | null | undefined): UseQueryResult<VehicleMaintenanceReminder[], Error> => {
	return useQuery({
		queryKey: qk.vehicles.maintenanceReminders(id ?? ""),
		queryFn: () => vehiclesApi.getMaintenanceReminders(id!),
		enabled: !!id,
		staleTime: 30_000,
	})
}

export const useMaintenanceSourceLinesQuery = (vehicleId: string, q: string): UseQueryResult<MaintenanceSourceLine[], Error> => {
	return useQuery({
		queryKey: qk.vehicles.maintenanceSourceLines(vehicleId, q || undefined),
		queryFn: () => vehiclesApi.searchMaintenanceSourceLines(vehicleId, q || undefined),
		enabled: !!vehicleId,
		staleTime: 15_000,
	})
}

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

export const useCreateMaintenanceRecordMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, data} : { vehicleId: string, data: CreateMaintenanceRecordInput}) => vehiclesApi.createMaintenanceRecord(vehicleId, data),
		onSuccess: (result: VehicleMaintenanceRecord, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenance(vehicleId)});
		}
	})
}

export const useUpdateMaintenanceRecordMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, recordId, data} : { vehicleId: string, recordId: string, data: UpdateMaintenanceRecordInput}) => vehiclesApi.updateMaintenanceRecord(vehicleId, recordId, data),
		onSuccess: (result: VehicleMaintenanceRecord, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenance(vehicleId)});
		}
	})
}

export const useDeleteMaintenanceRecordMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId} : { vehicleId: string, reminderId: string}) => vehiclesApi.deleteMaintenanceRecord(vehicleId, reminderId),
		onSuccess: (data: void, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenance(vehicleId)});
		}
	})
}

export const useCreateMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, data} : { vehicleId: string, data: CreateMaintenanceReminderInput}) => vehiclesApi.createMaintenanceReminder(vehicleId, data),
		onSuccess: (result: VehicleMaintenanceReminder, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}

export const useUpdateMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId, data} : { vehicleId: string, reminderId: string, data: UpdateMaintenanceReminderInput}) => vehiclesApi.updateMaintenanceReminder(vehicleId, reminderId, data),
		onSuccess: (result: VehicleMaintenanceReminder, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}

export const useDeleteMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId} : { vehicleId: string, reminderId: string}) => vehiclesApi.deleteMaintenanceReminder(vehicleId, reminderId),
		onSuccess: (data: void, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}

export const useAcknowledgeMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId} : { vehicleId: string, reminderId: string}) => vehiclesApi.acknowledgeMaintenanceReminder(vehicleId, reminderId),
		onSuccess: (result: VehicleMaintenanceReminder, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}

export const useUnacknowledgeMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId} : { vehicleId: string, reminderId: string}) => vehiclesApi.unacknowledgeMaintenanceReminder(vehicleId, reminderId),
		onSuccess: (result: VehicleMaintenanceReminder, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}

export const useCompleteMaintenanceReminderMutation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({vehicleId, reminderId} : { vehicleId: string, reminderId: string}) => vehiclesApi.completeMaintenanceReminder(vehicleId, reminderId),
		onSuccess: (result: VehicleMaintenanceReminder, {vehicleId}) => {
			qc.invalidateQueries({ queryKey: qk.vehicles.maintenanceReminders(vehicleId)});
		}
	})
}
