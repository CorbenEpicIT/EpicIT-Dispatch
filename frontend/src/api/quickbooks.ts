import {api} from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { QBCustomerLite } from "../types/clients"
import type { 
    QBItemLite, 
    MappedQBItem, 
    ImportQBItemResult, 
    QBTaxCodeLite, 
    QBImportableInvoice, 
    QBInvoiceImportResult, 
    QBInvoicePrefill,
    QBProfitAndLossQuery,
    QBProfitAndLossReport
} from "../types/quickbooks";
 
export const getQBStatus = async (): Promise<{ connected: boolean; realmId?: string }> => {
    const response = await api.get<ApiResponse<{ connected: boolean; realmId?: string }>>(`/integrations/quickbooks/connection`);
    return response.data.data || { connected: false };
};

export const getQBConnectUrl = async (): Promise<string> => {
    const response = await api.get<ApiResponse<{ url: string }>>(`/integrations/quickbooks/connection/auth-url`);
    if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error?.message || "Failed to get QuickBooks connect URL");
    }
    return response.data.data.url;
};

export const disconnectQB = async (): Promise<void> => {
    const response = await api.delete<ApiResponse<null>>(`/integrations/quickbooks/connection`);
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
    const response = await api.get<ApiResponse<string[]>>("integrations/quickbooks/customers/mappings");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get mapped QB customers");
    return response.data.data!;
}

export const getQBItems = async (): Promise<QBItemLite[]> => {
    const response = await api.get<ApiResponse<QBItemLite[]>>("integrations/quickbooks/items");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB items");
    return response.data.data!;
}

export const getQBMappedItems = async (): Promise<MappedQBItem[]> => {
    const response = await api.get<ApiResponse<MappedQBItem[]>>("integrations/quickbooks/items/mappings");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get mapped QB items");
    return response.data.data!;
}

export const linkQBItem = async (inventory_item_id: string, qb_item_id:string) => {
    const response = await api.post<ApiResponse<{linked: boolean}>>(`integrations/quickbooks/item-mappings`, {inventory_item_id, qb_item_id});
}

export const unlinkQBItem = async (inventory_item_id: string) => {
    const response = await api.delete<ApiResponse<{linked: boolean}>>(`integrations/quickbooks/item-mappings/${inventory_item_id}`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to unlink QB item");
    return response.data.data!;
}

export const importQBItem = async (qb_item_id: string): Promise<ImportQBItemResult> => {
    const response = await api.post<ApiResponse<ImportQBItemResult>>(`integrations/quickbooks/items/${qb_item_id}/import`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to import QB item");
    return response.data.data!;
}

export const pushQBItem = async (itemId: string) => {
    const response = await api.post<ApiResponse<{pushed: boolean}>>(`integrations/quickbooks/items/${itemId}/push`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to push QB item");
    return response.data.data!;
}

export const getQBTaxCodes = async (): Promise<QBTaxCodeLite[]> => {
    const response = await api.get<ApiResponse<QBTaxCodeLite[]>>("integrations/quickbooks/tax-codes");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB tax codes");
    return response.data.data!;
}

export const getQBTaxPrefs = async (): Promise<{ automatedSalesTax: boolean }> => {
    const response = await api.get<ApiResponse<{ automatedSalesTax: boolean }>>("integrations/quickbooks/tax-preferences");
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB tax preferences");
    return response.data.data!;
}

export const linkTaxCode = async (tax_group_id: string, qb_tax_code_id: string) => {
    const response = await api.put<ApiResponse<{linked: boolean}>>(`integrations/quickbooks/tax-groups/${tax_group_id}/qb-tax-code`, {qb_tax_code_id});
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to link QB tax code");
    return response.data.data!;
}

export const unlinkTaxCode = async (tax_group_id: string) => {
    const response = await api.delete<ApiResponse<{unlinked: boolean}>>(`integrations/quickbooks/tax-groups/${tax_group_id}/qb-tax-code`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to unlink QB tax code");
    return response.data.data!;
}

export const getImportableQBInvoices = async (clientId?: string): Promise<QBImportableInvoice[]> => {
    const response = await api.get<ApiResponse<QBImportableInvoice[]>>("integrations/quickbooks/invoices/importable", { params: { clientId } });
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get importable QB invoices");
    return response.data.data!;
}

export const getQBInvoicePrefill = async (qbInvoiceId: string): Promise<QBInvoicePrefill> => {
    const response = await api.get<ApiResponse<QBInvoicePrefill>>(`integrations/quickbooks/invoices/${qbInvoiceId}/prefill`);
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB invoice detail");
    return response.data.data!;
}

export const importQBInvoices = async (qbInvoiceIds: string[]): Promise<QBInvoiceImportResult> => {
    const response = await api.post<ApiResponse<QBInvoiceImportResult>>("integrations/quickbooks/invoices/import", { qbInvoiceIds });
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to import QB invoices");
    return response.data.data!;
}

export const getQBProfitAndLossReport = async (query: QBProfitAndLossQuery): Promise<QBProfitAndLossReport> => {
    const response = await api.get<ApiResponse<QBProfitAndLossReport>>("integrations/quickbooks/reports/profit-and-loss", { params: query });
    if (response.data.error) throw new Error(response.data.error?.message || "Failed to get QB profit and loss report");
    return response.data.data!;
}
