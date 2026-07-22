import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { InventoryItem } from "../types/inventory";
import { triggerDownload, datedFilename } from "../util/download";
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

export const resolveCode = async (code: string): Promise<ResolveCodeResult> => {
	const response = await api.get<ApiResponse<ResolveCodeResult>>("/inventory/resolve", {
		params: { code },
	});

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "No match found");
	}

	return response.data.data!;
};

export const ensureItemCode = async (itemId: string): Promise<InventoryItem> => {
	const response = await api.post<ApiResponse<InventoryItem>>(`/inventory/${itemId}/ensure-code`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to assign item code");
	}

	return response.data.data!;
};

export const receiveInventory = async (
	itemId: string,
	input: ReceiveInventoryInput,
): Promise<ReceiveInventoryResponse> => {
	const response = await api.post<ApiResponse<ReceiveInventoryResponse>>(
		`/inventory/${itemId}/receive`,
		input,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to receive stock");
	}

	return response.data.data!;
};

export const getItemSerials = async (
	itemId: string,
	params?: { status?: string; vehicleId?: string; cursor?: string; search?: string },
): Promise<SerialsListResponse> => {
	const queryParams: Record<string, string> = {};
	if (params?.status) queryParams.status = params.status;
	if (params?.vehicleId) queryParams.vehicle_id = params.vehicleId;
	if (params?.cursor) queryParams.cursor = params.cursor;
	if (params?.search) queryParams.search = params.search;

	const response = await api.get<ApiResponse<SerialsListResponse>>(`/inventory/${itemId}/serials`, {
		params: queryParams,
	});

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch serials");
	}

	return response.data.data!;
};

export const getItemBatches = async (
	itemId: string,
	params?: { search?: string },
): Promise<BatchesListResponse> => {
	const queryParams: Record<string, string> = {};
	if (params?.search) queryParams.search = params.search;

	const response = await api.get<ApiResponse<BatchesListResponse>>(`/inventory/${itemId}/batches`, {
		params: queryParams,
	});

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch batches");
	}

	return response.data.data!;
};

export const getTrackingSummary = async (itemId: string): Promise<TrackingSummary> => {
	const response = await api.get<ApiResponse<TrackingSummary>>(`/inventory/${itemId}/tracking-summary`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch tracking summary");
	}

	return response.data.data!;
};

export const updateItemTracking = async (
	itemId: string,
	input: UpdateItemTrackingInput,
): Promise<InventoryItem> => {
	const response = await api.patch<ApiResponse<InventoryItem>>(
		`/inventory/${itemId}/tracking`,
		input,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update tracking");
	}

	return response.data.data!;
};

export const updateBatch = async (
	batchId: string,
	input: UpdateBatchInput,
): Promise<BatchDetail> => {
	const response = await api.patch<ApiResponse<BatchDetail>>(`/inventory/batches/${batchId}`, input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update batch");
	}

	return response.data.data!;
};

export const deleteBatch = async (batchId: string): Promise<void> => {
	const response = await api.delete<ApiResponse<null>>(`/inventory/batches/${batchId}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete batch");
	}
};

export const updateSerial = async (
	serialId: string,
	input: UpdateSerialInput,
): Promise<SerialUnitRow> => {
	const response = await api.patch<ApiResponse<SerialUnitRow>>(
		`/inventory/serials/${serialId}`,
		input,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update serial");
	}

	return response.data.data!;
};

export const deleteSerial = async (serialId: string): Promise<void> => {
	const response = await api.delete<ApiResponse<null>>(`/inventory/serials/${serialId}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete serial");
	}
};

export const getBatchImpact = async (batchId: string): Promise<BatchImpactReport> => {
	const response = await api.get<ApiResponse<BatchImpactReport>>(
		`/inventory/batches/${batchId}/impact`,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch recall impact report");
	}

	return response.data.data!;
};

export const exportBatchImpact = async (batchId: string, batchNumber?: string): Promise<void> => {
	const response = await api.get(`/inventory/batches/${batchId}/export`, { responseType: "blob" });
	const base = batchNumber ? `batch-${batchNumber}-recall-report` : "batch-recall-report";
	triggerDownload(response.data as Blob, datedFilename(base));
};

export const getSerialHistory = async (serialId: string): Promise<SerialHistoryResponse> => {
	const response = await api.get<ApiResponse<SerialHistoryResponse>>(
		`/inventory/serials/${serialId}/history`,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch serial history");
	}

	return response.data.data!;
};

export const getTrackingReconciliation = async (): Promise<ReconciliationReport> => {
	const response = await api.get<ApiResponse<ReconciliationReport>>(
		"/inventory/tracking/reconciliation",
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch reconciliation report");
	}

	return response.data.data!;
};
