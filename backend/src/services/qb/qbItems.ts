import { qbFetch, getValidToken } from "../quickbooksService.js";
import { getScopedDb } from "../../lib/context.js";
import { db } from "../../db.js";

const QB_ENV = (process.env.QB_ENVIRONMENT ?? "sandbox") as "sandbox" | "production";
const QB_BASE = QB_ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";

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

async function qbQueryAll<T>(orgId: string, entity: string, where?: string): Promise<T[]> {
    const { accessToken, realmId } = await getValidToken(orgId);
    const results: T[] = [];
    let start = 1;
    const pageSize = 1000;
    
    for (;;) {
        const sql = `SELECT * FROM ${entity}${where? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
        const url = `${QB_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=75`;
        const res = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`QB query ${entity} -> ${res.status}: ${text}`);
        }
        const data = (await res.json()) as any; 
        const page = (data?.QueryResponse?.[entity] ?? []) as T[];
        results.push(...page);
        if (page.length < pageSize) {
            break;
        }
        start += pageSize;
    }
    return results;
};

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
        throw new Error("This QuickBooks item has already been imported.");
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
        throw new Error("Inventory item not found");
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
            throw new Error("This item or QuickBooks item has already been linked.");
        }
        throw error;
    }
};

export async function pushItem(orgId: string, inventoryItemId: string): Promise<string> {
    const sdb = getScopedDb(orgId);
    const item = await sdb.inventory_item.findFirst({
        where: { id: inventoryItemId }
    });
    if (!item) {
        throw new Error("Inventory item not found");
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