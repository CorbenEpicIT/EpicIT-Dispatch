import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";

export interface OrgSettings {
	id: string;
	name: string;
	logo_url: string | null;
	phone: string | null;
	address: string | null;
	coords: { lat: number; lon: number } | null;
	email: string | null;
	website: string | null;
	tax_rate: string;
}

export interface OrgSettingsUpdate {
	name?: string;
	phone?: string | null;
	address?: string | null;
	coords?: { lat: number; lon: number } | null;
	email?: string | null;
	website?: string | null;
}

export const getOrgSettings = async (): Promise<OrgSettings> => {
	const response = await api.get<ApiResponse<OrgSettings>>("/org");
	if (!response.data.data) throw new Error("Organization not found");
	return response.data.data;
};

export const updateOrgSettings = async (data: OrgSettingsUpdate): Promise<OrgSettings> => {
	const response = await api.patch<ApiResponse<OrgSettings>>("/org", data);
	if (!response.data.data) throw new Error("Failed to update organization");
	return response.data.data;
};

export const uploadOrgLogo = async (file: File): Promise<string> => {
	const formData = new FormData();
	formData.append("image", file);
	const response = await api.post<ApiResponse<{ url: string }>>("/org/logo", formData, {
		headers: { "Content-Type": "multipart/form-data" },
	});
	if (!response.data.data) throw new Error("Upload failed");
	return response.data.data.url;
};

export const deleteOrgLogo = async (): Promise<void> => {
	await api.delete("/org/logo");
};
