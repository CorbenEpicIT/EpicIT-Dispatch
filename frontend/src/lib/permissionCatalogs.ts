export const DISPATCHER_CATALOG = [
	{
		category: "Jobs",
		permissions: [
			{ id: "view_jobs", label: "View Jobs" },
			{ id: "create_jobs", label: "Create Jobs" },
			{ id: "edit_jobs", label: "Edit Jobs" },
			{ id: "delete_jobs", label: "Delete Jobs" },
		],
	},
	{
		category: "Requests",
		permissions: [
			{ id: "view_requests", label: "View Requests" },
			{ id: "create_requests", label: "Create Requests" },
			{ id: "edit_requests", label: "Edit Requests" },
			{ id: "delete_requests", label: "Delete Requests" },
		],
	},
	{
		category: "Quotes",
		permissions: [
			{ id: "view_quotes", label: "View Quotes" },
			{ id: "create_quotes", label: "Create Quotes" },
			{ id: "edit_quotes", label: "Edit Quotes" },
			{ id: "delete_quotes", label: "Delete Quotes" },
		],
	},
	{
		category: "Invoices",
		permissions: [
			{ id: "view_invoices", label: "View Invoices" },
			{ id: "create_invoices", label: "Create Invoices" },
			{ id: "edit_invoices", label: "Edit Invoices" },
			{ id: "delete_invoices", label: "Delete Invoices" },
		],
	},
	{
		category: "Clients",
		permissions: [
			{ id: "view_clients", label: "View Clients" },
			{ id: "create_clients", label: "Create Clients" },
			{ id: "edit_clients", label: "Edit Clients" },
			{ id: "delete_clients", label: "Delete Clients" },
		],
	},
	{
		category: "Inventory",
		permissions: [
			{ id: "view_inventory", label: "View Inventory" },
			{ id: "manage_inventory", label: "Manage Inventory" },
		],
	},
	{
		category: "Reports",
		permissions: [
			{ id: "view_reports", label: "View Reports" },
			{ id: "export_reports", label: "Export Reports" },
		],
	},
	{
		category: "Recurring Plans",
		permissions: [
			{ id: "view_recurring_plans", label: "View Plans" },
			{ id: "manage_recurring_plans", label: "Manage Plans" },
		],
	},
	{
		category: "Team",
		permissions: [
			{ id: "view_technicians", label: "View Technicians" },
			{ id: "manage_technicians", label: "Manage Technicians" },
			{ id: "view_dispatchers", label: "View Dispatchers" },
			{ id: "manage_dispatchers", label: "Manage Dispatchers" },
		],
	},
	{
		category: "Administration",
		permissions: [
			{ id: "view_admin", label: "View Admin Page" },
			{ id: "manage_roles", label: "Manage Roles" },
			{ id: "manage_organization", label: "Manage Organization" },
			{ id: "manage_taxes", label: "Manage Taxes" },
		],
	},
] as const;

export const TECHNICIAN_CATALOG = [
	{
		category: "Jobs",
		permissions: [
			{ id: "view_assigned_jobs", label: "View Assigned Jobs" },
			{ id: "view_all_jobs", label: "View All Jobs" },
			{ id: "update_job_status", label: "Update Job Status" },
			{ id: "add_job_notes", label: "Add Job Notes" },
		],
	},
	{
		category: "Job Visits",
		permissions: [
			{ id: "view_visits", label: "View Visits" },
			{ id: "check_in", label: "Check In" },
			{ id: "check_out", label: "Check Out" },
			{ id: "update_visit_status", label: "Update Visit Status" },
			{ id: "add_visit_notes", label: "Add Visit Notes" },
		],
	},
	{
		category: "Clients",
		permissions: [
			{ id: "view_clients", label: "View Clients" },
		],
	},
	{
		category: "Inventory",
		permissions: [
			{ id: "view_inventory", label: "View Inventory" },
			{ id: "use_inventory", label: "Use Inventory" },
		],
	},
	{
		category: "Schedule",
		permissions: [
			{ id: "view_own_schedule", label: "View Own Schedule" },
			{ id: "view_team_schedule", label: "View Team Schedule" },
		],
	},
	{
		category: "Forms",
		permissions: [
			{ id: "view_forms", label: "View Forms" },
			{ id: "submit_forms", label: "Submit Forms" },
		],
	},
] as const;

export const PERMISSION_CATALOGS = {
	dispatcher: DISPATCHER_CATALOG,
	technician: TECHNICIAN_CATALOG,
} as const;

export type PermissionCatalogTier = keyof typeof PERMISSION_CATALOGS;

/** Resolve a permission id to its human-readable label using the catalog. Falls back to the raw id. */
export function resolvePermissionLabel(id: string, tier: PermissionCatalogTier): string {
	const catalog = PERMISSION_CATALOGS[tier];
	for (const section of catalog) {
		for (const perm of section.permissions) {
			if (perm.id === id) return perm.label;
		}
	}
	return id;
}

/** Group a list of permission ids by their catalog category. Unknown ids go into "Other". */
export function groupPermissionsByCategory(
	ids: string[],
	tier: PermissionCatalogTier
): { category: string; permissions: { id: string; label: string }[] }[] {
	const catalog = PERMISSION_CATALOGS[tier];
	const result: { category: string; permissions: { id: string; label: string }[] }[] = [];
	const seen = new Set<string>();

	for (const section of catalog) {
		const matched = section.permissions.filter((p) => ids.includes(p.id));
		if (matched.length > 0) {
			result.push({ category: section.category, permissions: matched.map((p) => ({ id: p.id, label: p.label })) });
			matched.forEach((p) => seen.add(p.id));
		}
	}

	const unknown = ids.filter((id) => !seen.has(id));
	if (unknown.length > 0) {
		result.push({ category: "Other", permissions: unknown.map((id) => ({ id, label: id })) });
	}

	return result;
}
