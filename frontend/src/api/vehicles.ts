import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	Vehicle,
	VehicleStockItem,
	VehicleStockUsage,
	CreateVehicleInput,
	UpdateVehicleInput,
	AddVehicleStockItemInput,
	UpdateVehicleStockItemInput,
	AddPartsUsedInput,
	RestockRequestInput,
} from "../types/vehicles";
import type { VisitLineItem } from "../types/jobs";

// ── Vehicles ──────────────────────────────────────────────────────────────────

export const getVehicles = async (status?: string): Promise<Vehicle[]> => {
	const params = status ? { status } : undefined;
	const response = await api.get<ApiResponse<Vehicle[]>>("/vehicles", { params });
	return response.data.data || [];
};

export const createVehicle = async (input: CreateVehicleInput): Promise<Vehicle> => {
	const response = await api.post<ApiResponse<Vehicle>>("/vehicles", input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create vehicle");
	}
	return response.data.data!;
};

export const updateVehicle = async (id: string, input: UpdateVehicleInput): Promise<Vehicle> => {
	const response = await api.put<ApiResponse<Vehicle>>(`/vehicles/${id}`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update vehicle");
	}
	return response.data.data!;
};

// ── Vehicle Stock ─────────────────────────────────────────────────────────────

export const getVehicleStock = async (vehicleId: string): Promise<VehicleStockItem[]> => {
	const response = await api.get<ApiResponse<VehicleStockItem[]>>(`/vehicles/${vehicleId}/stock`);
	return response.data.data || [];
};

export const addVehicleStockItem = async (vehicleId: string, input: AddVehicleStockItemInput): Promise<VehicleStockItem> => {
	const response = await api.post<ApiResponse<VehicleStockItem>>(`/vehicles/${vehicleId}/stock`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to add stock item");
	}
	return response.data.data!;
};

export const updateVehicleStockItem = async (vehicleId: string, itemId: string, input: UpdateVehicleStockItemInput): Promise<VehicleStockItem> => {
	const response = await api.put<ApiResponse<VehicleStockItem>>(`/vehicles/${vehicleId}/stock/${itemId}`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update stock item");
	}
	return response.data.data!;
};

export const deleteVehicleStockItem = async (vehicleId: string, itemId: string): Promise<void> => {
	const response = await api.delete<ApiResponse<null>>(`/vehicles/${vehicleId}/stock/${itemId}`);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete stock item");
	}
};

export const createRestockRequest = async (vehicleId: string, itemId: string, input: RestockRequestInput): Promise<void> => {
	const response = await api.post<ApiResponse<unknown>>(`/vehicles/${vehicleId}/stock/${itemId}/restock-request`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create restock request");
	}
};

// ── Technician vehicle assignment ─────────────────────────────────────────────

export const setTechnicianVehicle = async (technicianId: string, vehicleId: string | null): Promise<void> => {
	const response = await api.put<ApiResponse<unknown>>(`/technicians/${technicianId}/vehicle`, { vehicle_id: vehicleId });
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to set vehicle");
	}
};

// ── Parts used ────────────────────────────────────────────────────────────────

export const addPartsUsed = async (visitId: string, input: AddPartsUsedInput): Promise<{ lineItem: VisitLineItem; usage: VehicleStockUsage }> => {
	const response = await api.post<ApiResponse<{ lineItem: VisitLineItem; usage: VehicleStockUsage }>>(`/job-visits/${visitId}/parts-used`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to add parts used");
	}
	return response.data.data!;
};
