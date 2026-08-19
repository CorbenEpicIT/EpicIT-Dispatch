import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getChangeHistory, type ChangeHistoryResult } from "../api/logs";
import type { ChangeScope } from "../types/logs";

export const CHANGE_HISTORY_REFETCH_MS = 60_000;
export const CHANGE_HISTORY_PAGE_SIZE = 20;

export const useChangeHistory = (
	scope: ChangeScope,
	limit: number = CHANGE_HISTORY_PAGE_SIZE,
	options?: { enabled?: boolean },
): UseQueryResult<ChangeHistoryResult, Error> => {
	return useQuery({
		queryKey: ["changes", scope.kind, scope.type, scope.id, limit],
		queryFn: () => getChangeHistory(scope, limit),
		enabled: options?.enabled !== undefined ? options.enabled : !!scope.id,
		staleTime: CHANGE_HISTORY_REFETCH_MS,
		refetchInterval: CHANGE_HISTORY_REFETCH_MS,
		placeholderData: keepPreviousData,
	});
};
