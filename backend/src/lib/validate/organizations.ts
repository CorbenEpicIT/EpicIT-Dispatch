import z from "zod";

export const registerOrganizationSchema = z.object({
	org_name: z.string().min(1, "Organization name is required"),
	admin_name: z.string().min(1, "Admin name is required"),
	admin_email: z.string().email("Valid email is required"),
	admin_password: z.string().min(8, "Password must be at least 8 characters"),
	admin_phone: z.string().optional(),
});

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
