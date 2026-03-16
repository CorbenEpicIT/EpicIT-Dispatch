import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
    InventoryItem,
} from "../types/inventory";


// ============================================
// INVENTORY API
// ============================================

export const getAllInventory = async (lowStock?: boolean): Promise<InventoryItem[]> => {
    const params = lowStock ? { low_stock: "true" } : {};
    const response = await api.get<ApiResponse<InventoryItem[]>>('/inventory', { params });

    if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to fetch inventory');
    }

    return response.data.data || [];
};

export const updateItemThreshold = async (
    itemId: string,
    threshold: number | null
): Promise<InventoryItem> => {
    const response = await api.patch<ApiResponse<InventoryItem>>(`/inventory/${itemId}/threshold`,{ low_stock_threshold: threshold });

    if(!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to update threshold');
    }
        return response.data.data!;
};

