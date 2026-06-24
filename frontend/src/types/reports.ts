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
// LEADS BY SOURCE
// ============================================================================

export interface LeadsBySourceItem {
	source: string;
	count: number;
}

export interface LeadsBySourceResponse {
	data: LeadsBySourceItem[];
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

// ============================================================================
// MILEAGE REPORT
// ============================================================================

export interface MileageReportVisit {
	visitId: string;
	jobId: string;
	jobName: string;
	jobAddress: string;
	clientName: string;
	visitDate: string;
	miles: number;
	visitStatus: string;
	technicianNames: string;
}

// ============================================================================
// TIMESHEETS REPORT
// ============================================================================

export interface TimesheetReportEntry {
	shiftId: string;
	technicianId: string;
	technicianName: string;
	startedAt: string;
	endedAt: string;
	grossHours: number;
	breakHours: number;
	payableHours: number;
}

// ============================================================================
// INVENTORY REORDER FORECAST
// ============================================================================

// Calculated over the last 90 days
export interface ReorderForecastRow {
	itemId: string;
	itemName: string;
	sku: string | null;
	category: string | null;
	unit: string | null;
	currentQuantity: number;
	qtyConsumed: number;
	avgDailyUsage: number;
	daysOfStock: number | null;
	projectedStockoutDate: string | null;
}

// ============================================================================
// Aged Receivables
// ============================================================================

export interface AgedReceivablesBucket {
	bucket: "0-30" | "31-60" | "61-90" | "90+";
	amount: number;
	count: number;
}

export interface AgedReceivablesResponse {
	data: AgedReceivablesBucket[];
	totalOutstanding: number;
}
