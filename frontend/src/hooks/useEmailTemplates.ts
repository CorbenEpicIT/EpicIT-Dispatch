import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type { EmailTemplateCategory } from "../types/followups";
import type {
	EmailTemplate,
	UpsertTemplateInput,
	TemplatePreviewContext,
} from "../types/emailTemplates";
import * as templatesApi from "../api/emailTemplates";

export const useTemplatesQuery = (): UseQueryResult<EmailTemplate[], Error> => {
	return useQuery({
		queryKey: ["followups", "templates"],
		queryFn: templatesApi.getTemplates,
	});
};

export const useTemplateContextQuery = (): UseQueryResult<TemplatePreviewContext, Error> => {
	return useQuery({
		queryKey: ["followups", "templates", "context"],
		queryFn: templatesApi.getTemplateContext,
		staleTime: 5 * 60 * 1000,
	});
};

export const useUpdateTemplateMutation = (): UseMutationResult<
	EmailTemplate,
	Error,
	{ category: EmailTemplateCategory; data: UpsertTemplateInput }
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ category, data }) => templatesApi.updateTemplate(category, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["followups", "templates"] });
		},
	});
};

export const useResetTemplateMutation = (): UseMutationResult<
	EmailTemplate,
	Error,
	EmailTemplateCategory
> => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (category) => templatesApi.resetTemplate(category),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["followups", "templates"] });
		},
	});
};
