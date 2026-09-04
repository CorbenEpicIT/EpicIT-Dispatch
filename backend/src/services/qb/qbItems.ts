import { getOrgRealmId, qbFetch } from "../quickbooksService.js";
import { qbQueryAll } from "./qbQuery.js";
import { getScopedDb } from "../../lib/context.js";
import { db } from "../../db.js";
import { httpError, ErrorCodes } from "../../types/responses.js";
import { recordMovements, type ActorInfo } from "../stockMovements.js";
import { throwOnMappingConflict } from "./qbMappingErrors.js";

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
    const accountId = await getOrgRealmId(orgId);
    const mappings = await db.item_external_mapping.findMany({
        where: {
            provider: "quickbooks",
            inventory_item : { organization_id: orgId },
            account_id: accountId
        },
        select: {
            inventory_item_id: true,
            external_id: true
        }
    });
    return mappings;
}

export async function importQBItem(orgId: string, qbItemId: string, actor?: ActorInfo) {
    const data = (await qbFetch(orgId, "GET", `/item/${qbItemId}`)) as any;
    const qbItem = data.Item as QBItem;
    const accountId = await getOrgRealmId(orgId);
    const existing = await db.item_external_mapping.findFirst({
        where: {
            provider: "quickbooks",
            external_id: qbItemId,
            account_id: accountId,
            inventory_item: { organization_id: orgId },
        }
    });
    if (existing) {
        throw httpError(409, ErrorCodes.CONFLICT, "This QuickBooks item has already been imported.");
    }

    // Keep the QBO quantity at the ledger's own scale (numeric(10,2)) instead of
    // flooring it: 12.5 gal on hand in QuickBooks is 12.5 here, not 12. Rounding
    // to 2 dp is what makes it storable for recordMovements' precision guard;
    // anything QBO sends with more precision than that is not representable and
    // is rounded rather than failing the import. Negative QBO balances still
    // import as 0 — the opening movement can't be negative.
    const qtyOnHand = Math.max(0, Math.round((qbItem.QtyOnHand ?? 0) * 100) / 100);

    try {
        const item = await db.$transaction(async (tx) => {
            const created = await tx.inventory_item.create({
                data: {
                    organization_id: orgId,
                    name: qbItem.Name,
                    origin: "import",
                    description: qbItem.Description ?? "",
                    location: "",
                    quantity: 0, // recordMovements sets the opening qty below
                    // No unit-of-measure field on the QBO Item — leave `unit` at its default rather than guess.
                    unit_price: qbItem.UnitPrice ?? null,
                    cost: qbItem.PurchaseCost ?? null,
                    sku: qbItem.Sku ?? null,
                },
            });
            await tx.item_external_mapping.create({
                data: {
                    inventory_item_id: created.id,
                    external_id: qbItemId,
                    provider: "quickbooks",
                    account_id: accountId
                }
            });

            // recordMovements is the single writer of inventory_item.quantity — route the opening
            // balance through it. Reason "initial", not "receive": nothing was purchased.
            if (qtyOnHand > 0) {
                await recordMovements(tx, orgId, actor ?? { actor_type: "system" }, [
                    {
                        inventory_item_id: created.id,
                        qty: qtyOnHand,
                        from_location_type: "external",
                        to_location_type: "warehouse",
                        reason: "initial",
                        note: `Imported from QuickBooks (QtyOnHand ${qbItem.QtyOnHand})`,
                        unit_cost: qbItem.PurchaseCost ?? undefined,
                    },
                ]);
            }

            // quantity was created at 0 and incremented by recordMovements; return
            // the known final value instead of re-reading the row.
            return { ...created, quantity: qtyOnHand };
        });
        return { item };
    } catch (error: any) {
        // sku is unique per org — a P2002 means this org already has the QB
        // item's sku. Fail with a clear conflict instead of silently importing
        // without it (the user can resolve the existing item / sku, then retry).
        if (error?.code === "P2002") {
            throw httpError(
                409,
                ErrorCodes.CONFLICT,
                `An item with SKU "${qbItem.Sku}" already exists in this organization.`,
            );
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

    const accountId = await getOrgRealmId(orgId);
    try {
        await sdb.item_external_mapping.create({
            data: {
                inventory_item_id: inventoryItemId,
                external_id: qbItemId,
                provider: "quickbooks",
                account_id: accountId
            }
        });
    } catch (error: any) {
        throwOnMappingConflict(error, "This item or QuickBooks item has already been linked.");
    }
};

// Remove the QB mapping for an inventory item. Org-scoped via the parent
// inventory_item; throws 404 if no mapping exists for this org's item.
export async function unlinkQBItem(orgId: string, inventoryItemId: string): Promise<void> {
    const accountId = await getOrgRealmId(orgId);
    const { count } = await db.item_external_mapping.deleteMany({
        where: {
            provider: "quickbooks",
            inventory_item_id: inventoryItemId,
            account_id: accountId,
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

    const accountId = await getOrgRealmId(orgId);
    const existing = await db.item_external_mapping.findFirst({
        where: {
            provider: "quickbooks",
            inventory_item_id: inventoryItemId,
            account_id: accountId,
            inventory_item: { organization_id: orgId },
        }
    });
    if (existing) return existing.external_id;

    const qbItemId = await findOrCreateQBItem(orgId, item.name, item.unit_price ? Number(item.unit_price) : undefined);
    await db.item_external_mapping.create({
        data: {
            inventory_item_id: inventoryItemId,
            external_id: qbItemId,
            provider: "quickbooks",
            account_id: accountId
        }
    });
    return qbItemId;
};