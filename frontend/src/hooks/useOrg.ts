import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import * as orgApi from "../api/org";
import type { OrgSettings, OrgSettingsUpdate } from "../api/org";

export const useOrgSettings = (): UseQueryResult<OrgSettings, Error> => {
	return useQuery({
		queryKey: ["org"],
		queryFn: orgApi.getOrgSettings,
	});
};

export const useUpdateOrgSettings = (): UseMutationResult<OrgSettings, Error, OrgSettingsUpdate> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: orgApi.updateOrgSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["org"] });
		},
	});
};

export const useUploadOrgLogo = (): UseMutationResult<string, Error, File> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: orgApi.uploadOrgLogo,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["org"] });
		},
	});
};

export const useDeleteOrgLogo = (): UseMutationResult<void, Error, void> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: orgApi.deleteOrgLogo,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["org"] });
		},
	});
};
