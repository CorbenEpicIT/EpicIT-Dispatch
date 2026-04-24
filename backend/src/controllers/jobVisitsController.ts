import { ZodError } from "zod";
import { db } from "../db.js";
import {
	createJobVisitSchema,
	updateJobVisitSchema,
} from "../lib/validate/jobVisits.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { deductInventoryForVisit } from "./inventoryController.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

export const getAllJobVisits = async () => {
	return await db.job_visit.findMany({
		include: {
			job: {
				include: {
					client: true,
				},
			},
			visit_techs: {
				include: {
					tech: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			notes: true,
		},
	});
};

export const getJobVisitById = async (id: string) => {
	return await db.job_visit.findFirst({
		where: { id: id },
		include: {
			job: {
				include: {
					client: true,
				},
			},
			visit_techs: {
				include: {
					tech: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			notes: true,
		},
	});
};

export const getJobVisitsByJobId = async (jobId: string) => {
	return await db.job_visit.findMany({
		where: { job_id: jobId },
		include: {
			visit_techs: {
				include: {
					tech: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			notes: true,
		},
		orderBy: {
			scheduled_start_at: "asc",
		},
	});
};

export const getJobVisitsByTechId = async (techId: string) => {
	return await db.job_visit.findMany({
		where: {
			visit_techs: {
				some: {
					tech_id: techId,
				},
			},
		},
		include: {
			job: {
				include: {
					client: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			visit_techs: {
				include: {
					tech: true,
				},
			},
			notes: true,
		},
		orderBy: {
			scheduled_start_at: "asc",
		},
	});
};

export const getJobVisitsByDateRange = async (
	startDate: Date,
	endDate: Date,
) => {
	return await db.job_visit.findMany({
		where: {
			OR: [
				{
					scheduled_start_at: {
						gte: startDate,
						lte: endDate,
					},
				},
				{
					scheduled_end_at: {
						gte: startDate,
						lte: endDate,
					},
				},
			],
		},
		include: {
			job: {
				include: {
					client: true,
				},
			},
			visit_techs: {
				include: {
					tech: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			notes: true,
		},
		orderBy: {
			scheduled_start_at: "asc",
		},
	});
};

export const insertJobVisit = async (req: Request, context?: UserContext) => {
	try {
		const parsed = createJobVisitSchema.parse(req.body);

		const job = await db.job.findUnique({
			where: { id: parsed.job_id },
		});

		if (!job) {
			return { err: "Invalid job id" };
		}

		if (parsed.tech_ids && parsed.tech_ids.length > 0) {
			const existingTechs = await db.technician.findMany({
				where: { id: { in: parsed.tech_ids } },
				select: { id: true },
			});
			const existingIds = new Set(existingTechs.map((t) => t.id));
			const missing = parsed.tech_ids.filter(
				(id) => !existingIds.has(id),
			);
			if (missing.length > 0) {
				return {
					err: `Technicians not found: ${missing.join(", ")}`,
				};
			}
		}

		const created = await db.$transaction(async (tx) => {
			const visit = await tx.job_visit.create({
				data: {
					job_id: parsed.job_id,
					name: parsed.name,
					description: parsed.description ?? null,

					arrival_constraint: parsed.arrival_constraint,
					finish_constraint: parsed.finish_constraint,
					scheduled_start_at: parsed.scheduled_start_at,
					scheduled_end_at: parsed.scheduled_end_at,
					arrival_time: parsed.arrival_time ?? null,
					arrival_window_start: parsed.arrival_window_start ?? null,
					arrival_window_end: parsed.arrival_window_end ?? null,
					finish_time: parsed.finish_time ?? null,
				},
			});

			if (parsed.tech_ids && parsed.tech_ids.length > 0) {
				await tx.job_visit_technician.createMany({
					data: parsed.tech_ids.map((tech_id) => ({
						visit_id: visit.id,
						tech_id,
					})),
					skipDuplicates: true,
				});
			}

			if (job.status === "Unscheduled") {
				await tx.job.update({
					where: { id: parsed.job_id },
					data: { status: "Scheduled" },
				});
			}

			await logActivity({
				event_type: "job_visit.created",
				action: "created",
				entity_type: "job_visit",
				entity_id: visit.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: null, new: visit.name },
					description: { old: null, new: visit.description },
					arrival_constraint: {
						old: null,
						new: visit.arrival_constraint,
					},
					finish_constraint: {
						old: null,
						new: visit.finish_constraint,
					},
					scheduled_start_at: {
						old: null,
						new: visit.scheduled_start_at,
					},
					scheduled_end_at: {
						old: null,
						new: visit.scheduled_end_at,
					},
					status: { old: null, new: visit.status },
					job_id: { old: null, new: parsed.job_id },
					_job_number: { old: null, new: job.job_number },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return tx.job_visit.findUnique({
				where: { id: visit.id },
				include: {
					job: {
						include: {
							client: true,
						},
					},
					visit_techs: {
						include: { tech: true },
					},
					notes: true,
				},
			});
		});

		return { err: "", item: created ?? undefined };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		log.error({ err: e }, "Error inserting job visit");
		return { err: "Internal server error" };
	}
};

export const updateJobVisit = async (req: Request, context?: UserContext) => {
	try {
		const id = req.params.id as string;
		const parsed = updateJobVisitSchema.parse(req.body);

		const existingVisit = await db.job_visit.findUnique({
			where: { id },
			include: {
				job: true,
				line_items: { select: { id: true } },
			},
		});

		if (!existingVisit) {
			return { err: "Job visit not found" };
		}

		const changes = buildChanges(existingVisit, parsed, [
			"name",
			"description",
			"arrival_constraint",
			"finish_constraint",
			"scheduled_start_at",
			"scheduled_end_at",
			"arrival_time",
			"arrival_window_start",
			"arrival_window_end",
			"finish_time",
			"actual_start_at",
			"actual_end_at",
			"status",
		] as const);
		const updated = await db.$transaction(async (tx) => {
			// ── Scalar field update ───────────────────────────────────────
			const visit = await tx.job_visit.update({
				where: { id },
				data: {
					...(parsed.name !== undefined && { name: parsed.name }),
					...(parsed.description !== undefined && {
						description: parsed.description,
					}),
					...(parsed.arrival_constraint !== undefined && {
						arrival_constraint: parsed.arrival_constraint,
					}),
					...(parsed.finish_constraint !== undefined && {
						finish_constraint: parsed.finish_constraint,
					}),
					...(parsed.scheduled_start_at !== undefined && {
						scheduled_start_at: parsed.scheduled_start_at,
					}),
					...(parsed.scheduled_end_at !== undefined && {
						scheduled_end_at: parsed.scheduled_end_at,
					}),
					...(parsed.arrival_time !== undefined && {
						arrival_time: parsed.arrival_time,
					}),
					...(parsed.arrival_window_start !== undefined && {
						arrival_window_start: parsed.arrival_window_start,
					}),
					...(parsed.arrival_window_end !== undefined && {
						arrival_window_end: parsed.arrival_window_end,
					}),
					...(parsed.finish_time !== undefined && {
						finish_time: parsed.finish_time,
					}),
					...(parsed.actual_start_at !== undefined && {
						actual_start_at: parsed.actual_start_at,
					}),
					...(parsed.actual_end_at !== undefined && {
						actual_end_at: parsed.actual_end_at,
					}),
				},
				include: {
					job: true,
					visit_techs: { include: { tech: true } },
					notes: true,
				},
			});

			// ── Line item replacement ─────────────────────────────────────
			// Full replace: incoming array is the source of truth.
			// Items with a matching id → update in place.
			// Items without an id → create new.
			// Existing items absent from the incoming array → delete.
			// If line_items is undefined (not sent), skip entirely — no change.
			if (parsed.line_items !== undefined) {
				const existingIds = new Set(
					existingVisit.line_items.map((i) => i.id),
				);
				const incomingIds = new Set(
					parsed.line_items.filter((i) => i.id).map((i) => i.id!),
				);

				// Delete removed items
				for (const item of existingVisit.line_items) {
					if (!incomingIds.has(item.id)) {
						await tx.job_visit_line_item.delete({
							where: { id: item.id },
						});
					}
				}

				// Create or update
				for (const item of parsed.line_items) {
					if (item.id && existingIds.has(item.id)) {
						// Update existing
						await tx.job_visit_line_item.update({
							where: { id: item.id },
							data: {
								name: item.name,
								description: item.description ?? null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total:
									item.total ??
									Number(item.quantity) *
										Number(item.unit_price),
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
							},
						});
					} else {
						// Create new
						await tx.job_visit_line_item.create({
							data: {
								visit_id: id,
								name: item.name,
								description: item.description ?? null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total:
									item.total ??
									Number(item.quantity) *
										Number(item.unit_price),
								source: "manual",
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
							},
						});
					}
				}
			}

			// ── Job status sync ───────────────────────────────────────────
			if (parsed.status) {
				const allVisits = await tx.job_visit.findMany({
					where: { job_id: existingVisit.job_id },
				});

				let newJobStatus = existingVisit.job.status;
				if (allVisits.every((v) => v.status === "Completed")) {
					newJobStatus = "Completed";
				} else if (allVisits.some((v) => v.status === "InProgress")) {
					newJobStatus = "InProgress";
				} else if (allVisits.some((v) => v.status === "Scheduled")) {
					newJobStatus = "Scheduled";
				}

				if (newJobStatus !== existingVisit.job.status) {
					await tx.job.update({
						where: { id: existingVisit.job_id },
						data: { status: newJobStatus },
					});
				}

				const deductOn = existingVisit.job.deduct_inventory_on;
				if (
					parsed.status === "Completed" &&
					existingVisit.status !== "Completed" &&
					deductOn === "visit_completion"
				) {
					await deductInventoryForVisit(id, tx, context);
				}

				// Inventory deduction on job completion (all visits done)
				if (
					newJobStatus === "Completed" &&
					existingVisit.job.status !== "Completed" &&
					deductOn === "job_completion"
				) {
					for (const v of allVisits) {
						await deductInventoryForVisit(v.id, tx, context);
					}
				}
			}

			// ── Activity log ──────────────────────────────────────────────
			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "job_visit.updated",
					action: "updated",
					entity_type: "job_visit",
					entity_id: id,
					actor_type: context?.techId
						? "technician"
						: context?.dispatcherId
							? "dispatcher"
							: "system",
					actor_id: context?.techId || context?.dispatcherId,
					changes: {
						...changes,
						_job_id: { old: null, new: existingVisit.job_id },
						_job_number: { old: null, new: existingVisit.job.job_number },
					},
					ip_address: context?.ipAddress,
					user_agent: context?.userAgent,
				});
			}

			// Re-fetch with line_items so the response shape is complete
			return tx.job_visit.findUnique({
				where: { id },
				include: {
					job: { include: { client: true } },
					visit_techs: { include: { tech: true } },
					line_items: { orderBy: { sort_order: "asc" } },
					notes: true,
				},
			});
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
		log.error({ err: e }, "Failed to update job visit");
		return { err: "Failed to update job visit" };
	}
};

export const assignTechniciansToVisit = async (
	visitId: string,
	techIds: string[],
	context?: UserContext,
) => {
	try {
		const visit = await db.job_visit.findUnique({
			where: { id: visitId },
			include: {
				job: { select: { job_number: true } },
				visit_techs: {
					include: { tech: true },
				},
			},
		});

		if (!visit) {
			return { err: "Job visit not found" };
		}

		const existingTechs = await db.technician.findMany({
			where: { id: { in: techIds } },
			select: { id: true, name: true },
		});

		const existingIds = new Set(existingTechs.map((t) => t.id));
		const missing = techIds.filter((id) => !existingIds.has(id));

		if (missing.length > 0) {
			return {
				err: `Technicians not found: ${missing.join(", ")}`,
			};
		}

		const oldTechNames = visit.visit_techs.map((vt) => vt.tech.name);
		const newTechNames = existingTechs.map((t) => t.name);

		await db.$transaction(async (tx) => {
			await tx.job_visit_technician.deleteMany({
				where: { visit_id: visitId },
			});

			await tx.job_visit_technician.createMany({
				data: techIds.map((tech_id) => ({
					visit_id: visitId,
					tech_id,
				})),
			});

			await logActivity({
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visitId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					technicians: {
						old: oldTechNames,
						new: newTechNames,
					},
					_job_id: { old: null, new: visit.job_id },
					_job_number: { old: null, new: visit.job.job_number },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});
		});

		const updated = await db.job_visit.findUnique({
			where: { id: visitId },
			include: {
				job: {
					include: {
						client: true,
					},
				},
				visit_techs: {
					include: { tech: true },
				},
				notes: true,
			},
		});

		return { err: "", item: updated };
	} catch (e) {
		log.error({ err: e }, "Failed to assign technicians");
		return { err: "Failed to assign technicians" };
	}
};

export const acceptJobVisit = async (
	visitId: string,
	techId: string,
	context?: UserContext,
) => {
	try {
		const visit = await db.job_visit.findUnique({
			where: { id: visitId },
		});

		if (!visit) {
			return { err: "Job visit not found" };
		}

		const tech = await db.technician.findUnique({
			where: { id: techId },
			select: { id: true },
		});

		if (!tech) {
			return { err: "Technician not found" };
		}

		await db.$transaction(async (tx) => {
			await tx.job_visit_technician.create({
				data: { visit_id: visitId, tech_id: techId },
			});

			await logActivity({
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visitId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					technicians: {
						old: [],
						new: [techId],
					},
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});
		});

		const updated = await db.job_visit.findUnique({
			where: { id: visitId },
			include: {
				job: {
					include: {
						client: true,
					},
				},
				visit_techs: {
					include: { tech: true },
				},
				notes: true,
			},
		});

		return { err: "", item: updated };
	} catch (e) {
		log.error({ err: e }, "Failed to accept job visit");
		return { err: "Failed to accept job visit" };
	}
};

export const deleteJobVisit = async (id: string, context?: UserContext) => {
	try {
		const visit = await db.job_visit.findUnique({
			where: { id },
		});

		if (!visit) {
			return { err: "Job visit not found" };
		}

		await db.$transaction(async (tx) => {
			await tx.job_visit_technician.deleteMany({
				where: { visit_id: id },
			});

			await logActivity({
				event_type: "job_visit.deleted",
				action: "deleted",
				entity_type: "job_visit",
				entity_id: id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: visit.name, new: null },
					description: { old: visit.description, new: null },
					scheduled_start_at: {
						old: visit.scheduled_start_at,
						new: null,
					},
					scheduled_end_at: {
						old: visit.scheduled_end_at,
						new: null,
					},
					status: { old: visit.status, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			await tx.job_visit.delete({
				where: { id },
			});

			// Update job status if no visits remain
			const remainingVisits = await tx.job_visit.findMany({
				where: { job_id: visit.job_id },
			});

			if (remainingVisits.length === 0) {
				await tx.job.update({
					where: { id: visit.job_id },
					data: { status: "Unscheduled" },
				});
			}
		});

		return { err: "", message: "Job visit deleted successfully" };
	} catch (e) {
		log.error({ err: e }, "Failed to delete job visit");
		return { err: "Failed to delete job visit" };
	}
};
