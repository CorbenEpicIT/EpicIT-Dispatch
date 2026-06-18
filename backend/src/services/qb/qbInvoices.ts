import { getScopedDb } from "../../lib/context.js";
import { db } from "../../db.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { qbQueryAll } from "./qbQuery.js";
import { qbFetch } from "../quickbooksService.js";
import { findOrCreateQBCustomer } from "./qbCustomers.js";
import { httpError } from "../../types/responses.js";

interface QBImportInvoice {
	Id: string;
	DocNumber?: string;
	TxnDate?: string;
	DueDate?: string;
	TotalAmt?: number | string;
	CustomerRef?: { value?: string; name?: string };
	CustomerMemo?: { value?: string };
	PrivateNote?: string;
	TxnTaxDetail?: { TotalTax?: number | string };
	Line?: Array<{
			Amount?: number | string;
			DetailType?: string;
			Description?: string;
			LineNum?: number;
			SalesItemLineDetail?: {
					Qty?: number | string;
					UnitPrice?: number | string;
					ItemRef?: { value?: string; name?: string };
					TaxCodeRef?: { value?: string };
			};
	}>;
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
	lineItems: Array<{
		name: string;
		description: string | null;
		quantity: number;
		unit_price: number;
		inventory_item_id: string | null;
	}>;
}

const inFlightPushes = new Map<string, Promise<void>>();

const createOneImportedInvoice = async (
	orgId: string,
	clientId: string,
	qbInvoice: QBImportInvoice,
	itemMap: Map<string, string>,
) => {
	const base = `QB-${qbInvoice.DocNumber ?? qbInvoice.Id}`;
	const lines = (qbInvoice.Line ?? []).filter(
		(l) => l.DetailType === "SalesItemLineDetail",
	);
	const subtotal = lines.reduce((s, l) => s + Number(l.Amount ?? 0), 0);
	const total = Number(qbInvoice.TotalAmt ?? subtotal);

	for (let attempt = 0; attempt < 5; attempt++) {
		// First try the bare QB number; on collision append -2, -3, …
		const invoice_number = attempt === 0 ? base : `${base}-${attempt + 1}`;
		try {
			await db.$transaction(async (tx) => {
				const invoice = await tx.invoice.create({
					data: {
						organization_id: orgId,
						client_id: clientId,
						invoice_number,
						status: "Draft",
						qb_invoice_id: qbInvoice.Id,
						qb_sync_status: "synced",
						issue_date: qbInvoice.TxnDate ? new Date(qbInvoice.TxnDate) : new Date(),
						due_date: qbInvoice.DueDate ? new Date(qbInvoice.DueDate) : null,
						subtotal,
						tax_rate: 0, // legacy field — actual tax is per-line
						tax_amount: Number(qbInvoice.TxnTaxDetail?.TotalTax ?? 0),
						discount_type: null,
						discount_value: null,
						discount_amount: 0,
						total,
						amount_paid: 0,
						balance_due: total,
					},
				});

				if (lines.length > 0) {
					await tx.invoice_line_item.createMany({
						data: lines.map((l, idx) => {
							const qty = Number(l.SalesItemLineDetail?.Qty ?? 1);
							const amount = Number(l.Amount ?? 0);
							const refId = l.SalesItemLineDetail?.ItemRef?.value;
							return {
								invoice_id: invoice.id,
								name:
									l.Description ??
									l.SalesItemLineDetail?.ItemRef?.name ??
									"Imported item",
								description: l.Description ?? null,
								quantity: qty,
								unit_price: Number(
									l.SalesItemLineDetail?.UnitPrice ?? (qty ? amount / qty : amount),
								),
								total: amount,
								taxable: l.SalesItemLineDetail?.TaxCodeRef?.value !== "NON",
								tax_group_id: null,
								inventory_item_id: (refId && itemMap.get(refId)) ?? null,
								item_type: null,
								sort_order: l.LineNum ?? idx,
							};
						}),
					});
				}
			});
			return; 
		} catch (e) {
			// Retry only on invoice_number unique collision
			if (
				attempt < 4 &&
				e instanceof Prisma.PrismaClientKnownRequestError &&
				e.code === "P2002" &&
				(e.meta?.target as string[] | undefined)?.includes("invoice_number")
			) {
				continue;
			}
			throw e;
		}
	}
};

export const getImportableQBInvoices = async (
	orgId: string,
	clientId?: string,
): Promise<QBImportableInvoice[]> => {
	const sdb = getScopedDb(orgId);

	// The caller passes our EpicIT client id, not the QB customer id. If the
	// client is linked to a QB customer, scope to that customer (QB's CustomerRef
	// is numeric — querying with our UUID makes QB 400 with a QueryParserError).
	// If the client isn't linked, fall back to the org-wide list so the user can
	// still import and assign invoices to the selected client.
	let where: string | undefined;
	if (clientId) {
		const mapping = await sdb.client_external_mapping.findFirst({
			where: {
				provider: "quickbooks",
				client_id: clientId,
				client: { organization_id: orgId },
			},
			select: { external_id: true },
		});
		if (mapping) where = `CustomerRef = '${mapping.external_id}'`;
	}

	const invoices = await qbQueryAll<QBImportInvoice>(orgId, "Invoice", where);

	const qbIds = invoices.map((i) => i.Id);
	const existing = await sdb.invoice.findMany({
		where: { qb_invoice_id: { in: qbIds } },
		select: { qb_invoice_id: true },
	});
	const seen = new Set(existing.map((i) => i.qb_invoice_id));

	return invoices.map((i) => ({
		Id: i.Id,
		DocNumber: i.DocNumber ?? null,
		TxnDate: i.TxnDate ?? null,
		DueDate: i.DueDate ?? null,
		TotalAmt: Number(i.TotalAmt ?? 0),
		customerId: i.CustomerRef?.value ?? null,
		customerName: i.CustomerRef?.name ?? null,
		lineCount: (i.Line ?? []).filter((l) => l.DetailType === "SalesItemLineDetail").length,
		alreadyImported: seen.has(i.Id),
	}));
};

// Full detail of a single QB invoice, mapped to the create-invoice form shape.
// Used to auto-fill the form when a user picks an invoice in the import dropdown.
export const getQBInvoicePrefill = async (
	orgId: string,
	qbInvoiceId: string,
): Promise<QBInvoicePrefill> => {
	const sdb = getScopedDb(orgId);
	const invoices = await qbQueryAll<QBImportInvoice>(orgId, "Invoice", `Id = '${qbInvoiceId}'`);
	const qb = invoices[0];
	if (!qb) throw httpError(404, "NOT_FOUND", "QuickBooks invoice not found");

	const lines = (qb.Line ?? []).filter((l) => l.DetailType === "SalesItemLineDetail");

	// Resolve QB customer → local client (only if this customer is linked)
	let clientId: string | null = null;
	if (qb.CustomerRef?.value) {
		const mapping = await sdb.client_external_mapping.findFirst({
			where: {
				provider: "quickbooks",
				external_id: qb.CustomerRef.value,
				client: { organization_id: orgId },
			},
			select: { client_id: true },
		});
		clientId = mapping?.client_id ?? null;
	}

	// Resolve QB items → local inventory items (only those that are linked)
	const itemRefIds = [...new Set(
		lines.map((l) => l.SalesItemLineDetail?.ItemRef?.value).filter(Boolean) as string[],
	)];
	const itemMaps = itemRefIds.length
		? await sdb.item_external_mapping.findMany({
				where: {
					provider: "quickbooks",
					external_id: { in: itemRefIds },
					inventory_item: { organization_id: orgId },
				},
				select: { external_id: true, inventory_item_id: true },
			})
		: [];
	const itemMap = new Map(itemMaps.map((m) => [m.external_id, m.inventory_item_id]));

	const alreadyImported = !!(await sdb.invoice.findFirst({
		where: { qb_invoice_id: qb.Id },
		select: { id: true },
	}));

	return {
		qbInvoiceId: qb.Id,
		docNumber: qb.DocNumber ?? null,
		txnDate: qb.TxnDate ?? null,
		dueDate: qb.DueDate ?? null,
		memo: qb.CustomerMemo?.value ?? qb.PrivateNote ?? null,
		customerId: qb.CustomerRef?.value ?? null,
		customerName: qb.CustomerRef?.name ?? null,
		clientId,
		alreadyImported,
		lineItems: lines.map((l) => {
			const refId = l.SalesItemLineDetail?.ItemRef?.value;
			return {
				name:
					l.Description ??
					l.SalesItemLineDetail?.ItemRef?.name ??
					"Imported item",
				description: l.Description ?? null,
				quantity: Number(l.SalesItemLineDetail?.Qty ?? 1),
				unit_price: Number(l.SalesItemLineDetail?.UnitPrice ?? l.Amount ?? 0),
				inventory_item_id: refId ? itemMap.get(refId) ?? null : null,
			};
		}),
	};
};

export const importQBInvoices = async (orgId: string, qbInvoiceIds: string[]) => {
	let imported = 0;
	let skipped = 0;
	const errors: string[] = [];
	if (qbInvoiceIds.length === 0) return { imported, skipped, errors };

	const sdb = getScopedDb(orgId);
	const idList = qbInvoiceIds.map((id) => `'${id}'`).join(",");
	const invoices = await qbQueryAll<QBImportInvoice>(orgId, "Invoice", `Id IN (${idList})`);

	const existing = await sdb.invoice.findMany({
		where: { qb_invoice_id: { in: qbInvoiceIds } },
		select: { qb_invoice_id: true },
	});
	const seen = new Set(existing.map((i) => i.qb_invoice_id));

	const custRefs = [...new Set(invoices.map((i) => i.CustomerRef?.value).filter(Boolean) as string[])];
	const clientMaps = await sdb.client_external_mapping.findMany({
		where: { provider: "quickbooks", external_id: { in: custRefs }, client: { organization_id: orgId } },
		select: { external_id: true, client_id: true },
	});
	const clientMap = new Map(clientMaps.map((m) => [m.external_id, m.client_id]));

	const itemRefIds = [...new Set(
		invoices
			.flatMap((i) => i.Line ?? [])
			.filter((l) => l.DetailType === "SalesItemLineDetail")
			.map((l) => l.SalesItemLineDetail?.ItemRef?.value)
			.filter(Boolean) as string[],
	)];
	const itemMaps = await sdb.item_external_mapping.findMany({
		where: { provider: "quickbooks", external_id: { in: itemRefIds }, inventory_item: { organization_id: orgId } },
		select: { external_id: true, inventory_item_id: true },
	});
	const itemMap = new Map(itemMaps.map((m) => [m.external_id, m.inventory_item_id]));

	for (const qb of invoices) {
		if (seen.has(qb.Id)) {
			skipped++;
			continue;
		}
		const clientId = qb.CustomerRef?.value ? clientMap.get(qb.CustomerRef.value) : undefined;
		if (!clientId) {
			errors.push(`Invoice ${qb.DocNumber ?? qb.Id}: customer not mapped to a client`);
			continue;
		}
		try {
			await createOneImportedInvoice(orgId, clientId, qb, itemMap);
			imported++;
		} catch (error) {
			errors.push(`Invoice ${qb.DocNumber ?? qb.Id}: ${error}`);
		}
	}

	return { imported, skipped, errors };
};

export async function pushInvoice(invoiceId: string, orgId: string): Promise<void> {
	const prior = inFlightPushes.get(invoiceId) ?? Promise.resolve();
	const run = prior.catch(() => {}).then(() => doPushInvoice(invoiceId, orgId));
	inFlightPushes.set(
		invoiceId,
		run.finally(() => {
			if (inFlightPushes.get(invoiceId) === run) {
				inFlightPushes.delete(invoiceId);
			}
		})
	);
	return run;
};

async function doPushInvoice(invoiceId: string, orgId: string): Promise<void> {
	const sdb = getScopedDb(orgId);
	const invoice = await sdb.invoice.findFirst({
		where: { id: invoiceId },
		include: {
			line_items: {
				include: { 
					inventory_item: { 
						include: { 
							external_mappings: { 
								where: { 
									provider: "quickbooks"
								}, 
								take: 1 
							} 
						} 
					},
					tax_group: {
						select: { qb_tax_code_id: true }
					}
				} 
			},
			client: {
				include: {
					contacts: {
						where: { is_primary: true },
						include: { contact: { select: { email: true } } },
						take: 1,
					},
					client_external_mapping: {
						where: { provider: "quickbooks" },
						take: 1,
					},
				},
			},
		},
	});
	if (!invoice) throw new Error("Invoice not found");

	const primaryEmail = invoice.client.contacts?.[0]?.contact?.email ?? null;
	const existingQBId = invoice.client.client_external_mapping?.[0]?.external_id ?? null;
	const customerId = existingQBId ?? (await findOrCreateQBCustomer(orgId, invoice.client.name));

	// Cache the QB customer ID so this client is excluded from the import dropdown
	if (!existingQBId) {
		await sdb.client_external_mapping.upsert({
			where: { provider_external_id: { provider: "quickbooks", external_id: customerId } },
			create: { client_id: invoice.client_id, provider: "quickbooks", external_id: customerId },
			update: {},
		}).catch(() => {});
	}

	const lines: any[] = invoice.line_items.map((item) => {
		const mapping = item.inventory_item?.external_mappings?.[0];
		return {
			Amount: Number(item.total),
			DetailType: "SalesItemLineDetail",
			Description: item.description ?? item.name,
			SalesItemLineDetail: {
				Qty: Number(item.quantity),
				UnitPrice: Number(item.unit_price),
				ItemRef: mapping ? { value: mapping.external_id } : { value: "1", name: "Services" },
				TaxCodeRef: { value: item.taxable === false ? "NON" : (item.tax_group?.qb_tax_code_id ?? "TAX") }
			},

		};
	});

	// Mirror an invoice-level discount as a QB fixed-amount discount line.
	if (Number(invoice.discount_amount) > 0) {
		lines.push({
			DetailType: "DiscountLineDetail",
			Amount: Number(invoice.discount_amount),
			DiscountLineDetail: { PercentBased: false },
		});
	}

	
	let qbInvoiceId: string | null = invoice.qb_invoice_id ?? null;
	if (!qbInvoiceId) {
		const existingByDoc = await qbQueryAll<{ Id: string }>(
				orgId,
				"Invoice",
				`DocNumber = '${invoice.invoice_number}'`,
		);
		if (existingByDoc.length > 0) qbInvoiceId = existingByDoc[0].Id;
	}

	if (qbInvoiceId) {
		const existing = (await qbFetch(orgId, "GET", `/invoice/${qbInvoiceId}`)) as any;
		await qbFetch(orgId, "POST", "/invoice", {
			sparse: true,
			Id: qbInvoiceId,
			SyncToken: existing.Invoice.SyncToken,
			CustomerRef: { value: customerId },
			Line: lines,
			...(invoice.due_date && { DueDate: invoice.due_date.toISOString().split("T")[0] }),
			...(invoice.memo && { CustomerMemo: { value: invoice.memo } }),
			...(primaryEmail && { BillEmail: { Address: primaryEmail } }),
		});
		await sdb.invoice.update({
			where: { id: invoiceId },
			// persist the id in case we resolved it via the Doc
			data: { qb_invoice_id: qbInvoiceId, qb_sync_status: "synced" },
		});
	} else {
		const created = (await qbFetch(orgId, "POST", "/invoice", {
			CustomerRef: { value: customerId },
			Line: lines,
			DocNumber: invoice.invoice_number,
			...(invoice.due_date && { DueDate: invoice.due_date.toISOString().split("T")[0] }),
			...(invoice.memo && { CustomerMemo: { value: invoice.memo } }),
			...(primaryEmail && { BillEmail: { Address: primaryEmail } }),
		})) as any;

		await sdb.invoice.update({
			where: { id: invoiceId },
			data: {
				qb_invoice_id: created.Invoice.Id,
				qb_sync_status: "synced",
			},
		});
	}
}

export async function voidQBInvoice(orgId: string, qbInvoiceId: string): Promise<void> {
	const existing = (await qbFetch(orgId, "GET", `/invoice/${qbInvoiceId}`)) as any;
	const syncToken = existing.Invoice.SyncToken;
	await qbFetch(orgId, "POST", `/invoice?operation=void`, {
		SyncToken: syncToken,
		Id: qbInvoiceId,
	});

	// Reflect the void locally. updateMany is org-scoped via getScopedDb.
	const sdb = getScopedDb(orgId);
	await sdb.invoice.updateMany({
		where: { qb_invoice_id: qbInvoiceId },
		data: { qb_sync_status: "synced" },
	});
}


export async function sendInvoiceEmail(invoiceId: string, orgId: string, sendTo: string): Promise<void>{
	const invoice = await db.invoice.findFirst({
		where: { id: invoiceId, organization_id: orgId },
		select: { qb_invoice_id: true },
	});
	if (!invoice) throw new Error("Invoice not found");
	if (!invoice.qb_invoice_id){
		await pushInvoice(invoiceId, orgId);
		const refresh = await db.invoice.findFirst({
			where: { id: invoiceId, organization_id: orgId },
			select: { qb_invoice_id: true },
		});
		if (!refresh?.qb_invoice_id) throw new Error("QB sync failed");
		invoice.qb_invoice_id = refresh.qb_invoice_id;
	}

	// Set BillEmail and EmailStatus: "NeedToSend" in one sparse update.
	// QB processes this as a send request and sets EmailStatus to "EmailSent".
	// (The /invoice/{id}/send endpoint has a known NullPointerException bug in sandbox.)
	const existing = (await qbFetch(orgId, "GET", `/invoice/${invoice.qb_invoice_id}`)) as any;
	await qbFetch(orgId, "POST", "/invoice", {
		sparse: true,
		Id: invoice.qb_invoice_id,
		SyncToken: existing.Invoice.SyncToken,
		BillEmail: { Address: sendTo },
		EmailStatus: "NeedToSend",
	});
};