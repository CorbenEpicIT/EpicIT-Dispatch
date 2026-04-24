import type { Job } from "./jobs";
import z from "zod";
import type { Coordinates } from "./location";

// ============================================================================
// Client
// ============================================================================

export interface Client {
	id: string;
	name: string;
	address: string;
	coords: Coordinates;
	is_active: boolean;
	created_at: Date;
	last_activity: Date;
	jobs: Job[];
	contacts: ClientContactLink[];
	notes: ClientNote[];
}

export interface ClientSummary {
	id: string;
	name: string;
	address: string;
	is_active: boolean;
}
export interface ClientWithPrimaryContact {
	id: string;
	name: string;
	address: string;
	is_active: boolean;
	contacts?: Array<{
		is_primary: boolean;
		contact: {
			id: string;
			name: string;
			email: string | null;
			phone: string | null;
		};
	}>;
}

export interface CreateClientInput {
	name: string;
	address: string;
	coords?: Coordinates;
	is_active: boolean;
}

export interface UpdateClientInput {
	name?: string;
	address?: string;
	coords?: Coordinates;
	is_active?: boolean;
}

export const CreateClientSchema = z.object({
	name: z.string().min(1, "Client name is required"),
	address: z.string().min(1, "Address is required"),
	is_active: z.boolean().default(true),
});

export const UpdateClientSchema = z.object({
	name: z.string().min(1, "Client name is required").optional(),
	address: z.string().min(1, "Address is required").optional(),
	is_active: z.boolean().optional(),
});

// ============================================================================
// CLIENT NOTE
// ============================================================================

export interface ClientNote {
	id: string;
	client_id: string;
	content: string;
	created_at: Date;
	updated_at: Date;

	creator_tech_id: string | null;
	creator_dispatcher_id: string | null;
	creator_tech?: { id: string; name: string; email: string };
	creator_dispatcher?: { id: string; name: string; email: string };

	last_editor_tech_id: string | null;
	last_editor_dispatcher_id: string | null;
	last_editor_tech?: { id: string; name: string; email: string };
	last_editor_dispatcher?: { id: string; name: string; email: string };
}

export interface CreateClientNoteInput {
	content: string;
}

export interface UpdateClientNoteInput {
	content: string;
}

export const CreateClientNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

export const UpdateClientNoteSchema = z.object({
	content: z.string().min(1, "Note content is required"),
});

// ============================================================================
// CONTACT TYPES
// ============================================================================

export interface Contact {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	type: string | null; // "customer", "vendor", "property_manager", etc.
	is_active: boolean;
	created_at: Date;
	updated_at: Date;

	client_contacts: ClientContactLink[];
}

export interface ClientContactLink {
	client_id: string;
	contact_id: string;
	relationship: string; // "owner", "tenant", "manager", "emergency_contact"
	is_primary: boolean;
	is_billing: boolean;
	created_at: Date;
	updated_at: Date;

	client?: Client;
	contact?: Contact;
}

export interface CreateContactInput {
	name: string;
	email?: string;
	phone?: string;
	type?: string;

	client_id?: string;
	relationship?: string;
	is_primary?: boolean;
	is_billing?: boolean;
}

export interface UpdateContactInput {
	name?: string;
	email?: string;
	phone?: string;
	relationship?: string;
	type?: string;
	is_active?: boolean;
}

export interface LinkContactInput {
	relationship: string;
	is_primary?: boolean;
	is_billing?: boolean;
}

export interface UpdateClientContactInput {
	relationship?: string;
	is_primary?: boolean;
	is_billing?: boolean;
}

export const CreateContactSchema = z.object({
	name: z.string().min(1, "Contact name is required"),
	email: z.string().email("Invalid email address").optional().or(z.literal("")),
	phone: z.string().optional().or(z.literal("")),
	type: z.string().optional().or(z.literal("")),

	client_id: z.string().uuid().optional(),
	relationship: z.string().optional(),
	is_primary: z.boolean().optional(),
	is_billing: z.boolean().optional(),
});

export const UpdateContactSchema = z
	.object({
		name: z.string().min(1, "Contact name is required").optional(),
		email: z.string().email("Invalid email address").optional().or(z.literal("")),
		phone: z.string().optional().or(z.literal("")),
		type: z.string().optional().or(z.literal("")),
		is_active: z.boolean().optional(),
	})
	.refine(
		(data) =>
			data.name !== undefined ||
			data.email !== undefined ||
			data.phone !== undefined ||
			data.type !== undefined ||
			data.is_active !== undefined,
		{ message: "At least one field must be provided for update" }
	);

export const LinkContactSchema = z.object({
	relationship: z.string().min(1, "Relationship is required").default("contact"),
	is_primary: z.boolean().default(false),
	is_billing: z.boolean().default(false),
});

export const UpdateClientContactSchema = z
	.object({
		relationship: z.string().optional(),
		is_primary: z.boolean().optional(),
		is_billing: z.boolean().optional(),
	})
	.refine(
		(data) =>
			data.relationship !== undefined ||
			data.is_primary !== undefined ||
			data.is_billing !== undefined,
		{ message: "At least one field must be provided for update" }
	);
