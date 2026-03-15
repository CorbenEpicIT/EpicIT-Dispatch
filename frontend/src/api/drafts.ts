import axios from "axios";
import type { ApiResponse } from "../types/api";
import type {
	Draft,
	DraftSummary,
	CreateDraftInput,
	UpdateDraftInput,
	ListDraftsQuery,
} from "../types/drafts";

const BASE_URL: string = import.meta.env.VITE_BACKEND_URL;

if (!BASE_URL) console.warn("Failed to load backend url environment variable!");

const api = axios.create({
	baseURL: BASE_URL,
});

export const getDrafts = async (query?: ListDraftsQuery): Promise<DraftSummary[]> => {
	const params = new URLSearchParams();
	if (query?.form_type) params.append("form_type", query.form_type);
	if (query?.entity_context_id) params.append("entity_context_id", query.entity_context_id);

	const url = `/drafts${params.toString() ? `?${params.toString()}` : ""}`;
	const response = await api.get<ApiResponse<DraftSummary[]>>(url);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch drafts");
	}

	return response.data.data ?? [];
};

export const getDraft = async (id: string): Promise<Draft> => {
	const response = await api.get<ApiResponse<Draft>>(`/drafts/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to fetch draft");
	}

	if (!response.data.data) {
		throw new Error("Draft not found");
	}

	return response.data.data;
};

export const createDraft = async (input: CreateDraftInput): Promise<Draft> => {
	const response = await api.post<ApiResponse<Draft>>("/drafts", input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create draft");
	}

	return response.data.data!;
};

export const updateDraft = async (id: string, input: UpdateDraftInput): Promise<Draft> => {
	const response = await api.put<ApiResponse<Draft>>(`/drafts/${id}`, input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update draft");
	}

	return response.data.data!;
};

export const deleteDraft = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/drafts/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete draft");
	}

	return response.data.data || { id };
};
