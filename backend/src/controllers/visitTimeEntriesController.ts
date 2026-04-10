import { db } from "../db.js";
import { log } from "../services/appLogger.js";
import { logActivity } from "../services/logger.js";
import type { UserContext } from "./jobVisitsController.js";

const CLOCK_IN_TRANSITIONS = ["Scheduled", "Driving", "OnSite"];

export const clockInVisit = async (
	visitId: string,
	techId: string,
	context?: UserContext,
): Promise<{ err: string; item?: any }> => {
	try {
		const visit = await db.job_visit.findUnique({
			where: { id: visitId },
			include: { job: { select: { id: true, job_number: true } } },
		});
		if (!visit) return { err: "Job visit not found" };

		const assignment = await db.job_visit_technician.findUnique({
			where: { visit_id_tech_id: { visit_id: visitId, tech_id: techId } },
		});
		if (!assignment) return { err: "Technician not assigned to this visit" };

		// Enforce global 1-open-entry constraint
		const existingOpen = await db.visit_tech_time_entry.findFirst({
			where: { tech_id: techId, clocked_out_at: null },
			include: { visit: { select: { id: true } } },
		});
		if (existingOpen) {
			return { err: `ALREADY_CLOCKED_IN:${existingOpen.visit.id}` };
		}

		const now = new Date();

		const entry = await db.$transaction(async (tx) => {
			const newEntry = await tx.visit_tech_time_entry.create({
				data: { visit_id: visitId, tech_id: techId, clocked_in_at: now },
				include: { tech: { select: { id: true, name: true } } },
			});

			// Transition visit to InProgress if applicable
			if (CLOCK_IN_TRANSITIONS.includes(visit.status)) {
				await tx.job_visit.update({
					where: { id: visitId },
					data: {
						status: "InProgress",
						actual_start_at: visit.actual_start_at ?? now,
					},
				});
				await tx.job.update({
					where: { id: visit.job.id },
					data: { status: "InProgress" },
				});
			}

			await logActivity({
				event_type: "visit_time_entry.clocked_in",
				action: "created",
				entity_type: "visit_tech_time_entry",
				entity_id: newEntry.id,
				actor_type: "technician",
				actor_id: techId,
				changes: {
					visit_id: { old: null, new: visitId },
					clocked_in_at: { old: null, new: now },
				},
			});

			return newEntry;
		});

		return { err: "", item: entry };
	} catch (e) {
		log.error({ err: e }, "clockInVisit failed");
		return { err: "Internal server error" };
	}
};

export const clockOutVisit = async (
	visitId: string,
	techId: string,
	context?: UserContext,
): Promise<{ err: string; item?: any }> => {
	try {
		const openEntry = await db.visit_tech_time_entry.findFirst({
			where: { visit_id: visitId, tech_id: techId, clocked_out_at: null },
		});
		if (!openEntry) return { err: "No active clock-in found for this technician on this visit" };

		const tech = await db.technician.findUnique({
			where: { id: techId },
			select: { hourly_rate: true, name: true },
		});
		if (!tech) return { err: "Technician not found" };

		const now = new Date();
		const elapsedMs = now.getTime() - openEntry.clocked_in_at.getTime();
		const hoursWorked = parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(4));
		const hourlyRate = Number(tech.hourly_rate);
		const laborTotal = parseFloat((hoursWorked * hourlyRate).toFixed(2));

		const result = await db.$transaction(async (tx) => {
			const closedEntry = await tx.visit_tech_time_entry.update({
				where: { id: openEntry.id },
				data: { clocked_out_at: now, hours_worked: hoursWorked },
			});

			const lineItem = await tx.job_visit_line_item.create({
				data: {
					visit_id: visitId,
					name: `Labor – ${tech.name}`,
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
				where: { id: closedEntry.id },
				data: { line_item_id: lineItem.id },
			});

			// Recalculate visit financials
			const visitWithItems = await tx.job_visit.findUnique({
				where: { id: visitId },
				include: { line_items: true },
			});
			if (visitWithItems) {
				const newSubtotal = visitWithItems.line_items.reduce((s, li) => s + Number(li.total), 0);
				const taxRate = Number(visitWithItems.tax_rate);
				const newTaxAmount = parseFloat((newSubtotal * taxRate).toFixed(2));
				await tx.job_visit.update({
					where: { id: visitId },
					data: {
						subtotal: newSubtotal,
						tax_amount: newTaxAmount,
						total: parseFloat((newSubtotal + newTaxAmount).toFixed(2)),
					},
				});
			}

			// is_last_tech: any other open entries on this visit?
			const remainingOpen = await tx.visit_tech_time_entry.findFirst({
				where: {
					visit_id: visitId,
					clocked_out_at: null,
					id: { not: openEntry.id },
				},
			});

			await logActivity({
				event_type: "visit_time_entry.clocked_out",
				action: "updated",
				entity_type: "visit_tech_time_entry",
				entity_id: closedEntry.id,
				actor_type: "technician",
				actor_id: techId,
				changes: {
					clocked_out_at: { old: null, new: now },
					hours_worked: { old: null, new: hoursWorked },
				},
			});

			return { entry: closedEntry, line_item: lineItem, is_last_tech: remainingOpen === null };
		});

		return { err: "", item: result };
	} catch (e) {
		log.error({ err: e }, "clockOutVisit failed");
		return { err: "Internal server error" };
	}
};
