import { Router } from "express";
import { requirePermission } from "../lib/requirePermissions.js";
import { createSuccessResponse, createErrorResponse, ErrorCodes } from "../types/responses.js";
import {
	getAuthUrl,
	handleCallback,
	disconnectOrg,
	getQBStatus,
	getOrgRealmId,
} from "../services/quickbooksService.js";
import { 
	pushInvoice,
	sendInvoiceEmail,
} from "../services/qb/qbInvoices.js"
import { findAllQBCustomers } from "../services/qb/qbCustomers.js"
import {
	getQBItems,
	getMappedQBItems,
	linkQBItem,
	unlinkQBItem,
	pushItem,
	importQBItem
} from "../services/qb/qbItems.js";
import {
	getQBTaxCodes,
	getQBTaxPrefs,
	linkTaxCode
} from "../services/qb/qbTax.js"
import {
	getImportableQBInvoices,
	getQBInvoicePrefill,
	importQBInvoices
} from "../services/qb/qbInvoices.js"
import { linkQBItemSchema } from "../lib/validate/quickbooks.js"
import { db } from "../db.js";
import { getScopedDb } from "../lib/context.js";
import { queryProfitAndLossQBReport } from "../services/qb/qbReports.js";
import type { ProfitAndLossQuery } from "../services/qb/qbReports.js";

const router = Router();

// Connection status for this org (the QB "connection" resource)
router.get("/connection", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id!;
		const status = await getQBStatus(orgId);
		res.json(createSuccessResponse(status));
	} catch (err) {
		next(err);
	}
});

// OAuth URL the frontend opens to begin the connect flow
router.get("/connection/auth-url", requirePermission("manage_organization"), (req, res, next) => {
	try {
		const orgId = req.user!.organization_id!;
		const url = getAuthUrl(orgId);
		res.json(createSuccessResponse({ url }));
	} catch (err) {
		next(err);
	}
});

// Clears QB tokens — org must reconnect to sync again
router.delete("/connection", requirePermission("manage_organization"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id!;
		await disconnectOrg(orgId);
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

// Manual sync — push a single invoice to QB (or retry a failed one)
router.post("/invoices/:id/sync", requirePermission("edit_invoices"), async (req, res, next) => {
	const invoiceId = req.params.id as string;
	try {
		const orgId = req.user!.organization_id!;
		await pushInvoice(invoiceId, orgId);
		res.json(createSuccessResponse({ synced: true }));
	} catch (err) {
		await db.invoice
			.update({ where: { id: invoiceId }, data: { qb_sync_status: "failed" } })
			.catch(() => {});
		next(err);
	}
});

router.post("/invoices/:id/email", async (req, res, next) =>{
	try {
		const invoiceId = req.params.id as string;
		const orgId = req.user!.organization_id as string;
		const { sendTo } = req.body;

		if (!sendTo){
			return res.status(400).json(
				createErrorResponse(ErrorCodes.VALIDATION_ERROR, "sendTo email is required")
			);
		}
		await sendInvoiceEmail(invoiceId, orgId, sendTo);
		res.json(createSuccessResponse({sent: true}));
	} catch(err) {
		next(err);
	}
});

// Returns QB customer IDs already imported into this org
router.get("/customers/mappings", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const sdb = getScopedDb(orgId);
		const accountId = await getOrgRealmId(orgId);
		const mappings = await sdb.client_external_mapping.findMany({
			where: {
				provider: "quickbooks",
				client: { organization_id: orgId },
				account_id: accountId,
			},
			select: { external_id: true },
		});
		return res.json(createSuccessResponse(mappings.map((m) => m.external_id)));
	} catch (e) {
		next(e);
	}
});

router.get("/customers", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const response = await findAllQBCustomers(orgId);

		if (!response) {
			return res.status(500).json(createErrorResponse(ErrorCodes.SERVER_ERROR, "Could not get QB Customers"));
		}
		return res.json(createSuccessResponse(response));
	} catch (e) {
		next(e);
	}
});

router.get("/items", requirePermission("view_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const response = await getQBItems(orgId);

		return res.json(createSuccessResponse(response));
	} catch (e) {
		next(e);
	}
});

router.get("/items/mappings", requirePermission("view_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const response = await getMappedQBItems(orgId);

		return res.json(createSuccessResponse(response));
	} catch (e) {
		next(e);
	}
});

// Create an item mapping
router.post("/item-mappings", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const parsed = linkQBItemSchema.safeParse(req.body);
		if (!parsed.success){
			return res.status(400).json(
				createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message)
			);
		}
	const { inventory_item_id, qb_item_id } = parsed.data;
		await linkQBItem(orgId, inventory_item_id, qb_item_id);
		res.status(201).json(createSuccessResponse({ linked: true }));
	} catch (err) {
		next(err);
	}
});

// Remove an item mapping 
router.delete("/item-mappings/:inventoryItemId", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const inventoryItemId = req.params.inventoryItemId as string;
		await unlinkQBItem(orgId, inventoryItemId);
		res.json(createSuccessResponse({ linked: false }));
	} catch (err) {
		next(err);
	}
});

// Import a QB item (:id) into this org's inventory
router.post("/items/:id/import", requirePermission("manage_inventory"), async (req, res, next) => {
	try{
		const orgId = req.user!.organization_id as string;
		const qbItemId = req.params.id as string;
		const result = await importQBItem(orgId, qbItemId);

		res.status(201).json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
});

router.post("/items/:id/push", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const itemId = req.params.id as string;
		await pushItem(orgId, itemId);
		res.json(createSuccessResponse({ pushed: true }));
	} catch (err) {
		next(err);
	}
});

router.get("/tax-codes", requirePermission("manage_taxes"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const taxCodes = await getQBTaxCodes(orgId);
		res.json(createSuccessResponse(taxCodes));
	} catch (err) {
		next(err);
	}
});

// Whether this QB company uses Automated Sales Tax 
router.get("/tax-preferences", requirePermission("manage_taxes"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const prefs = await getQBTaxPrefs(orgId);
		res.json(createSuccessResponse(prefs));
	} catch (err) {
		next(err);
	}
});

// Link a tax group to a QB tax code 
router.put("/tax-groups/:id/qb-tax-code", requirePermission("manage_taxes"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const taxGroupId = req.params.id as string;
		const qbTaxCodeId = req.body?.qb_tax_code_id;
		if (typeof qbTaxCodeId !== "string" || !qbTaxCodeId.trim()) {
			return res.status(400).json(
				createErrorResponse(ErrorCodes.VALIDATION_ERROR, "qb_tax_code_id is required")
			);
		}
		await linkTaxCode(orgId, taxGroupId, qbTaxCodeId);
		res.json(createSuccessResponse({ linked: true }));
	} catch (err) {
		next(err);
	}
});

// Unlink the tax group from its QB tax code
router.delete("/tax-groups/:id/qb-tax-code", requirePermission("manage_taxes"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const taxGroupId = req.params.id as string;
		await linkTaxCode(orgId, taxGroupId, null);
		res.json(createSuccessResponse({ linked: false }));
	} catch (err) {
		next(err);
	}
});

// List QB invoices available to import 
router.get("/invoices/importable", requirePermission("create_invoices"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
		const result = await getImportableQBInvoices(orgId, clientId);
		res.json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
});

// Full detail of one QB invoice, mapped to the create-invoice form shape
router.get("/invoices/:id/prefill", requirePermission("create_invoices"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const result = await getQBInvoicePrefill(orgId, req.params.id as string);
		res.json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
});

// Import only the selected QB invoices as local Drafts
router.post("/invoices/import", requirePermission("create_invoices"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const ids = req.body?.qb_invoice_ids;
		if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
			return res.status(400).json(
				createErrorResponse(ErrorCodes.VALIDATION_ERROR, "qb_invoice_ids must be an array of strings"),
			);
		}
		const result = await importQBInvoices(orgId, ids);
		res.status(201).json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
});

router.get("/reports/profit-and-loss", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const query = req.query as ProfitAndLossQuery;
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(query)) {
			if (typeof value === "string" && value !== "") {
				search.set(key, value);
			}
		}
		const report = await queryProfitAndLossQBReport(orgId, search.toString());
		res.json(createSuccessResponse(report));
	} catch (err) {
		next(err);
	}
});

export default router;
