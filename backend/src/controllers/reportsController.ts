import { getScopedDb } from "../lib/context.js";

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
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) < -900 THEN 1 END)::int AS early,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) > 1800 THEN 1 END)::int AS late,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) BETWEEN -900 AND 1800 THEN 1 END)::int AS on_time
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

	// Soonest projected stockout first with items with no recent last
	built.sort((a, b) => {
		const aT = a.projectedStockoutDate ? new Date(a.projectedStockoutDate).getTime() : Infinity;
		const bT = b.projectedStockoutDate ? new Date(b.projectedStockoutDate).getTime() : Infinity;
		return aT - bT;
	});

	return built;
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
