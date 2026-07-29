import type { FilterCondition, FilterJoin } from "../reports/reportSources";
import type { StockStatus } from "./inventory";

// ============================================================================
// REPORT CATEGORIES
// ============================================================================

export type ReportCategoryId = "financial" | "operational" | "technician" | "client";

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

export interface InventoryReportRow {
	id: string;
	name: string;
	sku: string | null;
	category: string | null;
	description: string;
	unit: string;
	isActive: boolean;
	quantity: number;
	fleetQty: number;
	fleetStandard: number;
	totalQty: number;
	lowStockThreshold: number | null;
	cost: number | null;
	unitPrice: number | null;
	assetValue: number | null;
	qtyUsed: number;
	stockStatus: StockStatus;
	location: string;
	tags: { label: string }[];
	altIds: string[];
	updatedAt: string;
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

export interface AgedReceivablesClientRow {
	clientId: string;
	clientName: string;
	bucket0_30: number;
	bucket31_60: number;
	bucket61_90: number;
	bucket90plus: number;
	total: number;
	count: number;
}

// ============================================================================
// Tax Liability
// ============================================================================

export interface TaxLiabilityRow {
	rateKey: string;
	jurisdiction: string;
	rateName: string;
	rate: number;
	taxableBase: number;
	taxCollected: number;
	invoiceCount: number;
}

// ============================================================================
// JOBS REPORT
// ============================================================================

export interface JobsReportRow {
	id: string;
	jobNumber: string;
	name: string;
	clientName: string;
	status: string;
	priority: string;
	jobType: string;
	source: string;
	address: string;
	createdAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	estimatedTotal: number | null;
	actualTotal: number | null;
	variance: number | null;
	subtotal: number;
	taxAmount: number;
	discountAmount: number | null;
	visitCount: number;
}

// ============================================================================
// INVOICES REPORT
// ============================================================================

export interface InvoicesReportRow {
	id: string;
	invoiceNumber: string;
	clientName: string;
	status: string;
	issueDate: string | null;
	dueDate: string | null;
	paidAt: string | null;
	sentAt: string | null;
	total: number;
	amountPaid: number;
	balanceDue: number;
	subtotal: number;
	taxAmount: number;
	daysOverdue: number;
	qbSyncStatus: string;
}

// ============================================================================
// CLIENTS REPORT
// ============================================================================

export interface ClientsReportRow {
	id: string;
	name: string;
	status: string;
	taxExempt: string;
	primaryContact: string | null;
	email: string | null;
	phone: string | null;
	address: string;
	contactCount: number;
	taxGroup: string | null;
	taxRate: number | null;
	createdAt: string;
	lastActivity: string;
	jobCount: number;
	invoiceCount: number;
	lifetimeRevenue: number;
	openBalance: number;
}

// ============================================================================
// PAYMENTS REPORT
// ============================================================================

export interface PaymentsReportRow {
	paymentId: string;
	paidAt: string;
	invoiceId: string;
	invoiceNumber: string;
	clientName: string;
	amount: number;
	method: string | null;
	note: string | null;
	recordedBy: string | null;
	qbSynced: boolean;
}

// ============================================================================
// QUOTE CONVERSION FUNNEL
// ============================================================================

export interface QuoteFunnelStages {
	created: number;
	issued: number;
	sent: number;
	viewed: number;
	approved: number;
}

export interface QuoteFunnelSourceRow {
	source: string;
	quotes: number;
	approved: number;
	rate: number;
}

export interface QuoteFunnelQuoteRow {
	quoteId: string;
	quoteNumber: string;
	title: string;
	clientName: string;
	status: string;
	source: string;
	total: number;
	createdAt: string;
	issuedAt: string | null;
	sentAt: string | null;
	viewedAt: string | null;
	approvedAt: string | null;
	daysToApprove: number | null;
}

export interface QuoteFunnelResponse {
	funnel: QuoteFunnelStages;
	winRate: number | null;
	avgDaysToApprove: number | null;
	valueWon: number;
	valueLost: number;
	bySource: QuoteFunnelSourceRow[];
	quotes: QuoteFunnelQuoteRow[];
}

// ============================================================================
// TECHNICIAN SCORECARD
// ============================================================================

export interface TechScorecardVisitRow {
	techId: string;
	techName: string;
	visitId: string;
	jobId: string;
	jobName: string;
	clientName: string;
	scheduledStartAt: string;
	actualStartAt: string | null;
	arrival: "Early" | "On Time" | "Late" | null;
	hoursWorked: number;
	revenueShare: number;
}

// ============================================================================
// SAVED REPORTS + FAVORITES
// ============================================================================

export interface SavedReportConfig {
	hidden: string[];
	date: string;
	search: string;
	sortKey: string;
	sortDir: "asc" | "desc";
	join: FilterJoin;
	conditions: FilterCondition[];
}

export interface SavedReport {
	id: string;
	organization_id: string;
	name: string;
	description: string | null;
	source: string;
	config: SavedReportConfig;
	created_by_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateSavedReportInput {
	name: string;
	source: string;
	description?: string | null;
	config: SavedReportConfig;
}

export interface UpdateSavedReportInput {
	name?: string;
	description?: string | null;
	config?: SavedReportConfig;
}

export type ReportFavoriteKind = "built_in" | "saved";

export interface ReportFavorite {
	id: string;
	organization_id: string;
	dispatcher_id: string;
	kind: ReportFavoriteKind;
	ref: string;
	created_at: string;
}

export interface CreateFavoriteInput {
	kind: ReportFavoriteKind;
	ref: string;
}

// ===========================================================================
// Page summary
// ===========================================================================
export interface PageSummaryResponse {
	page: string;
	stats: { label: string; value: number; format: "number" | "currency" | "percent" | "duration" }[];
	breakdown: { label: string; value: number; }[];
	breakdownLabel: string;
}