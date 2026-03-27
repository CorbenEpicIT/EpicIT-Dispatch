import { ZodError } from "zod";
import { db } from "../db.js";
import {
	createTechnicianSchema,
	updateTechnicianSchema,
} from "../lib/validate/technicians.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

export const getAllTechnicians = async () => {
	return await db.technician.findMany({
		include: {
			visit_techs: {
				include: {
					visit: {
						include: {
							job: {
								include: {
									client: true,
								},
							},
						},
					},
				},
			},
		},
	});
};

export const getTechnicianById = async (id: string) => {
	return await db.technician.findUnique({
		where: { id },
		include: {
			visit_techs: {
				include: {
					visit: {
						include: {
							job: {
								include: {
									client: true,
								},
							},
						},
					},
				},
			},
		},
	});
};

export const insertTechnician = async (
	data: unknown,
	context?: UserContext
) => {
	try {
		const parsed = createTechnicianSchema.parse(data);

		const existing = await db.technician.findUnique({
			where: { email: parsed.email },
		});

		if (existing) {
			return { err: "Email already exists" };
		}

		const created = await db.$transaction(async (tx) => {
			const technician = await tx.technician.create({
				data: parsed,
				include: {
					visit_techs: {
						include: {
							visit: {
								include: {
									job: {
										include: {
											client: true,
										},
									},
								},
							},
						},
					},
				},
			});

			await logActivity({
				event_type: "technician.created",
				action: "created",
				entity_type: "technician",
				entity_id: technician.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
					? "dispatcher"
					: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: null, new: technician.name },
					email: { old: null, new: technician.email },
					phone: { old: null, new: technician.phone },
					title: { old: null, new: technician.title },
					status: { old: null, new: technician.status },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return technician;
		});

		return { err: "", item: created };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		log.error({ err: e }, "Error inserting technician");
		return { err: "Internal server error" };
	}
};

export const updateTechnician = async (
	id: string,
	data: unknown,
	context?: UserContext
) => {
	try {
		const parsed = updateTechnicianSchema.parse(data);

		const existing = await db.technician.findUnique({
			where: { id },
		});

		if (!existing) {
			return { err: "Technician not found" };
		}

		if (parsed.email && parsed.email !== existing.email) {
			const emailTaken = await db.technician.findUnique({
				where: { email: parsed.email },
			});

			if (emailTaken) {
				return { err: "Email already exists" };
			}
		}

		const changes = buildChanges(existing, parsed, [
			"name",
			"email",
			"phone",
			"title",
			"description",
			"status",
			"coords",
			"hire_date",
			"last_login",
		] as const);

		const updated = await db.$transaction(async (tx) => {
			const technician = await tx.technician.update({
				where: { id },
				data: parsed,
				include: {
					visit_techs: {
						include: {
							visit: {
								include: {
									job: {
										include: {
											client: true,
										},
									},
								},
							},
						},
					},
				},
			});

			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "technician.updated",
					action: "updated",
					entity_type: "technician",
					entity_id: id,
					actor_type: context?.techId
						? "technician"
						: context?.dispatcherId
						? "dispatcher"
						: "system",
					actor_id: context?.techId || context?.dispatcherId,
					changes,
					ip_address: context?.ipAddress,
					user_agent: context?.userAgent,
				});
			}

			return technician;
		});

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		log.error({ err: e }, "Error updating technician");
		return { err: "Internal server error" };
	}
};

export const updateTechnicianLocation = async (
	id: string,
	data: unknown,
	context?: UserContext
) => {
	try {
		const parsed = updateTechnicianSchema.parse(data);

		const existing = await db.technician.findUnique({
			where: { id },
		});

		if (!existing) {
			return { err: "Technician not found" };
		}

		const updated = await db.$transaction(async (tx) => {
			const technician = await tx.technician.update({
				where: { id },
				data: parsed,
			});

			await logActivity({
				event_type: "technician.updated",
				action: "updated",
				entity_type: "technician",
				entity_id: id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
					? "dispatcher"
					: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: "coords",
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return technician;
		});

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		log.error({ err: e }, "Error updating technician");
		return { err: "Internal server error" };
	}
};

export const deleteTechnician = async (id: string, context?: UserContext) => {
	try {
		const existing = await db.technician.findUnique({
			where: { id },
		});

		if (!existing) {
			return { err: "Technician not found" };
		}

		const upcomingVisits = await db.job_visit_technician.count({
			where: {
				tech_id: id,
				visit: {
					status: {
						in: ["Scheduled", "InProgress"],
					},
				},
			},
		});

		if (upcomingVisits > 0) {
			return {
				err: `Cannot delete technician with ${upcomingVisits} scheduled or in-progress visits`,
			};
		}

		await db.$transaction(async (tx) => {
			await tx.job_visit_technician.deleteMany({
				where: { tech_id: id },
			});

			await logActivity({
				event_type: "technician.deleted",
				action: "deleted",
				entity_type: "technician",
				entity_id: id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
					? "dispatcher"
					: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: existing.name, new: null },
					email: { old: existing.email, new: null },
					status: { old: existing.status, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});
		});

		return { err: "", message: "Technician deleted successfully" };
	} catch (error) {
		log.error({ err: error }, "Error deleting technician");
		return { err: "Internal server error" };
	}
};
