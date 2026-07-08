import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	SavedReport,
	CreateSavedReportInput,
	UpdateSavedReportInput,
	ReportFavorite,
	CreateFavoriteInput,
} from "../types/reports";

export const getSavedReports = async (): Promise<SavedReport[]> => {
	const response = await api.get<ApiResponse<SavedReport[]>>("/reports/saved");
	return response.data.data || [];
};

export const getSavedReport = async (id: string): Promise<SavedReport> => {
	const response = await api.get<ApiResponse<SavedReport>>(`/reports/saved/${id}`);
	if (!response.data.data) {
		throw new Error(response.data.error?.message || "Saved report not found");
	}
	return response.data.data;
};

export const createSavedReport = async (
	input: CreateSavedReportInput,
): Promise<SavedReport> => {
	const response = await api.post<ApiResponse<SavedReport>>("/reports/saved", input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to save report");
	}
	return response.data.data!;
};

export const updateSavedReport = async (
	id: string,
	input: UpdateSavedReportInput,
): Promise<SavedReport> => {
	const response = await api.put<ApiResponse<SavedReport>>(`/reports/saved/${id}`, input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update report");
	}
	return response.data.data!;
};

export const deleteSavedReport = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/reports/saved/${id}`);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete report");
	}
	return response.data.data || { id };
};

export const getReportFavorites = async (): Promise<ReportFavorite[]> => {
	const response = await api.get<ApiResponse<ReportFavorite[]>>("/reports/favorites");
	return response.data.data || [];
};

export const addReportFavorite = async (
	input: CreateFavoriteInput,
): Promise<ReportFavorite> => {
	const response = await api.post<ApiResponse<ReportFavorite>>("/reports/favorites", input);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to add favorite");
	}
	return response.data.data!;
};

export const removeReportFavorite = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/reports/favorites/${id}`);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to remove favorite");
	}
	return response.data.data || { id };
};
