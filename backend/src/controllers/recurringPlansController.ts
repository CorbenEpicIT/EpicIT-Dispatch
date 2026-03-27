import { ZodError } from "zod";
import { db } from "../db.js";
import {
	Prisma,
	recurring_frequency,
	weekday,
} from "../../generated/prisma/client.js";
import { Request } from "express";
import { logActivity, buildChanges } from "../services/logger.js";
import {
	createRecurringPlanSchema,
	updateRecurringPlanSchema,
	updateRecurringPlanLineItemsSchema,
	updateInvoiceScheduleSchema,
	generateOccurrencesSchema,
	skipOccurrenceSchema,
	rescheduleOccurrenceSchema,
	bulkSkipOccurrencesSchema,
	bulkRescheduleOccurrencesSchema,
} from "../lib/validate/recurringPlans.js";
import {
	LineItemToCreate,
	ChangeSet,
	OccurrenceGenerationResult,
	VisitGenerationResult,
} from "../types/common.js";
import { addDays, addWeeks, addMonths, addYears, parseISO } from "date-fns";
import {
	calculateNextInvoiceAt,
	type ScheduleFrequency,
} from "../lib/invoiceSchedule.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}

type RecurringRuleWithWeekdays = Prisma.recurring_ruleGetPayload<{
	include: { by_weekday: true };
}>;

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
// OCCURRENCE GENERATION LOGIC
// ============================================================================

async function generateOccurrencesForPlan(
	planId: string,
	daysAhead: number,
	tx: Prisma.TransactionClient,
): Promise<OccurrenceGenerationResult> {
	const plan = await tx.recurring_plan.findUnique({
		where: { id: planId },
		include: {
			rules: {
				include: {
					by_weekday: true,
				},
			},
		},
	});

	if (!plan) {
		throw new Error("Plan not found");
	}

	if (plan.rules.length === 0) {
		throw new Error("Plan has no rules defined");
	}

	const rule = plan.rules[0]; // Use first rule (we only support one rule per plan for now)
	const startDate = new Date();
	const endDate = addDays(startDate, daysAhead);
	const planEndDate = plan.ends_at ? new Date(plan.ends_at) : null;

	const generationEndDate =
		planEndDate && planEndDate < endDate ? planEndDate : endDate;

	const dates = calculateOccurrenceDates(
		rule,
		new Date(plan.starts_at),
		startDate,
		generationEndDate,
	);

	let generated = 0;
	let skipped = 0;

	for (const date of dates) {
		// Check if occurrence already exists
		const existing = await tx.recurring_occurrence.findFirst({
			where: {
				recurring_plan_id: planId,
				occurrence_start_at: date.start,
			},
		});

		if (existing) {
			skipped++;
			continue;
		}

		// Create occurrence
		await tx.recurring_occurrence.create({
			data: {
				recurring_plan_id: planId,
				occurrence_start_at: date.start,
				occurrence_end_at: date.end,
				status: "planned",
				template_version: 1, // TODO: Implement versioning
			},
		});

		generated++;
	}

	return {
		generated,
		skipped,
		start_date: startDate,
		end_date: generationEndDate,
	};
}

function calculateOccurrenceDates(
	rule: RecurringRuleWithWeekdays,
	planStartDate: Date,
	rangeStart: Date,
	rangeEnd: Date,
): Array<{ start: Date; end: Date }> {
	const dates: Array<{ start: Date; end: Date }> = [];
	let currentDate = new Date(
		Math.max(planStartDate.getTime(), rangeStart.getTime()),
	);

	let startHours = 9; // Default 9 AM
	let startMinutes = 0;

	// Determine start time based on arrival constraint
	if (rule.arrival_constraint === "at" && rule.arrival_time) {
		const [h, m] = rule.arrival_time.split(":").map(Number);
		startHours = h;
		startMinutes = m;
	} else if (
		rule.arrival_constraint === "between" &&
		rule.arrival_window_start
	) {
		const [h, m] = rule.arrival_window_start.split(":").map(Number);
		startHours = h;
		startMinutes = m;
	} else if (rule.arrival_constraint === "by" && rule.arrival_window_end) {
		// For "by" constraint, calculate a reasonable start time before deadline
		// Default to 4 hours before deadline, or 9 AM if deadline is earlier
		const [deadlineH, deadlineM] = rule.arrival_window_end
			.split(":")
			.map(Number);
		const deadlineMinutes = deadlineH * 60 + deadlineM;
		const startTimeMinutes = Math.max(540, deadlineMinutes - 240); // 540 = 9:00 AM, 240 = 4 hours
		startHours = Math.floor(startTimeMinutes / 60);
		startMinutes = startTimeMinutes % 60;
	}

	const weekdayMap: Record<weekday, number> = {
		MO: 1,
		TU: 2,
		WE: 3,
		TH: 4,
		FR: 5,
		SA: 6,
		SU: 0,
	};

	while (currentDate <= rangeEnd) {
		let shouldInclude = false;

		switch (rule.frequency) {
			case "daily":
				shouldInclude = true;
				break;

			case "weekly":
				const currentDay = currentDate.getDay();
				shouldInclude = rule.by_weekday.some(
					(wd) => weekdayMap[wd.weekday] === currentDay,
				);
				break;

			case "monthly":
				if (rule.by_month_day !== null) {
					shouldInclude = currentDate.getDate() === rule.by_month_day;
				}
				break;

			case "yearly":
				if (rule.by_month !== null && rule.by_month_day !== null) {
					shouldInclude =
						currentDate.getMonth() + 1 === rule.by_month &&
						currentDate.getDate() === rule.by_month_day;
				}
				break;
		}

		if (shouldInclude) {
			const occurrenceStart = new Date(currentDate);
			occurrenceStart.setHours(startHours, startMinutes, 0, 0);

			// Calculate end time based on finish constraint
			let endHours = startHours;
			let endMinutes = startMinutes;
			let durationMinutes = 120; // Default 2 hours

			if (rule.finish_constraint === "at" && rule.finish_time) {
				const [h, m] = rule.finish_time.split(":").map(Number);
				endHours = h;
				endMinutes = m;
				durationMinutes =
					endHours * 60 +
					endMinutes -
					(startHours * 60 + startMinutes);
			} else if (rule.finish_constraint === "by" && rule.finish_time) {
				const [h, m] = rule.finish_time.split(":").map(Number);
				endHours = h;
				endMinutes = m;
				durationMinutes =
					endHours * 60 +
					endMinutes -
					(startHours * 60 + startMinutes);
			} else {
				// Default duration for "when_done" or unspecified
				const endTimeMinutes =
					startHours * 60 + startMinutes + durationMinutes;
				endHours = Math.floor(endTimeMinutes / 60) % 24;
				endMinutes = endTimeMinutes % 60;
			}

			if (durationMinutes <= 0) {
				durationMinutes = 120; // Fallback to 2 hours
			}

			const occurrenceEnd = addMinutes(occurrenceStart, durationMinutes);

			dates.push({
				start: occurrenceStart,
				end: occurrenceEnd,
			});
		}

		// Increment date based on frequency and interval
		switch (rule.frequency) {
			case "daily":
				currentDate = addDays(currentDate, rule.interval);
				break;
			case "weekly":
				currentDate = addDays(currentDate, 1); // Check each day for weekly
				break;
			case "monthly":
				currentDate = addMonths(currentDate, rule.interval);
				break;
			case "yearly":
				currentDate = addYears(currentDate, rule.interval);
				break;
		}
	}

	return dates;
}

function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * 60000);
}

// ============================================================================
// RECURRING PLAN CRUD
// ============================================================================

export const getAllRecurringPlans = async () => {
	return await db.recurring_plan.findMany({
		include: {
			client: {
				select: {
					id: true,
					name: true,
					address: true,
				},
			},
			job_container: {
				select: {
					id: true,
					job_number: true,
					name: true,
					status: true,
				},
			},
			rules: {
				include: {
					by_weekday: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			occurrences: {
				where: {
					occurrence_start_at: {
						gte: new Date(),
					},
				},
				orderBy: { occurrence_start_at: "asc" },
				take: 5,
			},
		},
		orderBy: { created_at: "desc" },
	});
};

export const getRecurringPlanByJobId = async (jobId: string) => {
	return await db.recurring_plan.findFirst({
		where: {
			job_container: {
				id: jobId,
			},
		},
		include: {
			client: true,
			job_container: true,
			rules: {
				include: {
					by_weekday: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			occurrences: {
				orderBy: { occurrence_start_at: "asc" },
			},
			invoice_schedule: true,
			created_by_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	});
};

export const getRecurringPlanById = async (planId: string) => {
	return await db.recurring_plan.findUnique({
		where: { id: planId },
		include: {
			client: {
				include: {
					contacts: {
						include: {
							contact: true,
						},
					},
				},
			},
			job_container: {
				select: {
					id: true,
					job_number: true,
					name: true,
					status: true,
					address: true,
					description: true,
					tax_rate: true,
				},
			},
			rules: {
				include: {
					by_weekday: true,
				},
			},
			line_items: {
				orderBy: { sort_order: "asc" },
			},
			occurrences: {
				orderBy: { occurrence_start_at: "asc" },
			},
			invoice_schedule: true,
			created_by_dispatcher: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	});
};

export const insertRecurringPlan = async (
	req: Request,
	context?: UserContext,
) => {
	try {
		const parsed = createRecurringPlanSchema.parse(req.body);

		const created = await db.$transaction(async (tx) => {
			const client = await tx.client.findUnique({
				where: { id: parsed.client_id },
			});

			if (!client) {
				throw new Error("Client not found");
			}

			const jobNumber = await generateJobNumber();

			// Create job container first (without recurring_plan_id)
			const job = await tx.job.create({
				data: {
					job_number: jobNumber,
					name: parsed.name,
					description: parsed.description,
					priority: parsed.priority,
					address: parsed.address,
					coords: parsed.coords,
					status: "InProgress", // Recurring job container is always in progress
					client_id: parsed.client_id,
					organization_id: client.organization_id,
				},
			});

			// Create recurring plan (without job_container reference yet)
			const plan = await tx.recurring_plan.create({
				data: {
					organization_id: client.organization_id,
					client_id: parsed.client_id,
					name: parsed.name,
					description: parsed.description,
					address: parsed.address,
					coords: parsed.coords,
					priority: parsed.priority,
					status: "Active",
					starts_at: new Date(parsed.starts_at),
					ends_at: parsed.ends_at ? new Date(parsed.ends_at) : null,
					timezone: parsed.timezone,
					generation_window_days: parsed.generation_window_days,
					min_advance_days: parsed.min_advance_days,
					billing_mode: parsed.billing_mode,
					invoice_timing: parsed.invoice_timing,
					auto_invoice: parsed.auto_invoice,
					created_by_dispatcher_id: context?.dispatcherId || null,
				},
			});

			// Link job to plan (bidirectional 1:1)
			await tx.job.update({
				where: { id: job.id },
				data: { recurring_plan_id: plan.id },
			});

			// Create recurring rule
			const rule = await tx.recurring_rule.create({
				data: {
					recurring_plan_id: plan.id,
					frequency: parsed.rule.frequency,
					interval: parsed.rule.interval,
					by_month_day: parsed.rule.by_month_day,
					by_month: parsed.rule.by_month,

					// Constraint-based scheduling
					arrival_constraint: parsed.rule.arrival_constraint,
					finish_constraint: parsed.rule.finish_constraint,
					arrival_time: parsed.rule.arrival_time,
					arrival_window_start: parsed.rule.arrival_window_start,
					arrival_window_end: parsed.rule.arrival_window_end,
					finish_time: parsed.rule.finish_time,
				},
			});

			// Create weekday relations if provided
			if (parsed.rule.by_weekday && parsed.rule.by_weekday.length > 0) {
				await tx.recurring_rule_weekday.createMany({
					data: parsed.rule.by_weekday.map((weekday) => ({
						recurring_rule_id: rule.id,
						weekday: weekday,
					})),
				});
			}

			// Create template line items
			if (parsed.line_items && parsed.line_items.length > 0) {
				await tx.recurring_plan_line_item.createMany({
					data: parsed.line_items.map((item, idx) => ({
						recurring_plan_id: plan.id,
						name: item.name,
						description: item.description ?? null,
						quantity: item.quantity,
						unit_price: item.unit_price,
						item_type: item.item_type ?? null,
						sort_order: item.sort_order ?? idx,
					})),
				});
			}

			// Create invoice schedule if billing is configured
			if (parsed.invoice_schedule && parsed.billing_mode !== "none") {
				const sched = parsed.invoice_schedule;
				const nextInvoiceAt =
					sched.frequency !== "on_visit_completion"
						? calculateNextInvoiceAt(
								sched.frequency as ScheduleFrequency,
								sched.day_of_month ?? null,
								sched.day_of_week ?? null,
								sched.generate_days_before ?? 0,
							)
						: null;
				await tx.invoice_schedule.create({
					data: {
						recurring_plan_id: plan.id,
						billing_basis: sched.billing_basis,
						fixed_amount: sched.fixed_amount ?? null,
						frequency: sched.frequency,
						day_of_month: sched.day_of_month ?? null,
						day_of_week: sched.day_of_week as weekday | null ?? null,
						generate_days_before: sched.generate_days_before ?? 0,
						payment_terms_days: sched.payment_terms_days ?? 30,
						auto_send: sched.auto_send ?? false,
						memo_template: sched.memo_template ?? null,
						next_invoice_at: nextInvoiceAt,
						is_active: true,
					},
				});
			}

			// Generate initial occurrences
			await generateOccurrencesForPlan(
				plan.id,
				parsed.generation_window_days,
				tx,
			);

			// Update client activity
			await tx.client.update({
				where: { id: parsed.client_id },
				data: { last_activity: new Date() },
			});

			await logActivity({
				event_type: "recurring_plan.created",
				action: "created",
				entity_type: "recurring_plan",
				entity_id: plan.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					name: { old: null, new: plan.name },
					client_id: { old: null, new: plan.client_id },
					status: { old: null, new: plan.status },
					job_id: { old: null, new: job.id },
					line_items_count: {
						old: null,
						new: parsed.line_items?.length ?? 0,
					},
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			// Return full plan with all relations
			return tx.recurring_plan.findUnique({
				where: { id: plan.id },
				include: {
					client: true,
					job_container: true,
					rules: {
						include: {
							by_weekday: true,
						},
					},
					line_items: {
						orderBy: { sort_order: "asc" },
					},
					occurrences: {
						orderBy: { occurrence_start_at: "asc" },
						take: 10,
					},
					invoice_schedule: true,
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
		console.error("Insert recurring plan error:", e);
		return { err: "Internal server error" };
	}
};

export const updateRecurringPlan = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateRecurringPlanSchema.parse(data);

		const existing = await db.recurring_plan.findFirst({
			where: {
				job_container: {
					id: jobId,
				},
			},
			include: {
				rules: {
					include: {
						by_weekday: true,
					},
				},
				line_items: true,
			},
		});

		if (!existing) {
			return { err: "Recurring plan not found" };
		}

		const changes = buildChanges(existing, parsed, [
			"name",
			"description",
			"address",
			"priority",
			"status",
			"starts_at",
			"ends_at",
			"timezone",
			"generation_window_days",
			"min_advance_days",
			"billing_mode",
			"invoice_timing",
			"auto_invoice",
			"coords",
		] as const);

		const updated = await db.$transaction(async (tx) => {
			const plan = await tx.recurring_plan.update({
				where: { id: existing.id },
				data: {
					...(parsed.name !== undefined && { name: parsed.name }),
					...(parsed.description !== undefined && {
						description: parsed.description,
					}),
					...(parsed.address !== undefined && {
						address: parsed.address,
					}),
					...(parsed.coords !== undefined && {
						coords: parsed.coords,
					}),
					...(parsed.priority !== undefined && {
						priority: parsed.priority,
					}),
					...(parsed.status !== undefined && {
						status: parsed.status,
					}),
					...(parsed.starts_at !== undefined && {
						starts_at: new Date(parsed.starts_at),
					}),
					...(parsed.ends_at !== undefined && {
						ends_at: parsed.ends_at
							? new Date(parsed.ends_at)
							: null,
					}),
					...(parsed.timezone !== undefined && {
						timezone: parsed.timezone,
					}),
					...(parsed.generation_window_days !== undefined && {
						generation_window_days: parsed.generation_window_days,
					}),
					...(parsed.min_advance_days !== undefined && {
						min_advance_days: parsed.min_advance_days,
					}),
					...(parsed.billing_mode !== undefined && {
						billing_mode: parsed.billing_mode,
					}),
					...(parsed.invoice_timing !== undefined && {
						invoice_timing: parsed.invoice_timing,
					}),
					...(parsed.auto_invoice !== undefined && {
						auto_invoice: parsed.auto_invoice,
					}),
				},
			});

			// Update recurring rule if provided
			if (parsed.rule && existing.rules.length > 0) {
				const existingRule = existing.rules[0];

				await tx.recurring_rule.update({
					where: { id: existingRule.id },
					data: {
						frequency: parsed.rule.frequency,
						interval: parsed.rule.interval,
						by_month_day: parsed.rule.by_month_day ?? null,
						by_month: parsed.rule.by_month ?? null,

						arrival_constraint: parsed.rule.arrival_constraint,
						finish_constraint: parsed.rule.finish_constraint,
						arrival_time: parsed.rule.arrival_time ?? null,
						arrival_window_start:
							parsed.rule.arrival_window_start ?? null,
						arrival_window_end:
							parsed.rule.arrival_window_end ?? null,
						finish_time: parsed.rule.finish_time ?? null,
					},
				});

				// Update weekdays - delete all and recreate
				await tx.recurring_rule_weekday.deleteMany({
					where: { recurring_rule_id: existingRule.id },
				});

				if (
					parsed.rule.by_weekday &&
					parsed.rule.by_weekday.length > 0
				) {
					await tx.recurring_rule_weekday.createMany({
						data: parsed.rule.by_weekday.map((weekday) => ({
							recurring_rule_id: existingRule.id,
							weekday: weekday,
						})),
					});
				}

				// Delete all future planned occurrences after schedule changed
				await tx.recurring_occurrence.deleteMany({
					where: {
						recurring_plan_id: existing.id,
						status: "planned",
						occurrence_start_at: {
							gte: new Date(),
						},
					},
				});

				// Regenerate occurrences with new schedule and generation window
				await generateOccurrencesForPlan(
					existing.id,
					plan.generation_window_days,
					tx,
				);
			}

			// Update line items if provided
			if (parsed.line_items) {
				const existingItemIds = new Set(
					existing.line_items.map((item) => item.id),
				);
				const incomingItemIds = new Set(
					parsed.line_items
						.filter((item) => item.id)
						.map((item) => item.id!),
				);

				// DELETE: Items not in incoming list
				const itemsToDelete = existing.line_items.filter(
					(item) => !incomingItemIds.has(item.id),
				);

				for (const item of itemsToDelete) {
					await tx.recurring_plan_line_item.delete({
						where: { id: item.id },
					});
				}

				// CREATE OR UPDATE
				for (const item of parsed.line_items) {
					if (item.id && existingItemIds.has(item.id)) {
						await tx.recurring_plan_line_item.update({
							where: { id: item.id },
							data: {
								name: item.name,
								description: item.description || null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
							},
						});
					} else {
						await tx.recurring_plan_line_item.create({
							data: {
								recurring_plan_id: existing.id,
								name: item.name,
								description: item.description || null,
								quantity: item.quantity,
								unit_price: item.unit_price,
								item_type: item.item_type ?? null,
								sort_order: item.sort_order ?? 0,
							},
						});
					}
				}
			}

			// Update job container if relevant fields changed
			if (
				parsed.name !== undefined ||
				parsed.description !== undefined ||
				parsed.address !== undefined ||
				parsed.coords !== undefined ||
				parsed.priority !== undefined
			) {
				await tx.job.update({
					where: { id: jobId },
					data: {
						...(parsed.name !== undefined && { name: parsed.name }),
						...(parsed.description !== undefined && {
							description: parsed.description,
						}),
						...(parsed.address !== undefined && {
							address: parsed.address,
						}),
						...(parsed.coords !== undefined && {
							coords: parsed.coords,
						}),
						...(parsed.priority !== undefined && {
							priority: parsed.priority,
						}),
					},
				});
			}

			// Upsert invoice schedule if billing configuration is provided
			if (parsed.invoice_schedule) {
				const sched = parsed.invoice_schedule;
				if (parsed.billing_mode === "none") {
					// Deactivate schedule if billing is set to none
					await tx.invoice_schedule.updateMany({
						where: { recurring_plan_id: existing.id },
						data: { is_active: false },
					});
				} else {
					const nextInvoiceAt =
						sched.frequency !== "on_visit_completion"
							? calculateNextInvoiceAt(
									sched.frequency as ScheduleFrequency,
									sched.day_of_month ?? null,
									sched.day_of_week ?? null,
									sched.generate_days_before ?? 0,
								)
							: null;
					await tx.invoice_schedule.upsert({
						where: { recurring_plan_id: existing.id },
						create: {
							recurring_plan_id: existing.id,
							billing_basis: sched.billing_basis,
							fixed_amount: sched.fixed_amount ?? null,
							frequency: sched.frequency,
							day_of_month: sched.day_of_month ?? null,
							day_of_week: sched.day_of_week as weekday | null ?? null,
							generate_days_before: sched.generate_days_before ?? 0,
							payment_terms_days: sched.payment_terms_days ?? 30,
							auto_send: sched.auto_send ?? false,
							memo_template: sched.memo_template ?? null,
							next_invoice_at: nextInvoiceAt,
							is_active: true,
						},
						update: {
							billing_basis: sched.billing_basis,
							fixed_amount: sched.fixed_amount ?? null,
							frequency: sched.frequency,
							day_of_month: sched.day_of_month ?? null,
							day_of_week: sched.day_of_week as weekday | null ?? null,
							generate_days_before: sched.generate_days_before ?? 0,
							payment_terms_days: sched.payment_terms_days ?? 30,
							auto_send: sched.auto_send ?? false,
							memo_template: sched.memo_template ?? null,
							next_invoice_at: nextInvoiceAt,
							is_active: true,
						},
					});
				}
			}

			if (
				Object.keys(changes).length > 0 ||
				parsed.rule ||
				parsed.line_items
			) {
				await logActivity({
					event_type: "recurring_plan.updated",
					action: "updated",
					entity_type: "recurring_plan",
					entity_id: existing.id,
					actor_type: context?.techId
						? "technician"
						: context?.dispatcherId
							? "dispatcher"
							: "system",
					actor_id: context?.techId || context?.dispatcherId,
					changes: {
						...changes,
						...(parsed.rule && {
							rule_updated: { old: null, new: true },
						}),
						...(parsed.line_items && {
							line_items_count: {
								old: existing.line_items.length,
								new: parsed.line_items.length,
							},
						}),
					},
					ip_address: context?.ipAddress,
					user_agent: context?.userAgent,
				});
			}

			// Return full plan with all relations
			return tx.recurring_plan.findUnique({
				where: { id: existing.id },
				include: {
					client: {
						include: {
							contacts: {
								include: {
									contact: true,
								},
							},
						},
					},
					job_container: {
						select: {
							id: true,
							job_number: true,
							name: true,
							status: true,
							address: true,
							description: true,
							tax_rate: true,
						},
					},
					rules: {
						include: {
							by_weekday: true,
						},
					},
					line_items: {
						orderBy: { sort_order: "asc" },
					},
					occurrences: {
						orderBy: { occurrence_start_at: "asc" },
					},
					invoice_schedule: true,
					created_by_dispatcher: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
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
		console.error("Update recurring plan error:", e);
		return { err: "Internal server error" };
	}
};

export const updateRecurringPlanLineItems = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateRecurringPlanLineItemsSchema.parse(data);

		const plan = await db.recurring_plan.findFirst({
			where: {
				job_container: {
					id: jobId,
				},
			},
			include: {
				line_items: true,
			},
		});

		if (!plan) {
			return { err: "Recurring plan not found" };
		}

		const updated = await db.$transaction(async (tx) => {
			const existingItemIds = new Set(
				plan.line_items.map((item) => item.id),
			);
			const incomingItemIds = new Set(
				parsed.line_items
					.filter((item) => item.id)
					.map((item) => item.id!),
			);

			// DELETE: Items not in incoming list
			const itemsToDelete = plan.line_items.filter(
				(item) => !incomingItemIds.has(item.id),
			);

			for (const item of itemsToDelete) {
				await tx.recurring_plan_line_item.delete({
					where: { id: item.id },
				});
			}

			// CREATE OR UPDATE
			for (const item of parsed.line_items) {
				if (item.id && existingItemIds.has(item.id)) {
					await tx.recurring_plan_line_item.update({
						where: { id: item.id },
						data: {
							name: item.name,
							description: item.description || null,
							quantity: item.quantity,
							unit_price: item.unit_price,
							item_type: item.item_type ?? null,
							sort_order: item.sort_order ?? 0,
						},
					});
				} else {
					await tx.recurring_plan_line_item.create({
						data: {
							recurring_plan_id: plan.id,
							name: item.name,
							description: item.description || null,
							quantity: item.quantity,
							unit_price: item.unit_price,
							item_type: item.item_type ?? null,
							sort_order: item.sort_order ?? 0,
						},
					});
				}
			}

			await logActivity({
				event_type: "recurring_plan.template_updated",
				action: "updated",
				entity_type: "recurring_plan",
				entity_id: plan.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					line_items_count: {
						old: plan.line_items.length,
						new: parsed.line_items.length,
					},
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return tx.recurring_plan.findUnique({
				where: { id: plan.id },
				include: {
					line_items: {
						orderBy: { sort_order: "asc" },
					},
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
		console.error("Update recurring plan line items error:", e);
		return { err: "Internal server error" };
	}
};

// ============================================================================
// INVOICE SCHEDULE
// ============================================================================

export const upsertInvoiceSchedule = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = updateInvoiceScheduleSchema.parse(data);

		const plan = await db.recurring_plan.findFirst({
			where: { job_container: { id: jobId } },
		});

		if (!plan) return { err: "Recurring plan not found" };

		const nextInvoiceAt =
			parsed.frequency !== "on_visit_completion"
				? calculateNextInvoiceAt(
						parsed.frequency as ScheduleFrequency,
						parsed.day_of_month ?? null,
						parsed.day_of_week ?? null,
						parsed.generate_days_before ?? 0,
					)
				: null;

		const schedule = await db.invoice_schedule.upsert({
			where: { recurring_plan_id: plan.id },
			create: {
				recurring_plan_id: plan.id,
				billing_basis: parsed.billing_basis,
				fixed_amount: parsed.fixed_amount ?? null,
				frequency: parsed.frequency,
				day_of_month: parsed.day_of_month ?? null,
				day_of_week: parsed.day_of_week as weekday | null ?? null,
				generate_days_before: parsed.generate_days_before ?? 0,
				payment_terms_days: parsed.payment_terms_days ?? 30,
				auto_send: parsed.auto_send ?? false,
				memo_template: parsed.memo_template ?? null,
				next_invoice_at: nextInvoiceAt,
				is_active: true,
			},
			update: {
				billing_basis: parsed.billing_basis,
				fixed_amount: parsed.fixed_amount ?? null,
				frequency: parsed.frequency,
				day_of_month: parsed.day_of_month ?? null,
				day_of_week: parsed.day_of_week as weekday | null ?? null,
				generate_days_before: parsed.generate_days_before ?? 0,
				payment_terms_days: parsed.payment_terms_days ?? 30,
				auto_send: parsed.auto_send ?? false,
				memo_template: parsed.memo_template ?? null,
				next_invoice_at: nextInvoiceAt,
				is_active: true,
			},
		});

		return { err: "", item: schedule };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues.map((err) => err.message).join(", ")}`,
			};
		}
		console.error("Upsert invoice schedule error:", e);
		return { err: "Internal server error" };
	}
};

export const deleteInvoiceSchedule = async (jobId: string) => {
	const plan = await db.recurring_plan.findFirst({
		where: { job_container: { id: jobId } },
	});

	if (!plan) return { err: "Recurring plan not found" };

	await db.invoice_schedule.deleteMany({
		where: { recurring_plan_id: plan.id },
	});

	return { err: "" };
};

// ============================================================================
// PLAN LIFECYCLE ACTIONS
// ============================================================================

export const pauseRecurringPlan = async (
	jobId: string,
	context?: UserContext,
) => {
	return updateRecurringPlan(jobId, { status: "Paused" }, context);
};

export const resumeRecurringPlan = async (
	jobId: string,
	context?: UserContext,
) => {
	return updateRecurringPlan(jobId, { status: "Active" }, context);
};

export const cancelRecurringPlan = async (
	jobId: string,
	context?: UserContext,
) => {
	try {
		const plan = await db.recurring_plan.findFirst({
			where: {
				job_container: {
					id: jobId,
				},
			},
		});

		if (!plan) {
			return { err: "Recurring plan not found" };
		}

		const updated = await db.$transaction(async (tx) => {
			// Cancel all future planned occurrences
			await tx.recurring_occurrence.updateMany({
				where: {
					recurring_plan_id: plan.id,
					status: "planned",
					occurrence_start_at: {
						gt: new Date(),
					},
				},
				data: {
					status: "cancelled",
					skip_reason: "Plan cancelled",
				},
			});

			// Update plan status
			const updatedPlan = await tx.recurring_plan.update({
				where: { id: plan.id },
				data: { status: "Cancelled" },
			});

			await logActivity({
				event_type: "recurring_plan.cancelled",
				action: "updated",
				entity_type: "recurring_plan",
				entity_id: plan.id,
				actor_type: context?.techId
					? "technician"
					: context?.dispatcherId
						? "dispatcher"
						: "system",
				actor_id: context?.techId || context?.dispatcherId,
				changes: {
					status: { old: plan.status, new: "Cancelled" },
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return updatedPlan;
		});

		return { err: "", item: updated };
	} catch (e) {
		console.error("Cancel recurring plan error:", e);
		return { err: "Internal server error" };
	}
};

export const completeRecurringPlan = async (
	jobId: string,
	context?: UserContext,
) => {
	return updateRecurringPlan(jobId, { status: "Completed" }, context);
};

// ============================================================================
// OCCURRENCE MANAGEMENT
// ============================================================================

export const getOccurrencesByJobId = async (jobId: string) => {
	const plan = await db.recurring_plan.findFirst({
		where: {
			job_container: {
				id: jobId,
			},
		},
	});

	if (!plan) {
		return [];
	}

	return await db.recurring_occurrence.findMany({
		where: { recurring_plan_id: plan.id },
		include: {
			job_visit: {
				include: {
					visit_techs: {
						include: {
							tech: true,
						},
					},
				},
			},
		},
		orderBy: { occurrence_start_at: "asc" },
	});
};

export const generateOccurrences = async (
	jobId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = generateOccurrencesSchema.parse(data);

		const plan = await db.recurring_plan.findFirst({
			where: {
				job_container: {
					id: jobId,
				},
			},
		});

		if (!plan) {
			return { err: "Recurring plan not found" };
		}

		if (plan.status !== "Active") {
			return { err: "Can only generate occurrences for active plans" };
		}

		const result = await db.$transaction(async (tx) => {
			return await generateOccurrencesForPlan(
				plan.id,
				parsed.days_ahead,
				tx,
			);
		});

		await logActivity({
			event_type: "recurring_occurrence.generated",
			action: "created",
			entity_type: "recurring_plan",
			entity_id: plan.id,
			actor_type: context?.techId
				? "technician"
				: context?.dispatcherId
					? "dispatcher"
					: "system",
			actor_id: context?.techId || context?.dispatcherId,
			changes: {
				generated_count: { old: null, new: result.generated },
				days_ahead: { old: null, new: parsed.days_ahead },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: result };
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
		console.error("Generate occurrences error:", e);
		return { err: "Internal server error" };
	}
};

export const skipOccurrence = async (
	occurrenceId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = skipOccurrenceSchema.parse(data);

		const occurrence = await db.recurring_occurrence.findUnique({
			where: { id: occurrenceId },
		});

		if (!occurrence) {
			return { err: "Occurrence not found" };
		}

		if (occurrence.status !== "planned") {
			return { err: "Can only skip planned occurrences" };
		}

		const updated = await db.recurring_occurrence.update({
			where: { id: occurrenceId },
			data: {
				status: "skipped",
				skip_reason: parsed.skip_reason,
				skipped_at: new Date(),
			},
		});

		await logActivity({
			event_type: "recurring_occurrence.skipped",
			action: "updated",
			entity_type: "recurring_occurrence",
			entity_id: occurrenceId,
			actor_type: context?.techId
				? "technician"
				: context?.dispatcherId
					? "dispatcher"
					: "system",
			actor_id: context?.techId || context?.dispatcherId,
			changes: {
				status: { old: "planned", new: "skipped" },
				skip_reason: { old: null, new: parsed.skip_reason },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
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
		console.error("Skip occurrence error:", e);
		return { err: "Internal server error" };
	}
};

export const rescheduleOccurrence = async (
	occurrenceId: string,
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = rescheduleOccurrenceSchema.parse(data);

		const occurrence = await db.recurring_occurrence.findUnique({
			where: { id: occurrenceId },
		});

		if (!occurrence) {
			return { err: "Occurrence not found" };
		}

		if (occurrence.status !== "planned") {
			return { err: "Can only reschedule planned occurrences" };
		}

		const newStartDate = new Date(parsed.new_start_at);
		const newEndDate = parsed.new_end_at
			? new Date(parsed.new_end_at)
			: occurrence.occurrence_end_at;

		const conflictingOccurrence = await db.recurring_occurrence.findFirst({
			where: {
				recurring_plan_id: occurrence.recurring_plan_id,
				occurrence_start_at: newStartDate,
				id: { not: occurrenceId },
			},
		});

		if (conflictingOccurrence) {
			return {
				err: "Cannot reschedule: An occurrence from this recurring plan already exists at this date and time.",
			};
		}

		const updated = await db.recurring_occurrence.update({
			where: { id: occurrenceId },
			data: {
				occurrence_start_at: newStartDate,
				occurrence_end_at: newEndDate,
			},
		});

		await logActivity({
			event_type: "recurring_occurrence.rescheduled",
			action: "updated",
			entity_type: "recurring_occurrence",
			entity_id: occurrenceId,
			actor_type: context?.techId
				? "technician"
				: context?.dispatcherId
					? "dispatcher"
					: "system",
			actor_id: context?.techId || context?.dispatcherId,
			changes: {
				occurrence_start_at: {
					old: occurrence.occurrence_start_at,
					new: newStartDate,
				},
				occurrence_end_at: {
					old: occurrence.occurrence_end_at,
					new: newEndDate,
				},
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: updated };
	} catch (e) {
		if (e instanceof ZodError) {
			console.error("Reschedule occurrence validation error:", e.issues);
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}

		if (e instanceof Error && "code" in e && (e as any).code === "P2002") {
			console.error("Unique constraint violation:", e);
			return {
				err: "Cannot reschedule: An occurrence from this recurring plan already exists at this date and time.",
			};
		}

		console.error("Reschedule occurrence error:", e);
		if (e instanceof Error) {
			return { err: e.message };
		}
		return { err: "Internal server error" };
	}
};

export const bulkSkipOccurrences = async (
	data: unknown,
	context?: UserContext,
) => {
	try {
		const parsed = bulkSkipOccurrencesSchema.parse(data);

		const result = await db.$transaction(async (tx) => {
			const updated = await tx.recurring_occurrence.updateMany({
				where: {
					id: { in: parsed.occurrence_ids },
					status: "planned",
				},
				data: {
					status: "skipped",
					skip_reason: parsed.skip_reason,
					skipped_at: new Date(),
				},
			});

			return updated;
		});

		await logActivity({
			event_type: "recurring_occurrence.bulk_skipped",
			action: "updated",
			entity_type: "recurring_occurrence",
			entity_id: parsed.occurrence_ids[0],
			actor_type: context?.techId
				? "technician"
				: context?.dispatcherId
					? "dispatcher"
					: "system",
			actor_id: context?.techId || context?.dispatcherId,
			changes: {
				count: { old: null, new: result.count },
				skip_reason: { old: null, new: parsed.skip_reason },
			},
			ip_address: context?.ipAddress,
			user_agent: context?.userAgent,
		});

		return { err: "", item: { skipped: result.count } };
	} catch (e) {
		if (e instanceof ZodError) {
			return {
				err: `Validation failed: ${e.issues
					.map((err) => err.message)
					.join(", ")}`,
			};
		}
		console.error("Bulk skip occurrences error:", e);
		return { err: "Internal server error" };
	}
};

// ============================================================================
// VISIT GENERATION
// ============================================================================

export const generateVisitFromOccurrence = async (
	occurrenceId: string,
	context?: UserContext,
): Promise<{ err: string; item?: VisitGenerationResult }> => {
	try {
		const occurrence = await db.recurring_occurrence.findUnique({
			where: { id: occurrenceId },
			include: {
				recurring_plan: {
					include: {
						line_items: {
							orderBy: { sort_order: "asc" },
						},
						job_container: true,
						rules: {
							include: {
								by_weekday: true,
							},
						},
					},
				},
			},
		});

		if (!occurrence) {
			return { err: "Occurrence not found" };
		}

		if (occurrence.status !== "planned") {
			return { err: "Occurrence must be in planned state" };
		}

		if (occurrence.job_visit_id) {
			return { err: "Visit already generated for this occurrence" };
		}

		const plan = occurrence.recurring_plan;
		const rule = plan.rules[0];

		const result = await db.$transaction(async (tx) => {
			// Calculate subtotal from template line items
			const subtotal = plan.line_items.reduce(
				(sum, item) =>
					sum + Number(item.quantity) * Number(item.unit_price),
				0,
			);

			const visit = await tx.job_visit.create({
				data: {
					job_id: plan.job_container!.id,
					scheduled_start_at: occurrence.occurrence_start_at,
					scheduled_end_at: occurrence.occurrence_end_at,

					arrival_constraint: rule.arrival_constraint,
					finish_constraint: rule.finish_constraint,
					arrival_time: rule.arrival_time,
					arrival_window_start: rule.arrival_window_start,
					arrival_window_end: rule.arrival_window_end,
					finish_time: rule.finish_time,

					status: "Scheduled",
					subtotal: subtotal,
					tax_rate: plan.job_container!.tax_rate || 0,

					// Copy template line items
					line_items: {
						createMany: {
							data: plan.line_items.map((item, idx) => ({
								name: item.name,
								description: item.description,
								quantity: Number(item.quantity),
								unit_price: Number(item.unit_price),
								total:
									Number(item.quantity) *
									Number(item.unit_price),
								source: "recurring_plan",
								item_type: item.item_type,
								sort_order: idx,
							})),
						},
					},
				},
			});

			await tx.recurring_occurrence.update({
				where: { id: occurrenceId },
				data: {
					status: "generated",
					job_visit_id: visit.id,
					generated_at: new Date(),
				},
			});

			await logActivity({
				event_type: "job_visit.generated_from_occurrence",
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
					occurrence_id: { old: null, new: occurrenceId },
					scheduled_start_at: {
						old: null,
						new: visit.scheduled_start_at,
					},
				},
				ip_address: context?.ipAddress,
				user_agent: context?.userAgent,
			});

			return {
				visit_id: visit.id,
				occurrence_id: occurrenceId,
				scheduled_start_at: visit.scheduled_start_at,
				scheduled_end_at: visit.scheduled_end_at,
				template_version: occurrence.template_version,
			};
		});

		return { err: "", item: result };
	} catch (e) {
		if (e instanceof Error) {
			return { err: e.message };
		}
		console.error("Generate visit from occurrence error:", e);
		return { err: "Internal server error" };
	}
};
