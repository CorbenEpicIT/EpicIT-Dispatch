import type { ColumnType, FilterCondition, FilterJoin } from "../reports/reportSources";
import type { StockStatus, UnitBasis } from "./inventory";

// ============================================================================
// REPORT CATEGORIES
// ============================================================================

export type ReportCategoryId = "financial" | "operational" | "technician" | "client";

// ============================================================================
// PAGINATION
// ============================================================================

export type ReportRowRecord = Record<string, unknown>;

export interface Paginated<T = ReportRowRecord> {
	rows: T[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
	summary?: Record<string, unknown>;
}

export interface ReportFetchParams {
	startDate?: string;
	endDate?: string;
	search?: string;
	searchTerms?: string[];
	conditions?: FilterCondition[];
	join?: FilterJoin;
	sortKey?: string;
	sortDir?: "asc" | "desc";
	sortType?: ColumnType;
	page?: number;
	limit?: number;
	include_inactive?: boolean;
	lookbackDays?: number;
}

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

// The reorder verdict, computed server-side in reportsController's
// buildReorderForecast so this report's table, the priority chart, and the item
// detail page can never disagree about the same item. Never re-derive it
// locally from daysOfStock — that drift is exactly what this replaced.
export type ReorderSeverity = 'critical' | 'warning' | 'healthy' | 'unknown';

// Calculated over the last REORDER_FORECAST_WINDOW_DAYS days.
export interface ReorderForecastRow {
	itemId: string;
	itemName: string;
	sku: string | null;
	category: string | null;
	unit: string | null;
	// ORG-WIDE on-hand: warehouse + every vehicle, matching the org-wide
	// consumption it's divided by. The split is carried separately because
	// "order more" and "move some out to a van" are different actions.
	currentQuantity: number;
	warehouseQuantity: number;
	vehicleQuantity: number;
	// null when the consumption behind them spans a unit change (consumptionBasis
	// below). The on-hand figures above stay non-null: they come from the cached
	// quantity columns, always in the item's current unit, not from a ledger sum.
	qtyConsumed: number | null;
	avgDailyUsage: number | null;
	// Denomination of the consumption this forecast burns down, from the units stamped
	// on the movements — never from `unit` above, which is the item's CURRENT unit.
	// When mixed, the rate, runway and stockout date are withheld together and
	// `severity` falls back to the bands that need no rate.
	consumptionBasis: UnitBasis;
	// Days of history the rate was actually measured over — less than the window
	// for a young item. Carried so a rate built on 4 days isn't read as a 90-day
	// average. A time span, so it survives a unit break.
	observedDays: number;
	daysOfStock: number | null;
	projectedStockoutDate: string | null;
	// Warehouse-scoped reorder trigger (the low-stock threshold is a warehouse
	// number), unlike the org-wide runway above.
	lowStockThreshold: number | null;
	belowReorderPoint: boolean;
	severity: ReorderSeverity;
}

// The forecast window is FIXED server-side (reportRegistry.ts's "reorder-forecast"
// entry defaults lookbackDays to 90 and this report sends no override). Stated in
// one place so the report labels the same window ReorderHealthCard does.
export const REORDER_FORECAST_WINDOW_DAYS = 90;

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
	// null when this item's consumption spans a unit change — never 0, which is the
	// real answer for "never consumed" and has to stay distinguishable in a report
	// people export and act on.
	qtyUsed: number | null;
	qtyUsedBasis: UnitBasis;
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

export interface ClientRetentionRow {
	id: string;
	name: string;
	primaryContact: string;
	email: string;
	phone: string;
	lastActivity: string;
	lifetimeRevenue: number;
	jobCount: number;
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
// FIRST-TIME FIX RATE
// ============================================================================

export interface FirstTimeFixRow {
	id: string;
	jobNumber: string;
	name: string;
	clientName: string;
	completedAt: string;
	visitCount: number;
	firstTimeFix: string;
}

export interface FirstTimeFixSummary {
	completedJobs: number;
	firstTimeFix: number;
	repeatVisit: number;
	ftfrPercent: number;
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