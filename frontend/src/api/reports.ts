import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	OverviewResponse,
	RevenueYTDResponse,
	RevenueByJobTypeResponse,
	UnscheduledRevenueResponse,
	QuotePipelineResponse,
	ArrivalPerformanceResponse,
} from "../types/reports";

// ============================================================================
// REPORTS API
// ============================================================================

export const getOverview = async (
	startDate: string,
	endDate: string,
): Promise<OverviewResponse> => {
	const params: Record<string, string> = { startDate, endDate };

	const response = await api.get<ApiResponse<OverviewResponse>>(
		"/reports/overview",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch overview metrics");
	}

	return response.data.data;
};

export const getRevenueYTD = async (
	year?: number,
): Promise<RevenueYTDResponse> => {
	const params: Record<string, string> = {};
	if (year) params.year = String(year);

	const response = await api.get<ApiResponse<RevenueYTDResponse>>(
		"/reports/revenue-ytd",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch revenue data");
	}

	return response.data.data;
};

export const getRevenueByJobType = async (
	startDate: string,
	endDate: string,
): Promise<RevenueByJobTypeResponse> => {
	const params: Record<string, string> = { startDate, endDate };

	const response = await api.get<ApiResponse<RevenueByJobTypeResponse>>(
		"/reports/revenue-by-job-type",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch revenue by job type");
	}

	return response.data.data;
};

export const getUnscheduledRevenue = async (): Promise<UnscheduledRevenueResponse> => {
	const response = await api.get<ApiResponse<UnscheduledRevenueResponse>>(
		"/reports/unscheduled-revenue",
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch unscheduled revenue");
	}

	return response.data.data;
};

export const getQuotePipeline = async (
	startDate: string,
	endDate: string,
): Promise<QuotePipelineResponse> => {
	const params: Record<string, string> = { startDate, endDate };
	const response = await api.get<ApiResponse<QuotePipelineResponse>>(
		"/reports/quote-pipeline",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch quote pipeline");
	}

	return response.data.data;
};

export const getArrivalPerformance = async (
	startDate: string,
	endDate: string,
): Promise<ArrivalPerformanceResponse> => {
	const params: Record<string, string> = { startDate, endDate };

	const response = await api.get<ApiResponse<ArrivalPerformanceResponse>>(
		"/reports/arrival-performance",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch arrival performance");
	}

	return response.data.data;
};
