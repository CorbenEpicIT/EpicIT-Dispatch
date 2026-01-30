import z from "zod";
import type {
	JobPriority,
	JobStatus,
	VisitStatus,
	ArrivalConstraint,
	FinishConstraint,
} from "./jobs";
import type { Coordinates } from "./location";
import type { JobVisit } from "./jobs";

export const TechnicianStatusValues = ["Offline", "Available", "Busy", "Break"] as const;
export type TechnicianStatus = (typeof TechnicianStatusValues)[number];

export interface VisitTechInfo {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	title: string;
	status: TechnicianStatus;
}

export interface VisitTech {
	tech_id: string;
	visit_id: string;
	tech: VisitTechInfo;
}

export interface VisitTechnician {
	visit_id: string;
	tech_id: string;
	visit: {
		id: string;
		job_id: string;

		arrival_constraint: ArrivalConstraint;
		finish_constraint: FinishConstraint;
		scheduled_start_at: Date;
		scheduled_end_at: Date;
		arrival_time?: string | null; // HH:MM
		arrival_window_start?: string | null; // HH:MM
		arrival_window_end?: string | null; // HH:MM
		finish_time?: string | null; // HH:MM

		actual_start_at?: Date | null;
		actual_end_at?: Date | null;
		status: VisitStatus;
		job: {
			id: string;
			name: string;
			description: string;
			status: JobStatus;
			address: string;
			priority: JobPriority;
			created_at: Date;
			client_id: string;
			client: {
				id: string;
				name: string;
				address: string;
			};
		};
	};
}

export interface TechnicianWithVisits extends Technician {
	activeVisits: JobVisit[];
	scheduledVisits: JobVisit[];
	totalVisitsToday: number;
}

export interface Technician {
	id: string;
	name: string;
	email: string;
	phone: string;
	title: string;
	description: string;
	coords: Coordinates;
	status: TechnicianStatus;
	hire_date: Date;
	last_login: Date;
	visit_techs?: VisitTechnician[];
	logs?: unknown[];
	created_client_notes?: unknown[];
	last_edited_client_notes?: unknown[];
	created_job_notes?: unknown[];
	last_edited_job_notes?: unknown[];
}

export interface CreateTechnicianInput {
	name: string;
	email: string;
	phone: string;
	password: string;
	title: string;
	description?: string;
	status?: TechnicianStatus;
	hire_date?: Date;
	coords?: {
		lat: number;
		lon: number;
	};
}

export interface UpdateTechnicianInput {
	name?: string;
	email?: string;
	phone?: string;
	password?: string;
	title?: string;
	description?: string;
	status?: TechnicianStatus;
	hire_date?: Date;
	last_login?: Date;
}

export const CreateTechnicianSchema = z.object({
	name: z.string().min(1, "Technician name is required"),
	email: z.string().email("Invalid email address"),
	phone: z.string().min(1, "Phone number is required"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	title: z.string().min(1, "Title is required"),
	description: z.string().default(""),
	status: z.enum(TechnicianStatusValues).default("Offline"),
	hire_date: z.coerce
		.date()
		.optional()
		.default(() => new Date()),
	coords: z
		.object({
			lat: z.number(),
			lon: z.number(),
		})
		.default({ lat: 0, lon: 0 }),
});

export const UpdateTechnicianSchema = z
	.object({
		name: z.string().min(1, "Technician name is required").optional(),
		email: z.string().email("Invalid email address").optional(),
		phone: z.string().min(1, "Phone number is required").optional(),
		password: z.string().min(8, "Password must be at least 8 characters").optional(),
		title: z.string().min(1, "Title is required").optional(),
		description: z.string().optional(),
		status: z.enum(TechnicianStatusValues).optional(),
		hire_date: z.coerce.date().optional(),
		last_login: z.coerce.date().optional(),
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
			data.hire_date !== undefined ||
			data.last_login !== undefined,
		{ message: "At least one field must be provided for update" }
	);
