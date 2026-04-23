import type { Request } from "express";
import { db } from "../db.js";

export interface UserContext {
	techId?: string;
	dispatcherId?: string;
	ipAddress?: string;
	userAgent?: string;
}


export const getUserContext = (req: Request): UserContext => {
	const userId = req.headers["x-user-id"] as string;
	const userType = req.headers["x-user-type"] as "tech" | "dispatcher";
	const userAgent = req.headers["user-agent"] || undefined;

	return {
		techId: userType === "tech" ? userId : undefined,
		dispatcherId: userType === "dispatcher" ? userId : undefined,
		ipAddress: undefined,
		userAgent,
	};
};

// Models that have an organization_id column and must be filtered per-org
const ORG_SCOPED_MODELS = new Set([
	"contact",
	"client",
	"client_note",
	"request",
	"request_note",
	"quote",
	"quote_note",
	"job",
	"job_note",
	"recurring_plan",
	"recurring_plan_note",
	"form_draft",
	"inventory_item",
	"technician",
	"dispatcher",
	"invoice",
	"invoice_note",
	"log",
]);
/*
Here's the complete list of models that have no organization_id column and
   rely on a parent relation for org scoping:

  ┌───────────────────────┬─────────────────────────────────────────┐
  │         Model         │             Scoped through              │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ job_visit             │ job.organization_id                     │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ job_visit_line_item   │ job_visit → job.organization_id         │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ job_visit_technician  │ job_visit → job.organization_id         │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ visit_tech_time_entry │ job_visit → job.organization_id         │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ quote_line_item       │ quote.organization_id                   │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ recurring_occurrence  │ recurring_plan.organization_id          │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ invoice_line_item     │ invoice.organization_id                 │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ invoice_payment       │ invoice.organization_id                 │
  ├───────────────────────┼─────────────────────────────────────────┤
  │ client_contact        │ client.organization_id (junction table) │
  └───────────────────────┴─────────────────────────────────────────┘
*/
/**
 * Returns a Prisma client scoped to an organization.
 * Automatically injects `organization_id` into findMany, findFirst, count,
 * updateMany, and deleteMany where clauses for all tenant-scoped models.
 *
 * Does NOT cover: create (set organization_id manually in data),
 * update/delete single-record (use updateMany/deleteMany or verify ownership first),
 * findUnique (use findFirst instead).
 */
export function getScopedDb(organizationId: string) {
	return db.$extends({
		query: {
			$allModels: {
				async findMany({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						args.where = { ...(args.where as any), organization_id: organizationId };
					return query(args);
				},
				async findFirst({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						args.where = { ...(args.where ?? {} as any), organization_id: organizationId };
					return query(args);
				},
				async count({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						args.where = { ...(args.where as any), organization_id: organizationId };
					return query(args);
				},
				async aggregate({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						(args as any).where = { ...((args as any).where ?? {}), organization_id: organizationId };
					return query(args);
				},
				async updateMany({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						args.where = { ...(args.where as any), organization_id: organizationId };
					return query(args);
				},
				async deleteMany({ model, args, query }) {
					if (ORG_SCOPED_MODELS.has(model))
						args.where = { ...(args.where as any), organization_id: organizationId };
					return query(args);
				},
			},
		},
	});
}

