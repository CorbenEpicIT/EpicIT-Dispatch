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