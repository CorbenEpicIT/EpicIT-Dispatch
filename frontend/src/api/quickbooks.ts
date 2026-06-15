import {api} from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { QBCustomerLite } from "../types/clients"
import type { QBItemLite, MappedQBItem, ImportQBItemResult } from "../types/quickbooks";
 
export const getQBStatus = async (): Promise<{ connected: boolean; realmId?: string }> => {
    const response = await api.get<ApiResponse<{ connected: boolean; realmId?: string }>>(`/integrations/quickbooks/status`);
    return response.data.data || { connected: false };
};

export const getQBConnectUrl = async (): Promise<string> => {
    const response = await api.get<ApiResponse<{ url: string }>>(`/integrations/quickbooks/connect`);
    if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error?.message || "Failed to get QuickBooks connect URL");
    }
    return response.data.data.url;
};

export const disconnectQB = async (): Promise<void> => {
    const response = await api.delete<ApiResponse<null>>(`/integrations/quickbooks/disconnect`);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to disconnect QuickBooks");
    }
};

export const syncInvoiceToQB = async (invoiceId: string): Promise<void> => {
    const response = await api.post<ApiResponse<null>>(`/integrations/quickbooks/invoices/${invoiceId}/sync`);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to sync invoice to QuickBooks");
    }
};

export const sendInvoiceEmailViaQB = async (invoiceId: string, sendTo: string)=>{
    const response = await api.post<ApiResponse<{ sent: boolean }>>(`integrations/quickbooks/invoices/${invoiceId}/email`, {sendTo});
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to send email");
    return response.data.data!;
}

export const getQBCustomers = async (): Promise<QBCustomerLite[]> => {
    const response = await api.get<ApiResponse<QBCustomerLite[]>>("integrations/quickbooks/customers");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB customers");
    return response.data.data!;
}

export const getQBMappedCustomers = async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<string[]>>("integrations/quickbooks/mapped-customers");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get mapped QB customers");
    return response.data.data!;
}

export const getQBItems = async (): Promise<QBItemLite[]> => {
    const response = await api.get<ApiResponse<QBItemLite[]>>("integrations/quickbooks/items");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB items");
    return response.data.data!;
}

export const getQBMappedItems = async (): Promise<MappedQBItem[]> => {
    const response = await api.get<ApiResponse<MappedQBItem[]>>("integrations/quickbooks/mapped-items");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get mapped QB items");
    return response.data.data!;
}

export const linkQBItem = async (inventory_item_id: string, qb_item_id:string) => {
    const response = await api.post<ApiResponse<{linked: boolean}>>(`integrations/quickbooks/items/link`, {inventory_item_id, qb_item_id});
}

export const importQBItem = async (qb_item_id: string): Promise<ImportQBItemResult> => {
    const response = await api.post<ApiResponse<ImportQBItemResult>>(`integrations/quickbooks/items/import`, { qb_item_id });
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to import QB item");
    return response.data.data!;
}

export const pushQBItem = async (itemId: string) => {
    const response = await api.post<ApiResponse<{pushed: boolean}>>(`integrations/quickbooks/items/${itemId}/push`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to push QB item");
    return response.data.data!;
}