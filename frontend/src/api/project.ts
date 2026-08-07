import {api} from "./axiosClient";
import type { CreateProjectInput, Project, UpdateProjectInput } from "../types/project";

interface ProjectMutationPayload {
    err?: string;
    project?: Project;
}

const unwrapProject = (
    payload: ProjectMutationPayload | null | undefined,
    fallback: string,
): Project => {
    if (payload?.err) throw new Error(payload.err);
    if (!payload?.project) throw new Error(fallback);
    return payload.project;
};

const assertNoError = (payload: ProjectMutationPayload | null | undefined) => {
    if (payload?.err) throw new Error(payload.err);
};

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
    const response = await api.post("/projects", projectData);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to create project");
    }
    return unwrapProject(response.data.data, "Failed to create project");
};

export const updateProject = async (
    projectId: string,
    projectData: UpdateProjectInput,
): Promise<Project> => {
    const response = await api.put(`/projects/${projectId}`, projectData);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to update project");
    }
    return unwrapProject(response.data.data, "Failed to update project");
};

export const attachJobToProject = async (projectId: string, jobId: string): Promise<Project> => {
    try {
        const response = await api.post(`/projects/${projectId}/jobs/${jobId}`, { jobId });
        if (!response.data.success) {
            throw new Error(response.data.error?.message || "Failed to attach job to project");
        }
        return unwrapProject(response.data.data, "Failed to attach job to project");
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
        assertNoError(response.data.data);
    } catch (err) {
        rethrowServerMessage(err);
    }
};

export const deleteProject = async (projectId: string): Promise<void> => {
    const response = await api.delete(`/projects/${projectId}`);
    if (!response.data.success) {
        throw new Error(response.data.error?.message || "Failed to delete project");
    }
    assertNoError(response.data.data);
};
