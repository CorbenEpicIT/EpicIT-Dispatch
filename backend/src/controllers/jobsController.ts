import { ZodError } from "zod";
import { db } from "../db.js";
import {
	createJobSchema,
	updateJobSchema,
	createJobLineItemSchema,
	updateJobLineItemSchema,
} from "../lib/validate/jobs.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import { Prisma } from "../../generated/prisma/client.js";
import { LineItemToCreate, ChangeSet } from "../types/common.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

async function generateJobNumber(): Promise<string> {
	const lastJob = await db.job.findFirst({
		where: {
			job_number: {
				startsWith: "J-",
			},
		},
		orderBy: {
			job_number: "desc",
		},
	});

	let nextNumber = 1;
	if (lastJob) {
		const match = lastJob.job_number.match(/J-(\d+)/);
		if (match) {
			nextNumber = parseInt(match[1]) + 1;
		}
	}

	return `J-${nextNumber.toString().padStart(4, "0")}`;
}

// ============================================================================
// JOB CRUD
// ============================================================================

export const getAllJobs = async () => {
	return await db.job.findMany({
		include: {
			client: {
				select: {
					id: true,
					name: true,
				},
			},
			request: {
				select: {
					id: true,
					title: true,
					status: true,
				},
			},
			quote: {
				select: {
					id: true,
					quote_number: true,
					status: true,
					total: true,
				},
			},
			visits: {
				include: {
					visit_techs: {
						include: {
							tech: true,
						},
					},
				},
			},
			recurring_plan: {
				include: {
					rules: {
						include: {
							by_weekday: true,
						},
					},
					occurrences: {
						where: {
							occurrence_start_at: {
								gte: new Date(), // Only future occurrences
							},
							status: "planned", // Only planned ones
						},
						orderBy: { occurrence_start_at: "asc" },
					},
				},
			},
			line_items: true,
		},
		orderBy: { created_at: "desc" },
	});
};

export const getJobById = async (id: string) => {
	return await db.job.findUnique({
		where: { id },
		include: {
			client: {
				select: {
					id: true,
					name: true,
					address: true,
					coords: true,
					is_active: true,
					contacts: {
						where: {
							is_primary: true,
						},
						include: {
							contact: {
								select: {
									id: true,
									name: true,
									email: true,
									phone: true,
									title: true,
								},
							},
						},
						take: 1,
					},
				},
			},
			request: {
				select: {
					id: true,
					title: true,
					status: true,
					created_at: true,
				},
			},
			quote: {
				select: {
					id: true,
					quote_number: true,
					title: true,
					status: true,
					total: true,
					created_at: true,
				},
			},
			visits: {
				include: {
					visit_techs: {
						include: {
							tech: true,
						},
					},
					notes: true,
				},
			},
			line_items: true,
			notes: {
				include: {
					creator_tech: {
						select: { id: true, name: true, email: true },
					},
					creator_dispatcher: {
						select: { id: true, name: true, email: true },
					},
					last_editor_tech: {
						select: { id: true, name: true, email: true },
					},
					last_editor_dispatcher: {
						select: { id: true, name: true, email: true },
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
			},
		},
	});
};

export const getJobsByClientId = async (clientId: string) => {
	return await db.job.findMany({
		where: { client_id: clientId },
		include: {
			client: true,
			request: {
				select: {
					id: true,
					title: true,
					status: true,
				},
			},
			quote: {
				select: {
					id: true,
					quote_number: true,
					total: true,
				},
			},
			visits: {
				include: {
					visit_techs: {
						include: {
							tech: true,
						},
					},
				},
			},
		},
		orderBy: { created_at: "desc" },
	});
};

export const insertJob = async (req: Request, context?: UserContext) => {
	try {
		const parsed = createJobSchema.parse(req.body);

		const created = await db.$transaction(async (tx) => {
			const client = await tx.client.findUnique({
				where: { id: parsed.client_id },
			});

			if (!client) {
				throw new Error("Client not found");
			}

			if (parsed.tech_ids && parsed.tech_ids.length > 0) {
				const existingTechs = await tx.technician.findMany({
					where: { id: { in: parsed.tech_ids } },
					select: { id: true },
				});
				const existingIds = new Set(existingTechs.map((t) => t.id));
				const missing = parsed.tech_ids.filter(
					(id) => !existingIds.has(id),
				);
				if (missing.length > 0) {
					throw new Error(
						`Technicians not found: ${missing.join(", ")}`,
					);
				}
			}

			// Initialize job data with parsed values
			let name = parsed.name;
			let description = parsed.description;
			let address = parsed.address;
			let coords: { lat: number; lon: number } | undefined =
				parsed.coords;
			let priority = parsed.priority;
			let estimatedTotal = parsed.estimated_total;
			let subtotal = parsed.subtotal;
			let taxRate = parsed.tax_rate;
			let taxAmount = parsed.tax_amount;
			let discountType = parsed.discount_type;
			let discountValue = parsed.discount_value;
			let discountAmount = parsed.discount_amount;
			let lineItemsToCreate: LineItemToCreate[] = [];

			// If linked to quote, inherit fields and prepare line items
			if (parsed.quote_id) {
				const quote = await tx.quote.findUnique({
					where: { id: parsed.quote_id },
					include: {
						line_items: {
							orderBy: { sort_order: "asc" },
						},
					},
				});

				if (!quote) {
					throw new Error("Quote not found");
				}

				if (!name) name = quote.title;
				if (!description) description = quote.description;
				if (!address) address = quote.address;
				if (!coords && quote.coords) {
					coords = quote.coords as { lat: number; lon: number };
				}
				if (!priority) priority = quote.priority;
				if (!estimatedTotal) estimatedTotal = Number(quote.total);

				// Copy financial fields from quote if not provided
				if (subtotal === undefined)
					subtotal = quote.subtotal
						? Number(quote.subtotal)
						: undefined;
				if (taxRate === undefined)
					taxRate = quote.tax_rate
						? Number(quote.tax_rate)
						: undefined;
				if (taxAmount === undefined)
					taxAmount = quote.tax_amount
						? Number(quote.tax_amount)
						: undefined;
				if (discountType === undefined)
					discountType =
						(quote.discount_type as "percent" | "amount" | null) ||
						undefined;
				if (discountValue === undefined && quote.discount_value)
					discountValue = Number(quote.discount_value);
				if (discountAmount === undefined)
					discountAmount = quote.discount_amount
						? Number(quote.discount_amount)
						: undefined;

				// Store line items from quote for later creation
				lineItemsToCreate = quote.line_items.map((item) => ({
					name: item.name,
					description: item.description,
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					total: Number(item.total),
					source: "quote" as const,
					item_type: item.item_type,
				}));

				await tx.quote.update({
					where: { id: parsed.quote_id },
					data: { status: "Approved" },
				});

				if (quote.request_id) {
					await tx.request.update({
						where: { id: quote.request_id },
						data: { status: "ConvertedToJob" },
					});
				}
			}
			// If linked to request directly (no quote), inherit from request
			else if (parsed.request_id) {
				const request = await tx.request.findUnique({
					where: { id: parsed.request_id },
				});

				if (!request) {
					throw new Error("Request not found");
				}

				if (!name) name = request.title;
				if (!description) description = request.description;
				if (!address && request.address) address = request.address;
				if (!coords && request.coords) {
					coords = request.coords as { lat: number; lon: number };
				}
				if (!priority) priority = request.priority;
				if (request.estimated_value) {
					estimatedTotal = Number(request.estimated_value);
				}

				await tx.request.update({
					where: { id: parsed.request_id },
					data: { status: "ConvertedToJob" },
				});
			}

			// If line_items provided directly in request, use those
			if (parsed.line_items && parsed.line_items.length > 0) {
				lineItemsToCreate = parsed.line_items.map((item) => ({
					name: item.name,
					description: item.description || null,
					quantity: item.quantity,
					unit_price: item.unit_price,
					total: item.total,
					source: "manual" as const,
					item_type: item.item_type || null,
				}));
			}

			if (!address) {
				throw new Error("Address is required for job");
			}
			if (!coords) {
				throw new Error("Coordinates are required for job");
			}
			if (!name) {
				throw new Error("Job name is required");
			}
			if (!description) {
				throw new Error("Job description is required");
			}

			const jobNumber = await generateJobNumber();

			const job = await tx.job.create({
				data: {
					job_number: jobNumber,
					name: name,
					description: description,
					priority: priority,
					client_id: parsed.client_id,
					address: address,
					coords: coords,
					status: parsed.status || "Unscheduled",
					request_id: parsed.request_id || null,
					quote_id: parsed.quote_id || null,
					recurring_plan_id: parsed.recurring_plan_id || null,
					...(subtotal !== undefined && { subtotal }),
					...(taxRate !== undefined && { tax_rate: taxRate }),
					...(taxAmount !== undefined && { tax_amount: taxAmount }),
					...(discountType !== undefined && {
						discount_type: discountType,
					}),
					...(discountValue !== undefined && {
						discount_value: discountValue,
					}),
					...(discountAmount !== undefined && {
						discount_amount: discountAmount,
					}),
					...(estimatedTotal !== undefined && {
						estimated_total: estimatedTotal,
					}),
				},
			});

			//Create line items (from quote OR from request body)
			if (lineItemsToCreate.length > 0) {
				await tx.job_line_item.createMany({
					data: lineItemsToCreate.map((item) => ({
						job_id: job.id,
						name: item.name,
						description: item.description,
						quantity: item.quantity,
						unit_price: item.unit_price,
						total: item.total ?? item.quantity * item.unit_price,
						source: item.source ?? "manual",
						item_type: item.item_type,
					})),
				});
			}

			await tx.client.update({
				where: { id: parsed.client_id },
				data: { last_activity: new Date() },
			});

			await logActivity({
				event_type: "job.created",
				action: "created",
				entity_type: "job",
				entity_id: job.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					job_number: { old: null, new: job.job_number },
					name: { old: null, new: job.name },
					priority: { old: null, new: job.priority },
					status: { old: null, new: job.status },
					client_id: { old: null, new: job.client_id },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return tx.job.findUnique({
				where: { id: job.id },
				include: {
					client: {
						select: {
							id: true,
							name: true,
							address: true,
							coords: true,
							is_active: true,
							contacts: {
								where: {
									is_primary: true,
								},
								include: {
									contact: {
										select: {
											id: true,
											name: true,
											email: true,
											phone: true,
											title: true,
										},
									},
								},
								take: 1,
							},
						},
					},
					request: {
						select: {
							id: true,
							title: true,
							status: true,
							created_at: true,
						},
					},
					quote: {
						select: {
							id: true,
							quote_number: true,
							title: true,
							status: true,
							total: true,
							created_at: true,
						},
					},
					visits: {
						include: {
							visit_techs: {
								include: { tech: true },
							},
							notes: true,
						},
					},
					line_items: true,
					notes: {
						include: {
							creator_tech: {
								select: { id: true, name: true, email: true },
							},
							creator_dispatcher: {
								select: { id: true, name: true, email: true },
							},
							last_editor_tech: {
								select: { id: true, name: true, email: true },
							},
							last_editor_dispatcher: {
								select: { id: true, name: true, email: true },
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
					},
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
		if (e instanceof Error) {
			return { err: e.message };
		}
		console.error("Insert job error:", e);
		return { err: "Internal server error" };
	}
};

export const updateJob = async (req: Request, context?: UserContext) => {
	try {
		const id = req.params.id as string;
		const parsed = updateJobSchema.parse(req.body);

		const existing = await db.job.findUnique({
			where: { id },
			include: { line_items: true },
		});

		if (!existing) {
			return { err: "Job not found" };
		}

		// Exclude line_items from buildChanges (tracked separately for better detail)
		const { line_items: _lineItems, ...parsedWithoutLineItems } = parsed;

		// Track all job-level field changes
		const changes = buildChanges(existing, parsedWithoutLineItems, [
			"name",
			"description",
			"priority",
			"address",
			"status",
			"cancellation_reason",
			"subtotal",
			"tax_rate",
			"tax_amount",
			"discount_value",
			"discount_amount",
			"estimated_total",
			"actual_total",
			"discount_type",
			"coords",
		] as const);

		const updated = await db.$transaction(async (tx) => {
			// BULK LINE ITEMS UPDATE
			if (parsed.line_items !== undefined) {
				const incomingItems = parsed.line_items || [];

				// Track existing and incoming item IDs
				const existingItemIds = new Set(
					existing.line_items.map((item) => item.id),
				);
				const incomingItemIds = new Set(
					incomingItems
						.filter((item) => item.id)
						.map((item) => item.id!),
				);

				// DELETE: Items not in incoming list
				const itemsToDelete = existing.line_items.filter(
					(item) => !incomingItemIds.has(item.id),
				);

				for (const item of itemsToDelete) {
					await tx.job_line_item.delete({
						where: { id: item.id },
					});

					await logActivity({
						event_type: "job_line_item.deleted",
						action: "deleted",
						entity_type: "job_line_item",
						entity_id: item.id,
						actor_type: context?.techId
							? "technician"
							: context?.dispatcherId
								? "dispatcher"
								: "system",
						actor_id: context?.techId || context?.dispatcherId,
						changes: {
							name: { old: item.name, new: null },
							job_id: { old: item.job_id, new: null },
						},
						ip_address: context?.ipAddress,
						user_agent: context?.userAgent,
					});
				}

				// CREATE OR UPDATE: Process incoming items
				for (const item of incomingItems) {
					if (item.id && existingItemIds.has(item.id)) {
						// UPDATE existing item
						const existingItem = existing.line_items.find(
							(i) => i.id === item.id,
						);

						if (existingItem) {
							// Track changes for this specific item
							const itemChanges: ChangeSet = {};

							if (item.name !== existingItem.name) {
								itemChanges.name = {
									old: existingItem.name,
									new: item.name,
								};
							}
							if (item.description !== existingItem.description) {
								itemChanges.description = {
									old: existingItem.description,
									new: item.description,
								};
							}
							if (
								Number(item.quantity) !==
								Number(existingItem.quantity)
							) {
								itemChanges.quantity = {
									old: existingItem.quantity,
									new: item.quantity,
								};
							}
							if (
								Number(item.unit_price) !==
								Number(existingItem.unit_price)
							) {
								itemChanges.unit_price = {
									old: existingItem.unit_price,
									new: item.unit_price,
								};
							}
							if (
								Number(item.total) !==
								Number(existingItem.total)
							) {
								itemChanges.total = {
									old: existingItem.total,
									new: item.total,
								};
							}
							if (item.item_type !== existingItem.item_type) {
								itemChanges.item_type = {
									old: existingItem.item_type,
									new: item.item_type,
								};
							}

							// Only update if there are actual changes
							if (Object.keys(itemChanges).length > 0) {
								await tx.job_line_item.update({
									where: { id: item.id },
									data: {
										name: item.name,
										description: item.description || null,
										quantity: item.quantity,
										unit_price: item.unit_price,
										total: item.total,
										item_type: item.item_type || null,
									},
								});

								await logActivity({
									event_type: "job_line_item.updated",
									action: "updated",
									entity_type: "job_line_item",
									entity_id: item.id,
									actor_type: context?.techId
										? "technician"
										: context?.dispatcherId
											? "dispatcher"
											: "system",
									actor_id:
										context?.techId ||
										context?.dispatcherId,
									changes: itemChanges,
									ip_address: context?.ipAddress,
									user_agent: context?.userAgent,
								});
							}
						}
					} else {
						const newItem = await tx.job_line_item.create({
							data: {
								job_id: id,
								name: item.name,
								description: item.description || null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								total: item.total,
								source: "manual",
								item_type: item.item_type || null,
							},
						});

						await logActivity({
							event_type: "job_line_item.created",
							action: "created",
							entity_type: "job_line_item",
							entity_id: newItem.id,
							actor_type: context?.techId
								? "technician"
								: context?.dispatcherId
									? "dispatcher"
									: "system",
							actor_id: context?.techId || context?.dispatcherId,
							changes: {
								name: { old: null, new: item.name },
								job_id: { old: null, new: id },
								quantity: { old: null, new: item.quantity },
								unit_price: { old: null, new: item.unit_price },
								total: { old: null, new: item.total },
							},
							ip_address: context?.ipAddress,
							user_agent: context?.userAgent,
						});
					}
				}
			}
			const job = await tx.job.update({
				where: { id },
				data: {
					...(parsed.name !== undefined && { name: parsed.name }),
					...(parsed.description !== undefined && {
						description: parsed.description,
					}),
					...(parsed.priority !== undefined && {
						priority: parsed.priority,
					}),
					...(parsed.address !== undefined && {
						address: parsed.address,
					}),
					...(parsed.coords !== undefined && {
						coords: parsed.coords,
					}),
					...(parsed.status !== undefined && {
						status: parsed.status,
					}),

					...(parsed.subtotal !== undefined && {
						subtotal: parsed.subtotal,
					}),
					...(parsed.tax_rate !== undefined && {
						tax_rate: parsed.tax_rate,
					}),
					...(parsed.tax_amount !== undefined && {
						tax_amount: parsed.tax_amount,
					}),
					...(parsed.discount_type !== undefined && {
						discount_type: parsed.discount_type,
					}),
					...(parsed.discount_value !== undefined && {
						discount_value: parsed.discount_value,
					}),
					...(parsed.discount_amount !== undefined && {
						discount_amount: parsed.discount_amount,
					}),
					...(parsed.estimated_total !== undefined && {
						estimated_total: parsed.estimated_total,
					}),
					...(parsed.actual_total !== undefined && {
						actual_total: parsed.actual_total,
					}),

					...(parsed.cancellation_reason !== undefined && {
						cancellation_reason: parsed.cancellation_reason,
					}),

					...(parsed.status === "Completed" &&
						!existing.completed_at && { completed_at: new Date() }),
					...(parsed.status === "Cancelled" &&
						!existing.cancelled_at && { cancelled_at: new Date() }),
				},
				include: {
					client: true,
					request: true,
					quote: true,
					visits: {
						include: {
							visit_techs: {
								include: { tech: true },
							},
						},
					},
					line_items: true,
					notes: true,
				},
			});

			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "job.updated",
					action: "updated",
					entity_type: "job",
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

			return job;
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
		console.error("Update job error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteJob = async (id: string, context?: UserContext) => {
	try {
		const existing = await db.job.findUnique({
			where: { id },
		});

		if (!existing) {
			return { err: "Job not found" };
		}

		await db.$transaction(async (tx) => {
			await logActivity({
				event_type: "job.deleted",
				action: "deleted",
				entity_type: "job",
				entity_id: id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					job_number: { old: existing.job_number, new: null },
					name: { old: existing.name, new: null },
					status: { old: existing.status, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			await tx.job.delete({
				where: { id },
			});
		});

		return { err: "", item: { id } };
	} catch (e) {
		console.error("Delete job error:", e);
		return { err: "Internal server error" };
	}
};

// ============================================================================
// JOB LINE ITEMS
// ============================================================================

export const getJobLineItems = async (jobId: string) => {
	return await db.job_line_item.findMany({
		where: { job_id: jobId },
		orderBy: { created_at: "asc" },
	});
};

export const getJobLineItemById = async (jobId: string, itemId: string) => {
	return await db.job_line_item.findFirst({
		where: {
			id: itemId,
			job_id: jobId,
		},
	});
};

export const insertJobLineItem = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = createJobLineItemSchema.parse(data);

		const job = await db.job.findUnique({
			where: { id: jobId },
		});

		if (!job) {
			return { err: "Job not found" };
		}

		const created = await db.$transaction(async (tx) => {
			// Calculate total if not provided
			const total =
				parsed.total !== undefined
					? parsed.total
					: parsed.quantity * parsed.unit_price;

			const item = await tx.job_line_item.create({
				data: {
					job_id: jobId,
					name: parsed.name,
					description: parsed.description || null,
					quantity: parsed.quantity,
					unit_price: parsed.unit_price,
					total: total,
					source: parsed.source || "manual",
					item_type: parsed.item_type || null,
				},
			});

			await logActivity({
				event_type: "job_line_item.created",
				action: "created",
				entity_type: "job_line_item",
				entity_id: item.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: null, new: parsed.name },
					job_id: { old: null, new: jobId },
					total: { old: null, new: total },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return item;
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
		console.error("Insert job line item error:", e);
		return { err: "Internal server error" };
	}
};

export const updateJobLineItem = async (
	jobId: string,
	itemId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateJobLineItemSchema.parse(data);

		const existing = await db.job_line_item.findFirst({
			where: {
				id: itemId,
				job_id: jobId,
			},
		});

		if (!existing) {
			return { err: "Item not found" };
		}

		const changes = buildChanges(existing, parsed, [
			"name",
			"description",
			"source",
			"item_type",
		] as const);

		// Manually track numeric fields (Decimal type)
		if (
			parsed.quantity !== undefined &&
			Number(existing.quantity) !== parsed.quantity
		) {
			changes.quantity = { old: existing.quantity, new: parsed.quantity };
		}
		if (
			parsed.unit_price !== undefined &&
			Number(existing.unit_price) !== parsed.unit_price
		) {
			changes.unit_price = {
				old: existing.unit_price,
				new: parsed.unit_price,
			};
		}
		if (
			parsed.total !== undefined &&
			Number(existing.total) !== parsed.total
		) {
			changes.total = { old: existing.total, new: parsed.total };
		}

		const updated = await db.$transaction(async (tx) => {
			// Recalculate total if quantity or unit_price changed
			let total = parsed.total;
			if (total === undefined) {
				const newQuantity =
					parsed.quantity !== undefined
						? parsed.quantity
						: Number(existing.quantity);
				const newUnitPrice =
					parsed.unit_price !== undefined
						? parsed.unit_price
						: Number(existing.unit_price);
				total = newQuantity * newUnitPrice;
			}

			const item = await tx.job_line_item.update({
				where: { id: itemId },
				data: {
					...(parsed.name !== undefined && { name: parsed.name }),
					...(parsed.description !== undefined && {
						description: parsed.description,
					}),
					...(parsed.quantity !== undefined && {
						quantity: parsed.quantity,
					}),
					...(parsed.unit_price !== undefined && {
						unit_price: parsed.unit_price,
					}),
					total: total,
					...(parsed.source !== undefined && {
						source: parsed.source,
					}),
					...(parsed.item_type !== undefined && {
						item_type: parsed.item_type,
					}),
				},
			});

			if (Object.keys(changes).length > 0) {
				await logActivity({
					event_type: "job_line_item.updated",
					action: "updated",
					entity_type: "job_line_item",
					entity_id: itemId,
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

			return item;
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
		console.error("Update job line item error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteJobLineItem = async (
	jobId: string,
	itemId: string,
	context?: UserContext,
) => {
	try {
		const existing = await db.job_line_item.findFirst({
			where: {
				id: itemId,
				job_id: jobId,
			},
		});

		if (!existing) {
			return { err: "Item not found" };
		}

		await db.$transaction(async (tx) => {
			await logActivity({
				event_type: "job_line_item.deleted",
				action: "deleted",
				entity_type: "job_line_item",
				entity_id: itemId,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: existing.name, new: null },
					job_id: { old: existing.job_id, new: null },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			await tx.job_line_item.delete({
				where: { id: itemId },
			});
		});

		return { err: "", message: "Item deleted successfully" };
	} catch (error) {
		console.error("Delete job line item error:", error);
		return { err: "Internal server error" };
	}
};
