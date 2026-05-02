import { ZodError } from "zod";
import {
	createTechnicianSchema,
	updateTechnicianSchema,
} from "../lib/validate/technicians.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { getScopedDb, type UserContext } from "../lib/context.js";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { sendEmailVerificationEmail } from "../services/emailService.js";

export const getAllTechnicians = async (organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.technician.findMany({
		include: {
			visit_techs: {
				include: {
					visit: {
						include: {
							job: { include: { client: true } },
						},
					},
				},
			},
		},
	});
};

export const getTechnicianById = async (id: string, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	return await sdb.technician.findFirst({
		where: { id },
		include: {
			visit_techs: {
				include: {
					visit: {
						include: {
							job: { include: { client: true } },
						},
					},
				},
			},
		},
	});
};

export const insertTechnician = async (
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = createTechnicianSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const existing = await sdb.technician.findFirst({
			where: { email: parsed.email },
		});

		if (existing) {
			return { err: "Email already exists" };
		}

		const passwordProvided = parsed.password? true : false;
		const tempPassword = parsed.password ?? randomBytes(8).toString("hex") + "A1!";
		const hashedPassword = await bcrypt.hash(tempPassword, 10);

		const created = await sdb.$transaction(async (tx) => {
			const { password: _pw, ...parsedWithoutPassword } = parsed;
			const technician = await tx.technician.create({
				data: {
					...parsedWithoutPassword,
					organization_id: organizationId,
					password: hashedPassword,
					...(passwordProvided && { last_login: new Date() }),
				},
				include: {
					visit_techs: {
						include: {
							visit: {
								include: {
									job: { include: { client: true } },
								},
							},
						},
					},
				},
			});

			// Don't worry about this right now since main doesn't have working emails
			/*sendEmailVerificationEmail(
				technician.email, 
				technician.email_verification_token!, 
				passwordProvided ? undefined : tempPassword
			);*/

			await logActivity({
				event_type: "technician.created",
				action: "created",
				entity_type: "technician",
				entity_id: technician.id,
				organization_id: organizationId,
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
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Error inserting technician");
		return { err: "Internal server error" };
	}
};

export const updateTechnician = async (
	id: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = updateTechnicianSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const existing = await sdb.technician.findFirst({ where: { id } });

		if (!existing) {
			return { err: "Technician not found" };
		}

		if (parsed.email && parsed.email !== existing.email) {
			const emailTaken = await sdb.technician.findFirst({
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

		const updated = await sdb.$transaction(async (tx) => {
			const technician = await tx.technician.update({
				where: { id },
				data: parsed,
				include: {
					visit_techs: {
						include: {
							visit: {
								include: {
									job: { include: { client: true } },
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
					organization_id: organizationId,
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
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Error updating technician");
		return { err: "Internal server error" };
	}
};

export const updateTechnicianLocation = async (
	id: string,
	data: unknown,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const parsed = updateTechnicianSchema.parse(data);
		const sdb = getScopedDb(organizationId);

		const existing = await sdb.technician.findFirst({ where: { id } });

		if (!existing) {
			return { err: "Technician not found" };
		}

		const updated = await sdb.$transaction(async (tx) => {
			const technician = await tx.technician.update({
				where: { id },
				data: parsed,
			});

			await logActivity({
				event_type: "technician.updated",
				action: "updated",
				entity_type: "technician",
				entity_id: id,
				organization_id: organizationId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
					? "dispatcher"
					: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					coords: { old: existing.coords ?? null, new: parsed.coords ?? null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return technician;
		});

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		log.error({ err: e }, "Error updating technician");
		return { err: "Internal server error" };
	}
};

export const deleteTechnician = async (
	id: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existing = await sdb.technician.findFirst({ where: { id } });

		if (!existing) {
			return { err: "Technician not found" };
		}

		const upcomingVisits = await sdb.job_visit_technician.count({
			where: {
				tech_id: id,
				visit: { status: { in: ["Scheduled", "InProgress"] } },
			},
		});

		if (upcomingVisits > 0) {
			return {
				err: `Cannot delete technician with ${upcomingVisits} scheduled or in-progress visits`,
			};
		}

		await sdb.$transaction(async (tx) => {
			await tx.job_visit_technician.deleteMany({ where: { tech_id: id } });

			await logActivity({
				event_type: "technician.deleted",
				action: "deleted",
				entity_type: "technician",
				entity_id: id,
				organization_id: organizationId,
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
