import z from "zod";

export const createDispatcherSchema = z.object({
	organization_id: z.string().uuid("Valid organization ID is required").optional(),
	name: z.string().min(1, "Dispatcher name is required"),
	email: z.string().email("Valid email is required"),
	phone: z.string().min(1, "Phone number is required").optional(),
	password: z.string().min(8, "Password must be at least 8 characters"),
	title: z.string().min(1, "Title is required"),
	description: z.string().default(""),
});

export const updateDispatcherSchema = z
	.object({
		organization_id: z
			.string()
			.uuid("Valid organization ID is required")
			.nullable()
			.optional(),
		name: z.string().min(1, "Dispatcher name is required").optional(),
		email: z.string().email("Valid email is required").optional(),
		phone: z.string().min(1, "Phone number is required").nullable().optional(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.optional(),
		title: z.string().min(1, "Title is required").optional(),
		description: z.string().optional(),
		last_login: z
			.preprocess(
				(val) =>
					typeof val === "string" || val instanceof Date
						? new Date(val)
						: val,
				z.date()
			)
			.optional(),
	})
	.refine(
		(data) =>
			data.organization_id !== undefined ||
			data.name !== undefined ||
			data.email !== undefined ||
			data.phone !== undefined ||
			data.password !== undefined ||
			data.title !== undefined ||
			data.description !== undefined ||
			data.last_login !== undefined,
		{ message: "At least one field must be provided for update" }
	);

export type CreateDispatcherInput = z.infer<typeof createDispatcherSchema>;
export type UpdateDispatcherInput = z.infer<typeof updateDispatcherSchema>;