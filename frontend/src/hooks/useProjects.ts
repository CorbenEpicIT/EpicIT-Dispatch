import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClientProjects } from "../api/clients";
import type { CreateProjectInput, UpdateProjectInput } from "../types/project";
import {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    attachJobToProject,
    detachJobFromProject,
    deleteProject
} from "../api/project";

// Queries

export function useClientProjectsQuery(clientId: string) {
	return useQuery({
		queryKey: ["clientProjects", clientId],
		queryFn: () => getClientProjects(clientId)
	});
}

export function useProjectsQuery() {
    return useQuery({
        queryKey: ["projects"],
        queryFn: getProjects,
    });
}

export function useProjectByIdQuery(projectId: string) {
    return useQuery({
        queryKey: ["project", projectId],
        queryFn: () => getProjectById(projectId),
        enabled: !!projectId,
    });
}

// Mutations

export function useCreateProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateProjectInput) => createProject(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        }
    });
}

export function useUpdateProjectMutation(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: UpdateProjectInput) => updateProject(projectId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        }
    });
}

export function useAttachJobToProjectMutation(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (jobId: string) => attachJobToProject(projectId, jobId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }
    });
}

export function useDetachJobFromProjectMutation(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (jobId: string) => detachJobFromProject(projectId, jobId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }
    });
}

export function useDeleteProjectMutation(projectId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => deleteProject(projectId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        }
    });
}