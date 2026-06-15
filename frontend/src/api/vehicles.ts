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
	SupplierPartUsedInput,
	RestockRequestInput,
	RestockRequest,
	BulkRestockInput,
	ConfirmReceiptInput,
	VehicleStockConflict,
	VehicleUsageTodayGroup,
	VehicleEodRecord,
	CompleteEodInput,
	AdjustStockInput,
	VehicleStockAdjustment,
	VehicleReadiness,
	FillPlan,
	ApplyFillInput,
	FillResultLine,
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

// ── Restock request lifecycle ─────────────────────────────────────────────────

export const getRestockRequests = async (
	status?: string,
	vehicleId?: string,
): Promise<RestockRequest[]> => {
	const params: Record<string, string> = {};
	if (status) params.status = status;
	if (vehicleId) params.vehicleId = vehicleId;
	const response = await api.get<ApiResponse<RestockRequest[]>>("/vehicles/restock-requests", { params });
	return response.data.data || [];
};

export const fulfillRestockRequest = async (requestId: string, qty?: number): Promise<RestockRequest> => {
	const response = await api.post<ApiResponse<RestockRequest>>(
		`/vehicles/restock-requests/${requestId}/fulfill`,
		qty !== undefined ? { qty } : {},
	);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fulfill restock request");
	}
	return response.data.data!;
};

export const dismissRestockRequest = async (requestId: string): Promise<RestockRequest> => {
	const response = await api.post<ApiResponse<RestockRequest>>(
		`/vehicles/restock-requests/${requestId}/dismiss`,
	);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to dismiss restock request");
	}
	return response.data.data!;
};

export const getVehicleRestockRequests = async (vehicleId: string): Promise<RestockRequest[]> => {
	const response = await api.get<ApiResponse<RestockRequest[]>>(`/vehicles/${vehicleId}/restock-requests`);
	return response.data.data || [];
};

export const createRestockRequestsBulk = async (
	vehicleId: string,
	input: BulkRestockInput,
): Promise<{ created: RestockRequest[]; skipped: { stock_item_id: string; reason: string }[] }> => {
	const response = await api.post<ApiResponse<{ created: RestockRequest[]; skipped: { stock_item_id: string; reason: string }[] }>>(
		`/vehicles/${vehicleId}/restock-requests/bulk`, input);
	if (!response.data.success) throw new Error(response.data.error?.message || "Failed to submit restock requests");
	return response.data.data!;
};

export const confirmRestockReceipts = async (
	vehicleId: string,
	input: ConfirmReceiptInput,
): Promise<{ confirmed: RestockRequest[]; failed: { request_id: string; error: string }[] }> => {
	const response = await api.post<ApiResponse<{ confirmed: RestockRequest[]; failed: { request_id: string; error: string }[] }>>(
		`/vehicles/${vehicleId}/restock-requests/confirm-receipt`, input);
	if (!response.data.success) throw new Error(response.data.error?.message || "Failed to confirm receipt");
	return response.data.data!;
};

// ── Technician vehicle assignment ─────────────────────────────────────────────

export const setTechnicianVehicle = async (technicianId: string, vehicleId: string | null): Promise<void> => {
	const response = await api.put<ApiResponse<unknown>>(`/technicians/${technicianId}/vehicle`, { vehicle_id: vehicleId });
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to set vehicle");
	}
};

// ── Parts used ────────────────────────────────────────────────────────────────

export const getStockConflicts = async (): Promise<VehicleStockConflict[]> => {
	const response = await api.get<ApiResponse<VehicleStockConflict[]>>("/vehicles/stock-conflicts");
	return response.data.data || [];
};

export const getFillPlan = async (vehicleId: string): Promise<FillPlan> => {
	const response = await api.get<ApiResponse<FillPlan>>(`/vehicles/${vehicleId}/stock/fill-plan`);
	if (!response.data.success) throw new Error(response.data.error?.message || "Failed to load fill plan");
	return response.data.data!;
};

export const applyFill = async (vehicleId: string, input: ApplyFillInput): Promise<FillResultLine[]> => {
	const response = await api.post<ApiResponse<FillResultLine[]>>(`/vehicles/${vehicleId}/stock/fill`, input);
	if (!response.data.success) throw new Error(response.data.error?.message || "Failed to apply fill");
	return response.data.data!;
};

export const getUsageToday = async (vehicleId: string): Promise<VehicleUsageTodayGroup[]> => {
	const response = await api.get<ApiResponse<VehicleUsageTodayGroup[]>>(`/vehicles/${vehicleId}/usage-today`);
	return response.data.data || [];
};

export const addPartsUsed = async (visitId: string, input: AddPartsUsedInput): Promise<{ lineItem: VisitLineItem; usage: VehicleStockUsage }> => {
	const response = await api.post<ApiResponse<{ lineItem: VisitLineItem; usage: VehicleStockUsage }>>(`/job-visits/${visitId}/parts-used`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to add parts used");
	}
	return response.data.data!;
};

export const addSupplierPartUsed = async (
	visitId: string,
	input: SupplierPartUsedInput,
): Promise<unknown> => {
	const response = await api.post<ApiResponse<unknown>>(
		`/job-visits/${visitId}/parts-used/supplier`,
		input,
	);
	if (!response.data.success) throw new Error(response.data.error?.message || "Failed to add supplier part");
	return response.data.data;
};

// ── EOD (End of Day) ──────────────────────────────────────────────────────────

export const completeEod = async (vehicleId: string, input: CompleteEodInput): Promise<VehicleEodRecord> => {
	const response = await api.post<ApiResponse<VehicleEodRecord>>(`/vehicles/${vehicleId}/eod`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to complete EOD");
	}
	return response.data.data!;
};

export const getVehicleEodToday = async (vehicleId: string): Promise<VehicleEodRecord | null> => {
	const response = await api.get<ApiResponse<VehicleEodRecord | null>>(`/vehicles/${vehicleId}/eod/today`);
	return response.data.data ?? null;
};

export const getVehicleEodHistory = async (vehicleId: string): Promise<VehicleEodRecord[]> => {
	const response = await api.get<ApiResponse<VehicleEodRecord[]>>(`/vehicles/${vehicleId}/eod/history`);
	return response.data.data ?? [];
};

export const getVehicleStockAdjustmentHistory = async (vehicleId: string): Promise<VehicleStockAdjustment[]> => {
	const response = await api.get<ApiResponse<VehicleStockAdjustment[]>>(`/vehicles/${vehicleId}/stock/adjustments`);
	return response.data.data ?? [];
};

// ── Adjust Stock ──────────────────────────────────────────────────────────────

export const adjustStock = async (vehicleId: string, input: AdjustStockInput): Promise<VehicleStockAdjustment> => {
	const response = await api.post<ApiResponse<VehicleStockAdjustment>>(`/vehicles/${vehicleId}/stock/adjust`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to adjust stock");
	}
	return response.data.data!;
};

// ── Readiness ─────────────────────────────────────────────────────────────────

export const getFleetReadiness = async (
	date: string,
): Promise<Array<{ vehicle_id: string } & VehicleReadiness>> => {
	const res = await api.get<ApiResponse<Array<{ vehicle_id: string } & VehicleReadiness>>>(
		`/vehicles/readiness?date=${encodeURIComponent(date)}`,
	);
	return res.data.data ?? [];
};

export const getVehicleReadiness = async (
	vehicleId: string,
	date?: string,
): Promise<VehicleReadiness> => {
	const params = date ? `?date=${encodeURIComponent(date)}` : "";
	const res = await api.get<ApiResponse<VehicleReadiness>>(`/vehicles/${vehicleId}/readiness${params}`);
	if (!res.data.success || !res.data.data)
		throw new Error(res.data.error?.message ?? "Failed to fetch readiness");
	return res.data.data;
};

export const confirmVehicleReadiness = async (
	vehicleId: string,
	body: { date: string; notes?: string },
): Promise<VehicleReadiness> => {
	const res = await api.post<ApiResponse<VehicleReadiness>>(`/vehicles/${vehicleId}/readiness`, body);
	if (!res.data.success || !res.data.data)
		throw new Error(res.data.error?.message ?? "Failed to confirm readiness");
	return res.data.data;
};

export const revokeVehicleReadiness = async (
	vehicleId: string,
	date: string,
): Promise<VehicleReadiness> => {
	const res = await api.delete<ApiResponse<VehicleReadiness>>(
		`/vehicles/${vehicleId}/readiness/${encodeURIComponent(date)}`
	);
	if (!res.data.success || !res.data.data)
		throw new Error(res.data.error?.message ?? "Failed to revoke readiness");
	return res.data.data;
};
