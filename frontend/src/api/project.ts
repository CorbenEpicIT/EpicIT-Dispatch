import {api} from "./axiosClient";
import type { CreateProjectInput, Project, UpdateProjectInput } from "../types/project";

// Mutations respond with non-2xx on validation / not-found / conflict, so axios
// throws; re-throw the server's own message rather than "Request failed with
// status code 4xx".
const rethrowServerMessage = (err: unknown): never => {
    const message = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
    if (message) throw new Error(message);
    throw err;
};

export const getProjects = async (): Promise<Project[]> => {
    const response = await api.get("/projects");
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to fetch projects");
    }
    return response.data.data || [];
};

export const getProjectById = async (projectId: string): Promise<Project> => {
    const response = await api.get(`/projects/${projectId}`);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to fetch project");
    }
    return response.data.data;
};

export const createProject = async (projectData: CreateProjectInput): Promise<Project> => {
    try {
        const response = await api.post("/projects", projectData);
        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error?.message || "Failed to create project");
        }
        return response.data.data;
    } catch (err) {
        return rethrowServerMessage(err);
    }
};

export const updateProject = async (
    projectId: string,
    projectData: UpdateProjectInput,
): Promise<Project> => {
    try {
        const response = await api.put(`/projects/${projectId}`, projectData);
        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error?.message || "Failed to update project");
        }
        return response.data.data;
    } catch (err) {
        return rethrowServerMessage(err);
    }
};

export const attachJobToProject = async (projectId: string, jobId: string): Promise<Project> => {
    try {
        const response = await api.post(`/projects/${projectId}/jobs/${jobId}`);
        if (!response.data.success || !response.data.data) {
            throw new Error(response.data.error?.message || "Failed to attach job to project");
        }
        return response.data.data;
    } catch (err) {
        return rethrowServerMessage(err);
    }
};

export const detachJobFromProject = async (projectId: string, jobId: string): Promise<void> => {
    try {
        const response = await api.delete(`/projects/${projectId}/jobs/${jobId}`);
        if (!response.data.success) {
            throw new Error(response.data.error?.message || "Failed to detach job from project");
        }
    } catch (err) {
        rethrowServerMessage(err);
    }
};

export const deleteProject = async (projectId: string): Promise<void> => {
    try {
        const response = await api.delete(`/projects/${projectId}`);
        if (!response.data.success) {
            throw new Error(response.data.error?.message || "Failed to delete project");
        }
    } catch (err) {
        rethrowServerMessage(err);
    }
};
