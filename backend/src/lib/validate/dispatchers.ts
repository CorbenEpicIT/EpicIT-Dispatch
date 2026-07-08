import z from "zod";

const DispatcherRole = z.enum(["dispatcher", "admin"]);

const reportLayoutSchema = z.record(
	z.string(),
	z.object({ order: z.array(z.string()), hidden: z.array(z.string()) }),
);

export const createDispatcherSchema = z.object({
	organization_id: z.string().uuid("Valid organization ID is required").optional(),
	name: z.string().min(1, "Dispatcher name is required"),
	email: z.string().email("Valid email is required"),
	phone: z.string().min(1, "Phone number is required").optional(),
	password: z.string().min(8, "Password must be at least 8 characters").optional(),
	title: z.string().min(1, "Title is required"),
	description: z.string().default(""),
	organization_role_id: z.string().uuid("Valid role ID is required").nullable().optional(),
});

export const updateDispatcherSchema = z
	.object({
		organization_id: z.string().uuid("Valid organization ID is required").optional(),
		name: z.string().min(1, "Dispatcher name is required").optional(),
		email: z.string().email("Valid email is required").optional(),
		phone: z.string().min(1, "Phone number is required").nullable().optional(),
		title: z.string().min(1, "Title is required").optional(),
		description: z.string().optional(),
		role: DispatcherRole.optional(),
		theme: z.enum(["dark", "light", "system"]).optional(),
		last_login: z
			.preprocess(
				(val) =>
					typeof val === "string" || val instanceof Date
						? new Date(val)
						: val,
				z.date()
			)
			.optional(),
		dashboard_layout: z.any().optional(),
		report_layout: reportLayoutSchema.nullable().optional(),
	})
	.refine(
		(data) =>
			data.organization_id !== undefined ||
			data.name !== undefined ||
			data.email !== undefined ||
			data.phone !== undefined ||
			data.title !== undefined ||
			data.description !== undefined ||
			data.role !== undefined ||
			data.theme !== undefined ||
			data.last_login !== undefined ||
			data.dashboard_layout !== undefined ||
			data.report_layout !== undefined,
		{ message: "At least one field must be provided for update" }
	);

export const changePasswordSchema = z.object({
	current_password: z.string().min(1, "Current password is required"),
	new_password: z.string().min(8, "New password must be at least 8 characters"),
});

export type CreateDispatcherInput = z.infer<typeof createDispatcherSchema>;
export type UpdateDispatcherInput = z.infer<typeof updateDispatcherSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;