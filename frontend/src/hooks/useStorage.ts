import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { presignKeys } from "../api/storage";

export const usePresignedUrls = (
	keys: string[],
): UseQueryResult<Record<string, string>, Error> => {
	return useQuery({
		queryKey: ["presign", keys],
		queryFn: () => presignKeys(keys),
		enabled: keys.length > 0,
		staleTime: 50 * 60 * 1000,
	});
};
