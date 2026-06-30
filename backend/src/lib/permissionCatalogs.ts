const DISPATCHER_CATALOG = [
	{ category: "Jobs", permissions: ["view_jobs", "create_jobs", "edit_jobs", "delete_jobs"] },
	{ category: "Requests", permissions: ["view_requests", "create_requests", "edit_requests", "delete_requests"] },
	{ category: "Quotes", permissions: ["view_quotes", "create_quotes", "edit_quotes", "delete_quotes"] },
	{ category: "Invoices", permissions: ["view_invoices", "create_invoices", "edit_invoices", "delete_invoices"] },
	{ category: "Clients", permissions: ["view_clients", "create_clients", "edit_clients", "delete_clients"] },
	{ category: "Inventory", permissions: ["view_inventory", "manage_inventory"] },
	{ category: "Reports", permissions: ["view_reports", "export_reports"] },
	{ category: "Recurring Plans", permissions: ["view_recurring_plans", "manage_recurring_plans"] },
	{ category: "Team", permissions: ["view_technicians", "manage_technicians", "view_dispatchers", "manage_dispatchers"] },
	{ category: "Administration", permissions: ["view_admin", "manage_roles", "manage_organization", "manage_taxes"] },
	{ category: "Vehicles", permissions: ["view_vehicles", "manage_vehicles"] },
] as const;

const TECHNICIAN_CATALOG = [
	{ category: "Jobs", permissions: ["view_assigned_jobs", "view_all_jobs", "update_job_status", "add_job_notes"] },
	{ category: "Job Visits", permissions: ["view_visits", "check_in", "check_out", "update_visit_status", "add_visit_notes"] },
	{ category: "Clients", permissions: ["view_clients"] },
	{ category: "Inventory", permissions: ["view_inventory", "use_inventory"] },
	{ category: "Vehicle Stock", permissions: ["stock_own_vehicle", "complete_own_restock", "adjust_field_loss", "adjust_transfer", "adjust_audit", "adjust_warehouse_exchange", "adjust_supplier_purchase"] },
	{ category: "Schedule", permissions: ["view_own_schedule", "view_team_schedule"] },
	{ category: "Forms", permissions: ["view_forms", "submit_forms"] },
	{ category: "Vehicles", permissions: ["view_vehicles", "use_vehicles"] },
] as const;

export const PERMISSION_CATALOGS = {
	dispatcher: DISPATCHER_CATALOG,
	technician: TECHNICIAN_CATALOG,
} as const;

export type PermissionTier = keyof typeof PERMISSION_CATALOGS;

export function getAllPermissions(tier: PermissionTier): string[] {
	return PERMISSION_CATALOGS[tier].flatMap((section) => [...section.permissions]);
}
