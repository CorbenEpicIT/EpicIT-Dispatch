import { Router, type Response } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
    type ErrorCode,
} from "../types/responses.js";
import { getAgedReceivables,
    getArrivalPerformance,
    getLeadsBySource,
    getMileageReport,
    getOverviewMetrics,
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
import { exportReportSchema, exportServerSchema } from '../lib/validate/reportExport.js';
import { parsePaginateQuery } from "../lib/validate/reportQuery.js";
import { filterRows, slicePage, type ReportRow } from "../lib/reports/filterEngine.js";
import { getReportDefinition, type ReportQuery } from "../lib/reports/reportRegistry.js";
import * as savedReports from "../controllers/savedReportsController.js";
import { getUserContext } from "../lib/context.js";

const router = Router();

// Runs a registered report, applies the shared filter/sort engine over the full
// result set, and returns just the requested page plus a full-set/filtered summary.
const buildReportQuery = (q: Record<string, unknown>): ReportQuery => {
	const lookback = typeof q.lookbackDays === "string" ? Number(q.lookbackDays) : NaN;
	return {
		startDate: typeof q.startDate === "string" ? q.startDate : undefined,
		endDate: typeof q.endDate === "string" ? q.endDate : undefined,
		includeInactive: q.include_inactive === "true" ? true : undefined,
		lookbackDays: Number.isFinite(lookback) && lookback > 0 ? lookback : undefined,
	};
};

const handlePaginatedReport = async (
	reportKey: string,
	orgId: string,
	reqQuery: Record<string, unknown>,
) => {
	const def = getReportDefinition(reportKey)!;
	const query = buildReportQuery(reqQuery);
	const params = parsePaginateQuery(reqQuery);

	// Fast path: push filter/sort/pagination into SQL (id-prefilter). Returns null
	// only if the request can't be expressed in SQL → falls through to in-memory.
	const fast = def.loadPage ? await def.loadPage(orgId, query, params) : null;

	let result: {
		rows: ReportRow[];
		total: number;
		page: number;
		pageSize: number;
		summary?: Record<string, unknown>;
	};
	if (fast) {
		result = fast;
	} else {
		// Fallback: fetch-all then filter/sort/paginate in memory (computed-column
		// filters/sorts, or reports without a pushdown path).
		const { rows, summary } = await def.load(orgId, query);
		const filtered = filterRows(rows, params);
		const page = slicePage(filtered, params);
		const filteredSummary = def.filteredSummary?.(filtered);
		const mergedSummary =
			summary || filteredSummary ? { ...(summary ?? {}), ...(filteredSummary ?? {}) } : undefined;
		result = { rows: page.rows, total: page.total, page: page.page, pageSize: page.pageSize, summary: mergedSummary };
	}

	const hasMore = (result.page + 1) * result.pageSize < result.total;
	return {
		data: {
			rows: result.rows,
			total: result.total,
			page: result.page,
			pageSize: result.pageSize,
			hasMore,
			...(result.summary ? { summary: result.summary } : {}),
		},
		meta: { count: result.total, page: result.page, pageSize: result.pageSize, hasMore },
	};
};

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
		const { data, meta } = await handlePaginatedReport(
			"tax-liability",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
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
		const { data, meta } = await handlePaginatedReport(
			"jobs",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/invoices", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"invoices",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/clients", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"clients",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/clients/retention", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"client-retention",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/payments", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"payments",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/quote-funnel", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"quotes",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/first-time-fix", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"first-time-fix",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
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
		const { data, meta } = await handlePaginatedReport(
			"reorder-forecast",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
	} catch (err) {
		next(err);
	}
});

router.get("/inventory/full", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const { data, meta } = await handlePaginatedReport(
			"inventory",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
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
		const { data, meta } = await handlePaginatedReport(
			"aged-receivables-by-client",
			orgId,
			req.query as Record<string, unknown>,
		);
		res.json(createSuccessResponse(data, meta));
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

// Server-side export for paginated reports: regenerates the full filtered set
// (all pages) from the report key + active filters, so the sheet is complete.
router.post("/export/server", requirePermission("view_reports"), async (req, res, next) => {
	try {
		const parsed = exportServerSchema.safeParse(req.body);
		if (!parsed.success) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.message));
		}

		const { report, filename, sheetName, columns, ...rest } = parsed.data;
		const def = getReportDefinition(report);
		if (!def) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, `Unknown report: ${report}`));
		}

		const orgId = req.user!.organization_id as string;
		const { rows } = await def.load(orgId, {
			startDate: rest.startDate,
			endDate: rest.endDate,
			includeInactive: rest.includeInactive,
			lookbackDays: rest.lookbackDays,
		});
		const filtered = filterRows(rows, {
			search: rest.search,
			searchTerms: rest.searchTerms,
			conditions: rest.conditions,
			join: rest.join,
			sortKey: rest.sortKey,
			sortDir: rest.sortDir,
			sortType: rest.sortType,
		});

		const mapped = filtered.map((row) =>
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
