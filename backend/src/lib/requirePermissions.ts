import { NextFunction, Request, Response } from "express";
import { ErrorCodes, createErrorResponse } from "../types/responses.js";

/*
 * Available permission strings for use with requirePermission()
 *
 * DISPATCHER
 *   Jobs
 *     view_jobs           · create_jobs        · edit_jobs          · delete_jobs
 *   Requests
 *     view_requests       · create_requests    · edit_requests      · delete_requests
 *   Quotes
 *     view_quotes         · create_quotes      · edit_quotes        · delete_quotes
 *   Invoices
 *     view_invoices       · create_invoices    · edit_invoices      · delete_invoices
 *   Clients
 *     view_clients        · create_clients     · edit_clients       · delete_clients
 *   Inventory
 *     view_inventory      · manage_inventory
 *   Reports
 *     view_reports        · export_reports
 *   Recurring Plans
 *     view_recurring_plans · manage_recurring_plans
 *   Team
 *     view_technicians    · manage_technicians · view_dispatchers   · manage_dispatchers
 *   Administration
 *     view_admin          · manage_roles        · manage_organization
 *
 * TECHNICIAN
 *   Jobs
 *     view_assigned_jobs  · view_all_jobs      · update_job_status  · add_job_notes
 *   Job Visits
 *     view_visits         · check_in           · check_out          · update_visit_status · add_visit_notes
 *   Clients
 *     view_clients
 *   Inventory
 *     view_inventory      · use_inventory
 *   Schedule
 *     view_own_schedule   · view_team_schedule
 *   Forms
 *     view_forms          · submit_forms
 */

export const requirePermission = (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    // admins bypass permission checks
    if (req.user?.role === "admin") return next();
    const perms: string[] = (req.user?.permissions as string[]) || [];
    if (!perms.includes(permission)) {
        return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, "Insufficient permissions"));
    }
    next();
};

export const requireAnyPermission = (...permissions: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === "admin") return next();
    const perms: string[] = (req.user?.permissions as string[]) || [];
    if (!permissions.some((p) => perms.includes(p))) {
        return res.status(403).json(createErrorResponse(ErrorCodes.INVALID_CREDENTIALS, "Insufficient permissions"));
    }
    next();
};