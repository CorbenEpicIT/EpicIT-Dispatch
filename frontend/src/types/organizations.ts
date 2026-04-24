

// ========================================================
// Interfaces
// ========================================================
export interface Organization {
    id: string;
    name: string;
    timezone: string | null;
    created_at: string;
    updated_at: string;
}
export interface RegisterOrganizationInput {
    org_name: string;
    admin_name: string;
    admin_email: string;
    admin_password: string;
    admin_phone?: string;
}

export interface RegisterOrganizationResponse {
    org: { id: string; name: string };
    admin: { id: string; name: string; email: string };
}