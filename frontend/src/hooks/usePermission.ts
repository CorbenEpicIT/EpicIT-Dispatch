import { useAuthStore } from "../auth/authStore";


export const usePermission = (permission: string) => {
    const user = useAuthStore((s) => (s.user));
    if (!user) return false;
    return user.permissions.includes(permission);
}

export const useAnyPermission = (permissions: string[]) => {
    const user = useAuthStore((s) => (s.user));
    if (!user) return false;
    return permissions.some((perm) => user.permissions.includes(perm));
}