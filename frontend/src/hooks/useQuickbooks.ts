import {
    getQBStatus,
    getQBConnectUrl,
    disconnectQB,
    syncInvoiceToQB,
    sendInvoiceEmailViaQB,
    getQBCustomers,
    getQBMappedCustomers,
    getQBItems,
    getQBMappedItems,
    linkQBItem,
    unlinkQBItem,
    importQBItem,
    pushQBItem,
    getQBTaxCodes,
    getQBTaxPrefs,
    unlinkTaxCode,
    linkTaxCode,
} from "../api/quickbooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ImportQBItemResult } from "../types/quickbooks";

type QBInvoiceEmailVars = {
  invoiceId: string;
  sendTo: string;
};

export const useQBStatusQuery = () => {
    return useQuery({
        queryKey: ["qbStatus"],
        queryFn: getQBStatus,
        refetchInterval: 2 * 60 * 1000,
        staleTime: 30_000,
    });
};

export const useQBMappedCustomersQuery = (enabled = true) => {
    return useQuery({
        queryKey: ["qbMappedCustomers"],
        queryFn: getQBMappedCustomers,
        enabled,
    });
};

export const useQBCustomerQuery = (enabled = true) => {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["qbCustomers"],
        queryFn: getQBCustomers,
        enabled,
        retry: false,
    });

    useEffect(() => {
        if (query.isError) {
            queryClient.invalidateQueries({ queryKey: ["qbStatus"] });
        }
    }, [query.isError, queryClient]);

    return query;
}

export const useQBItemsQuery = (enabled = true) => {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["qbItems"],
        queryFn: getQBItems,
        enabled,
        retry: false,
    });
    
    useEffect(() => {
        if (query.isError) {
            queryClient.invalidateQueries({ queryKey: ["qbStatus"] });
        }
    }, [query.isError, queryClient]);

    return query;
};

export const useQBMappedItemsQuery = (enabled = true) => {
    return useQuery({
        queryKey: ["qbMappedItems"],
        queryFn: getQBMappedItems,
        enabled,
        retry: false,
    });
};

export const useQBTaxCodesQuery = (enabled = true) => {
    return useQuery({
        queryKey: ["qbTaxCodes"],
        queryFn: getQBTaxCodes,
        enabled,
        retry: false,
    });
};

export const useQBTaxPrefsQuery = (enabled = true) => {
    return useQuery({
        queryKey: ["qbTaxPrefs"],
        queryFn: getQBTaxPrefs,
        enabled,
        retry: false,
    });
};

export const useQBConnectMutation = () => {
    return useMutation({
        mutationFn: async () => {
            const url = await getQBConnectUrl();
            window.location.href = url;
        },
    });
};

export const useQBDisconnectMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: disconnectQB,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qbStatus"] });
        },
    });
};

export const useQBInvoiceSyncMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (invoiceId: string) => syncInvoiceToQB(invoiceId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["qbStatus"] });
        },
    });
};

export const useQBInvoiceEmailMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, QBInvoiceEmailVars>({
        mutationFn: ({ invoiceId, sendTo }) => sendInvoiceEmailViaQB(invoiceId, sendTo),
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["qbStatus"] });
        },
    });
};

export const useLinkQBItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { inventory_item_id: string; qb_item_id: string }>({
        mutationFn: ({ inventory_item_id, qb_item_id }) => linkQBItem(inventory_item_id, qb_item_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qbMappedItems"] });
            queryClient.invalidateQueries({ queryKey: ["allInventory"] });
        },
    });
};

export const useImportQBItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<ImportQBItemResult, Error, { qb_item_id: string }>({
        mutationFn: ({ qb_item_id }) => importQBItem(qb_item_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qbMappedItems"] });
            queryClient.invalidateQueries({ queryKey: ["allInventory"] });
        },
    });
};

export const usePushQBItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { itemId: string }>({
        mutationFn: ({itemId}) => pushQBItem(itemId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qbMappedItems"] });
            queryClient.invalidateQueries({ queryKey: ["allInventory"] });
        },
    });
};

export const useUnlinkQBItemMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { inventory_item_id: string }>({
        mutationFn: ({ inventory_item_id }) => unlinkQBItem(inventory_item_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qbMappedItems"] });
            queryClient.invalidateQueries({ queryKey: ["allInventory"] });
        },
    });
};

export const useLinkTaxCodeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { tax_group_id: string; qb_tax_code_id: string }>({
        mutationFn: ({ tax_group_id, qb_tax_code_id }) => linkTaxCode(tax_group_id, qb_tax_code_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tax-groups"] });
        },
    });
};

export const useUnlinkTaxCodeMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { tax_group_id: string }>({
        mutationFn: ({ tax_group_id }) => unlinkTaxCode(tax_group_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tax-groups"] });
        },
    });
};