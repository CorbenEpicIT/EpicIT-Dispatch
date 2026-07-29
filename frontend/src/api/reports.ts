import { api } from "./axiosClient";
import { triggerDownload } from "../util/download";
import type { ApiResponse } from "../types/api";
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

export const getLeadsBySource = async (
	startDate: string,
	endDate: string,
): Promise<LeadsBySourceResponse> => {
	const params: Record<string, string> = { startDate, endDate };

	const response = await api.get<ApiResponse<LeadsBySourceResponse>>(
		"/reports/leads-by-source",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch leads by source");
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

export const getMileageReport = async (
	startDate?: string,
	endDate?: string,
): Promise<MileageReportVisit[]> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<MileageReportVisit[]>>(
		"/reports/mileage",
		{ params },
	);
	if (!response.data.data) throw new Error("Failed to fetch mileage report");
	return response.data.data;
};

export const getTimesheetsReport = async (
	startDate?: string,
	endDate?: string,
): Promise<TimesheetReportEntry[]> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<TimesheetReportEntry[]>>(
		"/reports/timesheets",
		{ params },
	);
	if (!response.data.data) throw new Error("Failed to fetch timesheets report");
	return response.data.data;
};

export const getReorderForecast = async (): Promise<ReorderForecastRow[]> => {
	const response = await api.get<ApiResponse<ReorderForecastRow[]>>(
		"/reports/inventory/reorder-forecast",
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch reorder forecast");
	}

	return response.data.data;
};

export const getInventoryReport = async (
	range?: { start: Date; end: Date } | null,
): Promise<InventoryReportRow[]> => {
	const params: Record<string, string> = { include_inactive: "true" };
	if (range) {
		params.startDate = range.start.toISOString();
		params.endDate = range.end.toISOString();
	}

	const response = await api.get<ApiResponse<InventoryReportRow[]>>(
		"/reports/inventory/full",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch inventory report");
	}

	return response.data.data;
};

export const getAgedReceivables = async (): Promise<AgedReceivablesResponse> => {
	const response = await api.get<ApiResponse<AgedReceivablesResponse>>(
		"/reports/receivables/aging",
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch aged receivables");
	}

	return response.data.data;
};

export const getAgedReceivablesByClient = async (): Promise<AgedReceivablesClientRow[]> => {
	const response = await api.get<ApiResponse<AgedReceivablesClientRow[]>>(
		"/reports/receivables/aging/by-client",
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch aged receivables by client");
	}

	return response.data.data;
};

export const getTaxLiabilityReport = async (
	startDate?: string,
	endDate?: string,
): Promise<TaxLiabilityRow[]> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<TaxLiabilityRow[]>>(
		"/reports/tax-liability",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch tax liability report");
	}

	return response.data.data;
};

export const getJobsReport = async (
	range?: { start: Date; end: Date } | null,
): Promise<JobsReportRow[]> => {
	const params: Record<string, string> = {};
	if (range) {
		params.startDate = range.start.toISOString();
		params.endDate = range.end.toISOString();
	}

	const response = await api.get<ApiResponse<JobsReportRow[]>>("/reports/jobs", { params });

	if (!response.data.data) {
		throw new Error("Failed to fetch jobs report");
	}

	return response.data.data;
};

export const getInvoicesReport = async (
	range?: { start: Date; end: Date } | null,
): Promise<InvoicesReportRow[]> => {
	const params: Record<string, string> = {};
	if (range) {
		params.startDate = range.start.toISOString();
		params.endDate = range.end.toISOString();
	}

	const response = await api.get<ApiResponse<InvoicesReportRow[]>>("/reports/invoices", {
		params,
	});

	if (!response.data.data) {
		throw new Error("Failed to fetch invoices report");
	}

	return response.data.data;
};

export const getClientsReport = async (): Promise<ClientsReportRow[]> => {
	const response = await api.get<ApiResponse<ClientsReportRow[]>>("/reports/clients");

	if (!response.data.data) {
		throw new Error("Failed to fetch clients report");
	}

	return response.data.data;
};

export const getPaymentsReport = async (
	startDate?: string,
	endDate?: string,
): Promise<PaymentsReportRow[]> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<PaymentsReportRow[]>>("/reports/payments", {
		params,
	});

	if (!response.data.data) {
		throw new Error("Failed to fetch payments report");
	}

	return response.data.data;
};

export const getQuoteFunnelReport = async (
	startDate?: string,
	endDate?: string,
): Promise<QuoteFunnelResponse> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<QuoteFunnelResponse>>("/reports/quote-funnel", {
		params,
	});

	if (!response.data.data) {
		throw new Error("Failed to fetch quote funnel report");
	}

	return response.data.data;
};

export const getTechnicianScorecard = async (
	startDate?: string,
	endDate?: string,
): Promise<TechScorecardVisitRow[]> => {
	const params: Record<string, string> = {};
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const response = await api.get<ApiResponse<TechScorecardVisitRow[]>>(
		"/reports/technician-scorecard",
		{ params },
	);

	if (!response.data.data) {
		throw new Error("Failed to fetch technician scorecard");
	}

	return response.data.data;
};

export interface ExportColumn {
	key: string;
	label: string;
}

export interface ExportReportArgs {
	filename: string;
	columns: ExportColumn[];
	rows: Array<Record<string, unknown>>;
	sheetName?: string;
}

export const exportReport = async ({
	filename,
	columns,
	rows,
	sheetName,
}: ExportReportArgs): Promise<void> => {
	const response = await api.post(
		"/reports/export",
		{ filename, sheetName, columns, rows },
		{ responseType: "blob" },
	);
	triggerDownload(response.data as Blob, filename);
};

export const getPageSummary = async (
	page: string,
	startDate?: string,
	endDate?: string,
	groupBy?: string,
): Promise<PageSummaryResponse> => {
	const params: Record<string, string> = {};
	params.page = page;
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;
	if (groupBy) params.groupBy = groupBy;
	const response = await api.get("/reports/page-summary", { params });
	if (!response.data.data){
		throw new Error("Failed to fetch page summary");
	}
	return response.data.data;
}