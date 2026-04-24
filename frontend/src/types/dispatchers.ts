import z from "zod";

// ============================================================================
// INTERFACES
// ============================================================================

export interface Dispatcher {
  id: string;
  organization_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  title: string;
  description: string;
  last_login: string; 
}

export interface CreateDispatcherInput {
  organization_id?: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  title: string;
  description: string;
}
 
export interface UpdateDispatcherInput {
  organization_id?: string | null;
  name?: string;
  email?: string;
  phone?: string | null;
  title?: string;
  description?: string;
}
 
export interface ChangeDispatcherPasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

// ============================================================================
// SCHEMAS
// ============================================================================

export const CreateDispatcherSchema = z.object({
	organization_id: z.string().uuid("Invalid organization ID").optional(),
	name: z.string().min(1, "Dispatcher name is required"),
	email: z.string().email("Invalid email address"),
	phone: z.string().min(1, "Phone number is required").optional(),
	password: z.string().min(8, "Password must be at least 8 characters"),
	title: z.string().min(1, "Title is required"),
	description: z.string().default(""),
});
 
export const UpdateDispatcherSchema = z
	.object({
		organization_id: z.string().uuid("Invalid organization ID").nullable().optional(),
		name: z.string().min(1, "Dispatcher name is required").optional(),
		email: z.string().email("Invalid email address").optional(),
		phone: z.string().min(1, "Phone number is required").nullable().optional(),
		password: z.string().min(8, "Password must be at least 8 characters").optional(),
		title: z.string().min(1, "Title is required").optional(),
		description: z.string().optional(),
		last_login: z.coerce.date().optional(),
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
