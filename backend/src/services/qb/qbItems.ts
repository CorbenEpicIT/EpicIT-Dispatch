import { qbFetch } from "../quickbooksService.js";
import { qbQueryAll } from "./qbQuery.js";
import { getScopedDb } from "../../lib/context.js";
import { db } from "../../db.js";
import { httpError, ErrorCodes } from "../../types/responses.js";

export interface QBItem {
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

export async function getQBItems(orgId: string) {
    return  qbQueryAll<QBItem>(orgId, "Item", "Active = true");
};

// QB requires an IncomeAccount Ref when creating Service items
async function getIncomeAccountId(orgId: string): Promise<string> {
    const accounts = await qbQueryAll<any>(orgId, "Account", "AccountType = 'Income' AND Active = true");
    if (!accounts.length) {
        throw new Error("No active income account found");
    }
    const preferred = accounts.find((acc: any) => ["SalesOfProductIncome", "ServiceFeeIncome"].includes(acc.AccountSubType));
    return preferred ? preferred.Id as string : accounts[0].Id as string;
}

async function findOrCreateQBItem(orgId: string, name: string, unitPrice?: number): Promise<string> {
    const escaped = name.replace(/'/g, "\\'");
    const existing = await qbQueryAll<QBItem>(orgId, "Item", `Name = '${escaped}'`);
    if (existing.length) return existing[0].Id;

    const incomeAccountId = await getIncomeAccountId(orgId);
    const created = (await qbFetch(orgId, "POST", "/item", {
        Name: name, 
        Type: "Service",
        IncomeAccountRef: { value: incomeAccountId },
        ...(unitPrice !== undefined && { UnitPrice: unitPrice })
    })) as any;
    return created.Item.Id as string;
};

export async function getMappedQBItems(orgId: string): Promise<{ inventory_item_id: string; external_id: string }[]> {
    const mappings = await db.item_external_mapping.findMany({
        where: { 
            provider: "quickbooks",
            inventory_item : { organization_id: orgId }
        },
        select: {
            inventory_item_id: true,
            external_id: true
        }
    });
    return mappings;
}

export async function importQBItem(orgId: string, qbItemId: string) {
    const data = (await qbFetch(orgId, "GET", `/item/${qbItemId}`)) as any;
    const qbItem = data.Item as QBItem;

    const existing = await db.item_external_mapping.findUnique({
        where: {
            provider_external_id: {
                provider: "quickbooks",
                external_id: qbItemId
            }
        }
    });
    if (existing) {
        throw httpError(409, ErrorCodes.CONFLICT, "This QuickBooks item has already been imported.");
    }

    const createItem = (sku: string | null) =>
        db.$transaction(async (tx) =>{
            const item = await tx.inventory_item.create({
                data: {
                    organization_id: orgId,
                    name: qbItem.Name,
                    description: qbItem.Description ?? "",
                    location: "",
                    quantity: qbItem.QtyOnHand ?? 0,
                    unit_price: qbItem.UnitPrice ?? null,
                    cost: qbItem.PurchaseCost ?? null,
                    sku
                },
            });
            await tx.item_external_mapping.create({
                data: {
                    inventory_item_id: item.id,
                    external_id: qbItemId,
                    provider: "quickbooks"
                }
            });
            return item;
        });
    try {
        const item = await createItem(qbItem.Sku ?? null);
        return { item };
    } catch (error: any) {
        // sku is globally unique, another org may already have this sku
        if (error?.code === "P2002" && qbItem.Sku) {
            const item = await createItem(null);
            return { item, warning: `Sku "${qbItem.Sku}" is already in use. Importing item without Sku.` };
        }
        throw error;
    }
};

export async function linkQBItem(orgId: string, inventoryItemId: string, qbItemId: string): Promise<void> {
    const sdb = getScopedDb(orgId);
    const item = await sdb.inventory_item.findFirst({
        where: { id: inventoryItemId }
    });
    if (!item) {
        throw httpError(404, ErrorCodes.NOT_FOUND, "Inventory item not found");
    }

    try {
        await sdb.item_external_mapping.create({
            data: {
                inventory_item_id: inventoryItemId,
                external_id: qbItemId,
                provider: "quickbooks"
            }
        });
    } catch (error: any) {
        if (error?.code === "P2002") {
            throw httpError(409, ErrorCodes.CONFLICT, "This item or QuickBooks item has already been linked.");
        }
        throw error;
    }
};

// Remove the QB mapping for an inventory item. Org-scoped via the parent
// inventory_item; throws 404 if no mapping exists for this org's item.
export async function unlinkQBItem(orgId: string, inventoryItemId: string): Promise<void> {
    const { count } = await db.item_external_mapping.deleteMany({
        where: {
            provider: "quickbooks",
            inventory_item_id: inventoryItemId,
            inventory_item: { organization_id: orgId },
        },
    });
    if (count === 0) {
        throw httpError(404, ErrorCodes.NOT_FOUND, "Item mapping not found");
    }
};

export async function pushItem(orgId: string, inventoryItemId: string): Promise<string> {
    const sdb = getScopedDb(orgId);
    const item = await sdb.inventory_item.findFirst({
        where: { id: inventoryItemId }
    });
    if (!item) {
        throw httpError(404, ErrorCodes.NOT_FOUND, "Inventory item not found");
    }

    const existing = await db.item_external_mapping.findUnique({
        where: {
            provider_inventory_item_id: {
                provider: "quickbooks",
                inventory_item_id: inventoryItemId
            }
        }
    });
    if (existing) return existing.external_id;

    const qbItemId = await findOrCreateQBItem(orgId, item.name, item.unit_price ? Number(item.unit_price) : undefined);
    await db.item_external_mapping.create({
        data: {
            inventory_item_id: inventoryItemId,
            external_id: qbItemId,
            provider: "quickbooks"
        }
    });
    return qbItemId;
};