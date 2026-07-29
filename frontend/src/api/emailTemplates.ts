import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { EmailTemplateCategory } from "../types/followups";
import type {
	EmailTemplate,
	UpsertTemplateInput,
	TemplatePreviewContext,
} from "../types/emailTemplates";

export const getTemplates = async (): Promise<EmailTemplate[]> => {
	const response = await api.get<ApiResponse<EmailTemplate[]>>("/followups/templates");
	return response.data.data || [];
};

export const getTemplateContext = async (): Promise<TemplatePreviewContext> => {
	const response = await api.get<ApiResponse<TemplatePreviewContext>>(
		"/followups/templates/context",
	);
	if (!response.data.data) throw new Error("Failed to load preview context");
	return response.data.data;
};

export const updateTemplate = async (
	category: EmailTemplateCategory,
	data: UpsertTemplateInput,
): Promise<EmailTemplate> => {
	const response = await api.put<ApiResponse<EmailTemplate>>(
		`/followups/templates/${category}`,
		data,
	);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to save template");
	}
	return response.data.data!;
};

export const resetTemplate = async (
	category: EmailTemplateCategory,
): Promise<EmailTemplate> => {
	const response = await api.post<ApiResponse<EmailTemplate>>(
		`/followups/templates/${category}/reset`,
	);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to reset template");
	}
	return response.data.data!;
};
