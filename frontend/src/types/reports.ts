// ============================================================================
// OVERVIEW
// ============================================================================

export interface OverviewMetric {
	value: number;
	previousValue: number;
	changePercent: number;
}

export interface OverviewResponse {
	periodStart: string;
	periodEnd: string;
	previousPeriodStart: string;
	previousPeriodEnd: string;
	grossRevenue: OverviewMetric;
	avgResponseTime: OverviewMetric;
	convertedQuotes: OverviewMetric;
	conversionRate: OverviewMetric;
	newOneOffJobs: OverviewMetric;
	newRecurringJobs: OverviewMetric;
	avgJobValue: OverviewMetric;
	unscheduledBacklog: OverviewMetric;
}

// ============================================================================
// RevenueYTD
// ============================================================================

export interface RevenueMonthData {
	month: string;
	currentYear: number;
	previousYear: number;
	forecast: number;
}

export interface RevenueYTDResponse {
	data: RevenueMonthData[];
	total: number;
	year: number;
}

export interface RevenueByJobTypeItem {
	type: string;
	revenue: number;
}

export interface RevenueByJobTypeResponse {
	data: RevenueByJobTypeItem[];
	total: number;
}

// ============================================================================
// UnscheduledJobRevenue 
// ============================================================================

export interface UnscheduledJobRevenue {
	revenue: number;
	count: number;
}

export interface UnscheduledRevenueResponse {
	totalRevenue: number;
	jobCount: number;
	new: UnscheduledJobRevenue;
	warning: UnscheduledJobRevenue;
	critical: UnscheduledJobRevenue;
}

// ============================================================================
// QUOTE PIPELINE
// ============================================================================

export interface QuotePipelineBucket {
	revenue: number;
	count: number;
}

export interface QuotePipelineResponse {
	totalRevenue: number;
	quoteCount: number;
	draft: QuotePipelineBucket;
	sent: QuotePipelineBucket;
	viewed: QuotePipelineBucket;
}

// ============================================================================
// ARRIVAL PERFORMANCE
// ============================================================================

export interface ArrivalPerformanceResponse {
	early: number;
	onTime: number;
	late: number;
	total: number;
	onTimeRate: number;
}

// ============================================================================
// DATE RANGE
// ============================================================================

export interface DateRange {
	startDate: Date;
	endDate: Date;
	label: string;
}
