import { Router, type Response } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
    type ErrorCode,
} from "../types/responses.js";
import { getAgedReceivables,
    getAgedReceivablesByClient,
    getArrivalPerformance,
    getClientsReport,
    getInventoryReorderForecast,
    getInventoryReport,
    getInvoicesReport,
    getJobsReport,
    getLeadsBySource,
    getMileageReport,
    getOverviewMetrics,
    getPaymentsReport,
    getTaxLiabilityReport,
    getQuoteFunnelReport,
    getQuotePipeline,
    getRevenueByJobType,
    getRevenueYTD,
    getTechnicianScorecard,
    getTimesheetReport,
    getUnscheduledRevenue,
	getPageSummary
} from '../controllers/reportsController.js';
import { requirePermission } from '../lib/requirePermissions.js';
import { rowsToXlsxBuffer } from '../lib/excel/reportExcel.js';
import { exportReportSchema } from '../lib/validate/reportExport.js';
import * as savedReports from "../controllers/savedReportsController.js";
import { getUserContext } from "../lib/context.js";

const router = Router();

// Maps a controller-result error string to the matching HTTP status + ErrorCode.
const sendControllerError = (
	res: Response,
	err: string,
	defaultCode: ErrorCode = ErrorCodes.VALIDATION_ERROR,
) => {
	const lower = err.toLowerCase();
	const { status, code } = lower.includes("already exists")
		? { status: 409, code: ErrorCodes.CONFLICT }
		: lower.includes("not found")
			? { status: 404, code: ErrorCodes.NOT_FOUND }
			: { status: 400, code: defaultCode };
	return res.status(status).json(createErrorResponse(code, err));
};

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

router.get("/tax-liability", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getTaxLiabilityReport(startDate, endDate, orgId);
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

router.get("/jobs", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getJobsReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/invoices", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getInvoicesReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/clients", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const data = await getClientsReport(orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/payments", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getPaymentsReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/quote-funnel", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getQuoteFunnelReport(startDate, endDate, orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.get("/technician-scorecard", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate } = req.query as {
			startDate?: string;
			endDate?: string;
		};
		const data = await getTechnicianScorecard(startDate, endDate, orgId);
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

router.get("/inventory/full", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { startDate, endDate, include_inactive } = req.query as {
			startDate?: string;
			endDate?: string;
			include_inactive?: string;
		};

		const from = startDate ? new Date(startDate) : undefined;
		const to = endDate ? new Date(endDate) : undefined;
		const validRange =
			from && to && !isNaN(from.getTime()) && !isNaN(to.getTime());

		const data = await getInventoryReport(orgId, {
			from: validRange ? from : undefined,
			to: validRange ? to : undefined,
			includeInactive: include_inactive === "true",
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

router.get("/receivables/aging/by-client", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const data = await getAgedReceivablesByClient(orgId);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

router.post("/export", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const parsed = exportReportSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.message));
		}

		const { filename, sheetName, columns, rows } = parsed.data;

		const mapped = rows.map((row) =>
			Object.fromEntries(columns.map((col) => [col.label, row[col.key] ?? ""])),
		);
		const buffer = rowsToXlsxBuffer(mapped, [], sheetName ?? "Report");

		const safeFilename = filename.replace(/["\\\r\n]/g, "_");
		res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
		res.setHeader(
			"Content-Type",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		res.send(buffer);
	} catch (err) {
		next(err);
	}
});

router.get("/saved", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.listSavedReports(orgId, uid);
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.json(createSuccessResponse(result.items));
	} catch (err) {
		next(err);
	}
});

router.post("/saved", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.insertSavedReport(req.body, orgId, uid, getUserContext(req));
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.get("/saved/:id", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.getSavedReport(req.params.id as string, orgId, uid);
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.put("/saved/:id", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.updateSavedReport(
			req.params.id as string,
			req.body,
			orgId,
			uid,
			getUserContext(req),
		);
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.delete("/saved/:id", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.deleteSavedReport(
			req.params.id as string,
			orgId,
			uid,
			getUserContext(req),
		);
		if (result.err) {
			return sendControllerError(res, result.err, ErrorCodes.DELETE_ERROR);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.get("/favorites", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.listFavorites(orgId, uid);
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.json(createSuccessResponse(result.items));
	} catch (err) {
		next(err);
	}
});

router.post("/favorites", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.addFavorite(req.body, orgId, uid, getUserContext(req));
		if (result.err) {
			return sendControllerError(res, result.err);
		}
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.delete("/favorites/:id", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const uid = req.user!.uid as string;
		const result = await savedReports.removeFavorite(
			req.params.id as string,
			orgId,
			uid,
			getUserContext(req),
		);
		if (result.err) {
			return sendControllerError(res, result.err, ErrorCodes.DELETE_ERROR);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.get("/page-summary", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { page, startDate, endDate, groupBy } = req.query as { page: string, startDate?: string, endDate?: string, groupBy?: string};

		const result = await getPageSummary(orgId, page, startDate, endDate, groupBy);

		res.json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
})

export default router;
