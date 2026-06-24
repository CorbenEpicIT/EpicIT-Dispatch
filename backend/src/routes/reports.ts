import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getAgedReceivables,
    getArrivalPerformance,
    getInventoryReorderForecast,
    getLeadsBySource,
    getMileageReport,
    getOverviewMetrics,
    getQuotePipeline,
    getRevenueByJobType,
    getRevenueYTD,
    getTimesheetReport,
    getUnscheduledRevenue
} from '../controllers/reportsController.js';
import { requirePermission } from '../lib/requirePermissions.js';

const router = Router();

router.get("/overview", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const overview = await getOverviewMetrics(startDate, endDate, orgId);
		res.json(createSuccessResponse(overview));
	} catch (err) {
		next(err);
	}
});

router.get("/revenue-ytd", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { year } = req.query as {
			year?: string;
		};

		const revenueYTD = await getRevenueYTD(
			orgId,
			year ? parseInt(year, 10) : undefined,
		);
		res.json(createSuccessResponse(revenueYTD));
	} catch (err) {
		next(err);
	}
});

router.get("/revenue-by-job-type", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const revenueByJobType = await getRevenueByJobType(startDate, endDate, orgId);
		res.json(createSuccessResponse(revenueByJobType));
	} catch (err) {
		next(err);
	}
});

router.get("/leads-by-source", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const leadsBySource = await getLeadsBySource(startDate, endDate, orgId);
		res.json(createSuccessResponse(leadsBySource));
	} catch (err) {
		next(err);
	}
});

router.get("/unscheduled-revenue", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const unscheduledRevenue = await getUnscheduledRevenue(orgId);
		res.json(createSuccessResponse(unscheduledRevenue));
	} catch (err) {
		next(err);
	}
});

router.get("/quote-pipeline", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const quotePipeline = await getQuotePipeline(startDate, endDate, orgId);
		res.json(createSuccessResponse(quotePipeline));
	} catch (err) {
		next(err);
	}
});

router.get("/arrival-performance", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const data = await getArrivalPerformance(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/mileage", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getMileageReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/timesheets", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getTimesheetReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/inventory/reorder-forecast", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { lookbackDays } = req.query as { lookbackDays?: string };

		// Parse with a safe default; require >= 1 day to avoid div-by-zero.
		const n = lookbackDays != null ? Number(lookbackDays) : NaN;
		const data = await getInventoryReorderForecast(orgId, {
			lookbackDays: Number.isFinite(n) && n > 0 ? n : 90,
		});
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/receivables/aging", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const data = await getAgedReceivables(orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

export default router;
