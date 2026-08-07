import z from "zod";

export const projectStatusEnum = z.enum([
  "Planning", "Active", "OnHold", "Completed", "Cancelled",
]);

export const createProjectSchema = z.object({
        name:  z.string().min(1),
        description: z.string().default(""),
        client_id: z.string().uuid(),
        status: projectStatusEnum.optional(),      // defaults Planning in DB
        priority: z
            .enum(["Low", "Medium", "High", "Urgent", "Emergency"])
            .optional()
            .default("Medium"),
        address: z.string().optional(),
        coords: z.any().optional(),
        budget: z.number().nonnegative().optional(),
        starts_at: z.string().datetime().optional(),
        target_end_at: z.string().datetime().optional(),
        manager_dispatcher_id: z.string().uuid().optional().nullable(),
    }).transform((data)=>({
        ...data,
        name: data.name,
        description: data.description,
        client_id: data.client_id ?? undefined,
        status: data.status ?? undefined,
        priority: data.priority ?? undefined,
        address: data.address || undefined,
        coords: data.coords ?? undefined,
        budget: data.budget ?? undefined,
        starts_at: data.starts_at ?? undefined,
        target_end_at: data.target_end_at ?? undefined,
        manager_dispatcher_id: data.manager_dispatcher_id ?? undefined,
    }));


export const updateProjectSchema = z
    .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        client_id: z.string().uuid().optional(),
        status: projectStatusEnum.optional(),
        priority: z
            .enum(["Low", "Medium", "High", "Urgent", "Emergency"])
            .optional(),
        address: z.string().optional(),
        coords: z.any().optional(),
        budget: z.number().nonnegative().optional().nullable(),
        starts_at: z.string().datetime().optional().nullable(),
        target_end_at: z.string().datetime().optional().nullable(),
        cancellation_reason: z.string().optional(),
        manager_dispatcher_id: z.string().uuid().optional().nullable(),
    })
    .transform((data) => ({
        ...data,
        name: data.name || undefined,
        description: data.description || undefined,
        client_id: data.client_id ?? undefined,
        status: data.status ?? undefined,
        priority: data.priority ?? undefined,
        address: data.address || undefined,
        coords: data.coords ?? undefined,
        cancellation_reason: data.cancellation_reason || undefined,
        manager_dispatcher_id: data.manager_dispatcher_id ?? undefined,
    }));

export const attachJobSchema = z.object({
    jobId: z.string().uuid("Invalid job ID"),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AttachJobInput = z.infer<typeof attachJobSchema>;

