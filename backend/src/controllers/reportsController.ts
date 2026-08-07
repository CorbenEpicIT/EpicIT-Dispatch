import { getScopedDb } from "../lib/context.js";
import { Prisma } from "../../generated/prisma/client.js";
import { centsToDollars, dollarsToCents, type TaxSnapshot } from "../services/taxEngine.js";
import { getStockStatus } from "../lib/inventory.js";
import {
	buildSqlParts,
	type ColumnDef,
	type ColumnMap,
	type DefaultOrder,
} from "../lib/reports/pushdown.js";
import type { PaginateParams } from "../lib/reports/filterEngine.js";
import { round2 } from "../lib/reports/numbers.js";
import { getOrgRealmId } from "../services/quickbooksService.js";
import { log } from "../services/appLogger.js";
import { createErrorResponse, ErrorCodes } from "../types/responses.js";

// Upper bound on rows pulled into memory for the in-JS report aggregations
const REPORT_ROW_CAP = 10000;

// Only text is searchable
const t = (expr: string): ColumnDef => ({ expr, type: "text", filterable: true, sortable: true, searchable: true });
const n = (expr: string): ColumnDef => ({ expr, type: "number", filterable: true, sortable: true, searchable: false });
const cur = (expr: string): ColumnDef => ({ expr, type: "currency", filterable: true, sortable: true, searchable: false });
const dt = (expr: string): ColumnDef => ({ expr, type: "date", filterable: true, sortable: true, searchable: false });

export interface PageResult<T> {
	rows: T[];
	total: number;
	page: number;
	pageSize: number;
}

// SQL id-prefilter: fetch a page of ids (+ total) via WHERE/ORDER/LIMIT, then
// hydrate just those ids through Prisma and re-order to match. Returns null if
// the request can't be expressed in SQL → caller uses the in-memory fallback.
async function runIdPrefilter<T>(opts: {
	sdb: ReturnType<typeof getScopedDb>;
	from: string;
	baseWhere: string;
	baseParams: unknown[];
	idExpr: string;
	columns: ColumnMap;
	defaultOrder: DefaultOrder;
	params: PaginateParams;
	hydrate: (ids: string[]) => Promise<T[]>;
	rowId: (row: T) => string;
}): Promise<(PageResult<T> & { whereSql: string; whereParams: unknown[] }) | null> {
	const parts = buildSqlParts(opts.params, opts.columns, {
		defaultOrder: opts.defaultOrder,
		idExpr: opts.idExpr,
		paramOffset: opts.baseParams.length,
	});
	if (!parts) return null;

	const whereFull = opts.baseWhere + (parts.whereSql ? ` AND ${parts.whereSql}` : "");
	const whereParams = [...opts.baseParams, ...parts.whereParams];
	const idSql = `SELECT ${opts.idExpr} AS id FROM ${opts.from} WHERE ${whereFull} ORDER BY ${parts.orderSql} LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`;
	const countSql = `SELECT COUNT(*)::int AS count FROM ${opts.from} WHERE ${whereFull}`;

	const [idRows, countRows] = await Promise.all([
		opts.sdb.$queryRawUnsafe<{ id: string }[]>(idSql, ...whereParams, parts.limit, parts.offset),
		opts.sdb.$queryRawUnsafe<{ count: number }[]>(countSql, ...whereParams),
	]);

	const ids = idRows.map((r) => r.id);
	const hydrated = await opts.hydrate(ids);
	const byId = new Map(hydrated.map((r) => [opts.rowId(r), r]));
	const rows = ids.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
	return {
		rows,
		total: countRows[0]?.count ?? 0,
		page: parts.page,
		pageSize: parts.pageSize,
		// base + dynamic, so callers can run matching aggregates
		whereSql: whereFull,
		whereParams,
	};
}

// ============================================================================
// OVERVIEW METRICS
// ============================================================================

export const getOverviewMetrics = async (
	startDate: string,
	endDate: string,
	organizationId: string,
) => {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const sdb = getScopedDb(organizationId);
	// Last Month
	const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
	const previousEnd = new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999);

	// Current period
	const [
		avgResponseTimeResult,
		convertedQuotes,
		totalQuotes,
		newOneOffJobs,
		newRecurringJobs,
		avgJobValue,
		grossRevenueResult,
	] = await Promise.all([
		sdb.$queryRaw<[{ avg_days: number | null }]>`
			SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at)) / 86400), 0)::float AS avg_days
			FROM quote q
			JOIN request r ON r.id = q.request_id
			WHERE q.created_at >= ${start}
				AND q.created_at <= ${end}
				AND q.request_id IS NOT NULL
				AND q.organization_id = ${organizationId}
		`,
		sdb.quote.count({
			where: {
				organization_id: organizationId,
				status: "Approved",
				approved_at: { gte: start, lte: end },
			},
		}),
		sdb.quote.count({
			where: {
				organization_id: organizationId,
				created_at: { gte: start, lte: end },
			},
		}),
		sdb.job.count({
			where: {
				organization_id: organizationId,
				recurring_plan_id: null,
				created_at: { gte: start, lte: end },
			},
		}),
		sdb.job.count({
			where: {
				organization_id: organizationId,
				recurring_plan_id: { not: null },
				created_at: { gte: start, lte: end },
			},
		}),
		sdb.job.aggregate({
			where: {
				organization_id: organizationId,
				created_at: { gte: start, lte: end },
			},
			_avg: { estimated_total: true },
		}),
		sdb.job_visit.aggregate({
			where: {
				status: "Completed",
				actual_end_at: { gte: start, lte: end },
				job: { organization_id: organizationId },
			},
			_sum: { total: true },
		}),
	]);

	// Last Month
	const [
		prevAvgResponseTimeResult,
		prevConvertedQuotes,
		prevTotalQuotes,
		prevOneOffJobs,
		prevRecurringJobs,
		prevAvgJobValue,
		prevGrossRevenueResult,
	] = await Promise.all([
		sdb.$queryRaw<[{ avg_days: number | null }]>`
			SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at)) / 86400), 0)::float AS avg_days
			FROM quote q
			JOIN request r ON r.id = q.request_id
			WHERE q.created_at >= ${previousStart}
				AND q.created_at <= ${previousEnd}
				AND q.request_id IS NOT NULL
				AND q.organization_id = ${organizationId}
		`,
		sdb.quote.count({
			where: {
				organization_id: organizationId,
				status: "Approved",
				approved_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		sdb.quote.count({
			where: {
				organization_id: organizationId,
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		sdb.job.count({
			where: {
				organization_id: organizationId,
				recurring_plan_id: null,
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		sdb.job.count({
			where: {
				organization_id: organizationId,
				recurring_plan_id: { not: null },
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		sdb.job.aggregate({
			where: {
				organization_id: organizationId,
				created_at: { gte: previousStart, lte: previousEnd },
			},
			_avg: { estimated_total: true },
		}),
		sdb.job_visit.aggregate({
			where: {
				status: "Completed",
				actual_end_at: { gte: previousStart, lte: previousEnd },
				job: { organization_id: organizationId },
			},
			_sum: { total: true },
		}),
	]);

	// Calculates all unscheduled jobs
	const backlogResult = await sdb.job.aggregate({
		where: { organization_id: organizationId, status: "Unscheduled" },
		_sum: { estimated_total: true },
	});

	const calcChange = (current: number, previous: number): number => {
		if (previous === 0) return current > 0 ? 100 : 0;
		return Math.round(((current - previous) / previous) * 100);
	};

	const convRate =
		totalQuotes > 0
			? Math.round((convertedQuotes / totalQuotes) * 100)
			: 0;
	const prevConvRate =
		prevTotalQuotes > 0
			? Math.round((prevConvertedQuotes / prevTotalQuotes) * 100)
			: 0;

	const avgValue = Number(avgJobValue._avg.estimated_total ?? 0);
	const prevAvgValue = Number(prevAvgJobValue._avg.estimated_total ?? 0);

	const grossRevenue = Number(grossRevenueResult._sum.total ?? 0);
	const prevGrossRevenue = Number(prevGrossRevenueResult._sum.total ?? 0);
	const backlogValue = Number(backlogResult._sum.estimated_total ?? 0);

	const avgResponseDays = Math.round((avgResponseTimeResult[0]?.avg_days ?? 0) * 10) / 10;
	const prevAvgResponseDays = Math.round((prevAvgResponseTimeResult[0]?.avg_days ?? 0) * 10) / 10;

	return {
		periodStart: start.toISOString(),
		periodEnd: end.toISOString(),
		previousPeriodStart: previousStart.toISOString(),
		previousPeriodEnd: previousEnd.toISOString(),
		grossRevenue: {
			value: Math.round(grossRevenue * 100) / 100,
			previousValue: Math.round(prevGrossRevenue * 100) / 100,
			changePercent: calcChange(grossRevenue, prevGrossRevenue),
		},
		avgResponseTime: {
			value: avgResponseDays,
			previousValue: prevAvgResponseDays,
			changePercent: calcChange(avgResponseDays, prevAvgResponseDays),
		},
		convertedQuotes: {
			value: convertedQuotes,
			previousValue: prevConvertedQuotes,
			changePercent: calcChange(convertedQuotes, prevConvertedQuotes),
		},
		conversionRate: {
			value: convRate,
			previousValue: prevConvRate,
			changePercent: calcChange(convRate, prevConvRate),
		},
		newOneOffJobs: {
			value: newOneOffJobs,
			previousValue: prevOneOffJobs,
			changePercent: calcChange(newOneOffJobs, prevOneOffJobs),
		},
		newRecurringJobs: {
			value: newRecurringJobs,
			previousValue: prevRecurringJobs,
			changePercent: calcChange(newRecurringJobs, prevRecurringJobs),
		},
		avgJobValue: {
			value: Math.round(avgValue),
			previousValue: Math.round(prevAvgValue),
			changePercent: calcChange(avgValue, prevAvgValue),
		},
		unscheduledBacklog: {
			value: Math.round(backlogValue * 100) / 100,
			previousValue: 0,
			changePercent: 0,
		},
	};
};

// ============================================================================
// REVENUE YEAR TO DATE
// ============================================================================

interface MonthlyRevenueRow {
	month: number;
	year: number;
	total: string;
}

export const getRevenueYTD = async (
	organizationId: string,
	year?: number,
) => {
	const currentYear = year ?? new Date().getFullYear();
	const previousYear = currentYear - 1;

	const sdb = getScopedDb(organizationId);

	const previousYearStart = new Date(`${previousYear}-01-01T00:00:00.000Z`);
	const currentYearEnd = new Date(`${currentYear + 1}-01-01T00:00:00.000Z`);

	const [monthlyRevenue, monthlyForecast] = await Promise.all([
		sdb.$queryRaw<MonthlyRevenueRow[]>`
			SELECT
				EXTRACT(MONTH FROM jv.actual_end_at)::int AS month,
				EXTRACT(YEAR FROM jv.actual_end_at)::int AS year,
				SUM(jv.total)::text AS total
			FROM job_visit jv
			JOIN job j ON j.id = jv.job_id
			WHERE jv.status = 'Completed'
				AND jv.actual_end_at >= ${previousYearStart}
				AND jv.actual_end_at < ${currentYearEnd}
				AND j.organization_id = ${organizationId}
			GROUP BY year, month
			ORDER BY year, month
		`,
		sdb.$queryRaw<MonthlyRevenueRow[]>`
			SELECT
				EXTRACT(MONTH FROM jv.scheduled_start_at)::int AS month,
				EXTRACT(YEAR FROM jv.scheduled_start_at)::int AS year,
				SUM(jv.total)::text AS total
			FROM job_visit jv
			JOIN job j ON j.id = jv.job_id
			WHERE jv.status IN ('Scheduled', 'InProgress')
				AND jv.scheduled_start_at >= ${previousYearStart}
				AND jv.scheduled_start_at < ${currentYearEnd}
				AND j.organization_id = ${organizationId}
			GROUP BY year, month
			ORDER BY year, month
		`,
	]);

	const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul",
		"Aug","Sep","Oct","Nov","Dec",
	];

	const findTotal = (
		rows: MonthlyRevenueRow[],
		y: number,
		m: number,
	): number => {
		const row = rows.find((r) => r.year === y && r.month === m);
		return row ? parseFloat(row.total) : 0;
	};

	const data = months.map((month, index) => ({
		month,
		currentYear: findTotal(monthlyRevenue, currentYear, index + 1),
		previousYear: findTotal(monthlyRevenue, previousYear, index + 1),
		forecast: findTotal(monthlyForecast, currentYear, index + 1),
	}));

	const total = data.reduce((sum, d) => sum + d.currentYear, 0);

	return {
		data,
		total,
		year: currentYear,
	};
};

// ============================================================================
// REVENUE BY JOB TYPE
// ============================================================================

export const getRevenueByJobType = async (
	startDate: string,
	endDate: string,
	organizationId: string,
) => {
	const start = new Date(startDate);
	const end = new Date(endDate);

	const sdb = getScopedDb(organizationId);

	const baseWhere = {
		status: "Completed" as const,
		actual_end_at: { gte: start, lte: end },
		job: { organization_id: organizationId },
	};

	const [oneTimeResult, recurringResult] = await Promise.all([
		sdb.job_visit.aggregate({
			_sum: { total: true },
			where: {
				...baseWhere,
				job: { organization_id: organizationId, recurring_plan_id: null },
			},
		}),
		sdb.job_visit.aggregate({
			_sum: { total: true },
			where: {
				...baseWhere,
				job: { organization_id: organizationId, recurring_plan_id: { not: null } },
			},
		}),
	]);

	const oneTimeRevenue = Number(oneTimeResult._sum?.total ?? 0);
	const recurringRevenue = Number(recurringResult._sum?.total ?? 0);

	return {
		data: [
			{ type: "One-Time", revenue: oneTimeRevenue },
			{ type: "Recurring", revenue: recurringRevenue },
		],
		total: oneTimeRevenue + recurringRevenue,
	};
};

// ============================================================================
// LEADS BY SOURCE
// ============================================================================

export const getLeadsBySource = async (
	startDate: string,
	endDate: string,
	organizationId: string,
) => {
	const start = new Date(startDate);
	start.setUTCHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setUTCHours(23, 59, 59, 999);
	const sdb = getScopedDb(organizationId);

	// Count of requests/leads grouped by the source
	const rows = await sdb.$queryRaw<{ source: string; count: number }[]>`
		SELECT
			LOWER(TRIM(source)) AS source,
			COUNT(*)::int AS count
		FROM request
		WHERE organization_id = ${organizationId}
			AND created_at >= ${start}
			AND created_at <= ${end}
			AND source IS NOT NULL
			AND TRIM(source) <> ''
		GROUP BY LOWER(TRIM(source))
		ORDER BY count DESC
	`;

	const toTitleCase = (s: string) =>
		s
			.split(/\s+/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");

	let total = 0;
	const data = rows.map((row) => {
		total += row.count;
		return { source: toTitleCase(row.source), count: row.count };
	});

	return { data, total };
};

// ============================================================================
// UNSCHEDULED REVENUE
// ============================================================================

export const getUnscheduledRevenue = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	const results = await sdb.$queryRaw<{ bucket: string, count: number, revenue: string }[]>`
		SELECT
			CASE
				WHEN EXTRACT(DAY FROM (NOW() - created_at)) > 30 THEN 'critical'
				WHEN EXTRACT(DAY FROM (NOW() - created_at)) >= 7 THEN 'warning'
				ELSE 'new'
			END AS bucket,
			COUNT(*)::int AS count,
			COALESCE(SUM(estimated_total), 0)::text AS revenue
		FROM job
		WHERE status = 'Unscheduled'
			AND organization_id = ${organizationId}
		GROUP BY bucket
	`;

	const buckets = {
		new: { revenue: 0, count: 0 },
		warning: { revenue: 0, count: 0 },
		critical: { revenue: 0, count: 0 },
	};

	let totalRevenue = 0;
	let jobCount = 0;

	for (const row of results) {
		const rev = Number(row.revenue);
		const count = row.count;
		const b = row.bucket as keyof typeof buckets;

		buckets[b].revenue = Math.round(rev * 100) / 100;
		buckets[b].count = count;

		totalRevenue += rev;
		jobCount += count;
	}

	return {
		totalRevenue: Math.round(totalRevenue * 100) / 100,
		jobCount,
		new: buckets.new,
		warning: buckets.warning,
		critical: buckets.critical,
	};
};

// ============================================================================
// ARRIVAL PERFORMANCE
// ============================================================================

const ARRIVAL_EARLY_SECONDS = -900;
const ARRIVAL_LATE_SECONDS = 1800;

export const classifyArrival = (
	scheduledStartAt: Date,
	actualStartAt: Date | null,
): "Early" | "On Time" | "Late" | null => {
	if (!actualStartAt) return null;
	const deltaSeconds = (actualStartAt.getTime() - scheduledStartAt.getTime()) / 1000;
	if (deltaSeconds < ARRIVAL_EARLY_SECONDS) return "Early";
	if (deltaSeconds > ARRIVAL_LATE_SECONDS) return "Late";
	return "On Time";
};

export const getArrivalPerformance = async (
	startDate: string,
	endDate: string,
	organizationId: string,
) => {
	const start = new Date(startDate);
	const end   = new Date(endDate);
	start.setUTCHours(0, 0, 0, 0);
	end.setUTCHours(23, 59, 59, 999);

	const sdb = getScopedDb(organizationId);
	const result = await sdb.$queryRaw<[{ early: number, on_time: number, late: number }]>`
		SELECT
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) < ${ARRIVAL_EARLY_SECONDS} THEN 1 END)::int AS early,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) > ${ARRIVAL_LATE_SECONDS} THEN 1 END)::int AS late,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) BETWEEN ${ARRIVAL_EARLY_SECONDS} AND ${ARRIVAL_LATE_SECONDS} THEN 1 END)::int AS on_time
		FROM job_visit jv
		JOIN job j ON j.id = jv.job_id
		WHERE jv.actual_start_at IS NOT NULL
			AND jv.actual_start_at >= ${start}
			AND jv.actual_start_at <= ${end}
			AND j.organization_id = ${organizationId}
	`;

	const stats = result[0] || { early: 0, on_time: 0, late: 0 };
	const total = stats.early + stats.on_time + stats.late;
	const onTimeRate = total > 0 ? Math.round(((stats.early + stats.on_time) / total) * 100) : 0;

	return {
		early: stats.early,
		onTime: stats.on_time,
		late: stats.late,
		total,
		onTimeRate,
	};
};

// ============================================================================
// QUOTE PIPELINE
// ============================================================================

export const getQuotePipeline = async (startDate: string, endDate: string, organizationId: string) => {
	const start = new Date(startDate);
	const end   = new Date(endDate);
	start.setUTCHours(0, 0, 0, 0);
	end.setUTCHours(23, 59, 59, 999);

	const OPEN_STATUSES = ["Draft", "Sent", "Viewed"] as const;

	const sdb = getScopedDb(organizationId);
	const grouped = await sdb.quote.groupBy({
		by: ["status"],
		where: {
			organization_id: organizationId,
			status: { in: [...OPEN_STATUSES] },
			created_at: { gte: start, lte: end },
		},
		_sum: { total: true },
		_count: { _all: true },
	});

	const buckets = {
		Draft: { revenue: 0, count: 0 },
		Sent: { revenue: 0, count: 0 },
		Viewed: { revenue: 0, count: 0 },
	};

	let totalRevenue = 0;
	let quoteCount = 0;

	for (const group of grouped) {
		const revenue = Number(group._sum?.total ?? 0);
		const count = group._count?._all ?? 0;

		buckets[group.status as keyof typeof buckets] = {
			revenue: Math.round(revenue * 100) / 100,
			count,
		};

		totalRevenue += revenue;
		quoteCount += count;
	}

	return {
		totalRevenue: Math.round(totalRevenue * 100) / 100,
		quoteCount,
		draft: buckets.Draft,
		sent: buckets.Sent,
		viewed: buckets.Viewed,
	};
};

// ============================================================================
// MILEAGE REPORT
// ============================================================================

export interface MileageReportVisitRow {
	visitId: string;
	jobId: string;
	jobName: string;
	jobAddress: string;
	clientName: string;
	visitDate: string; 
	miles: number;
	visitStatus: string;
	technicianNames: string; // multiple techs can be on one job visit
}

export const getMileageReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
): Promise<MileageReportVisitRow[]> => {
	const sdb = getScopedDb(organizationId);

	const dateFilter: { gte?: Date; lte?: Date } = {};
	if (startDate) {
		const s = new Date(startDate);
		s.setUTCHours(0, 0, 0, 0);
		dateFilter.gte = s;
	}
	if (endDate) {
		const e = new Date(endDate);
		e.setUTCHours(23, 59, 59, 999);
		dateFilter.lte = e;
	}

	const visits = await sdb.job_visit.findMany({
		where: {
			estimated_drive_miles: { not: null },
			job: { organization_id: organizationId },
			...(Object.keys(dateFilter).length && { scheduled_start_at: dateFilter }),
		},
		include: {
			job: {
				select: {
					id: true,
					name: true,
					address: true,
					client: { select: { name: true } },
				},
			},
			visit_techs: {
				include: { tech: { select: { id: true, name: true } } },
			},
		},
		orderBy: { scheduled_start_at: "desc" },
	});

	return visits.map((v) => ({
		visitId: v.id,
		jobId: v.job.id,
		jobName: v.job.name,
		jobAddress: v.job.address,
		clientName: v.job.client?.name ?? "Unknown Client",
		visitDate: v.scheduled_start_at.toISOString(),
		miles: Number(v.estimated_drive_miles ?? 0),
		visitStatus: v.status,
		technicianNames: v.visit_techs.map((vt) => vt.tech.name).join(", ") || "Unassigned",
	}));
};

// ============================================================================
// TIMESHEETS REPORT
// ============================================================================

export interface TimesheetReportRow {
	shiftId: string;
	technicianId: string;
	technicianName: string;
	startedAt: string;
	endedAt: string;
	grossHours: number;
	breakHours: number;
	payableHours: number;
}

export const getTimesheetReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
): Promise<TimesheetReportRow[]> => {
	const sdb = getScopedDb(organizationId);

	const dateFilter: { gte?: Date; lte?: Date } = {};
	if (startDate) {
		const s = new Date(startDate);
		s.setUTCHours(0, 0, 0, 0);
		dateFilter.gte = s;
	}
	if (endDate) {
		const e = new Date(endDate);
		e.setUTCHours(23, 59, 59, 999);
		dateFilter.lte = e;
	}

	const shifts = await sdb.technician_shift.findMany({
		where: {
			org_id: organizationId,
			ended_at: { not: null },
			payable_hours: { not: null },
			...(Object.keys(dateFilter).length && { started_at: dateFilter }),
		},
		include: {
			tech: { select: { id: true, name: true } },
		},
		orderBy: { started_at: "desc" },
	});

	return shifts.map((s) => ({
		shiftId: s.id,
		technicianId: s.tech.id,
		technicianName: s.tech.name,
		startedAt: s.started_at.toISOString(),
		endedAt: s.ended_at!.toISOString(),
		grossHours: Number(s.gross_hours ?? 0),
		breakHours: Number(s.break_hours ?? 0),
		payableHours: Number(s.payable_hours),
	}));
};

// ============================================================================
// INVENTORY REORDER FORECAST
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

//Forecast of the last 90 days of inventory usage
export const getInventoryReorderForecast = async (
	organizationId: string,
	opts: { lookbackDays: number },
) => {
	const { lookbackDays } = opts;
	const sdb = getScopedDb(organizationId);
	const cutoff = new Date(Date.now() - lookbackDays * DAY_MS);

	const rows = await sdb.$queryRaw<
		{
			itemId: string;
			itemName: string;
			sku: string | null;
			category: string | null;
			unit: string;
			warehouseQty: number;
			qtyConsumed: number | null;
		}[]
	>`
		SELECT
			ii.id AS "itemId",
			ii.name AS "itemName",
			ii.sku AS "sku",
			ii.category AS "category",
			ii.unit AS "unit",
			ii.quantity::float AS "warehouseQty",
			COALESCE((
				SELECT SUM(sm.qty)
				FROM stock_movement sm
				WHERE sm.inventory_item_id = ii.id
					AND sm.organization_id = ${organizationId}
					AND sm.reason IN ('parts_used', 'direct_consumption')
					AND sm.created_at >= ${cutoff}
			), 0)::float                                AS "qtyConsumed"
		FROM inventory_item ii
		WHERE ii.organization_id = ${organizationId}
			AND ii.is_active = true
	`;

	const now = Date.now();

	const built = rows.map((r) => {
		const currentQuantity = r.warehouseQty;
		const qtyConsumed = Number(r.qtyConsumed ?? 0);
		const avgDailyUsage = lookbackDays > 0 ? qtyConsumed / lookbackDays : 0;
		const hasUsage = avgDailyUsage > 0;

		const daysOfStock = hasUsage ? currentQuantity / avgDailyUsage : null;
		const projectedStockoutDate =
			daysOfStock === null ? null : new Date(now + daysOfStock * DAY_MS).toISOString();

		return {
			itemId: r.itemId,
			itemName: r.itemName,
			sku: r.sku ?? null,
			category: r.category ?? null,
			unit: r.unit,
			currentQuantity,
			qtyConsumed,
			avgDailyUsage,
			daysOfStock,
			projectedStockoutDate,
		};
	});

	// Shortest projected stockout first and items with no usage last
	built.sort((a, b) => {
		const aT = a.projectedStockoutDate ? new Date(a.projectedStockoutDate).getTime() : Infinity;
		const bT = b.projectedStockoutDate ? new Date(b.projectedStockoutDate).getTime() : Infinity;
		return aT - bT;
	});

	return built;
};

const INVENTORY_INCLUDE = {
	tags: { orderBy: { label: "asc" } },
	vehicle_stocks: { select: { qty_on_hand: true, qty_standard: true } },
} satisfies Prisma.inventory_itemInclude;

const inventoryBaseWhere = (includeInactive: boolean): Record<string, unknown> => ({
	provisional: false,
	...(includeInactive ? {} : { is_active: true }),
});

// Usage totals (qty consumed) per item, keyed by item id, over an optional range.
const inventoryUsageByItem = async (
	sdb: ReturnType<typeof getScopedDb>,
	organizationId: string,
	from?: Date,
	to?: Date,
	itemIds?: string[],
): Promise<Map<string, number>> => {
	const usage = await sdb.stock_movement.groupBy({
		by: ["inventory_item_id"],
		where: {
			organization_id: organizationId,
			reason: { in: ["parts_used", "direct_consumption"] },
			...(from && to ? { created_at: { gte: from, lte: to } } : {}),
			...(itemIds ? { inventory_item_id: { in: itemIds } } : {}),
		},
		_sum: { qty: true },
	});
	return new Map(usage.map((u) => [u.inventory_item_id, Number(u._sum.qty ?? 0)]));
};

const mapInventoryItem = (
	item: Prisma.inventory_itemGetPayload<{ include: typeof INVENTORY_INCLUDE }>,
	usageByItem: Map<string, number>,
) => {
	const fleetQty = item.vehicle_stocks.reduce((sum, vs) => sum + Number(vs.qty_on_hand ?? 0), 0);
	const fleetStandard = item.vehicle_stocks.reduce(
		(sum, vs) => sum + Number(vs.qty_standard ?? 0),
		0,
	);
	const warehouseQty = item.quantity;
	const totalQty = warehouseQty + fleetQty;
	const cost = item.cost != null ? Number(item.cost) : null;

	return {
		id: item.id,
		name: item.name,
		sku: item.sku ?? null,
		category: item.category ?? null,
		description: item.description,
		unit: item.unit,
		isActive: item.is_active,
		quantity: warehouseQty,
		fleetQty,
		fleetStandard,
		totalQty,
		lowStockThreshold: item.low_stock_threshold,
		cost,
		unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
		assetValue: cost != null ? cost * totalQty : null,
		qtyUsed: usageByItem.get(item.id) ?? 0,
		stockStatus: getStockStatus(warehouseQty, item.low_stock_threshold),
		location: item.location,
		tags: item.tags,
		altIds: item.alt_ids,
		updatedAt: item.updated_at,
	};
};

export const getInventoryReport = async (
	organizationId: string,
	opts: { from?: Date; to?: Date; includeInactive: boolean },
) => {
	const { from, to, includeInactive } = opts;
	const sdb = getScopedDb(organizationId);

	const items = await sdb.inventory_item.findMany({
		where: inventoryBaseWhere(includeInactive),
		orderBy: { name: "asc" },
		include: INVENTORY_INCLUDE,
	});
	const usageByItem = await inventoryUsageByItem(sdb, organizationId, from, to);
	return items.map((item) => mapInventoryItem(item, usageByItem));
};

const FLEET_ON_HAND =
	'(SELECT COALESCE(SUM(vs.qty_on_hand), 0) FROM "vehicle_stock_item" vs WHERE vs.inventory_item_id = ii.id)';

const INVENTORY_SQL_COLUMNS: ColumnMap = {
	itemName: t("ii.name"),
	sku: t("ii.sku"),
	category: t("ii.category"),
	description: t("ii.description"),
	unit: t("ii.unit"),
	location: t("ii.location"),
	status: t("CASE WHEN ii.is_active THEN 'Active' ELSE 'Discontinued' END"),
	quantity: n("ii.quantity"),
	lowStockThreshold: n("ii.low_stock_threshold"),
	cost: cur("ii.cost"),
	unitPrice: cur("ii.unit_price"),
	fleetQty: n(FLEET_ON_HAND),
	fleetStandard: n(
		'(SELECT COALESCE(SUM(vs.qty_standard), 0) FROM "vehicle_stock_item" vs WHERE vs.inventory_item_id = ii.id)',
	),
	totalQty: n(`(ii.quantity + ${FLEET_ON_HAND})`),
	assetValue: cur(`(ii.cost * (ii.quantity + ${FLEET_ON_HAND}))`),
	updatedAt: dt("ii.updated_at"),
};

export const getInventoryReportPage = async (
	organizationId: string,
	opts: { from?: Date; to?: Date; includeInactive: boolean },
	params: PaginateParams,
) => {
	const { from, to, includeInactive } = opts;
	const sdb = getScopedDb(organizationId);
	const baseParams: unknown[] = [organizationId];
	let baseWhere = "ii.organization_id = $1 AND ii.provisional = false";
	if (!includeInactive) baseWhere += " AND ii.is_active = true";

	const res = await runIdPrefilter({
		sdb,
		from: '"inventory_item" ii',
		baseWhere,
		baseParams,
		idExpr: "ii.id",
		columns: INVENTORY_SQL_COLUMNS,
		defaultOrder: { expr: "ii.name", dir: "asc" },
		params,
		hydrate: (ids) =>
			sdb.inventory_item.findMany({ where: { id: { in: ids } }, include: INVENTORY_INCLUDE }),
		rowId: (r) => r.id,
	});
	if (!res) return null;
	const usageByItem = await inventoryUsageByItem(
		sdb,
		organizationId,
		from,
		to,
		res.rows.map((i) => i.id),
	);
	return {
		rows: res.rows.map((item) => mapInventoryItem(item, usageByItem)),
		total: res.total,
		page: res.page,
		pageSize: res.pageSize,
	};
};

// ============================================================================
// AGED RECEIVABLES
// ============================================================================

// Outstanding invoice balances bucketed by how far past due
export const getAgedReceivables = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);

	const rows = await sdb.$queryRaw<
		{ bucket: string; count: number; amount: number | null }[]
	>`
		SELECT
			CASE
				WHEN COALESCE(due_date, created_at) > NOW() - INTERVAL '31 days' THEN '0-30'
				WHEN COALESCE(due_date, created_at) > NOW() - INTERVAL '61 days' THEN '31-60'
				WHEN COALESCE(due_date, created_at) > NOW() - INTERVAL '91 days' THEN '61-90'
				ELSE '90+'
			END AS bucket,
			COUNT(*)::int          AS count,
			SUM(balance_due)::float AS amount
		FROM invoice
		WHERE organization_id = ${organizationId}
			AND status NOT IN ('Draft', 'Paid', 'Void')
			AND balance_due > 0
			AND COALESCE(due_date, created_at) <= NOW()
		GROUP BY bucket
	`;

	const BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
	const byBucket = new Map(rows.map((r) => [r.bucket, r]));

	const data = BUCKETS.map((bucket) => {
		const row = byBucket.get(bucket);
		return {
			bucket,
			amount: Math.round(Number(row?.amount ?? 0) * 100) / 100,
			count: row?.count ?? 0,
		};
	});

	return {
		data,
		totalOutstanding: data.reduce((sum, d) => sum + d.amount, 0),
	};
};

// Outstanding invoice balances bucketed by age and grouped per client
export const getAgedReceivablesByClient = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);

	const rows = await sdb.$queryRaw<
		{
			clientId: string;
			clientName: string;
			bucket0_30: number | null;
			bucket31_60: number | null;
			bucket61_90: number | null;
			bucket90plus: number | null;
			total: number | null;
			count: number;
		}[]
	>`
		SELECT
			c.id   AS "clientId",
			c.name AS "clientName",
			SUM(CASE WHEN COALESCE(i.due_date, i.created_at) > NOW() - INTERVAL '31 days'
				THEN i.balance_due ELSE 0 END)::float AS "bucket0_30",
			SUM(CASE WHEN COALESCE(i.due_date, i.created_at) <= NOW() - INTERVAL '31 days'
					  AND COALESCE(i.due_date, i.created_at) >  NOW() - INTERVAL '61 days'
				THEN i.balance_due ELSE 0 END)::float AS "bucket31_60",
			SUM(CASE WHEN COALESCE(i.due_date, i.created_at) <= NOW() - INTERVAL '61 days'
					  AND COALESCE(i.due_date, i.created_at) >  NOW() - INTERVAL '91 days'
				THEN i.balance_due ELSE 0 END)::float AS "bucket61_90",
			SUM(CASE WHEN COALESCE(i.due_date, i.created_at) <= NOW() - INTERVAL '91 days'
				THEN i.balance_due ELSE 0 END)::float AS "bucket90plus",
			SUM(i.balance_due)::float AS "total",
			COUNT(*)::int             AS "count"
		FROM invoice i
		JOIN client c ON c.id = i.client_id
		WHERE i.organization_id = ${organizationId}
			AND i.status NOT IN ('Draft', 'Paid', 'Void')
			AND i.balance_due > 0
			AND COALESCE(i.due_date, i.created_at) <= NOW()
		GROUP BY c.id, c.name
		ORDER BY "total" DESC
	`;

	return rows.map((r) => ({
		clientId: r.clientId,
		clientName: r.clientName,
		bucket0_30: round2(r.bucket0_30),
		bucket31_60: round2(r.bucket31_60),
		bucket61_90: round2(r.bucket61_90),
		bucket90plus: round2(r.bucket90plus),
		total: round2(r.total),
		count: r.count,
	}));
};

const buildDateFilter = (startDate?: string, endDate?: string) => {
	const filter: { gte?: Date; lte?: Date } = {};
	if (startDate) {
		const s = new Date(startDate);
		s.setUTCHours(0, 0, 0, 0);
		filter.gte = s;
	}
	if (endDate) {
		const e = new Date(endDate);
		e.setUTCHours(23, 59, 59, 999);
		filter.lte = e;
	}
	return filter;
};

export interface TaxLiabilityRow {
	rateKey: string;
	jurisdiction: string;
	rateName: string;
	rate: number;
	taxableBase: number;
	taxCollected: number;
	invoiceCount: number;
}

const UNCATEGORIZED_KEY = "__uncategorized__";

export const getTaxLiabilityReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
): Promise<TaxLiabilityRow[]> => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const invoices = await sdb.invoice.findMany({
		where: {
			organization_id: organizationId,
			status: { notIn: ["Draft", "Void"] },
			...(Object.keys(dateFilter).length && {
				OR: [
					{ issue_date: dateFilter },
					{ issue_date: null, created_at: dateFilter },
				],
			}),
		},
		select: {
			id: true,
			tax_amount: true,
			tax_snapshot: true,
			tax_rate: true,
			subtotal: true,
			discount_amount: true,
		},
	});

	const acc = new Map<
		string,
		{
			jurisdiction: string;
			rateName: string;
			rate: number;
			taxableBaseCents: number;
			taxCollectedCents: number;
			invoiceIds: Set<string>;
		}
	>();

	const add = (
		key: string,
		jurisdiction: string,
		rateName: string,
		rate: number,
		taxableBaseCents: number,
		taxCollectedCents: number,
		invoiceId: string,
	) => {
		const existing = acc.get(key);
		if (existing) {
			existing.taxableBaseCents += taxableBaseCents;
			existing.taxCollectedCents += taxCollectedCents;
			existing.invoiceIds.add(invoiceId);
		} else {
			acc.set(key, {
				jurisdiction,
				rateName,
				rate,
				taxableBaseCents,
				taxCollectedCents,
				invoiceIds: new Set([invoiceId]),
			});
		}
	};

	for (const invoice of invoices) {
		const snapshot = invoice.tax_snapshot as TaxSnapshot | null;
		const hasGroups =
			snapshot != null &&
			snapshot.locked_at !== "draft" &&
			Array.isArray(snapshot.groups) &&
			snapshot.groups.length > 0;

		if (!hasGroups) {
			const taxAmountCents = dollarsToCents(Number(invoice.tax_amount));
			if (taxAmountCents > 0) {
				const rate = Number(invoice.tax_rate);
				const taxableBaseCents = Math.max(
					0,
					dollarsToCents(Number(invoice.subtotal) - Number(invoice.discount_amount)),
				);
				add(
					`${UNCATEGORIZED_KEY}:${rate}`,
					"Uncategorized",
					"Uncategorized",
					rate,
					taxableBaseCents,
					taxAmountCents,
					invoice.id,
				);
			}
			continue;
		}

		for (const group of snapshot.groups) {
			const taxableCents = group.taxable_amount_cents;
			const rawPerRate = group.rates.map((r) => Math.floor(taxableCents * r.rate));
			const rawSum = rawPerRate.reduce((sum, n) => sum + n, 0);
			const remainder = group.tax_amount_cents - rawSum;

			group.rates.forEach((r, idx) => {
				const isLast = idx === group.rates.length - 1;
				const rateTaxCents = rawPerRate[idx] + (isLast ? remainder : 0);
				const key = `${r.id}:${r.rate}`;
				add(
					key,
					r.jurisdiction ?? "—",
					r.name,
					r.rate,
					taxableCents,
					rateTaxCents,
					invoice.id,
				);
			});
		}
	}

	return Array.from(acc.entries())
		.filter(([, v]) => v.taxCollectedCents > 0)
		.map(([rateKey, v]) => ({
			rateKey,
			jurisdiction: v.jurisdiction,
			rateName: v.rateName,
			rate: v.rate,
			taxableBase: centsToDollars(v.taxableBaseCents),
			taxCollected: centsToDollars(v.taxCollectedCents),
			invoiceCount: v.invoiceIds.size,
		}))
		.sort((a, b) => b.taxCollected - a.taxCollected);
};

// ============================================================================
// JOBS
// ============================================================================

const JOBS_INCLUDE = {
	client: { select: { name: true } },
	_count: { select: { visits: true } },
} satisfies Prisma.jobInclude;

const jobsBaseWhere = (
	organizationId: string,
	startDate?: string,
	endDate?: string,
): Record<string, unknown> => {
	const dateFilter = buildDateFilter(startDate, endDate);
	return {
		organization_id: organizationId,
		...(Object.keys(dateFilter).length && { created_at: dateFilter }),
	};
};

const mapJobRaw = (job: Prisma.jobGetPayload<{ include: typeof JOBS_INCLUDE }>) => {
	const estimatedTotal = job.estimated_total != null ? Number(job.estimated_total) : null;
	const actualTotal = job.actual_total != null ? Number(job.actual_total) : null;
	const variance =
		estimatedTotal != null && actualTotal != null ? actualTotal - estimatedTotal : null;
	const source = job.quote_id
		? "Quote"
		: job.recurring_plan_id
			? "Recurring Plan"
			: job.request_id
				? "Request"
				: "Manual";

	return {
		id: job.id,
		jobNumber: job.job_number,
		name: job.name,
		clientName: job.client.name,
		status: job.status,
		priority: job.priority,
		jobType: job.recurring_plan_id ? "Recurring" : "One-off",
		source,
		address: job.address,
		createdAt: job.created_at,
		completedAt: job.completed_at,
		cancelledAt: job.cancelled_at,
		estimatedTotal,
		actualTotal,
		variance,
		subtotal: Number(job.subtotal),
		taxAmount: Number(job.tax_amount),
		discountAmount: job.discount_amount != null ? Number(job.discount_amount) : null,
		visitCount: job._count.visits,
	};
};

export const getJobsReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const jobs = await sdb.job.findMany({
		where: jobsBaseWhere(organizationId, startDate, endDate),
		orderBy: { created_at: "desc" },
		include: JOBS_INCLUDE,
	});
	return jobs.map(mapJobRaw);
};

// j = job, c = client
const JOBS_SQL_COLUMNS: ColumnMap = {
	jobNumber: t("j.job_number"),
	name: t("j.name"),
	clientName: t("c.name"),
	status: t("j.status::text"),
	priority: t("j.priority::text"),
	jobType: t("CASE WHEN j.recurring_plan_id IS NOT NULL THEN 'Recurring' ELSE 'One-off' END"),
	source: t(
		"CASE WHEN j.quote_id IS NOT NULL THEN 'Quote' WHEN j.recurring_plan_id IS NOT NULL THEN 'Recurring Plan' WHEN j.request_id IS NOT NULL THEN 'Request' ELSE 'Manual' END",
	),
	address: t("j.address"),
	createdAt: dt("j.created_at"),
	completedAt: dt("j.completed_at"),
	cancelledAt: dt("j.cancelled_at"),
	estimatedTotal: cur("j.estimated_total"),
	actualTotal: cur("j.actual_total"),
	variance: cur("(j.actual_total - j.estimated_total)"),
	subtotal: cur("j.subtotal"),
	taxAmount: cur("j.tax_amount"),
	discountAmount: cur("j.discount_amount"),
	visitCount: n('(SELECT COUNT(*) FROM "job_visit" v WHERE v.job_id = j.id)'),
};

export const getJobsReportPage = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
	params: PaginateParams,
): Promise<PageResult<ReturnType<typeof mapJobRaw>> | null> => {
	const sdb = getScopedDb(organizationId);
	const df = buildDateFilter(startDate, endDate);
	const baseParams: unknown[] = [organizationId];
	let baseWhere = "j.organization_id = $1";
	if (df.gte) baseWhere += ` AND j.created_at >= $${baseParams.push(df.gte)}`;
	if (df.lte) baseWhere += ` AND j.created_at <= $${baseParams.push(df.lte)}`;

	const res = await runIdPrefilter({
		sdb,
		from: '"job" j JOIN "client" c ON c.id = j.client_id',
		baseWhere,
		baseParams,
		idExpr: "j.id",
		columns: JOBS_SQL_COLUMNS,
		defaultOrder: { expr: "j.created_at", dir: "desc" },
		params,
		hydrate: (ids) => sdb.job.findMany({ where: { id: { in: ids } }, include: JOBS_INCLUDE }),
		rowId: (r) => r.id,
	});
	if (!res) return null;
	return { rows: res.rows.map(mapJobRaw), total: res.total, page: res.page, pageSize: res.pageSize };
};

// ============================================================================
// FIRST-TIME FIX RATE
// ============================================================================

const FTFR_INCLUDE = {
	client: { select: { name: true } },
	_count: { select: { visits: true } },
} satisfies Prisma.jobInclude;

const mapFtfrRaw = (job: Prisma.jobGetPayload<{ include: typeof FTFR_INCLUDE }>) => ({
	id: job.id,
	jobNumber: job.job_number,
	name: job.name,
	clientName: job.client.name,
	completedAt: job.completed_at,
	visitCount: job._count.visits,
	firstTimeFix: job._count.visits === 1,
});

export const getFirstTimeFixReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);
	const jobs = await sdb.job.findMany({
		where: {
			organization_id: organizationId,
			status: "Completed",
			visits: { some: {} },
			...(Object.keys(dateFilter).length && { completed_at: dateFilter }),
		},
		orderBy: { completed_at: "desc" },
		include: FTFR_INCLUDE,
	});
	return jobs.map(mapFtfrRaw);
};

// ============================================================================
// INVOICES
// ============================================================================

const INVOICES_INCLUDE = { client: { select: { name: true } } } satisfies Prisma.invoiceInclude;

const invoicesBaseWhere = (
	organizationId: string,
	startDate?: string,
	endDate?: string,
): Record<string, unknown> => {
	const dateFilter = buildDateFilter(startDate, endDate);
	return {
		organization_id: organizationId,
		...(Object.keys(dateFilter).length && {
			OR: [{ issue_date: dateFilter }, { issue_date: null, created_at: dateFilter }],
		}),
	};
};

const mapInvoiceRaw = (invoice: Prisma.invoiceGetPayload<{ include: typeof INVOICES_INCLUDE }>) => {
	const balanceDue = Number(invoice.balance_due);
	const dueDate = invoice.due_date;
	const now = Date.now();
	const daysOverdue =
		balanceDue > 0 && dueDate && dueDate.getTime() < now
			? Math.floor((now - dueDate.getTime()) / DAY_MS)
			: 0;

	return {
		id: invoice.id,
		invoiceNumber: invoice.invoice_number,
		clientName: invoice.client.name,
		status: invoice.status,
		issueDate: invoice.issue_date,
		dueDate: invoice.due_date,
		paidAt: invoice.paid_at,
		sentAt: invoice.sent_at,
		total: Number(invoice.total),
		amountPaid: Number(invoice.amount_paid),
		balanceDue,
		subtotal: Number(invoice.subtotal),
		taxAmount: Number(invoice.tax_amount),
		daysOverdue,
		qbSyncStatus: invoice.qb_sync_status,
	};
};

export const getInvoicesReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const invoices = await sdb.invoice.findMany({
		where: invoicesBaseWhere(organizationId, startDate, endDate),
		orderBy: { created_at: "desc" },
		include: INVOICES_INCLUDE,
	});
	return invoices.map(mapInvoiceRaw);
};

const INVOICES_SQL_COLUMNS: ColumnMap = {
	invoiceNumber: t("i.invoice_number"),
	clientName: t("c.name"),
	status: t("i.status::text"),
	issueDate: dt("i.issue_date"),
	dueDate: dt("i.due_date"),
	paidAt: dt("i.paid_at"),
	sentAt: dt("i.sent_at"),
	total: cur("i.total"),
	amountPaid: cur("i.amount_paid"),
	balanceDue: cur("i.balance_due"),
	subtotal: cur("i.subtotal"),
	taxAmount: cur("i.tax_amount"),
	daysOverdue: n(
		"CASE WHEN i.balance_due > 0 AND i.due_date IS NOT NULL AND i.due_date < NOW() THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - i.due_date)) / 86400) ELSE 0 END",
	),
	qbSyncStatus: t("i.qb_sync_status::text"),
};

export const getInvoicesReportPage = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
	params: PaginateParams,
): Promise<PageResult<ReturnType<typeof mapInvoiceRaw>> | null> => {
	const sdb = getScopedDb(organizationId);
	const df = buildDateFilter(startDate, endDate);
	const baseParams: unknown[] = [organizationId];
	let baseWhere = "i.organization_id = $1";
	if (df.gte || df.lte) {
		const issueConds: string[] = [];
		const createdConds: string[] = ["i.issue_date IS NULL"];
		if (df.gte) {
			const idx = baseParams.push(df.gte);
			issueConds.push(`i.issue_date >= $${idx}`);
			createdConds.push(`i.created_at >= $${idx}`);
		}
		if (df.lte) {
			const idx = baseParams.push(df.lte);
			issueConds.push(`i.issue_date <= $${idx}`);
			createdConds.push(`i.created_at <= $${idx}`);
		}
		baseWhere += ` AND ((${issueConds.join(" AND ")}) OR (${createdConds.join(" AND ")}))`;
	}

	const res = await runIdPrefilter({
		sdb,
		from: '"invoice" i JOIN "client" c ON c.id = i.client_id',
		baseWhere,
		baseParams,
		idExpr: "i.id",
		columns: INVOICES_SQL_COLUMNS,
		defaultOrder: { expr: "i.created_at", dir: "desc" },
		params,
		hydrate: (ids) => sdb.invoice.findMany({ where: { id: { in: ids } }, include: INVOICES_INCLUDE }),
		rowId: (r) => r.id,
	});
	if (!res) return null;
	return { rows: res.rows.map(mapInvoiceRaw), total: res.total, page: res.page, pageSize: res.pageSize };
};

// ============================================================================
// CLIENTS
// ============================================================================

export const getClientsReport = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);

	const rows = await sdb.$queryRaw<
		{
			id: string;
			name: string;
			isActive: boolean;
			isTaxExempt: boolean;
			createdAt: Date;
			lastActivity: Date;
			jobCount: number;
			invoiceCount: number;
			lifetimeRevenue: number | null;
			openBalance: number | null;
			primaryContact: string | null;
			email: string | null;
			phone: string | null;
			address: string;
			contactCount: number;
			taxGroup: string | null;
			taxRate: number | null;
		}[]
	>`
		SELECT
			c.id            AS "id",
			c.name          AS "name",
			c.is_active     AS "isActive",
			c.is_tax_exempt AS "isTaxExempt",
			c.created_at    AS "createdAt",
			c.last_activity AS "lastActivity",
			c.address       AS "address",
			pc.name         AS "primaryContact",
			pc.email        AS "email",
			pc.phone        AS "phone",
			tg.name         AS "taxGroup",
			c.tax_rate      AS "taxRate",
			COALESCE(cct.contact_count, 0)::int     AS "contactCount",
			COALESCE(j.job_count, 0)::int           AS "jobCount",
			COALESCE(inv.invoice_count, 0)::int     AS "invoiceCount",
			COALESCE(inv.lifetime_revenue, 0)::float AS "lifetimeRevenue",
			COALESCE(inv.open_balance, 0)::float    AS "openBalance"
		FROM client c
		LEFT JOIN tax_group tg ON tg.id = c.tax_group_id
		LEFT JOIN LATERAL (
			SELECT ct.name, ct.email, ct.phone
			FROM client_contact cc
			JOIN contact ct ON ct.id = cc.contact_id
			WHERE cc.client_id = c.id
			ORDER BY cc.is_primary DESC, cc.is_billing DESC
			LIMIT 1
		) pc ON true
		LEFT JOIN (
			SELECT client_id, COUNT(*) AS contact_count
			FROM client_contact
			GROUP BY client_id
		) cct ON cct.client_id = c.id
		LEFT JOIN (
			SELECT client_id, COUNT(*) AS job_count
			FROM job
			WHERE organization_id = ${organizationId}
			GROUP BY client_id
		) j ON j.client_id = c.id
		LEFT JOIN (
			SELECT client_id,
				COUNT(*)         AS invoice_count,
				SUM(amount_paid) AS lifetime_revenue,
				SUM(balance_due) AS open_balance
			FROM invoice
			WHERE organization_id = ${organizationId}
			GROUP BY client_id
		) inv ON inv.client_id = c.id
		WHERE c.organization_id = ${organizationId}
		ORDER BY "lifetimeRevenue" DESC
	`;

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		status: r.isActive ? "Active" : "Inactive",
		taxExempt: r.isTaxExempt ? "Yes" : "No",
		primaryContact: r.primaryContact,
		email: r.email,
		phone: r.phone,
		address: r.address,
		contactCount: r.contactCount,
		taxGroup: r.taxGroup,
		taxRate: r.taxRate != null ? Number(r.taxRate) : null,
		createdAt: r.createdAt,
		lastActivity: r.lastActivity,
		jobCount: r.jobCount,
		invoiceCount: r.invoiceCount,
		lifetimeRevenue: round2(r.lifetimeRevenue),
		openBalance: round2(r.openBalance),
	}));
};

// ============================================================================
// CLIENT RETENTION
// ============================================================================

// Active clients with no purchase, service, or communication within #
export const getClientRetentionReport = async (
	organizationId: string,
	opts: { lookbackDays: number },
) => {
	const sdb = getScopedDb(organizationId);
	const cutoff = new Date(Date.now() - opts.lookbackDays * DAY_MS);

	const rows = await sdb.$queryRaw<
		{
			id: string;
			name: string;
			primaryContact: string | null;
			email: string | null;
			phone: string | null;
			lastActivityAt: Date | null;
			jobCount: number;
			lifetimeRevenue: number | null;
		}[]
	>`
		WITH purchase AS (
			SELECT i.client_id, MAX(ip.paid_at) AS ts
			FROM invoice i
			JOIN invoice_payment ip ON ip.invoice_id = i.id
			WHERE i.organization_id = ${organizationId}
			GROUP BY i.client_id
		),
		service AS (
			SELECT client_id, MAX(created_at) AS ts FROM (
				SELECT client_id, created_at FROM request WHERE organization_id = ${organizationId}
				UNION ALL
				SELECT client_id, created_at FROM job WHERE organization_id = ${organizationId}
				UNION ALL
				SELECT client_id, created_at FROM quote WHERE organization_id = ${organizationId}
			) s
			GROUP BY client_id
		),
		comm AS (
			SELECT client_id, MAX(ts) AS ts FROM (
				SELECT client_id, created_at AS ts FROM client_note WHERE organization_id = ${organizationId}
				UNION ALL
				SELECT client_id, sent_at AS ts FROM quote WHERE organization_id = ${organizationId} AND sent_at IS NOT NULL
				UNION ALL
				SELECT client_id, viewed_at AS ts FROM quote WHERE organization_id = ${organizationId} AND viewed_at IS NOT NULL
				UNION ALL
				SELECT client_id, sent_at AS ts FROM invoice WHERE organization_id = ${organizationId} AND sent_at IS NOT NULL
				UNION ALL
				SELECT client_id, viewed_at AS ts FROM invoice WHERE organization_id = ${organizationId} AND viewed_at IS NOT NULL
			) c
			GROUP BY client_id
		)
		SELECT * FROM (
			SELECT
				c.id   AS "id",
				c.name AS "name",
				pc.name  AS "primaryContact",
				pc.email AS "email",
				pc.phone AS "phone",
				GREATEST(p.ts, s.ts, cm.ts) AS "lastActivityAt",
				COALESCE(j.job_count, 0)::int           AS "jobCount",
				COALESCE(inv.lifetime_revenue, 0)::float AS "lifetimeRevenue"
			FROM client c
			LEFT JOIN LATERAL (
				SELECT ct.name, ct.email, ct.phone
				FROM client_contact cc
				JOIN contact ct ON ct.id = cc.contact_id
				WHERE cc.client_id = c.id
				ORDER BY cc.is_primary DESC, cc.is_billing DESC
				LIMIT 1
			) pc ON true
			LEFT JOIN purchase p ON p.client_id = c.id
			LEFT JOIN service s ON s.client_id = c.id
			LEFT JOIN comm cm ON cm.client_id = c.id
			LEFT JOIN (
				SELECT client_id, COUNT(*) AS job_count
				FROM job
				WHERE organization_id = ${organizationId}
				GROUP BY client_id
			) j ON j.client_id = c.id
			LEFT JOIN (
				SELECT client_id, SUM(amount_paid) AS lifetime_revenue
				FROM invoice
				WHERE organization_id = ${organizationId}
				GROUP BY client_id
			) inv ON inv.client_id = c.id
			WHERE c.organization_id = ${organizationId}
				AND c.is_active = true
		) t
		WHERE t."lastActivityAt" < ${cutoff}
		ORDER BY t."lastActivityAt" DESC
	`;

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		primaryContact: r.primaryContact,
		email: r.email,
		phone: r.phone,
		lastActivityAt: r.lastActivityAt,
		jobCount: r.jobCount,
		lifetimeRevenue: round2(r.lifetimeRevenue),
	}));
};

// ============================================================================
// PAYMENTS COLLECTED
// ============================================================================

const PAYMENTS_INCLUDE = {
	invoice: {
		select: {
			id: true,
			invoice_number: true,
			client: { select: { name: true } },
		},
	},
	recorded_by_dispatcher: { select: { name: true } },
	recorded_by_tech: { select: { name: true } },
} satisfies Prisma.invoice_paymentInclude;

const paymentsBaseWhere = (
	organizationId: string,
	startDate?: string,
	endDate?: string,
): Record<string, unknown> => {
	const dateFilter = buildDateFilter(startDate, endDate);
	return {
		invoice: { organization_id: organizationId },
		...(Object.keys(dateFilter).length && { paid_at: dateFilter }),
	};
};

const mapPaymentRaw = (
	p: Prisma.invoice_paymentGetPayload<{ include: typeof PAYMENTS_INCLUDE }>,
) => ({
	paymentId: p.id,
	paidAt: p.paid_at,
	invoiceId: p.invoice.id,
	invoiceNumber: p.invoice.invoice_number,
	clientName: p.invoice.client.name,
	amount: Number(p.amount),
	method: p.method,
	note: p.note,
	recordedBy: p.recorded_by_dispatcher?.name ?? p.recorded_by_tech?.name ?? null,
	qbSynced: !!p.qb_payment_id,
});

export const getPaymentsReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const payments = await sdb.invoice_payment.findMany({
		where: paymentsBaseWhere(organizationId, startDate, endDate),
		orderBy: { paid_at: "desc" },
		include: PAYMENTS_INCLUDE,
	});
	return payments.map(mapPaymentRaw);
};

const PAYMENTS_FROM =
	'"invoice_payment" p JOIN "invoice" i ON i.id = p.invoice_id JOIN "client" c ON c.id = i.client_id LEFT JOIN "dispatcher" disp ON disp.id = p.recorded_by_dispatcher_id LEFT JOIN "technician" tech ON tech.id = p.recorded_by_tech_id';

const PAYMENTS_SQL_COLUMNS: ColumnMap = {
	invoiceNumber: t("i.invoice_number"),
	clientName: t("c.name"),
	method: t("p.method"),
	note: t("p.note"),
	recordedBy: t("COALESCE(disp.name, tech.name)"),
	qbSynced: t("CASE WHEN p.qb_payment_id IS NOT NULL THEN 'Synced' ELSE 'Not synced' END"),
	amount: cur("p.amount"),
	paidAt: dt("p.paid_at"),
};

const getPaymentsSummarySql = async (
	sdb: ReturnType<typeof getScopedDb>,
	whereSql: string,
	whereParams: unknown[],
) => {
	const [totals] = await sdb.$queryRawUnsafe<{ total: number; count: number }[]>(
		`SELECT COALESCE(SUM(p.amount), 0)::float AS total, COUNT(*)::int AS count FROM ${PAYMENTS_FROM} WHERE ${whereSql}`,
		...whereParams,
	);
	const byMethodRaw = await sdb.$queryRawUnsafe<{ method: string | null; amount: number; count: number }[]>(
		`SELECT p.method AS method, COALESCE(SUM(p.amount), 0)::float AS amount, COUNT(*)::int AS count FROM ${PAYMENTS_FROM} WHERE ${whereSql} GROUP BY p.method`,
		...whereParams,
	);
	const total = totals?.total ?? 0;
	const count = totals?.count ?? 0;
	const byMethodMap = new Map<string, { amount: number; count: number }>();
	for (const g of byMethodRaw) {
		const method = g.method ? String(g.method) : "Unspecified";
		const bucket = byMethodMap.get(method) ?? { amount: 0, count: 0 };
		bucket.amount += g.amount;
		bucket.count += g.count;
		byMethodMap.set(method, bucket);
	}
	return {
		totalCollected: total,
		count,
		avg: count > 0 ? total / count : 0,
		byMethod: [...byMethodMap.entries()]
			.map(([method, b]) => ({ method, ...b }))
			.sort((a, b) => b.amount - a.amount),
	};
};

export const getPaymentsReportPage = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
	params: PaginateParams,
) => {
	const sdb = getScopedDb(organizationId);
	const df = buildDateFilter(startDate, endDate);
	const baseParams: unknown[] = [organizationId];
	let baseWhere = "i.organization_id = $1";
	if (df.gte) baseWhere += ` AND p.paid_at >= $${baseParams.push(df.gte)}`;
	if (df.lte) baseWhere += ` AND p.paid_at <= $${baseParams.push(df.lte)}`;

	const res = await runIdPrefilter({
		sdb,
		from: PAYMENTS_FROM,
		baseWhere,
		baseParams,
		idExpr: "p.id",
		columns: PAYMENTS_SQL_COLUMNS,
		defaultOrder: { expr: "p.paid_at", dir: "desc" },
		params,
		hydrate: (ids) =>
			sdb.invoice_payment.findMany({ where: { id: { in: ids } }, include: PAYMENTS_INCLUDE }),
		rowId: (r) => r.id,
	});
	if (!res) return null;
	const summary = await getPaymentsSummarySql(sdb, res.whereSql, res.whereParams);
	return {
		rows: res.rows.map(mapPaymentRaw),
		total: res.total,
		page: res.page,
		pageSize: res.pageSize,
		summary,
	};
};

// ============================================================================
// QUOTE CONVERSION
// ============================================================================

const LOST_QUOTE_STATUSES = ["Rejected", "Expired", "Cancelled"] as const;

const QUOTE_INCLUDE = {
	client: { select: { name: true } },
	request: { select: { source: true } },
} satisfies Prisma.quoteInclude;

const quotesBaseWhere = (
	startDate?: string,
	endDate?: string,
): Record<string, unknown> => {
	const dateFilter = buildDateFilter(startDate, endDate);
	return {
		is_active: true,
		...(Object.keys(dateFilter).length && { created_at: dateFilter }),
	};
};

const mapQuoteRaw = (q: Prisma.quoteGetPayload<{ include: typeof QUOTE_INCLUDE }>) => {
	const approvalBaseline = q.sent_at ?? q.issued_at ?? q.created_at;
	const daysToApprove = q.approved_at
		? Math.round(((q.approved_at.getTime() - approvalBaseline.getTime()) / DAY_MS) * 10) / 10
		: null;
	return {
		quoteId: q.id,
		quoteNumber: q.quote_number,
		title: q.title,
		clientName: q.client.name,
		status: q.status,
		source: q.request?.source ?? "manual",
		total: Number(q.total),
		createdAt: q.created_at,
		issuedAt: q.issued_at,
		sentAt: q.sent_at,
		viewedAt: q.viewed_at,
		approvedAt: q.approved_at,
		daysToApprove,
	};
};

export const getQuoteFunnelReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);

	const quotes = await sdb.quote.findMany({
		where: quotesBaseWhere(startDate, endDate),
		orderBy: { created_at: "desc" },
		include: QUOTE_INCLUDE,
	});

	const funnel = { created: quotes.length, issued: 0, sent: 0, viewed: 0, approved: 0 };
	let valueWon = 0;
	let valueLost = 0;
	let lostCount = 0;
	const approveDays: number[] = [];
	const bySourceMap = new Map<string, { quotes: number; approved: number }>();

	const rows = quotes.map((q) => {
		const issued = !!(q.issued_at || q.sent_at || q.viewed_at || q.approved_at);
		const sent = !!(q.sent_at || q.viewed_at || q.approved_at);
		const viewed = !!(q.viewed_at || q.approved_at);
		const approved = !!q.approved_at;
		if (issued) funnel.issued++;
		if (sent) funnel.sent++;
		if (viewed) funnel.viewed++;
		if (approved) funnel.approved++;

		const total = Number(q.total);
		if (q.status === "Approved") valueWon += total;
		if ((LOST_QUOTE_STATUSES as readonly string[]).includes(q.status)) {
			valueLost += total;
			lostCount++;
		}

		const row = mapQuoteRaw(q);
		if (row.daysToApprove != null) approveDays.push(row.daysToApprove);

		const source = q.request?.source ?? "manual";
		const bucket = bySourceMap.get(source) ?? { quotes: 0, approved: 0 };
		bucket.quotes++;
		if (approved) bucket.approved++;
		bySourceMap.set(source, bucket);

		return row;
	});

	const decided = funnel.approved + lostCount;

	return {
		funnel,
		winRate: decided > 0 ? Math.round((funnel.approved / decided) * 100) : null,
		avgDaysToApprove: approveDays.length
			? round2(approveDays.reduce((a, b) => a + b, 0) / approveDays.length)
			: null,
		valueWon: round2(valueWon),
		valueLost: round2(valueLost),
		bySource: [...bySourceMap.entries()].map(([source, b]) => ({
			source,
			quotes: b.quotes,
			approved: b.approved,
			rate: b.quotes > 0 ? Math.round((b.approved / b.quotes) * 100) : 0,
		})),
		quotes: rows,
	};
};

const QUOTES_SQL_COLUMNS: ColumnMap = {
	quoteNumber: t("q.quote_number"),
	title: t("q.title"),
	clientName: t("c.name"),
	status: t("q.status::text"),
	source: t("COALESCE(r.source, 'manual')"),
	total: cur("q.total"),
	createdAt: dt("q.created_at"),
	issuedAt: dt("q.issued_at"),
	sentAt: dt("q.sent_at"),
	viewedAt: dt("q.viewed_at"),
	approvedAt: dt("q.approved_at"),
	daysToApprove: n(
		"CASE WHEN q.approved_at IS NOT NULL THEN ROUND((EXTRACT(EPOCH FROM (q.approved_at - COALESCE(q.sent_at, q.issued_at, q.created_at))) / 86400.0)::numeric, 1) ELSE NULL END",
	),
};

export const getQuoteRowsPage = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
	params: PaginateParams,
): Promise<PageResult<ReturnType<typeof mapQuoteRaw>> | null> => {
	const sdb = getScopedDb(organizationId);
	const df = buildDateFilter(startDate, endDate);
	const baseParams: unknown[] = [organizationId];
	let baseWhere = "q.organization_id = $1 AND q.is_active = true";
	if (df.gte) baseWhere += ` AND q.created_at >= $${baseParams.push(df.gte)}`;
	if (df.lte) baseWhere += ` AND q.created_at <= $${baseParams.push(df.lte)}`;

	const res = await runIdPrefilter({
		sdb,
		from: '"quote" q JOIN "client" c ON c.id = q.client_id LEFT JOIN "request" r ON r.id = q.request_id',
		baseWhere,
		baseParams,
		idExpr: "q.id",
		columns: QUOTES_SQL_COLUMNS,
		defaultOrder: { expr: "q.created_at", dir: "desc" },
		params,
		hydrate: (ids) => sdb.quote.findMany({ where: { id: { in: ids } }, include: QUOTE_INCLUDE }),
		rowId: (r) => r.id,
	});
	if (!res) return null;
	return { rows: res.rows.map(mapQuoteRaw), total: res.total, page: res.page, pageSize: res.pageSize };
};

interface FunnelScalarRow {
	created: number;
	issued: number;
	sent: number;
	viewed: number;
	approved: number;
	valueWon: number;
	valueLost: number;
	lostCount: number;
	avgDays: number | null;
}

interface BySourceRow {
	source: string;
	quotes: number;
	approved: number;
}

export const getQuoteFunnelSummary = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const conds: string[] = [`q.organization_id = $1`, `q.is_active = true`];
	const params: unknown[] = [organizationId];
	if (dateFilter.gte) {
		params.push(dateFilter.gte);
		conds.push(`q.created_at >= $${params.length}`);
	}
	if (dateFilter.lte) {
		params.push(dateFilter.lte);
		conds.push(`q.created_at <= $${params.length}`);
	}
	const whereSql = conds.join(" AND ");

	const [scalar] = await sdb.$queryRawUnsafe<FunnelScalarRow[]>(
		`SELECT
			COUNT(*)::int AS created,
			COUNT(*) FILTER (WHERE q.issued_at IS NOT NULL OR q.sent_at IS NOT NULL OR q.viewed_at IS NOT NULL OR q.approved_at IS NOT NULL)::int AS issued,
			COUNT(*) FILTER (WHERE q.sent_at IS NOT NULL OR q.viewed_at IS NOT NULL OR q.approved_at IS NOT NULL)::int AS sent,
			COUNT(*) FILTER (WHERE q.viewed_at IS NOT NULL OR q.approved_at IS NOT NULL)::int AS viewed,
			COUNT(*) FILTER (WHERE q.approved_at IS NOT NULL)::int AS approved,
			COALESCE(SUM(q.total) FILTER (WHERE q.status = 'Approved'), 0)::float AS "valueWon",
			COALESCE(SUM(q.total) FILTER (WHERE q.status IN ('Rejected','Expired','Cancelled')), 0)::float AS "valueLost",
			COUNT(*) FILTER (WHERE q.status IN ('Rejected','Expired','Cancelled'))::int AS "lostCount",
			AVG(ROUND((EXTRACT(EPOCH FROM (q.approved_at - COALESCE(q.sent_at, q.issued_at, q.created_at))) / 86400.0)::numeric, 1)) FILTER (WHERE q.approved_at IS NOT NULL)::float AS "avgDays"
		FROM quote q
		WHERE ${whereSql}`,
		...params,
	);

	const bySourceRaw = await sdb.$queryRawUnsafe<BySourceRow[]>(
		`SELECT
			COALESCE(r.source, 'manual') AS source,
			COUNT(*)::int AS quotes,
			COUNT(*) FILTER (WHERE q.approved_at IS NOT NULL)::int AS approved
		FROM quote q
		LEFT JOIN request r ON r.id = q.request_id
		WHERE ${whereSql}
		GROUP BY COALESCE(r.source, 'manual')`,
		...params,
	);

	const funnel = {
		created: scalar?.created ?? 0,
		issued: scalar?.issued ?? 0,
		sent: scalar?.sent ?? 0,
		viewed: scalar?.viewed ?? 0,
		approved: scalar?.approved ?? 0,
	};
	const lostCount = scalar?.lostCount ?? 0;
	const decided = funnel.approved + lostCount;

	return {
		funnel,
		winRate: decided > 0 ? Math.round((funnel.approved / decided) * 100) : null,
		avgDaysToApprove: scalar?.avgDays != null ? round2(scalar.avgDays) : null,
		valueWon: round2(scalar?.valueWon ?? 0),
		valueLost: round2(scalar?.valueLost ?? 0),
		bySource: bySourceRaw.map((b) => ({
			source: b.source,
			quotes: b.quotes,
			approved: b.approved,
			rate: b.quotes > 0 ? Math.round((b.approved / b.quotes) * 100) : 0,
		})),
	};
};

// ============================================================================
// TECHNICIAN SCORECARD
// ============================================================================

// Visit revenue is calculated by job revenue/# techs
export const getTechnicianScorecard = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const visits = await sdb.job_visit.findMany({
		where: {
			status: "Completed",
			job: { organization_id: organizationId },
			...(Object.keys(dateFilter).length && { scheduled_start_at: dateFilter }),
		},
		orderBy: { scheduled_start_at: "desc" },
		include: {
			job: {
				select: {
					id: true,
					name: true,
					client: { select: { name: true } },
				},
			},
			visit_techs: { select: { tech: { select: { id: true, name: true } } } },
			time_entries: { select: { tech_id: true, hours_worked: true } },
		},
	});

	const rows: {
		techId: string;
		techName: string;
		visitId: string;
		jobId: string;
		jobName: string;
		clientName: string;
		scheduledStartAt: Date;
		actualStartAt: Date | null;
		arrival: "Early" | "On Time" | "Late" | null;
		hoursWorked: number;
		revenueShare: number;
	}[] = [];

	for (const visit of visits) {
		const techs = visit.visit_techs;
		if (!techs.length) continue;
		const revenueShare = round2(Number(visit.total) / techs.length);
		const arrival = classifyArrival(visit.scheduled_start_at, visit.actual_start_at);

		for (const { tech } of techs) {
			const hoursWorked = visit.time_entries
				.filter((e) => e.tech_id === tech.id)
				.reduce((s, e) => s + Number(e.hours_worked ?? 0), 0);

			rows.push({
				techId: tech.id,
				techName: tech.name,
				visitId: visit.id,
				jobId: visit.job.id,
				jobName: visit.job.name,
				clientName: visit.job.client.name,
				scheduledStartAt: visit.scheduled_start_at,
				actualStartAt: visit.actual_start_at,
				arrival,
				hoursWorked: round2(hoursWorked),
				revenueShare,
			});
		}
	}

	return rows;
};

const PAGES = ["jobs", "quotes", "requests", "invoices", "clients", "inventory", "projects"];
const BREAKDOWNS: Record<string, string[]> = {
	jobs: ["status", "priority", "type"],
	quotes: ["status", "priority"],
	requests: ["status", "priority"],
	invoices: ["status", "qb_sync"],
	clients: ["status", "tax_exempt"],
	inventory: ["status", "qb_linked"],
	projects: ["status", "priority", "manager"],
};
type Stat = { label: string; value: number; format: "number" | "currency" | "percent" | "duration" };
type Slice = { label: string; value: number; };
interface PageSummaryResponse {
	page: string;
	stats: Stat[];
	breakdown: Slice[];
	breakdownLabel: string;
}

export const getPageSummary = async (orgId: string, page:string, startDate?: string, endDate?: string, groupBy?: string): Promise<PageSummaryResponse> => {
	if (!PAGES.includes(page))
		throw new Error("Unknown page");
	const allowed = BREAKDOWNS[page] ?? ["status"];
	const grouping = groupBy && allowed.includes(groupBy) ? groupBy : allowed[0];
	const sdb = getScopedDb(orgId);
	const dateFilter = buildDateFilter(startDate, endDate);
	const dated = Object.keys(dateFilter).length ? dateFilter : undefined;
	const createdWhere = dated? { created_at: dated } : {}
	const now = new Date();
	let stats: Stat[] = [];
	let breakdown: Slice[] = [];
	let breakdownLabel = "";
	
	switch (page) {
		case "jobs": {
			const OPEN_STATUSES = ["Unscheduled", "Scheduled", "InProgress"] as const;
			const [total, open, backlog, revenue] = await Promise.all([
				sdb.job.count({ where: { organization_id: orgId, ...createdWhere }}),
				sdb.job.count({ where: { organization_id: orgId, status: { in: [...OPEN_STATUSES] }, ...createdWhere }}),
				sdb.job.aggregate({
					where: { organization_id: orgId, status: "Unscheduled", ...createdWhere },
					_sum: { estimated_total: true },
				}),
				sdb.job_visit.aggregate({
					// Revenue is scoped by completion date, not job creation.
					where: { status: "Completed", ...(dated ? { actual_end_at: dated } : {}) },
					_sum: { total: true },
				}),
			]);
			if (grouping === "priority") {
				const g = await sdb.job.groupBy({ by: ["priority"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.priority, value: r._count._all }));
				breakdownLabel = "By Priority";
			} else if (grouping === "type") {
				const [oneOff, recurring] = await Promise.all([
					sdb.job.count({ where: { organization_id: orgId, recurring_plan_id: null, ...createdWhere } }),
					sdb.job.count({ where: { organization_id: orgId, recurring_plan_id: { not: null }, ...createdWhere } }),
				]);
				breakdown = [
					{ label: "One-off", value: oneOff },
					{ label: "Recurring", value: recurring },
				];
				breakdownLabel = "By Type";
			} else {
				const g = await sdb.job.groupBy({ by: ["status"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.status, value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",         value: total,                                        format: "number" },
				{ label: "Open",          value: open,                                         format: "number" },
				{ label: "Unscheduled",   value: Number(backlog._sum.estimated_total ?? 0),    format: "currency" },
				{ label: "Revenue",       value: Number(revenue._sum.total ?? 0),              format: "currency" },
			];
			break;
		}
		case "quotes": {
			const OPEN_STATUSES = ["Draft", "Sent", "Viewed"] as const;
			const createdRangeSql = Prisma.sql`
				${dated?.gte ? Prisma.sql`AND created_at >= ${dated.gte}` : Prisma.empty}
				${dated?.lte ? Prisma.sql`AND created_at <= ${dated.lte}` : Prisma.empty}`;
			const [total, open, pipeline, approved, rows] = await Promise.all([
				sdb.quote.count({ where: { organization_id: orgId, ...createdWhere }}),
				sdb.quote.count({ where: { organization_id: orgId, status: { in: [...OPEN_STATUSES]}, ...createdWhere }}),
				sdb.quote.aggregate({
					where: { organization_id: orgId, status: { in: [...OPEN_STATUSES]}, ...createdWhere },
					_sum: { total: true }
				}),
				sdb.quote.aggregate({ 
					where: { organization_id: orgId, status: "Approved", ...createdWhere},
					_sum: { total: true },
				}),
				sdb.$queryRaw<{ avg_seconds: number | null }[]>(Prisma.sql`
					SELECT EXTRACT(EPOCH FROM AVG(approved_at - sent_at)) AS avg_seconds
					FROM quote
					WHERE organization_id = ${orgId}
						AND approved_at IS NOT NULL
						AND sent_at IS NOT NULL
						${createdRangeSql}`),
			]);
			const avgSeconds = rows[0]?.avg_seconds ?? null;
			const avgDays = avgSeconds != null ? avgSeconds / 86_400 : null;
			if (grouping === "priority") {
				const g = await sdb.quote.groupBy({ by: ["priority"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.priority, value: r._count._all }));
				breakdownLabel = "By Priority";
			} else {
				const g = await sdb.quote.groupBy({ by: ["status"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.status, value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",    	 	  value: total,                            format: "number" },
				{ label: "Open",     	 	  value: open,                             format: "number" },
				{ label: "Pipeline", 	 	  value: Number(pipeline._sum.total ?? 0), format: "currency" },
				{ label: "Approved", 	 	  value: Number(approved._sum.total ?? 0), format: "currency" },
				{ label: "Avg. Approve Time", value: Number(avgDays), 	  		  	   format: "duration"}
			];
			break;
		} 
		case "requests": {
			const OPEN_STATUSES = ["New", "Reviewing"] as const;
			const [total, open, converted, estimatedValue] = await Promise.all([
				sdb.request.count({ where: { organization_id: orgId, ...createdWhere }}),
				sdb.request.count({ where: { organization_id: orgId, status: { in: [...OPEN_STATUSES]}, ...createdWhere}}),
				sdb.request.count({ where: { organization_id: orgId, status: "ConvertedToJob", ...createdWhere }}),
				sdb.request.aggregate({
					where: { organization_id: orgId, ...createdWhere },
					_sum: { estimated_value: true }
				})
			]);
			if (grouping === "priority") {
				const g = await sdb.request.groupBy({ by: ["priority"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.priority, value: r._count._all }));
				breakdownLabel = "By Priority";
			} else {
				const g = await sdb.request.groupBy({ by: ["status"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.status, value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",      value: total,                                        format: "number" },
				{ label: "Open",       value: open,                                         format: "number" },
				{ label: "Converted",  value: converted,                                    format: "number" },
				{ label: "Est. Value", value: Number(estimatedValue._sum.estimated_value ?? 0),   format: "currency" },
			];
			break;
		} 
		case "invoices": {
			const invoiceDateWhere: Prisma.invoiceWhereInput = dated
				? { OR: [{ issue_date: dated }, { issue_date: null, created_at: dated }] }
				: {};
			const paidAtFilter = dated ? dated : { not: null };
			const issueRangeSql = Prisma.sql`
				${dated?.gte ? Prisma.sql`AND issue_date >= ${dated.gte}` : Prisma.empty}
				${dated?.lte ? Prisma.sql`AND issue_date <= ${dated.lte}` : Prisma.empty}`;
			const [total, issued, collected, rows] = await Promise.all([
				sdb.invoice.count({ where: { organization_id: orgId, ...invoiceDateWhere } }),
				sdb.invoice.aggregate({
					where: { organization_id: orgId, ...invoiceDateWhere },
					_sum: { total: true },
				}),
				sdb.invoice.aggregate({
					where: { organization_id: orgId, paid_at: paidAtFilter },
					_sum: { amount_paid: true },
				}),
				sdb.$queryRaw<{ avg_seconds: number | null }[]>(Prisma.sql`
					SELECT EXTRACT(EPOCH FROM AVG(paid_at - issue_date)) AS avg_seconds
					FROM invoice
					WHERE organization_id = ${orgId}
						AND paid_at IS NOT NULL
						AND issue_date IS NOT NULL
						${issueRangeSql}`),
			]);
			const avgSeconds = rows[0]?.avg_seconds ?? null;
			const avgDays = avgSeconds != null ? avgSeconds / 86_400 : null;
			if (grouping === "qb_sync") {
				const g = await sdb.invoice.groupBy({ by: ["qb_sync_status"], where: { organization_id: orgId, ...invoiceDateWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.qb_sync_status, value: r._count._all }));
				breakdownLabel = "By QB Sync";
			} else {
				const g = await sdb.invoice.groupBy({ by: ["status"], where: { organization_id: orgId, ...invoiceDateWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.status, value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",           value: total,                                    format: "number" },
				{ label: "Issued",          value: Number(issued._sum.total ?? 0),           format: "currency" },
				{ label: "Collected",       value: Number(collected._sum.amount_paid ?? 0),  format: "currency" },
				{ label: "Avg. Days to Pay", value: Number(avgDays),                          format: "duration" },
			];
			break;
		}
		case "clients": {
			const [total, added, active, openBalance, income] = await Promise.all([
				sdb.client.count({ where: { organization_id: orgId } }),
				sdb.client.count({ where: { organization_id: orgId, ...createdWhere } }),
				sdb.client.count({ where: { organization_id: orgId, is_active: true } }),
				sdb.invoice.aggregate({
					where: { organization_id: orgId, balance_due: { gt: 0 } },
					_sum: { balance_due: true },
				}),
				sdb.invoice.aggregate({
					where: { organization_id: orgId },
					_sum: { total: true },
				}),
			]);
			// Avg income per client = total billed spread over the whole client book
			const avgIncome = total > 0 ? Number(income._sum.total ?? 0) / total : 0;
			if (grouping === "tax_exempt") {
				const g = await sdb.client.groupBy({ by: ["is_tax_exempt"], where: { organization_id: orgId }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.is_tax_exempt ? "Exempt" : "Taxable", value: r._count._all }));
				breakdownLabel = "By Tax Status";
			} else {
				const g = await sdb.client.groupBy({ by: ["is_active"], where: { organization_id: orgId }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.is_active ? "Active" : "Inactive", value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",        value: total,                                     format: "number" },
				{ label: "New",          value: added,                                     format: "number" },
				{ label: "Active",       value: active,                                    format: "number" },
				{ label: "Open Balance", value: Number(openBalance._sum.balance_due ?? 0), format: "currency" },
				{ label: "Avg. Income",   value: avgIncome,                                 format: "currency" },
			];
			break;
		}
		case "inventory": {
			const items = await sdb.inventory_item.findMany({
				where: { organization_id: orgId, provisional: false, is_active: true },
				select: { id: true, quantity: true, low_stock_threshold: true, cost: true },
				take: REPORT_ROW_CAP,
			});
			let low = 0;
			let out = 0;
			let sufficient = 0;
			let assetValue = 0;
			for (const it of items) {
				assetValue += it.quantity * Number(it.cost ?? 0);
				const status = getStockStatus(it.quantity, it.low_stock_threshold);
				if (status === "low") low++;
				else if (status === "out_of_stock") out++;
				else if (status === "sufficient") sufficient++;
			}
			if (grouping === "qb_linked") {
				const realmId = await getOrgRealmId(orgId);
				const mappings = realmId
					? await sdb.item_external_mapping.findMany({
							where: {
								provider: "quickbooks",
								account_id: realmId,
								inventory_item_id: { in: items.map((it) => it.id) },
							},
							select: { inventory_item_id: true },
						})
					: [];
				const linkedIds = new Set(mappings.map((m) => m.inventory_item_id));
				const linked = items.filter((it) => linkedIds.has(it.id)).length;
				breakdown = [
					{ label: "Linked", value: linked },
					{ label: "Not Linked", value: items.length - linked },
				];
				breakdownLabel = "By QuickBooks";
			} else {
				breakdown = [
					{ label: "Sufficient", value: sufficient },
					{ label: "Low", value: low },
					{ label: "Out of Stock", value: out },
				];
				breakdownLabel = "By Stock Status";
			}
			stats = [
				{ label: "Total Items",  value: items.length, format: "number" },
				{ label: "Low",          value: low,          format: "number" },
				{ label: "Out of Stock", value: out,          format: "number" },
				{ label: "Asset Value",  value: assetValue,   format: "currency" },
			];
			break;
		}
		case "projects": {
			const OPEN_STATUSES = ["Planning", "Active", "OnHold"] as const;
			const [total, open, overdue, budget, committed] = await Promise.all([
				sdb.project.count({ where: { organization_id: orgId, ...createdWhere } }),
				sdb.project.count({ where: { organization_id: orgId, status: { in: [...OPEN_STATUSES] }, ...createdWhere } }),
				sdb.project.count({
					where: {
						organization_id: orgId,
						target_end_at: { lt: now },
						completed_at: null,
						status: { notIn: ["Completed", "Cancelled"] },
					},
				}),
				sdb.project.aggregate({ where: { organization_id: orgId, ...createdWhere }, _sum: { budget: true } }),
				sdb.$queryRaw<{ committed: Prisma.Decimal | null }[]>(Prisma.sql`
						SELECT SUM(COALESCE(j.actual_total, j.estimated_total)) AS committed
						FROM job j JOIN project p ON p.id = j.project_id
						WHERE p.organization_id = ${orgId}
							${dated?.gte ? Prisma.sql`AND p.created_at >= ${dated.gte}` : Prisma.empty}
							${dated?.lte ? Prisma.sql`AND p.created_at <= ${dated.lte}` : Prisma.empty}
					`),
			]);
			if (grouping === "priority") {
				const g = await sdb.project.groupBy({ by: ["priority"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.priority, value: r._count._all }));
				breakdownLabel = "By Priority";
			} else if (grouping === "manager") {
				const g = await sdb.project.groupBy({
					by: ["manager_dispatcher_id"],
					where: { organization_id: orgId, ...createdWhere },
					_count: { _all: true },
				});
				const ids = g.map((r) => r.manager_dispatcher_id).filter((v): v is string => v !== null);
				const names = new Map(
					(await sdb.dispatcher.findMany({
						where: { id: { in: ids } },
						select: { id: true, name: true },
					})).map((d) => [d.id, d.name]),
				);
				const all = g
					.map((r) => ({
						label: r.manager_dispatcher_id
							? names.get(r.manager_dispatcher_id) ?? "Unknown"
							: "Unassigned",
						value: r._count._all,
					}))
					.sort((a, b) => b.value - a.value);
				const top = all.slice(0, 5);
				const rest = all.slice(5).reduce((s, r) => s + r.value, 0);
				breakdown = rest ? [...top, { label: "Other", value: rest }] : top;
				breakdownLabel = "By Manager";
			} else {
				const g = await sdb.project.groupBy({ by: ["status"], where: { organization_id: orgId, ...createdWhere }, _count: { _all: true } });
				breakdown = g.map((r) => ({ label: r.status, value: r._count._all }));
				breakdownLabel = "By Status";
			}
			stats = [
				{ label: "Total",			value: total,                                						 format: "number" },
				{ label: "Open",			value: open,                                 						format: "number" },
				{ label: "Overdue",		 value: overdue,                              						format: "number" },
				{ label: "Budget",		   value: Number(budget._sum.budget ?? 0),      	format: "currency" },
				{ label: "Committed", 	value: Number(committed[0]?.committed ?? 0), format: "currency" },
			];
			break;
		}
	}

	return { page, stats, breakdown, breakdownLabel };
}