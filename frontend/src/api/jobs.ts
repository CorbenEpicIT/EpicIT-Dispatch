import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type {
	CreateJobInput,
	Job,
	CreateJobNoteInput,
	JobNote,
	UpdateJobNoteInput,
	JobVisit,
	CreateJobVisitInput,
	UpdateJobVisitInput,
} from "../types/jobs";


// ============================================
// JOB API
// ============================================

export const getAllJobs = async (): Promise<Job[]> => {
	const response = await api.get<ApiResponse<Job[]>>("/jobs");
	return response.data.data || [];
};

export const getJobById = async (id: string): Promise<Job> => {
	if (!id) {
		throw new Error("Job ID is required");
	}

	const response = await api.get<ApiResponse<Job>>(`/jobs/${id}`);

	if (!response.data.data) {
		throw new Error("Job not found");
	}

	return response.data.data;
};

export const createJob = async (input: CreateJobInput): Promise<Job> => {
	const response = await api.post<ApiResponse<Job>>("/jobs", input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create job");
	}

	return response.data.data!;
};

export const updateJob = async (id: string, updates: Partial<Job>): Promise<Job> => {
	const response = await api.patch<ApiResponse<Job>>(`/jobs/${id}`, updates);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update job");
	}

	return response.data.data!;
};

export const deleteJob = async (id: string): Promise<{ message: string; id: string }> => {
	const response = await api.delete<ApiResponse<{ message: string; id: string }>>(
		`/jobs/${id}`
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete job");
	}

	return response.data.data || { message: "Job deleted successfully", id };
};

// ============================================
// JOB VISIT API
// ============================================

export const getAllJobVisits = async (): Promise<JobVisit[]> => {
	const response = await api.get<ApiResponse<JobVisit[]>>("/job-visits");
	return response.data.data || [];
};

export const getJobVisitById = async (id: string): Promise<JobVisit> => {
	const response = await api.get<ApiResponse<JobVisit>>(`/job-visits/${id}`);

	if (!response.data.data) {
		throw new Error("Job visit not found");
	}

	return response.data.data;
};

export const getJobVisitsByJobId = async (jobId: string): Promise<JobVisit[]> => {
	const response = await api.get<ApiResponse<JobVisit[]>>(`/jobs/${jobId}/visits`);
	return response.data.data || [];
};

export const getJobVisitsByTechId = async (techId: string): Promise<JobVisit[]> => {
	const response = await api.get<ApiResponse<JobVisit[]>>(`/technicians/${techId}/visits`);
	return response.data.data || [];
};

export const getJobVisitsByDateRange = async (
	startDate: Date,
	endDate: Date
): Promise<JobVisit[]> => {
	const start = startDate.toISOString().split("T")[0]; // YYYY-MM-DD
	const end = endDate.toISOString().split("T")[0];

	const response = await api.get<ApiResponse<JobVisit[]>>(
		`/job-visits/date-range/${start}/${end}`
	);

	return response.data.data || [];
};

export const createJobVisit = async (input: CreateJobVisitInput): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>("/job-visits", input);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create job visit");
	}

	return response.data.data!;
};

export const updateJobVisit = async (
	id: string,
	updates: UpdateJobVisitInput
): Promise<JobVisit> => {
	const response = await api.put<ApiResponse<JobVisit>>(`/job-visits/${id}`, updates);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update job visit");
	}

	return response.data.data!;
};

export const assignTechniciansToVisit = async (
	visitId: string,
	techIds: string[]
): Promise<JobVisit> => {
	const response = await api.put<ApiResponse<JobVisit>>(
		`/job-visits/${visitId}/technicians`,
		{ tech_ids: techIds }
	);

	if (!response.data.success) {
		throw new Error(
			response.data.error?.message || "Failed to assign technicians to visit"
		);
	}

	return response.data.data!;
};

export const deleteJobVisit = async (id: string): Promise<{ message: string }> => {
	const response = await api.delete<ApiResponse<{ message: string }>>(`/job-visits/${id}`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete job visit");
	}

	return response.data.data || { message: "Job visit deleted successfully" };
};

// ============================================
// JOB VISIT LIFECYCLE API
// ============================================

export const startJobVisit = async (visitId: string): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>(`/job-visits/${visitId}/start`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to start visit");
	}

	return response.data.data!;
};

export const pauseJobVisit = async (visitId: string): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>(`/job-visits/${visitId}/pause`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to pause visit");
	}

	return response.data.data!;
};

export const resumeJobVisit = async (visitId: string): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>(`/job-visits/${visitId}/resume`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to resume visit");
	}

	return response.data.data!;
};

export const completeJobVisit = async (visitId: string): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>(`/job-visits/${visitId}/complete`);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to complete visit");
	}

	return response.data.data!;
};

export const cancelJobVisit = async (
	visitId: string,
	cancellationReason: string
): Promise<JobVisit> => {
	const response = await api.post<ApiResponse<JobVisit>>(`/job-visits/${visitId}/cancel`, {
		cancellation_reason: cancellationReason,
	});

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to cancel visit");
	}

	return response.data.data!;
};

// ============================================
// JOB NOTES API
// ============================================

export const getJobNotes = async (jobId: string): Promise<JobNote[]> => {
	const response = await api.get<ApiResponse<JobNote[]>>(`/jobs/${jobId}/notes`);
	return response.data.data || [];
};

export const createJobNote = async (jobId: string, data: CreateJobNoteInput): Promise<JobNote> => {
	const response = await api.post<ApiResponse<JobNote>>(`/jobs/${jobId}/notes`, data);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to create job note");
	}

	return response.data.data!;
};

export const updateJobNote = async (
	jobId: string,
	noteId: string,
	data: UpdateJobNoteInput
): Promise<JobNote> => {
	const response = await api.put<ApiResponse<JobNote>>(
		`/jobs/${jobId}/notes/${noteId}`,
		data
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to update job note");
	}

	return response.data.data!;
};

export const deleteJobNote = async (
	jobId: string,
	noteId: string
): Promise<{ message: string }> => {
	const response = await api.delete<ApiResponse<{ message: string }>>(
		`/jobs/${jobId}/notes/${noteId}`
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to delete job note");
	}

	return response.data.data || { message: "Job note deleted successfully" };
};
