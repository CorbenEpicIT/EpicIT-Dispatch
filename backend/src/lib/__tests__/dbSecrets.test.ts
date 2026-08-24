import { describe, it, expect, vi } from "vitest";

// Capture the options the real db.ts hands to PrismaClient without touching a
// database: the generated client and the pg adapter are replaced by stubs.
const h = vi.hoisted(() => ({ clientOptions: [] as unknown[], adapterOptions: [] as unknown[] }));

vi.mock("../../../generated/prisma/client.js", () => ({
	PrismaClient: class {
		constructor(opts: unknown) {
			h.clientOptions.push(opts);
		}
	},
}));

vi.mock("@prisma/adapter-pg", () => ({
	PrismaPg: class {
		constructor(opts: unknown) {
			h.adapterOptions.push(opts);
		}
	},
}));

import { db, SECRET_FIELD_OMIT } from "../../db.js";

describe("db.ts — global secret omit (review B2)", () => {
	it("constructs PrismaClient with a global omit for every credential column", () => {
		expect(db).toBeDefined();
		expect(h.clientOptions).toHaveLength(1);
		const opts = h.clientOptions[0] as { omit?: Record<string, Record<string, boolean>> };
		expect(opts.omit).toBeDefined();
		expect(opts.omit).toEqual(SECRET_FIELD_OMIT);
	});

	it.each([
		["dispatcher", "password"],
		["dispatcher", "password_reset_token"],
		["dispatcher", "password_reset_token_expires_at"],
		["dispatcher", "email_verification_token"],
		["technician", "password"],
		["technician", "password_reset_token"],
		["technician", "password_reset_token_expires_at"],
	])("omits %s.%s by default", (model, field) => {
		const omit = SECRET_FIELD_OMIT as Record<string, Record<string, boolean>>;
		expect(omit[model][field]).toBe(true);
	});
});
