import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { ActivityLog } from "../types/logs";

export interface RecentLogsResult {
	data: ActivityLog[];
	hasMore: boolean;
}

export const getRecentLogs = async (limit = 25, cursor?: string): Promise<RecentLogsResult> => {
	const params = new URLSearchParams({ limit: String(limit) });
	if (cursor) params.set("cursor", cursor);
	const response = await api.get<ApiResponse<ActivityLog[]>>(`/logs/recent?${params}`);
	return {
		data: response.data.data || [],
		hasMore: (response.data.meta as Record<string, unknown>)?.hasMore === true,
	};
};
