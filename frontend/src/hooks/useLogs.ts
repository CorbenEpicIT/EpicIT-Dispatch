import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import * as logApi from "../api/logs";
import type { ActivityLog } from "../types/logs";

export const useRecentActivityQuery = (
	limit = 25
): UseQueryResult<ActivityLog[], Error> => {
	return useQuery({
		queryKey: ["activity-feed", limit],
		queryFn: () => logApi.getRecentLogs(limit),
		refetchInterval: 30_000,
		retry: 1,
	});
};
