import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDrafts, getDraft, createDraft, updateDraft, deleteDraft } from "../../api/drafts";
import type {
	Draft,
	DraftSummary,
	CreateDraftInput,
	UpdateDraftInput,
	ListDraftsQuery,
	FormDraftType,
} from "../../types/drafts";

export const draftKeys = {
	all: ["drafts"] as const,
	lists: () => [...draftKeys.all, "list"] as const,
	list: (filters: ListDraftsQuery) => [...draftKeys.lists(), filters] as const,
	details: () => [...draftKeys.all, "detail"] as const,
	detail: (id: string) => [...draftKeys.details(), id] as const,
	byType: (type: FormDraftType, contextId?: string) =>
		[...draftKeys.lists(), { form_type: type, entity_context_id: contextId }] as const,
};

export const useDraftsQuery = (query?: ListDraftsQuery) => {
	return useQuery({
		queryKey: draftKeys.list(query || {}),
		queryFn: () => getDrafts(query),
	});
};

export const useDraftsByTypeQuery = (formType: FormDraftType, entityContextId?: string) => {
	return useQuery({
		queryKey: draftKeys.byType(formType, entityContextId),
		queryFn: () =>
			getDrafts({ form_type: formType, entity_context_id: entityContextId }),
		enabled: !!formType,
	});
};

export const useDraftQuery = (id: string | null) => {
	return useQuery({
		queryKey: draftKeys.detail(id || "null"),
		queryFn: () => getDraft(id!),
		enabled: !!id,
	});
};

export const useCreateDraftMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateDraftInput) => createDraft(input),
		onSuccess: (draft) => {
			queryClient.invalidateQueries({ queryKey: draftKeys.all });
			// Pre-populate detail cache so loadDraft hits cache on first selection
			queryClient.setQueryData(draftKeys.detail(draft.id), draft);
		},
	});
};

export const useUpdateDraftMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: string; input: UpdateDraftInput }) =>
			updateDraft(id, input),
		onSuccess: (draft) => {
			queryClient.setQueryData(draftKeys.detail(draft.id), draft);
			queryClient.invalidateQueries({ queryKey: draftKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: draftKeys.byType(
					draft.form_type,
					draft.entity_context_id || undefined
				),
			});
		},
	});
};

export const useDeleteDraftMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => deleteDraft(id),
		onSuccess: (_, id) => {
			queryClient.removeQueries({ queryKey: draftKeys.detail(id) });
			// Invalidate all draft list queries regardless of type/context
			queryClient.invalidateQueries({ queryKey: draftKeys.all });
		},
	});
};
