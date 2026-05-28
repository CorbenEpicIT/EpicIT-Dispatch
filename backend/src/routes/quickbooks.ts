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

export default router;
