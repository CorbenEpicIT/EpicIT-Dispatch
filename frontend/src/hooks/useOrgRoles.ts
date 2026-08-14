import {
    getOrgRoles,
    createOrgRole,
    updateOrgRole,
    deleteOrgRole,
    getOrgRoleById,
    assignOrgRole,
} from "../api/organizations";
import type { OrganizationRole } from "../types/organizations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "./usePermission";

// ============================================================================
// Queries
// ============================================================================

export const useOrgRolesQuery = () => {
    const canManageRoles = usePermission("manage_roles");
    return useQuery({
        queryKey: ["organizationRoles"],
        queryFn: getOrgRoles,
        enabled: canManageRoles,
    });
};

export const useOrgRoleByIdQuery = (id: string) => {
    return useQuery({
        queryKey: ["organizationRoles", id],
        queryFn: () => getOrgRoleById(id),
        enabled: !!id,
    });
};

// ============================================================================
// Mutations
// ============================================================================

export const useCreateOrgRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createOrgRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationRoles"] });
        },
    });
};

export const useUpdateOrgRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; name?: string; base_tier?: "dispatcher" | "technician"; permissions?: string[]; is_default?: boolean }) =>
            updateOrgRole(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationRoles"] });
            queryClient.invalidateQueries({ queryKey: ["dispatchers"] });
            queryClient.invalidateQueries({ queryKey: ["technicians"] });
        },
    });
};

export const useDeleteOrgRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteOrgRole(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationRoles"] });
        },
    });
};

export const useAssignOrgRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: assignOrgRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationRoles"] });
            queryClient.invalidateQueries({ queryKey: ["dispatchers"] });
            queryClient.invalidateQueries({ queryKey: ["technicians"] });
        },
    });
};