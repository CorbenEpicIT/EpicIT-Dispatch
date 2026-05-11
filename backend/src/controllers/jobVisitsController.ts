import { ZodError } from "zod";
import type { tech_visit_status, technician_status, pause_reason_type } from "../../generated/prisma/client.js";
import { getScopedDb, type UserContext } from "../lib/context.js";
import {
	createJobVisitSchema,
	updateJobVisitSchema,
} from "../lib/validate/jobVisits.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import { log } from "../services/appLogger.js";
import { deductInventoryForVisit } from "./inventoryController.js";
import { createNotification } from "./notificationsController.js";
import { getSocket } from "../services/socketService.js";

const VALID_PAUSE_REASONS = new Set<string>(["AwaitingMaterials", "EquipmentIssue", "Break", "Other"]);
function toPauseReason(v: string | undefined): pause_reason_type | undefined {
	if (!v || !VALID_PAUSE_REASONS.has(v)) return undefined;
	return v as pause_reason_type;
}

export const buildVisitStatusPayload = (
	visit: {
		id: string;
		name: string | null;
		scheduled_start_at: Date;
		status: string;
		job_id: string;
		job: { id?: string; client: { name: string } };
		visit_techs: Array<{ tech_id: string; tech: { name: string } }>;
	},
	previousStatus: string,
	visitStatusChanged: boolean,
	context?: UserContext,
) => {
	let actor: { type: "technician" | "dispatcher"; name: string | null; id: string } | null = null;
	if (context?.techId) {
		const techEntry = visit.visit_techs.find((vt) => vt.tech_id === context.techId);
		actor = { type: "technician", name: techEntry?.tech.name ?? null, id: context.techId };
	} else if (context?.dispatcherId) {
		actor = { type: "dispatcher", name: null, id: context.dispatcherId };
	}
	return {
		visitStatusChanged,
		visitStatus: visit.status,
		previousVisitStatus: previousStatus,
		actor,
		visit: {
			id: visit.id,
			name: visit.name,
			scheduledAt: visit.scheduled_start_at.toISOString(),
			job: { id: visit.job_id, client: { name: visit.job.client.name } },
		},
		changedAt: new Date().toISOString(),
	};
};

export const buildSecondaryEventPayload = (
	visit: {
		id: string;
		name: string | null;
		scheduled_start_at: Date;
		status: string;
		job_id: string;
		job: { id?: string; client: { name: string } };
		visit_techs: Array<{ tech_id: string; tech: { name: string } }>;
	},
	techAction: string,
	context?: UserContext,
) => {
	let actor: { type: "technician" | "dispatcher"; name: string | null; id: string } | null = null;
	if (context?.techId) {
		const techEntry = visit.visit_techs.find((vt) => vt.tech_id === context.techId);
		actor = { type: "technician", name: techEntry?.tech.name ?? null, id: context.techId };
	}
	return {
		visitStatusChanged: false,
		visitStatus: techAction,
		previousVisitStatus: visit.status,
		actor,
		visit: {
			id: visit.id,
			name: visit.name,
			scheduledAt: visit.scheduled_start_at.toISOString(),
			job: { id: visit.job_id, client: { name: visit.job.client.name } },
		},
		changedAt: new Date().toISOString(),
	};
};

const ACTIVE_VISIT_STATUSES = ["Driving", "OnSite", "InProgress", "Paused", "Delayed"] as const;

export const getAllJobVisits = async (organization_id: string, filters?: { clientId?: string; limit?: number; sort?: "asc" | "desc" }) => {
	const sdb = getScopedDb(organization_id);
	return await sdb.job_visit.findMany({
		where: filters?.clientId
			? { job: { client_id: filters.clientId } }
			: undefined,
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
			time_entries: {
				orderBy: { clocked_in_at: "asc" },
				include: {
					tech: { select: { id: true, name: true } },
				},
			},
			notes: true,
		},
		orderBy: { scheduled_start_at: filters?.sort ?? "asc" },
		...(filters?.limit && { take: filters.limit }),
	});
};

export const getJobVisitById = async (id: string, organization_id: string) => {
	const sdb = getScopedDb(organization_id);
	return await sdb.job_visit.findFirst({
		where: { id: id },
		include: {
			job: {
				include: {
					client: {
						include: {
							contacts: {
								where: { is_primary: true },
								include: {
									contact: {
										select: {
											id: true,
											name: true,
											email: true,
											phone: true,
											type: true,
										},
									},
								},
								take: 1,
							},
						},
					},
					quote: true,
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
			time_entries: {
				orderBy: { clocked_in_at: "asc" },
				include: {
					tech: { select: { id: true, name: true } },
				},
			},
			notes: true,
		},
	});
};

export const getJobVisitsByJobId = async (jobId: string, organization_id: string) => {
	const sdb = getScopedDb(organization_id);
	return await sdb.job_visit.findMany({
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

export const getJobVisitsByTechId = async (techId: string, organization_id: string) => {
	const sdb = getScopedDb(organization_id);
	return await sdb.job_visit.findMany({
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
			time_entries: {
				orderBy: { clocked_in_at: "asc" },
				include: {
					tech: { select: { id: true, name: true } },
				},
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
	organization_id: string
) => {
	const sdb = getScopedDb(organization_id);
	return await sdb.job_visit.findMany({
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

export const insertJobVisit = async (req: Request, organization_id: string, context?: UserContext) => {
	try {
		const parsed = createJobVisitSchema.parse(req.body);
		const sdb = getScopedDb(organization_id);
		const job = await sdb.job.findFirst({
			where: { id: parsed.job_id },
		});

		if (!job) {
			return { err: "Invalid job id" };
		}

		if (parsed.tech_ids && parsed.tech_ids.length > 0) {
			const existingTechs = await sdb.technician.findMany({
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

		const created = await sdb.$transaction(async (tx) => {
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
				organization_id: organization_id,
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

			return tx.job_visit.findFirst({
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

export const updateJobVisit = async (req: Request, organizationId: string, context?: UserContext) => {
	try {
		const id = req.params.id as string;
		const parsed = updateJobVisitSchema.parse(req.body);
		const sdb = getScopedDb(organizationId);
		const existingVisit = await sdb.job_visit.findFirst({
			where: { id, job: { organization_id: organizationId } },
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
		const updated = await sdb.$transaction(async (tx) => {
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
					...(parsed.status !== undefined && {
						status: parsed.status,
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
				} else if (allVisits.some((v) => (ACTIVE_VISIT_STATUSES as readonly string[]).includes(v.status))) {
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
					organization_id: organizationId,
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
			return tx.job_visit.findFirst({
				where: { id },
				include: {
					job: { include: { client: true, quote: true } },
					visit_techs: { include: { tech: true } },
					line_items: { orderBy: { sort_order: "asc" } },
					notes: true,
				},
			});
		});

		// ── "This & all future" — shift future visits by the same delta ─────
		if (parsed.reschedule_scope === "future" && existingVisit.job.recurring_plan_id) {
			const oldStart = existingVisit.scheduled_start_at;
			const newStart = parsed.scheduled_start_at;
			if (oldStart && newStart) {
				const deltaMs = newStart.getTime() - oldStart.getTime();
				const futureVisits = await sdb.job_visit.findMany({
					where: {
						job: { recurring_plan_id: existingVisit.job.recurring_plan_id },
						scheduled_start_at: { gt: oldStart },
						id: { not: id },
						status: { notIn: ["Completed", "Cancelled"] },
					},
					select: { id: true, scheduled_start_at: true, scheduled_end_at: true },
				});
				if (futureVisits.length > 0) {
					await sdb.$transaction(
						futureVisits.map((v) =>
							sdb.job_visit.update({
								where: { id: v.id },
								data: {
									scheduled_start_at: new Date(v.scheduled_start_at.getTime() + deltaMs),
									...(v.scheduled_end_at && {
										scheduled_end_at: new Date(v.scheduled_end_at.getTime() + deltaMs),
									}),
									...(parsed.arrival_constraint !== undefined && { arrival_constraint: parsed.arrival_constraint }),
									...(parsed.arrival_time !== undefined && { arrival_time: parsed.arrival_time }),
									...(parsed.arrival_window_start !== undefined && { arrival_window_start: parsed.arrival_window_start }),
									...(parsed.arrival_window_end !== undefined && { arrival_window_end: parsed.arrival_window_end }),
									...(parsed.finish_constraint !== undefined && { finish_constraint: parsed.finish_constraint }),
									...(parsed.finish_time !== undefined && { finish_time: parsed.finish_time }),
								},
							}),
						),
					);
				}
			}
		}

		// Notify assigned technicians if scheduled time changed
		if (
			updated &&
			parsed.scheduled_start_at !== undefined &&
			existingVisit.scheduled_start_at.getTime() !== parsed.scheduled_start_at.getTime()
		) {
			const clientName = updated.job.client.name;
			const newTime = parsed.scheduled_start_at.toLocaleString("en-US", {
				weekday: "short", month: "short", day: "numeric",
				hour: "numeric", minute: "2-digit",
			});
			const techIds = updated.visit_techs.map((vt: { tech_id: string }) => vt.tech_id);
			for (const techId of techIds) {
				await createNotification({
					technicianId: techId,
					type:         "visit_changed",
					title:        `Schedule changed: ${clientName}`,
					body:         `Your visit at ${clientName} has been rescheduled to ${newTime}.`,
					actionUrl:    `/technician/visits/${id}`,
				}, organizationId);
			}
		}

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
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const visit = await sdb.job_visit.findFirst({
			where: { id: visitId, job: { organization_id: organizationId } },
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

		const existingTechs = await sdb.technician.findMany({
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

		await sdb.$transaction(async (tx) => {
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
				organization_id: organizationId,
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

		const updated = await sdb.job_visit.findFirst({
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

		// Notify newly assigned technicians
		if (updated) {
			const clientName = updated.job.client.name;
			const scheduledAt = updated.scheduled_start_at.toLocaleString("en-US", {
				weekday: "short", month: "short", day: "numeric",
				hour: "numeric", minute: "2-digit",
			});
			const newlyAssigned = techIds.filter(
				(id) => !visit.visit_techs.some((vt) => vt.tech_id === id),
			);
			for (const techId of newlyAssigned) {
				await createNotification({
					technicianId: techId,
					type:         "visit_assigned",
					title:        `New visit assigned: ${clientName}`,
					body:         `You have been assigned to a visit at ${clientName} on ${scheduledAt}.`,
					actionUrl:    `/technician/visits/${visitId}`,
				}, organizationId);
			}
		}

		return { err: "", item: updated };
	} catch (e) {
		log.error({ err: e }, "Failed to assign technicians");
		return { err: "Failed to assign technicians" };
	}
};

export const acceptJobVisit = async (
	visitId: string,
	techId: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const visit = await sdb.job_visit.findFirst({
			where: { id: visitId, job: { organization_id: organizationId } },
		});

		if (!visit) {
			return { err: "Job visit not found" };
		}

		const tech = await sdb.technician.findFirst({
			where: { id: techId },
			select: { id: true },
		});

		if (!tech) {
			return { err: "Technician not found" };
		}

		await sdb.$transaction(async (tx) => {
			await tx.job_visit_technician.create({
				data: { visit_id: visitId, tech_id: techId },
			});

			await logActivity({
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visitId,
				organization_id: organizationId,
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

		const updated = await sdb.job_visit.findFirst({
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

// ── Visit lifecycle ───────────────────────────────────────────────

export const LIFECYCLE_TRANSITIONS = {
	drive: { from: ["Scheduled", "Delayed"], to: "Driving" as const },
	arrive: { from: ["Driving"], to: "OnSite" as const },
	start: { from: ["OnSite"], to: "InProgress" as const },
	pause: { from: ["InProgress"], to: "Paused" as const },
	resume: { from: ["Paused"], to: "InProgress" as const },
	complete: { from: ["InProgress", "Paused", "OnSite"], to: "Completed" as const },
	delay: { from: ["Scheduled", "Driving", "OnSite"], to: "Delayed" as const },
};

const LIFECYCLE_ORDER: Record<string, number> = {
	Scheduled: 0,
	Delayed: 0,
	Driving: 1,
	OnSite: 2,
	InProgress: 3,
	Paused: 4,
	Completed: 5,
};

export type LifecycleAction = keyof typeof LIFECYCLE_TRANSITIONS;

export const applyVisitTransition = async (
	id: string,
	action: LifecycleAction,
	organizationId: string,
	context?: UserContext,
	pauseReason?: string,
) => {
	try {
		const { from, to } = LIFECYCLE_TRANSITIONS[action];
		const sdb = getScopedDb(organizationId);
		const existingVisit = await sdb.job_visit.findFirst({
			where: { id, job: { organization_id: organizationId } },
			include: { job: true, line_items: { select: { id: true } } },
		});

		if (!existingVisit) return { err: "Job visit not found" };

		// Guard: delay is dispatcher-only
		if (action === "delay" && context?.techId) {
			return { err: "Only dispatchers can mark a visit as Delayed." };
		}

		// Guard: drive and arrive require the technician to not be clocked in
		if ((action === "drive" || action === "arrive") && context?.techId) {
			const openEntry = await sdb.visit_tech_time_entry.findFirst({
				where: { tech_id: context.techId, clocked_out_at: null },
			});
			if (openEntry) {
				return { err: "CLOCKED_IN" };
			}
		}

		if (!(from as string[]).includes(existingVisit.status)) {
			const currentOrder = LIFECYCLE_ORDER[existingVisit.status] ?? -1;
			const targetOrder = LIFECYCLE_ORDER[to] ?? -1;
			if (targetOrder >= 0 && currentOrder >= targetOrder) {
				// Secondary transition: drive or arrive for a tech whose visit is already past that state
				if ((action === "drive" || action === "arrive") && context?.techId) {
					const techVisitStatus: tech_visit_status = action === "drive" ? "EnRoute" : "OnSite";
					const techGlobalStatus: technician_status = action === "drive" ? "EnRoute" : "OnSite";
					const assignment = await sdb.job_visit_technician.findUnique({
						where: { visit_id_tech_id: { visit_id: id, tech_id: context.techId } },
					});
					if (assignment && (assignment.tech_status === "Assigned" || (action === "arrive" && assignment.tech_status === "EnRoute"))) {
						const currentVisit = await sdb.job_visit.findFirst({
							where: { id },
							include: {
								job: { include: { client: true, quote: true } },
								visit_techs: { include: { tech: true } },
								line_items: { orderBy: { sort_order: "asc" } },
								notes: true,
							},
						});
						if (currentVisit) {
							await sdb.$transaction([
								sdb.job_visit_technician.update({
									where: { visit_id_tech_id: { visit_id: id, tech_id: context.techId } },
									data: { tech_status: techVisitStatus },
								}),
								sdb.technician.update({
									where: { id: context.techId },
									data: { status: techGlobalStatus },
								}),
							]);
							getSocket().emit(
								"job_visit:status_changed",
								buildSecondaryEventPayload(currentVisit, techVisitStatus, context),
							);
						}
						return { err: "", item: currentVisit ?? undefined };
					}
				}
				const currentVisit = await sdb.job_visit.findUnique({
					where: { id },
					include: {
						job: { include: { client: true, quote: true } },
						visit_techs: { include: { tech: true } },
						line_items: { orderBy: { sort_order: "asc" } },
						notes: true,
					},
				});
				return { err: "", item: currentVisit ?? undefined };
			}
			return {
				err: `Cannot ${action} a visit with status "${existingVisit.status}". Expected one of: ${from.join(", ")}.`,
			};
		}

		const now = new Date();
		const timestampData: Record<string, Date | null> = {};
		if (action === "start" && !existingVisit.actual_start_at) {
			timestampData.actual_start_at = now;
		}
		if (action === "complete") {
			timestampData.actual_end_at = now;
			if (!existingVisit.actual_start_at) timestampData.actual_start_at = now;
		}

		const updated = await sdb.$transaction(async (tx) => {
			await tx.job_visit.update({
				where: { id },
				data: {
					status: to,
					...timestampData,
				},
			});

			// Destination switch: revert any other Driving visit assigned to this tech
			if (action === "drive" && context?.techId) {
				const otherDrivingVisits = await tx.job_visit.findMany({
					where: {
						status: "Driving",
						id: { not: id },
						visit_techs: { some: { tech_id: context.techId } },
					},
					include: { job: true },
				});
				for (const other of otherDrivingVisits) {
					await tx.job_visit.update({
						where: { id: other.id },
						data: { status: "Scheduled" },
					});
					// Re-sync job status for the reverted visit
					const otherJobVisits = await tx.job_visit.findMany({
						where: { job_id: other.job_id },
					});
					let revertedJobStatus = other.job.status;
					if (otherJobVisits.every((v) => v.status === "Completed")) {
						revertedJobStatus = "Completed";
					} else if (otherJobVisits.some((v) => (ACTIVE_VISIT_STATUSES as readonly string[]).includes(v.status))) {
						revertedJobStatus = "InProgress";
					} else if (otherJobVisits.some((v) => v.status === "Scheduled" || v.status === "Driving")) {
						revertedJobStatus = "Scheduled";
					}
					if (revertedJobStatus !== other.job.status) {
						await tx.job.update({ where: { id: other.job_id }, data: { status: revertedJobStatus } });
					}
				}
			}

			// ── Job status sync ────────────────────────────────────────────────
			const allVisits = await tx.job_visit.findMany({ where: { job_id: existingVisit.job_id } });
			let newJobStatus = existingVisit.job.status;
			if (allVisits.every((v) => v.status === "Completed")) {
				newJobStatus = "Completed";
			} else if (allVisits.some((v) => (ACTIVE_VISIT_STATUSES as readonly string[]).includes(v.status))) {
				newJobStatus = "InProgress";
			} else if (allVisits.some((v) => v.status === "Scheduled")) {
				newJobStatus = "Scheduled";
			}
			if (newJobStatus !== existingVisit.job.status) {
				await tx.job.update({ where: { id: existingVisit.job_id }, data: { status: newJobStatus } });
			}

			// ── Inventory deduction ───────────────────────────────────
			const deductOn = existingVisit.job.deduct_inventory_on;
			if (action === "complete" && existingVisit.status !== "Completed" && deductOn === "visit_completion") {
				await deductInventoryForVisit(id, tx, context);
			}
			if (newJobStatus === "Completed" && existingVisit.job.status !== "Completed" && deductOn === "job_completion") {
				for (const v of allVisits) {
					await deductInventoryForVisit(v.id, tx, context);
				}
			}

			// ── Auto-close open time entries on pause or complete ─────────────
			if (action === "pause" || action === "complete") {
				const openEntries = await tx.visit_tech_time_entry.findMany({
					where: { visit_id: id, clocked_out_at: null },
					include: { tech: { select: { id: true, name: true, hourly_rate: true } } },
				});

				const closeTime = new Date();

				for (const entry of openEntries) {
					const elapsedMs = closeTime.getTime() - entry.clocked_in_at.getTime();
					const hoursWorked = parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(4));
					const hourlyRate = Number(entry.tech.hourly_rate);
					const laborTotal = parseFloat((hoursWorked * hourlyRate).toFixed(2));

					const lineItem = await tx.job_visit_line_item.create({
						data: {
							visit_id: id,
							name: `Labor – ${entry.tech.name}`,
							description: `${hoursWorked.toFixed(2)} hrs @ $${hourlyRate.toFixed(2)}/hr`,
							quantity: hoursWorked,
							unit_price: hourlyRate,
							total: laborTotal,
							source: "field_addition",
							item_type: "labor",
							sort_order: 0,
						},
					});

					await tx.visit_tech_time_entry.update({
						where: { id: entry.id },
						data: {
							clocked_out_at: closeTime,
							hours_worked: hoursWorked,
							line_item_id: lineItem.id,
							...(action === "pause" ? { pause_reason: toPauseReason(pauseReason) } : {}),
						},
					});
				}

				if (openEntries.length > 0) {
					const allItems = await tx.job_visit_line_item.findMany({ where: { visit_id: id } });
					const newSubtotal = allItems.reduce((s, li) => s + Number(li.total), 0);
					const taxRate = Number(existingVisit.tax_rate ?? 0);
					const newTaxAmount = parseFloat((newSubtotal * taxRate).toFixed(2));
					await tx.job_visit.update({
						where: { id },
						data: {
							subtotal: newSubtotal,
							tax_amount: newTaxAmount,
							total: parseFloat((newSubtotal + newTaxAmount).toFixed(2)),
						},
					});
				}
			}

			// ── Tech status updates ───────────────────────────────────────────
			const TECH_VISIT_STATUS_MAP: Partial<Record<LifecycleAction, tech_visit_status>> = {
				drive: "EnRoute",
				arrive: "OnSite",
				complete: "Done",
			};
			const TECH_GLOBAL_STATUS_MAP: Partial<Record<LifecycleAction, technician_status>> = {
				drive: "EnRoute",
				arrive: "OnSite",
				start: "Working",
				resume: "Working",
				pause: "Paused",
				complete: "WrappingUp",
			};
			const newTechVisitStatus = TECH_VISIT_STATUS_MAP[action];
			const newTechGlobalStatus = TECH_GLOBAL_STATUS_MAP[action];

			if (action === "complete") {
				// Only techs who actually participated (not no-shows sitting at Assigned)
				const activeTechs = await tx.job_visit_technician.findMany({
					where: { visit_id: id, tech_status: { not: "Assigned" } },
				});
				// Fetch current global status for each tech so we can handle Break correctly
				const techStatuses = await tx.technician.findMany({
					where: { id: { in: activeTechs.map((vt) => vt.tech_id) } },
					select: { id: true, status: true },
				});
				const techStatusMap = new Map(techStatuses.map((t) => [t.id, t.status]));
				// Techs NOT on break get WrappingUp; techs on break get their pre_break_status updated
				const wrappingUpTechIds: string[] = [];
				for (const vt of activeTechs) {
					await tx.job_visit_technician.update({
						where: { visit_id_tech_id: { visit_id: id, tech_id: vt.tech_id } },
						data: { tech_status: newTechVisitStatus! },
					});
					if (techStatusMap.get(vt.tech_id) === "Break") {
						// Tech is on break — update their pre_break_status so returning from
						// break will restore WrappingUp (not the stale OnSite/Working value)
						await tx.technician_shift_break.updateMany({
							where: { tech_id: vt.tech_id, ended_at: null },
							data: { pre_break_status: "WrappingUp" },
						});
					} else {
						await tx.technician.update({
							where: { id: vt.tech_id },
							data: { status: newTechGlobalStatus! },
						});
						wrappingUpTechIds.push(vt.tech_id);
					}
				}
				// Arm per-tech WrappingUp timers after transaction commits (only for non-break techs)
				if (wrappingUpTechIds.length > 0) {
					const org = await tx.organization.findUnique({
						where: { id: organizationId },
						select: { wrapping_up_minutes: true },
					});
					const wrappingMinutes = org?.wrapping_up_minutes ?? 15;
					const now = new Date();
					// Import lazily to avoid circular dependency at module load time
					import("../services/wrappingUpTimer.js").then(({ scheduleWrappingUpClear }) => {
						for (const techId of wrappingUpTechIds) {
							scheduleWrappingUpClear(techId, organizationId, now, wrappingMinutes);
						}
					}).catch(() => {});
				}
			} else if (action === "pause") {
				// Only update global tech status to Paused — tech_visit_status stays OnSite
				const activeTechs = await tx.job_visit_technician.findMany({
					where: { visit_id: id, tech_status: { notIn: ["Done", "Assigned"] } },
				});
				for (const vt of activeTechs) {
					await tx.technician.update({
						where: { id: vt.tech_id },
						data: { status: newTechGlobalStatus! },
					});
				}
			} else if (context?.techId && (newTechVisitStatus || newTechGlobalStatus)) {
				// Only the calling tech
				if (newTechVisitStatus) {
					await tx.job_visit_technician.update({
						where: { visit_id_tech_id: { visit_id: id, tech_id: context.techId } },
						data: { tech_status: newTechVisitStatus },
					});
				}
				if (newTechGlobalStatus) {
					await tx.technician.update({
						where: { id: context.techId },
						data: { status: newTechGlobalStatus },
					});
				}
				// Cancel any pending WrappingUp timer when tech transitions to an active state
				if (["drive", "arrive", "start", "resume"].includes(action)) {
					import("../services/wrappingUpTimer.js").then(({ cancelWrappingUpTimer }) => {
						cancelWrappingUpTimer(context.techId!);
					}).catch(() => {});
				}
			}

			// ── Activity log ────────────────────────────────────────────────────
			await logActivity({
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: id,
				organization_id: organizationId,
				actor_type: context?.techId ? "technician" : context?.dispatcherId ? "dispatcher" : "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					status: { old: existingVisit.status, new: to },
					...Object.fromEntries(
						Object.entries(timestampData).map(([k, v]) => [k, { old: null, new: v }]),
					),
					_job_id: { old: null, new: existingVisit.job_id },
					_job_number: { old: null, new: existingVisit.job.job_number },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return tx.job_visit.findFirst({
				where: { id },
				include: {
					job: { include: { client: true, quote: true } },
					visit_techs: { include: { tech: true } },
					line_items: { orderBy: { sort_order: "asc" } },
					notes: true,
				},
			});
		});

		if (updated) {
			getSocket().emit(
				"job_visit:status_changed",
				buildVisitStatusPayload(updated, existingVisit.status, true, context),
			);
		}

		return { err: "", item: updated ?? undefined };
	} catch (e) {
		log.error({ err: e }, `Failed to apply visit transition: ${action}`);
		return { err: "Failed to update visit status" };
	}
};


// ─────────────────────────────────────────────────────────────────────────────
export const cancelJobVisit = async (
	id: string,
	cancellationReason: string,
	organizationId: string,
	context?: UserContext,
) => {
	try {
		const sdb = getScopedDb(organizationId);
		const existingVisit = await sdb.job_visit.findFirst({
			where: { id, job: { organization_id: organizationId } },
			include: { job: true },
		});

		if (!existingVisit) return { err: "Job visit not found" };

		const updated = await sdb.$transaction(async (tx) => {
			await tx.job_visit.update({
				where: { id },
				data: { status: "Cancelled", cancellation_reason: cancellationReason },
			});

			const allVisits = await tx.job_visit.findMany({ where: { job_id: existingVisit.job_id } });
			let newJobStatus = existingVisit.job.status;
			if (allVisits.every((v) => v.status === "Completed" || v.status === "Cancelled")) {
				newJobStatus = "Completed";
			} else if (allVisits.some((v) => (ACTIVE_VISIT_STATUSES as readonly string[]).includes(v.status))) {
				newJobStatus = "InProgress";
			} else if (allVisits.some((v) => v.status === "Scheduled")) {
				newJobStatus = "Scheduled";
			}
			if (newJobStatus !== existingVisit.job.status) {
				await tx.job.update({ where: { id: existingVisit.job_id }, data: { status: newJobStatus } });
			}

			// ── Step 1: Close open time entries ──────────────────────────────────
			const openEntries = await tx.visit_tech_time_entry.findMany({
				where: { visit_id: id, clocked_out_at: null },
				include: { tech: { select: { name: true, hourly_rate: true } } },
			});

			const cancelTime = new Date();

			for (const entry of openEntries) {
				const elapsedMs = cancelTime.getTime() - entry.clocked_in_at.getTime();
				const hoursWorked = parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(4));
				const hourlyRate = Number(entry.tech.hourly_rate);
				const laborTotal = parseFloat((hoursWorked * hourlyRate).toFixed(2));

				const lineItem = await tx.job_visit_line_item.create({
					data: {
						visit_id: id,
						name: `Labor – ${entry.tech.name}`,
						description: `${hoursWorked.toFixed(2)} hrs @ $${hourlyRate.toFixed(2)}/hr`,
						quantity: hoursWorked,
						unit_price: hourlyRate,
						total: laborTotal,
						source: "field_addition",
						item_type: "labor",
						sort_order: 0,
					},
				});

				await tx.visit_tech_time_entry.update({
					where: { id: entry.id },
					data: {
						clocked_out_at: cancelTime,
						hours_worked: hoursWorked,
						line_item_id: lineItem.id,
					},
				});
			}

			if (openEntries.length > 0) {
				const allItems = await tx.job_visit_line_item.findMany({ where: { visit_id: id } });
				const newSubtotal = allItems.reduce((s, li) => s + Number(li.total), 0);
				const taxRate = Number(existingVisit.tax_rate ?? 0);
				const newTaxAmount = parseFloat((newSubtotal * taxRate).toFixed(2));
				await tx.job_visit.update({
					where: { id },
					data: {
						subtotal: newSubtotal,
						tax_amount: newTaxAmount,
						total: parseFloat((newSubtotal + newTaxAmount).toFixed(2)),
					},
				});
			}

			// ── Step 2: Reset tech_status for non-Done techs ─────────────────────
			// Snapshot the active set BEFORE the reset so Step 3 can use it.
			// "Active" means the tech had progressed past Assigned (EnRoute, OnSite,
			// Working, etc.) — no-shows sitting at Assigned don't need global updates.
			const activeTechRows = await tx.job_visit_technician.findMany({
				where: {
					visit_id: id,
					tech_status: { notIn: ["Assigned", "Done"] },
				},
				select: { tech_id: true },
			});

			await tx.job_visit_technician.updateMany({
				where: { visit_id: id, tech_status: { not: "Done" } },
				data: { tech_status: "Assigned" },
			});

			// ── Step 3: Update global technician.status for actively-working techs ─
			// Union: techs who were actively progressed on this visit (captured above)
			// plus any who had an open time entry (definitely Working).
			const openEntryTechIds = openEntries.map((e) => e.tech_id);
			const activeTechIds = [
				...new Set([
					...activeTechRows.map((r) => r.tech_id),
					...openEntryTechIds,
				]),
			];

			for (const techId of activeTechIds) {
				const openShift = await tx.technician_shift.findFirst({
					where: { tech_id: techId, ended_at: null },
				});
				const onBreak = await tx.technician.findUnique({
					where: { id: techId },
					select: { status: true },
				});

				// If the tech is currently on Break, leave their global status alone —
				// the break will restore their status when they return.
				if (onBreak?.status === "Break") continue;

				const newGlobalStatus: technician_status = openShift ? "Available" : "Offline";
				await tx.technician.update({
					where: { id: techId },
					data: { status: newGlobalStatus },
				});
			}

			await logActivity({
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: id,
				organization_id: organizationId,
				actor_type: context?.techId ? "technician" : context?.dispatcherId ? "dispatcher" : "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					status: { old: existingVisit.status, new: "Cancelled" },
					cancellation_reason: { old: null, new: cancellationReason },
					_job_id: { old: null, new: existingVisit.job_id },
					_job_number: { old: null, new: existingVisit.job.job_number },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return tx.job_visit.findFirst({
				where: { id },
				include: {
					job: { include: { client: true, quote: true } },
					visit_techs: { include: { tech: true } },
					line_items: { orderBy: { sort_order: "asc" } },
					notes: true,
				},
			});
		});

		// Notify assigned technicians of cancellation
		if (updated) {
			const clientName = updated.job.client.name;
			const techIds = updated.visit_techs.map((vt) => vt.tech_id);
			for (const techId of techIds) {
				await createNotification({
					technicianId: techId,
					type:         "visit_cancelled",
					title:        `Visit cancelled: ${clientName}`,
					body:         `A visit at ${clientName} has been cancelled.${cancellationReason ? ` Reason: ${cancellationReason}` : ""}`,
					actionUrl:    `/technician/visits/${id}`,
				}, organizationId);
			}
		}

		return { err: "", item: updated ?? undefined };
	} catch (e) {
		log.error({ err: e }, "Failed to cancel job visit");
		return { err: "Failed to cancel visit" };
	}
};

export const deleteJobVisit = async (id: string, organizationId: string, context?: UserContext) => {
	try {
		const sdb = getScopedDb(organizationId);
		const visit = await sdb.job_visit.findFirst({
			where: { id, job: { organization_id: organizationId } },
		});

		if (!visit) {
			return { err: "Job visit not found" };
		}

		await sdb.$transaction(async (tx) => {
			await tx.job_visit_technician.deleteMany({
				where: { visit_id: id },
			});

			await logActivity({
				event_type: "job_visit.deleted",
				action: "deleted",
				entity_type: "job_visit",
				entity_id: id,
				organization_id: organizationId,
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
