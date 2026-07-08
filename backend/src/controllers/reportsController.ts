import { getScopedDb } from "../lib/context.js";
import { centsToDollars, dollarsToCents, type TaxSnapshot } from "../services/taxEngine.js";
import { getStockStatus } from "../lib/inventory.js";
import { log } from "../services/appLogger.js";

// Cap on the rows that a report can have would require a change in dates
const REPORT_ROW_CAP = 10000;

const warnIfCapped = (count: number, report: string, organizationId: string) => {
	if (count >= REPORT_ROW_CAP) {
		log.warn(
			{ report, organizationId, cap: REPORT_ROW_CAP },
			"Report row cap reached; results may be truncated",
		);
	}
};

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
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(visits.length, "mileage", organizationId);

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
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(shifts.length, "timesheets", organizationId);

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
		LIMIT ${REPORT_ROW_CAP}
	`;
	warnIfCapped(rows.length, "inventory-reorder-forecast", organizationId);

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

	// Soonest projected stockout first with items with no recent last
	built.sort((a, b) => {
		const aT = a.projectedStockoutDate ? new Date(a.projectedStockoutDate).getTime() : Infinity;
		const bT = b.projectedStockoutDate ? new Date(b.projectedStockoutDate).getTime() : Infinity;
		return aT - bT;
	});

	return built;
};

export const getInventoryReport = async (
	organizationId: string,
	opts: { from?: Date; to?: Date; includeInactive: boolean },
) => {
	const { from, to, includeInactive } = opts;
	const sdb = getScopedDb(organizationId);

	const items = await sdb.inventory_item.findMany({
		where: {
			provisional: false,
			...(includeInactive ? {} : { is_active: true }),
		},
		orderBy: { name: "asc" },
		include: {
			tags: { orderBy: { label: "asc" } },
			vehicle_stocks: { select: { qty_on_hand: true, qty_standard: true } },
		},
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(items.length, "inventory-full", organizationId);

	const usage = await sdb.stock_movement.groupBy({
		by: ["inventory_item_id"],
		where: {
			organization_id: organizationId,
			reason: { in: ["parts_used", "direct_consumption"] },
			...(from && to ? { created_at: { gte: from, lte: to } } : {}),
		},
		_sum: { qty: true },
	});
	const usageByItem = new Map(usage.map((u) => [u.inventory_item_id, Number(u._sum.qty ?? 0)]));

	return items.map((item) => {
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
	});
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
		LIMIT ${REPORT_ROW_CAP}
	`;
	warnIfCapped(rows.length, "receivables-aging-by-client", organizationId);

	const round2 = (n: number | null) => Math.round(Number(n ?? 0) * 100) / 100;

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
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(invoices.length, "tax-liability", organizationId);

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

export const getJobsReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const jobs = await sdb.job.findMany({
		where: {
			organization_id: organizationId,
			...(Object.keys(dateFilter).length && { created_at: dateFilter }),
		},
		orderBy: { created_at: "desc" },
		include: {
			client: { select: { name: true } },
			_count: { select: { visits: true } },
		},
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(jobs.length, "jobs", organizationId);

	return jobs.map((job) => {
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
	});
};

// ============================================================================
// INVOICES
// ============================================================================

export const getInvoicesReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const invoices = await sdb.invoice.findMany({
		where: {
			organization_id: organizationId,
			...(Object.keys(dateFilter).length && {
				OR: [{ issue_date: dateFilter }, { issue_date: null, created_at: dateFilter }],
			}),
		},
		orderBy: { created_at: "desc" },
		include: { client: { select: { name: true } } },
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(invoices.length, "invoices", organizationId);

	const now = Date.now();

	return invoices.map((invoice) => {
		const balanceDue = Number(invoice.balance_due);
		const dueDate = invoice.due_date;
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
	});
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
		LIMIT ${REPORT_ROW_CAP}
	`;
	warnIfCapped(rows.length, "clients", organizationId);

	const round2 = (n: number | null) => Math.round(Number(n ?? 0) * 100) / 100;

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
// PAYMENTS COLLECTED
// ============================================================================

export const getPaymentsReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const payments = await sdb.invoice_payment.findMany({
		where: {
			invoice: { organization_id: organizationId },
			...(Object.keys(dateFilter).length && { paid_at: dateFilter }),
		},
		orderBy: { paid_at: "desc" },
		include: {
			invoice: {
				select: {
					id: true,
					invoice_number: true,
					client: { select: { name: true } },
				},
			},
			recorded_by_dispatcher: { select: { name: true } },
			recorded_by_tech: { select: { name: true } },
		},
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(payments.length, "payments", organizationId);

	return payments.map((p) => ({
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
	}));
};

// ============================================================================
// QUOTE CONVERSION
// ============================================================================

const LOST_QUOTE_STATUSES = ["Rejected", "Expired", "Cancelled"] as const;

export const getQuoteFunnelReport = async (
	startDate: string | undefined,
	endDate: string | undefined,
	organizationId: string,
) => {
	const sdb = getScopedDb(organizationId);
	const dateFilter = buildDateFilter(startDate, endDate);

	const quotes = await sdb.quote.findMany({
		where: {
			is_active: true,
			...(Object.keys(dateFilter).length && { created_at: dateFilter }),
		},
		orderBy: { created_at: "desc" },
		include: {
			client: { select: { name: true } },
			request: { select: { source: true } },
		},
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(quotes.length, "quote-funnel", organizationId);

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

		const approvalBaseline = q.sent_at ?? q.issued_at ?? q.created_at;
		const daysToApprove = q.approved_at
			? Math.round(((q.approved_at.getTime() - approvalBaseline.getTime()) / DAY_MS) * 10) / 10
			: null;
		if (daysToApprove != null) approveDays.push(daysToApprove);

		const source = q.request?.source ?? "manual";
		const bucket = bySourceMap.get(source) ?? { quotes: 0, approved: 0 };
		bucket.quotes++;
		if (approved) bucket.approved++;
		bySourceMap.set(source, bucket);

		return {
			quoteId: q.id,
			quoteNumber: q.quote_number,
			title: q.title,
			clientName: q.client.name,
			status: q.status,
			source,
			total,
			createdAt: q.created_at,
			issuedAt: q.issued_at,
			sentAt: q.sent_at,
			viewedAt: q.viewed_at,
			approvedAt: q.approved_at,
			daysToApprove,
		};
	});

	const decided = funnel.approved + lostCount;
	const round2 = (n: number) => Math.round(n * 100) / 100;

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
		take: REPORT_ROW_CAP,
	});
	warnIfCapped(visits.length, "technician-scorecard", organizationId);

	const round2 = (n: number) => Math.round(n * 100) / 100;
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
