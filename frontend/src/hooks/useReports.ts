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
	AgedReceivablesResponse,
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

export const useAgedReceivablesQuery = (): UseQueryResult<AgedReceivablesResponse, Error> => {
	return useQuery({
		queryKey: ["reports", "aged-receivables"],
		queryFn: () => reportsApi.getAgedReceivables(),
	});
};
