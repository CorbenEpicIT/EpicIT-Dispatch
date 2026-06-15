import { Router } from "express";
import { requirePermission } from "../lib/requirePermissions.js";
import { createSuccessResponse, createErrorResponse, ErrorCodes } from "../types/responses.js";
import {
	getAuthUrl,
	handleCallback,
	disconnectOrg,
	pushInvoice,
	getQBStatus,
	sendInvoiceEmail,
	findAllQBCustomers
} from "../services/quickbooksService.js";
import {
	getQBItems,
	getMappedQBItems,
	linkQBItem,
	pushItem,
	importQBItem
} from "../services/qb/qbItems.js";
import { linkQBItemSchema, importQBItemSchema } from "../lib/validate/quickbooks.js"
import { db } from "../db.js";
import { getScopedDb } from "../lib/context.js";

const router = Router();

// Returns OAuth URL; frontend opens this to start the QB connect flow
router.get("/connect", requirePermission("manage_organization"), (req, res, next) => {
	try {
		const orgId = req.user!.organization_id!;
		const url = getAuthUrl(orgId);
		res.json(createSuccessResponse({ url }));
	} catch (err) {
		next(err);
	}
});

// Returns whether QB is connected for this org
router.get("/status", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id!;
		const status = await getQBStatus(orgId);
		res.json(createSuccessResponse(status));
	} catch (err) {
		next(err);
	}
});

// Clears QB tokens — org must reconnect to sync again
router.delete("/disconnect", requirePermission("manage_organization"), async (req, res, next) => {
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
router.get("/mapped-customers", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const sdb = getScopedDb(orgId);
		const mappings = await sdb.client_external_mapping.findMany({
			where: {
				provider: "quickbooks",
				client: { organization_id: orgId },
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

router.get("/mapped-items", requirePermission("view_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const response = await getMappedQBItems(orgId);

		return res.json(createSuccessResponse(response));
	} catch (e) {
		next(e);
	}
});

router.post("/items/link", requirePermission("manage_inventory"), async (req, res, next) => {
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
		res.json(createSuccessResponse({ linked: true }));
	} catch (err) {
		next(err);
	}
});

// will add later
//router.post("/items/unlink", requirePermission("manage_inventory"), async (req, res, next) => {

router.post("/items/import", requirePermission("manage_inventory"), async (req, res, next) => {
	try{
		const orgId = req.user!.organization_id as string;
		const parsed = importQBItemSchema.safeParse(req.body);
		if (!parsed.success){
			return res.status(400).json(
				createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message)
			);
		}
		const { qb_item_id } = parsed.data;
		const result = await importQBItem(orgId, qb_item_id);
		
		res.json(createSuccessResponse(result));
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

export default router;
