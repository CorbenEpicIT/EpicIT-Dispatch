import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

vi.mock("../../db.js", () => ({ db: {} }));
vi.mock("../../lib/context.js", () => ({ getScopedDb: vi.fn(), getUserContext: vi.fn() }));
vi.mock("../../services/logger.js", () => ({ logActivity: vi.fn() }));
vi.mock("../../services/appLogger.js", () => ({
	log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../services/emailService.js", () => ({ sendEmailVerificationEmail: vi.fn() }));

import { defaultDispatcherPermissions } from "../organizationsController.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
	resolve(
		here,
		"../../../prisma/migrations/20260909120000_dispute_role_permissions/migration.sql",
	),
	"utf8",
);

/** The WHERE predicate of the UPDATE that grants `permission`, or null. */
function grantPredicate(permission: string): string | null {
	const statements = migrationSql
		.replace(/--[^\n]*/g, "")
		.split(";")
		.map((s) => s.trim());
	const grant = statements.find((s) =>
		s.includes(`"permissions" || ARRAY['${permission}']`),
	);
	return grant ? grant.slice(grant.indexOf("WHERE")) : null;
}

/**
 * A new org's Default Dispatcher must receive what an existing org's
 * equivalent role receives from the dispute-role migration (audit DW-05, D2).
 * Without this, SoD is off in every org created after deploy.
 */
describe("Default Dispatcher template follows the dispute-role migration", () => {
	const template = defaultDispatcherPermissions();

	it("withholds dispute resolution, concession and self-resolution", () => {
		expect(template).not.toContain("resolve_disputes");
		expect(template).not.toContain("concede_disputes");
		expect(template).not.toContain("resolve_own_disputes");
	});

	it("keeps refund_invoices alongside edit_invoices", () => {
		expect(template).toContain("edit_invoices");
		expect(template).toContain("refund_invoices");
	});

	it("still withholds administration", () => {
		for (const p of ["manage_roles", "view_admin", "manage_organization", "manage_dispatchers"]) {
			expect(template).not.toContain(p);
		}
	});

	it("matches the migration: refund follows edit_invoices, resolve/concede follow administration only", () => {
		expect(grantPredicate("refund_invoices")).toContain("'edit_invoices'");
		for (const p of ["resolve_disputes", "concede_disputes"]) {
			const where = grantPredicate(p);
			expect(where).not.toBeNull();
			expect(where).not.toContain("edit_");
		}
		expect(grantPredicate("resolve_own_disputes")).toBeNull();
	});
});
