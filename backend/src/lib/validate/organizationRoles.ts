import z from "zod";

const BaseTier = z.enum(["dispatcher", "technician"]);

export const createOrgRoleSchema = z.object({
    name: z.string().min(1, "Role name is required"),
    base_tier: BaseTier,
    permissions: z.array(z.string()).default([]),
    is_default: z.boolean().default(false),
});

export const updateOrgRoleSchema = z.object({
    name: z.string().min(1, "Role name is required").optional(),
    base_tier: BaseTier.optional(),
    permissions: z.array(z.string()).optional(),
    is_default: z.boolean().optional(),
}).refine(
    (data) => data.name !== undefined || data.base_tier !== undefined || data.permissions !== undefined || data.is_default !== undefined,
    { message: "At least one field must be provided for update" }
);

export const assignOrgRoleSchema = z.object({
    user_id: z.string().uuid("Valid user ID is required"),
    user_type: z.enum(["dispatcher", "technician"]),
    role_id: z.string().uuid("Valid role ID is required").nullable(), // null to remove role
});

export type CreateOrgRoleInput = z.infer<typeof createOrgRoleSchema>;
export type UpdateOrgRoleInput = z.infer<typeof updateOrgRoleSchema>;   
export type AssignOrgRoleInput = z.infer<typeof assignOrgRoleSchema>;