import { ZodError } from "zod";
import { db } from "../db.js";
import {
	createJobNoteSchema,
	updateJobNoteSchema,
} from "../lib/validate/jobs.js";
import { logActivity, buildChanges } from "../services/logger.js";
import { Prisma } from "../../generated/prisma/client.js";
import { log } from "../services/appLogger.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	organizationId?: string;
	ipAddress?: string;
	userAgent?: string;
}

export const getJobNotes = async (jobId: string) => {
	return await db.job_note.findMany({
		where: { job_id: jobId },
		include: {
			creator_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			creator_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			visit: {
				select: {
					id: true,
					scheduled_start_at: true,
					scheduled_end_at: true,
					status: true,
				},
			},
		},
		orderBy: { created_at: "desc" },
	});
};

export const getJobNotesByVisitId = async (jobId: string, visitId: string) => {
	return await db.job_note.findMany({
		where: {
			job_id: jobId,
			visit_id: visitId,
		},
		include: {
			creator_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			creator_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			visit: {
				select: {
					id: true,
					scheduled_start_at: true,
					scheduled_end_at: true,
					status: true,
				},
			},
		},
		orderBy: { created_at: "desc" },
	});
};

export const getNoteById = async (jobId: string, noteId: string) => {
	return await db.job_note.findFirst({
		where: {
			id: noteId,
			job_id: jobId,
		},
		include: {
			creator_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			creator_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_tech: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			last_editor_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			visit: {
				select: {
					id: true,
					scheduled_start_at: true,
					scheduled_end_at: true,
					status: true,
				},
			},
		},
	});
};

export const insertJobNote = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = createJobNoteSchema.parse(data);

		const job = await db.job.findUnique({
			where: { id: jobId },
			select: { id: true, organization_id: true },
		});

		if (!job) {
			return { err: "Job not found" };
		}

		if (parsed.visit_id) {
			const visit = await db.job_visit.findUnique({
				where: { id: parsed.visit_id },
			});

			if (!visit) {
				return { err: "Visit not found" };
			}

			if (visit.job_id !== jobId) {
				return { err: "Visit does not belong to this job" };
			}
		}

		const created = await db.$transaction(async (tx) => {
			const noteData: Prisma.job_noteCreateInput = {
				job: { connect: { id: jobId } },
				content: parsed.content,
				...(job.organization_id && {
					organization: { connect: { id: job.organization_id } },
				}),
				...(parsed.visit_id && {
					visit: { connect: { id: parsed.visit_id } },
				}),
				...(context?.techId && {
					creator_tech: { connect: { id: context.techId } },
				}),
				...(context?.dispatcherId && {
					creator_dispatcher: {
						connect: { id: context.dispatcherId },
					},
				}),
			};

			const note = await tx.job_note.create({
				data: noteData,
				include: {
					creator_tech: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					creator_dispatcher: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					visit: {
						select: {
							id: true,
							scheduled_start_at: true,
							scheduled_end_at: true,
							status: true,
						},
					},
				},
			});

			await logActivity({
				event_type: "job_note.created",
				action: "created",
				entity_type: "job_note",
				entity_id: note.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					content: { old: null, new: parsed.content },
					job_id: { old: null, new: jobId },
					visit_id: { old: null, new: parsed.visit_id || null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return note;
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
		log.error({ err: e }, "Error inserting job note");
		return { err: "Internal server error" };
	}
};

export const updateJobNote = async (
	jobId: string,
	noteId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateJobNoteSchema.parse(data);

		const existing = await db.job_note.findFirst({
			where: {
				id: noteId,
				job_id: jobId,
			},
		});

		if (!existing) {
			return { err: "Note not found" };
		}

		if (parsed.visit_id !== undefined && parsed.visit_id !== null) {
			const visit = await db.job_visit.findUnique({
				where: { id: parsed.visit_id },
			});

			if (!visit) {
				return { err: "Visit not found" };
			}

			if (visit.job_id !== jobId) {
				return { err: "Visit does not belong to this job" };
			}
		}

		const changes = buildChanges(existing, parsed, [
			"content",
			"visit_id",
		] as const);

		const updated = await db.$transaction(async (tx) => {
			const updateData: Prisma.job_noteUpdateInput = {
				updated_at: new Date(),
			};

			if (parsed.content !== undefined) {
				updateData.content = parsed.content;
			}

			if (parsed.visit_id !== undefined) {
				if (parsed.visit_id === null) {
					updateData.visit = { disconnect: true };
				} else {
					updateData.visit = { connect: { id: parsed.visit_id } };
				}
			}

			if (context?.techId) {
				updateData.last_editor_tech = {
					connect: { id: context.techId },
				};
				updateData.last_editor_dispatcher = { disconnect: true };
			} else if (context?.dispatcherId) {
				updateData.last_editor_dispatcher = {
					connect: { id: context.dispatcherId },
				};
				updateData.last_editor_tech = { disconnect: true };
			}

			const note = await tx.job_note.update({
				where: { id: noteId },
				data: updateData,
				include: {
					creator_tech: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					creator_dispatcher: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					last_editor_tech: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					last_editor_dispatcher: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					visit: {
						select: {
							id: true,
							scheduled_start_at: true,
							scheduled_end_at: true,
							status: true,
						},
					},
				},
			});

			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "job_note.updated",
					action: "updated",
					entity_type: "job_note",
					entity_id: noteId,
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

			return note;
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
		log.error({ err: e }, "Error updating job note");
		return { err: "Internal server error" };
	}
};

export const deleteJobNote = async (
	jobId: string,
	noteId: string,
	context?: UserContext,
) => {
	try {
		const existing = await db.job_note.findFirst({
			where: {
				id: noteId,
				job_id: jobId,
			},
		});

		if (!existing) {
			return { err: "Note not found" };
		}

		await db.$transaction(async (tx) => {
			await logActivity({
				event_type: "job_note.deleted",
				action: "deleted",
				entity_type: "job_note",
				entity_id: noteId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					content: { old: existing.content, new: null },
					job_id: { old: existing.job_id, new: null },
					visit_id: { old: existing.visit_id, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			await tx.job_note.delete({
				where: { id: noteId },
			});
		});

		return { err: "", message: "Note deleted successfully" };
	} catch (error) {
		log.error({ err: error }, "Error deleting job note");
		return { err: "Internal server error" };
	}
};
