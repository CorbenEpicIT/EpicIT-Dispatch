import { db } from "../db.js";

// ============================================================================
// OVERVIEW METRICS
// ============================================================================

export const getOverviewMetrics = async (
	startDate: string,
	endDate: string,
) => {
	const start = new Date(startDate);
	const end = new Date(endDate);

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
		db.$queryRaw<[{ avg_days: number | null }]>`
			SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at)) / 86400), 0)::float AS avg_days
			FROM quote q
			JOIN request r ON r.id = q.request_id
			WHERE q.created_at >= ${start}
				AND q.created_at <= ${end}
				AND q.request_id IS NOT NULL
		`,
		db.quote.count({
			where: {
				status: "Approved",
				approved_at: { gte: start, lte: end },
			},
		}),
		db.quote.count({
			where: {
				created_at: { gte: start, lte: end },
			},
		}),
		db.job.count({
			where: {
				recurring_plan_id: null,
				created_at: { gte: start, lte: end },
			},
		}),
		db.job.count({
			where: {
				recurring_plan_id: { not: null },
				created_at: { gte: start, lte: end },
			},
		}),
		db.job.aggregate({
			where: {
				created_at: { gte: start, lte: end },
			},
			_avg: { estimated_total: true },
		}),
		db.job_visit.aggregate({
			where: {
				status: "Completed",
				actual_end_at: { gte: start, lte: end },
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
		db.$queryRaw<[{ avg_days: number | null }]>`
			SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (q.created_at - r.created_at)) / 86400), 0)::float AS avg_days
			FROM quote q
			JOIN request r ON r.id = q.request_id
			WHERE q.created_at >= ${previousStart}
				AND q.created_at <= ${previousEnd}
				AND q.request_id IS NOT NULL
		`,
		db.quote.count({
			where: {
				status: "Approved",
				approved_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		db.quote.count({
			where: {
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		db.job.count({
			where: {
				recurring_plan_id: null,
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		db.job.count({
			where: {
				recurring_plan_id: { not: null },
				created_at: { gte: previousStart, lte: previousEnd },
			},
		}),
		db.job.aggregate({
			where: {
				created_at: { gte: previousStart, lte: previousEnd },
			},
			_avg: { estimated_total: true },
		}),
		db.job_visit.aggregate({
			where: {
				status: "Completed",
				actual_end_at: { gte: previousStart, lte: previousEnd },
			},
			_sum: { total: true },
		}),
	]);

	// Calculates all unscheduled jobs
	const backlogResult = await db.job.aggregate({
		where: { status: "Unscheduled" },
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
	year?: number,
) => {
	const currentYear = year ?? new Date().getFullYear();
	const previousYear = currentYear - 1;

	const previousYearStart = new Date(`${previousYear}-01-01T00:00:00.000Z`);
	const currentYearEnd = new Date(`${currentYear + 1}-01-01T00:00:00.000Z`);

	const [monthlyRevenue, monthlyForecast] = await Promise.all([
		db.$queryRaw<MonthlyRevenueRow[]>`
			SELECT
				EXTRACT(MONTH FROM jv.actual_end_at)::int AS month,
				EXTRACT(YEAR FROM jv.actual_end_at)::int AS year,
				SUM(jv.total)::text AS total
			FROM job_visit jv
			WHERE jv.status = 'Completed'
				AND jv.actual_end_at >= ${previousYearStart}
				AND jv.actual_end_at < ${currentYearEnd}
			GROUP BY year, month
			ORDER BY year, month
		`,
		db.$queryRaw<MonthlyRevenueRow[]>`
			SELECT
				EXTRACT(MONTH FROM jv.scheduled_start_at)::int AS month,
				EXTRACT(YEAR FROM jv.scheduled_start_at)::int AS year,
				SUM(jv.total)::text AS total
			FROM job_visit jv
			WHERE jv.status IN ('Scheduled', 'InProgress')
				AND jv.scheduled_start_at >= ${previousYearStart}
				AND jv.scheduled_start_at < ${currentYearEnd}
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
) => {
	const start = new Date(startDate);
	const end = new Date(endDate);

	const baseWhere = {
		status: "Completed" as const,
		actual_end_at: { gte: start, lte: end },
	};

	const [oneTimeResult, recurringResult] = await Promise.all([
		db.job_visit.aggregate({
			_sum: { total: true },
			where: {
				...baseWhere,
				job: { recurring_plan_id: null },
			},
		}),
		db.job_visit.aggregate({
			_sum: { total: true },
			where: {
				...baseWhere,
				job: { recurring_plan_id: { not: null } },
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
// UNSCHEDULED REVENUE
// ============================================================================

export const getUnscheduledRevenue = async () => {
	const results = await db.$queryRaw<{ bucket: string, count: number, revenue: string }[]>`
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
) => {
	const start = new Date(startDate);
	const end   = new Date(endDate);
	start.setUTCHours(0, 0, 0, 0);
	end.setUTCHours(23, 59, 59, 999);

	const result = await db.$queryRaw<[{ early: number, on_time: number, late: number }]>`
		SELECT
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) < -900 THEN 1 END)::int AS early,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) > 1800 THEN 1 END)::int AS late,
			COUNT(CASE WHEN EXTRACT(EPOCH FROM (actual_start_at - scheduled_start_at)) BETWEEN -900 AND 1800 THEN 1 END)::int AS on_time
		FROM job_visit
		WHERE actual_start_at IS NOT NULL
			AND actual_start_at >= ${start}
			AND actual_start_at <= ${end}
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

export const getQuotePipeline = async (startDate: string, endDate: string) => {
	const start = new Date(startDate);
	const end   = new Date(endDate);
	start.setUTCHours(0, 0, 0, 0);
	end.setUTCHours(23, 59, 59, 999);

	const OPEN_STATUSES = ["Draft", "Sent", "Viewed"] as const;

	const grouped = await db.quote.groupBy({
		by: ["status"],
		where: {
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
