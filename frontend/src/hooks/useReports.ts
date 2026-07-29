import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
	OverviewResponse,
	RevenueYTDResponse,
	RevenueByJobTypeResponse,
	LeadsBySourceResponse,
	UnscheduledRevenueResponse,
	QuotePipelineResponse,
	ArrivalPerformanceResponse,
	MileageReportVisit,
	TimesheetReportEntry,
	ReorderForecastRow,
	InventoryReportRow,
	AgedReceivablesResponse,
	AgedReceivablesClientRow,
	TaxLiabilityRow,
	JobsReportRow,
	InvoicesReportRow,
	ClientsReportRow,
	PaymentsReportRow,
	QuoteFunnelResponse,
	TechScorecardVisitRow,
	PageSummaryResponse
} from "../types/reports";
import * as reportsApi from "../api/reports";

// ============================================================================
// REPORT QUERIES
// ============================================================================

export const useOverviewQuery = (
	startDate: string,
	endDate: string,
): UseQueryResult<OverviewResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "overview", startDate, endDate],
		queryFn: () => reportsApi.getOverview(startDate, endDate),
		enabled: !!startDate && !!endDate,
	});
};

export const useRevenueYTDQuery = (
	year?: number,
): UseQueryResult<RevenueYTDResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "revenue-ytd", year],
		queryFn: () => reportsApi.getRevenueYTD(year),
	});
};

export const useRevenueByJobTypeQuery = (
	startDate: string,
	endDate: string,
): UseQueryResult<RevenueByJobTypeResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "revenue-by-job-type", startDate, endDate],
		queryFn: () => reportsApi.getRevenueByJobType(startDate, endDate),
		enabled: !!startDate && !!endDate,
	});
};

export const useLeadsBySourceQuery = (
	startDate: string,
	endDate: string,
): UseQueryResult<LeadsBySourceResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "leads-by-source", startDate, endDate],
		queryFn: () => reportsApi.getLeadsBySource(startDate, endDate),
		enabled: !!startDate && !!endDate,
	});
};

export const useUnscheduledRevenueQuery = (): UseQueryResult<UnscheduledRevenueResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "unscheduled-revenue"],
		queryFn: () => reportsApi.getUnscheduledRevenue(),
	});
};

export const useQuotePipelineQuery = (
	startDate: string,
	endDate: string,
): UseQueryResult<QuotePipelineResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "quote-pipeline", startDate, endDate],
		queryFn: () => reportsApi.getQuotePipeline(startDate, endDate),
		enabled: !!startDate && !!endDate,
	});
};

export const useArrivalPerformanceQuery = (
	startDate: string,
	endDate: string,
): UseQueryResult<ArrivalPerformanceResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "arrival-performance", startDate, endDate],
		queryFn: () => reportsApi.getArrivalPerformance(startDate, endDate),
		enabled: !!startDate && !!endDate,
	});
};

export const useMileageReportQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<MileageReportVisit[], Error> => {
	return useQuery({
		queryKey: ["reports", "mileage", startDate, endDate],
		queryFn: () => reportsApi.getMileageReport(startDate, endDate),
	});
};

export const useTimesheetsReportQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<TimesheetReportEntry[], Error> => {
	return useQuery({
		queryKey: ["reports", "timesheets", startDate, endDate],
		queryFn: () => reportsApi.getTimesheetsReport(startDate, endDate),
	});
};

export const useReorderForecastQuery = (): UseQueryResult<ReorderForecastRow[], Error> => {
	return useQuery({
		queryKey: ["reports", "reorder-forecast"],
		queryFn: () => reportsApi.getReorderForecast(),
	});
};

export const useInventoryReportQuery = (
	range?: { start: Date; end: Date } | null,
): UseQueryResult<InventoryReportRow[], Error> => {
	return useQuery({
		queryKey: [
			"reports",
			"inventory-full",
			range ? `${range.start.toISOString()}|${range.end.toISOString()}` : "all",
		],
		queryFn: () => reportsApi.getInventoryReport(range),
	});
};

export const useAgedReceivablesQuery = (): UseQueryResult<AgedReceivablesResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "aged-receivables"],
		queryFn: () => reportsApi.getAgedReceivables(),
	});
};

export const useAgedReceivablesByClientQuery = (): UseQueryResult<
	AgedReceivablesClientRow[],
	Error
> => {
	return useQuery({
		queryKey: ["reports", "aged-receivables", "by-client"],
		queryFn: () => reportsApi.getAgedReceivablesByClient(),
	});
};

export const useTaxLiabilityReportQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<TaxLiabilityRow[], Error> => {
	return useQuery({
		queryKey: ["reports", "tax-liability", startDate, endDate],
		queryFn: () => reportsApi.getTaxLiabilityReport(startDate, endDate),
	});
};

export const useJobsReportQuery = (
	range?: { start: Date; end: Date } | null,
): UseQueryResult<JobsReportRow[], Error> => {
	return useQuery({
		queryKey: [
			"reports",
			"jobs",
			range ? `${range.start.toISOString()}|${range.end.toISOString()}` : "all",
		],
		queryFn: () => reportsApi.getJobsReport(range),
	});
};

export const useInvoicesReportQuery = (
	range?: { start: Date; end: Date } | null,
): UseQueryResult<InvoicesReportRow[], Error> => {
	return useQuery({
		queryKey: [
			"reports",
			"invoices",
			range ? `${range.start.toISOString()}|${range.end.toISOString()}` : "all",
		],
		queryFn: () => reportsApi.getInvoicesReport(range),
	});
};

export const useClientsReportQuery = (): UseQueryResult<ClientsReportRow[], Error> => {
	return useQuery({
		queryKey: ["reports", "clients"],
		queryFn: () => reportsApi.getClientsReport(),
	});
};

export const usePaymentsReportQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<PaymentsReportRow[], Error> => {
	return useQuery({
		queryKey: ["reports", "payments", startDate, endDate],
		queryFn: () => reportsApi.getPaymentsReport(startDate, endDate),
	});
};

export const useQuoteFunnelQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<QuoteFunnelResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "quote-funnel", startDate, endDate],
		queryFn: () => reportsApi.getQuoteFunnelReport(startDate, endDate),
	});
};

export const useTechnicianScorecardQuery = (
	startDate?: string,
	endDate?: string,
): UseQueryResult<TechScorecardVisitRow[], Error> => {
	return useQuery({
		queryKey: ["reports", "technician-scorecard", startDate, endDate],
		queryFn: () => reportsApi.getTechnicianScorecard(startDate, endDate),
	});
};

export const usePageSummaryQuery = (
	page: string,
	startDate?: string,
	endDate?: string,
	groupBy?: string,
): UseQueryResult<PageSummaryResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "page-summary", page, startDate, endDate, groupBy],
		queryFn: () => reportsApi.getPageSummary(page, startDate, endDate, groupBy),
	});
};