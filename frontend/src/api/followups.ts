import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	FollowupSequence,
	CreateSequenceInput,
	UpdateSequenceInput,
	FollowupEnrollment,
	EnrollInput,
} from "../types/followups";

// ============================================================================
// SEQUENCE API
// ============================================================================

export const getSequences = async (): Promise<FollowupSequence[]> => {
	const response = await api.get<ApiResponse<FollowupSequence[]>>("/followups/sequences");
	return response.data.data || [];
};

export const getSequenceById = async (id: string): Promise<FollowupSequence> => {
	const response = await api.get<ApiResponse<FollowupSequence>>(`/followups/sequences/${id}`);

	if (!response.data.data) {
		throw new Error("Sequence not found");
	}

	return response.data.data;
};

export const createSequence = async (input: CreateSequenceInput): Promise<FollowupSequence> => {
	const response = await api.post<ApiResponse<FollowupSequence>>("/followups/sequences", input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create sequence");
	}

	return response.data.data!;
};

export const updateSequence = async (
	id: string,
	data: UpdateSequenceInput
): Promise<FollowupSequence> => {
	const response = await api.patch<ApiResponse<FollowupSequence>>(`/followups/sequences/${id}`, data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update sequence");
	}

	return response.data.data!;
};

export const deleteSequence = async (id: string): Promise<{ id: string }> => {
	const response = await api.delete<ApiResponse<{ id: string }>>(`/followups/sequences/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete sequence");
	}

	return response.data.data || { id };
};

// ============================================================================
// ENROLLMENT API
// ============================================================================

export interface EnrollmentFilters {
	status?: string;
	client_id?: string;
}

export const getEnrollments = async (
	filters?: EnrollmentFilters
): Promise<FollowupEnrollment[]> => {
	const params = new URLSearchParams();
	if (filters?.status) params.append("status", filters.status);
	if (filters?.client_id) params.append("client_id", filters.client_id);
	const qs = params.toString();

	const response = await api.get<ApiResponse<FollowupEnrollment[]>>(
		`/followups/enrollments${qs ? `?${qs}` : ""}`
	);
	return response.data.data || [];
};

export const enrollClient = async (input: EnrollInput): Promise<FollowupEnrollment> => {
	const response = await api.post<ApiResponse<FollowupEnrollment>>("/followups/enroll", input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to enroll client");
	}

	return response.data.data!;
};

export const stopEnrollment = async (id: string): Promise<FollowupEnrollment> => {
	const response = await api.post<ApiResponse<FollowupEnrollment>>(
		`/followups/enrollments/${id}/stop`
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to stop enrollment");
	}

	return response.data.data!;
};
