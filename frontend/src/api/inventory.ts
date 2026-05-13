import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	InventoryItem,
	InventorySortOption,
	CreateInventoryItemInput,
	UpdateInventoryItemInput,
} from "../types/inventory";

// ============================================
// INVENTORY API
// ============================================

export const getAllInventory = async (
	lowStock?: boolean,
	sort?: InventorySortOption,
): Promise<InventoryItem[]> => {
	const params: Record<string, string> = {};
	if (lowStock) params.low_stock = "true";
	if (sort) params.sort = sort;
	const response = await api.get<ApiResponse<InventoryItem[]>>("/inventory", { params });

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch inventory");
	}

	return response.data.data || [];
};

export const createInventoryItem = async (
	data: CreateInventoryItemInput,
): Promise<InventoryItem> => {
	const response = await api.post<ApiResponse<InventoryItem>>("/inventory", data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create inventory item");
	}

	return response.data.data!;
};

export const updateInventoryItem = async (
	itemId: string,
	data: UpdateInventoryItemInput,
): Promise<InventoryItem> => {
	const response = await api.patch<ApiResponse<InventoryItem>>(`/inventory/${itemId}`, data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update inventory item");
	}

	return response.data.data!;
};

export const deleteInventoryItem = async (itemId: string): Promise<void> => {
	const response = await api.delete<ApiResponse<{ message: string }>>(`/inventory/${itemId}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete inventory item");
	}
};

export const adjustStock = async (
	itemId: string,
	delta: number,
): Promise<InventoryItem> => {
	const response = await api.patch<ApiResponse<InventoryItem>>(
		`/inventory/${itemId}/stock`,
		{ delta },
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to adjust stock");
	}

	return response.data.data!;
};

export const uploadInventoryImage = async (file: File): Promise<string> => {
	const formData = new FormData();
	formData.append("image", file);

	const response = await api.post<ApiResponse<{ url: string }>>(
		"/inventory/upload-image",
		formData,
		{ headers: { "Content-Type": "multipart/form-data" } },
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to upload image");
	}

	return response.data.data!.url;
};

export const updateItemThreshold = async (
	itemId: string,
	threshold: number | null,
): Promise<InventoryItem> => {
	const response = await api.patch<ApiResponse<InventoryItem>>(
		`/inventory/${itemId}/threshold`,
		{ low_stock_threshold: threshold },
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update threshold");
	}

	return response.data.data!;
};

export interface ImportResult {
	imported: number;
	skipped: { row: number; reason: string }[];
}

export const importInventory = async (file: File): Promise<ImportResult> => {
	const formData = new FormData();
	formData.append("file", file);
	const response = await api.post<ApiResponse<ImportResult>>("/inventory/import", formData, {
		headers: { "Content-Type": "multipart/form-data" },
	});
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to import inventory");
	}
	return response.data.data!;
};

const triggerDownload = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
};

export const downloadInventoryTemplate = async (): Promise<void> => {
	const response = await api.get("/inventory/template", { responseType: "blob" });
	triggerDownload(response.data as Blob, "inventory-import-template.xlsx");
};

export const exportLowStockInventory = async (): Promise<void> => {
	const response = await api.get("/inventory/export/low-stock", { responseType: "blob" });
	const dateStr = new Date()
		.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
		.replace(",", "");
	triggerDownload(response.data as Blob, `low-stock-report ${dateStr}.xlsx`);
};
