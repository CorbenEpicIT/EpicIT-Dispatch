import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { ActivityLog } from "../types/logs";

export const getRecentLogs = async (limit = 25): Promise<ActivityLog[]> => {
	const response = await api.get<ApiResponse<ActivityLog[]>>(
		`/logs/recent?limit=${limit}`
	);
	return response.data.data || [];
};
