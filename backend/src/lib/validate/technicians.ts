import z from "zod";

const technicianStatusEnum = z.enum(["Offline", "Available", "Busy", "Break"]);

export const createTechnicianSchema = z.object({
	name: z.string().min(1, "Technician name is required"),
	email: z.string().email("Valid email is required"),
	phone: z.string().min(1, "Phone number is required"),
	password: z.string().min(8, "Password must be at least 8 characters").optional(),
	title: z.string().min(1, "Title is required"),
	description: z.string().default(""),
	status: technicianStatusEnum.default("Offline"),
	coords: z.object({
		lat: z.number(),
		lon: z.number(),
	}),
	hire_date: z
		.preprocess(
			(val) =>
				typeof val === "string" || val instanceof Date
					? new Date(val)
					: new Date(),
			z.date()
		)
		.default(() => new Date()),
});

export const updateTechnicianSchema = z
	.object({
		name: z.string().min(1, "Technician name is required").optional(),
		email: z.string().email("Valid email is required").optional(),
		phone: z.string().min(1, "Phone number is required").optional(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.optional(),
		title: z.string().min(1, "Title is required").optional(),
		description: z.string().optional(),
		status: technicianStatusEnum.optional(),
		coords: z.object({ lat: z.number(), lon: z.number() }).optional(),
		hire_date: z
			.preprocess(
				(val) =>
					typeof val === "string" || val instanceof Date
						? new Date(val)
						: val,
				z.date()
			)
			.optional(),
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
			data.name !== undefined ||
			data.email !== undefined ||
			data.phone !== undefined ||
			data.password !== undefined ||
			data.title !== undefined ||
			data.description !== undefined ||
			data.status !== undefined ||
			data.coords !== undefined ||
			data.hire_date !== undefined ||
			data.last_login !== undefined,
		{ message: "At least one field must be provided for update" }
	);

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
