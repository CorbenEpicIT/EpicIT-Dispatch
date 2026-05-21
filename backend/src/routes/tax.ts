import { Router } from "express";
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "../types/responses.js";
import {
	getTaxRates,
	createTaxRate,
	updateTaxRate,
	deleteTaxRate,
	getTaxGroups,
	getDefaultTaxGroup,
	createTaxGroup,
	updateTaxGroup,
	deleteTaxGroup,
	type TaxResult,
} from "../controllers/taxController.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helper — maps controller result to HTTP response without string-parsing
// ---------------------------------------------------------------------------

function sendTaxResult<T>(
	res: import("express").Response,
	result: TaxResult<T>,
	successStatus = 200,
): void {
	if (result.ok) {
		res.status(successStatus).json(createSuccessResponse(result.item));
		return;
	}
	const ERROR_MAP: Record<string, { status: number; code: string }> = {
		NOT_FOUND:  { status: 404, code: ErrorCodes.NOT_FOUND },
		CONFLICT:   { status: 409, code: ErrorCodes.CONFLICT },
		VALIDATION: { status: 400, code: ErrorCodes.VALIDATION_ERROR },
		INTERNAL:   { status: 500, code: ErrorCodes.SERVER_ERROR },
	};
	const { status, code: errCode } =
		ERROR_MAP[result.code] ?? { status: 500, code: ErrorCodes.SERVER_ERROR };
	res.status(status).json(createErrorResponse(errCode, result.message));
}

// ============================================
// TAX RATE ROUTES
// ============================================

router.get("/rates", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const includeInactive = req.query.include_inactive === "true";
		const rates = await getTaxRates(orgId, includeInactive);
		res.json(createSuccessResponse(rates, { count: rates.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/rates", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const result = await createTaxRate(req.body, orgId);
		sendTaxResult(res, result, 201);
	} catch (err) {
		next(err);
	}
});

router.patch("/rates/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await updateTaxRate(id, req.body, orgId);
		sendTaxResult(res, result);
	} catch (err) {
		next(err);
	}
});

router.delete("/rates/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await deleteTaxRate(id, orgId);
		sendTaxResult(res, result);
	} catch (err) {
		next(err);
	}
});

// ============================================
// TAX GROUP ROUTES
// ============================================

// Must be before /:id to avoid route conflict
router.get("/groups/default", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const group = await getDefaultTaxGroup(orgId);
		res.json(createSuccessResponse(group));
	} catch (err) {
		next(err);
	}
});

router.get("/groups", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const includeInactive = req.query.include_inactive === "true";
		const groups = await getTaxGroups(orgId, includeInactive);
		res.json(createSuccessResponse(groups, { count: groups.length }));
	} catch (err) {
		next(err);
	}
});

router.post("/groups", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const result = await createTaxGroup(req.body, orgId);
		sendTaxResult(res, result, 201);
	} catch (err) {
		next(err);
	}
});

router.patch("/groups/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await updateTaxGroup(id, req.body, orgId);
		sendTaxResult(res, result);
	} catch (err) {
		next(err);
	}
});

router.delete("/groups/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await deleteTaxGroup(id, orgId);
		sendTaxResult(res, result);
	} catch (err) {
		next(err);
	}
});

export default router;
