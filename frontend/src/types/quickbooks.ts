import type { InventoryItem } from "./inventory"

export interface QBItemLite {
    Id: string;
    Name: string;
    Sku?: string;
    Description?: string;
    Type?: string;
    UnitPrice?: number;
    PurchaseCost?: number;
    QtyOnHand?: number;
    Active?: boolean;
}

export interface MappedQBItem {
    inventory_item_id: string;
    external_id: string;
}

export interface ImportQBItemResult{
    item: InventoryItem;
    warning?: string;
}

export interface QBTaxCodeLite {
    id: string;
    name: string;
    rates: { id: string; name: string; rate: number }[];
    totalRate: number;
}

export interface QBImportableInvoice {
        Id: string;
        DocNumber: string | null;
        TxnDate: string | null;
        DueDate: string | null;
        TotalAmt: number;
        customerId: string | null;
        customerName: string | null;
        lineCount: number;
        alreadyImported: boolean;
  }

  export interface QBInvoiceImportResult {
        imported: number;
        skipped: number;
        errors: string[];
  }

  export interface QBInvoicePrefillLineItem {
        name: string;
        description: string | null;
        quantity: number;
        unit_price: number;
        inventory_item_id: string | null;
  }

  export interface QBInvoicePrefill {
        qbInvoiceId: string;
        docNumber: string | null;
        txnDate: string | null;
        dueDate: string | null;
        memo: string | null;
        customerId: string | null;
        customerName: string | null;
        clientId: string | null;
        alreadyImported: boolean;
        lineItems: QBInvoicePrefillLineItem[];
  }