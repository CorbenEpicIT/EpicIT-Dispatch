import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
	process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
	process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
	process.env.OTP_SECRET ??= "test-otp-secret";
});

vi.mock("../../db.js", async () => {
	const { createFakeDb } = await import("./harness.js");
	return { db: createFakeDb() };
});
vi.mock("../../services/emailService.js", () => ({
	sendEmail: vi.fn(),
	sendOTPEmail: vi.fn(),
	sendPasswordResetEmail: vi.fn(),
	sendEmailVerificationEmail: vi.fn(),
}));
vi.mock("../../services/otpServce.js", () => ({ createOTP: vi.fn(), OTP_DISABLED: true, verifyOTP: vi.fn() }));
vi.mock("../../controllers/mfaController.js", () => ({ resetMfa: vi.fn() }));
vi.mock("../../services/mfaService.js", () => ({
	getMfaEnabledUserIds: vi.fn(async () => new Set<string>()),
	isMfaEnabled: vi.fn(async () => false),
}));
vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn(async () => undefined),
	buildChanges: vi.fn(() => ({})),
}));

import dispatchersRouter from "../dispatchers.js";
import { db } from "../../db.js";
import { callRoute, type FakeDb } from "./harness.js";

const fake = db as unknown as FakeDb;

const SECRET_KEYS = ["password", "password_reset_token", "password_reset_token_expires_at", "email_verification_token"];

// What Prisma hands back once the global omit (db.ts) has stripped the
// credential columns — the route must pass it through untouched.
const dispatcherRow = {
	id: "disp-1",
	organization_id: "org-1",
	role: "dispatcher",
	name: "Dana",
	email: "dana@example.com",
	phone: null,
	title: "Dispatcher",
	description: "",
	last_login: null,
	theme: "system",
	organization_role_id: "role-1",
	organization_role: { id: "role-1", name: "Default", permissions: ["view_jobs"] },
	_count: { created_quotes: 0, created_invoices: 0, created_requests: 0, created_recurring_plans: 0, managed_projects: 0 },
};

beforeEach(() => {
	vi.clearAllMocks();
	fake.dispatcher.findFirst.mockResolvedValue(dispatcherRow);
	fake.dispatcher.findMany.mockResolvedValue([dispatcherRow]);
	fake.log.findMany.mockResolvedValue([]);
	fake.log.count.mockResolvedValue(0);
});

describe("GET /dispatchers/:id — no credential columns in the payload (review B2 / S2)", () => {
	it("returns the row as Prisma delivered it and never opts back into secret fields", async () => {
		const r = await callRoute(dispatchersRouter, "get", "/:id", {
			user: { uid: "other", role: "dispatcher", permissions: ["view_dispatchers"] },
			params: { id: "disp-1" },
		});
		expect(r.status).toBe(200);
		expect(r.body.success).toBe(true);
		for (const key of SECRET_KEYS) expect(r.body.data).not.toHaveProperty(key);
		expect(r.body.data).toMatchObject({ id: "disp-1", permissions: ["view_jobs"], mfaEnabled: false });

		const args = fake.dispatcher.findFirst.mock.calls[0][0];
		expect(args.select).toBeUndefined();
		for (const key of SECRET_KEYS) expect(args.omit?.[key]).not.toBe(false);
		// still org-scoped by getScopedDb
		expect(JSON.stringify(args.where)).toContain('"organization_id":"org-1"');
	});

	it("GET /dispatchers list carries no secret fields either", async () => {
		const r = await callRoute(dispatchersRouter, "get", "/", {
			user: { uid: "other", role: "dispatcher", permissions: ["view_dispatchers"] },
		});
		expect(r.status).toBe(200);
		for (const key of SECRET_KEYS) expect(r.body.data[0]).not.toHaveProperty(key);
		const args = fake.dispatcher.findMany.mock.calls[0][0];
		for (const key of SECRET_KEYS) expect(args.omit?.[key]).not.toBe(false);
	});

	it("denies a dispatcher without view_dispatchers reading someone else", async () => {
		const r = await callRoute(dispatchersRouter, "get", "/:id", {
			user: { uid: "other", role: "dispatcher", permissions: [] },
			params: { id: "disp-1" },
		});
		expect(r.status).toBe(403);
		expect(fake.dispatcher.findFirst).not.toHaveBeenCalled();
	});
});

describe("GET /dispatchers/:id/changes — limit validation + access (review P2-11, L1)", () => {
	it.each(["-5", "0", "1.5", "abc", "1000"])("returns 400 for limit=%s without querying", async (limit) => {
		const r = await callRoute(dispatchersRouter, "get", "/:id/changes", {
			user: { uid: "disp-1", role: "dispatcher", permissions: [] },
			params: { id: "disp-1" },
			query: { limit },
		});
		expect(r.status).toBe(400);
		expect(r.body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
		expect(fake.log.findMany).not.toHaveBeenCalled();
	});

	it("uses the default limit when absent and returns meta", async () => {
		fake.log.findMany.mockResolvedValue([]);
		fake.log.count.mockResolvedValue(0);
		const r = await callRoute(dispatchersRouter, "get", "/:id/changes", {
			user: { uid: "disp-1", role: "dispatcher", permissions: [] },
			params: { id: "disp-1" },
		});
		expect(r.status).toBe(200);
		expect(r.body.meta).toMatchObject({ count: 0, hasMore: false, total: 0 });
		expect(fake.log.findMany.mock.calls[0][0].take).toBe(21);
	});

	it("returns rows without password events and with sensitive keys stripped", async () => {
		fake.log.findMany.mockResolvedValue([
			{ id: "l1", event_type: "dispatcher.updated", action: "updated", entity_type: "dispatcher", entity_id: "disp-1", actor_type: "dispatcher", actor_id: "disp-1", changes: { name: { old: "a", new: "b" }, password_reset_token: { old: "x", new: "y" } }, timestamp: new Date() },
		]);
		fake.log.count.mockResolvedValue(1);
		const r = await callRoute(dispatchersRouter, "get", "/:id/changes", {
			user: { uid: "viewer", role: "dispatcher", permissions: ["view_dispatchers"] },
			params: { id: "disp-1" },
			query: { limit: "10" },
		});
		expect(r.status).toBe(200);
		expect(r.body.data[0].changes).toEqual({ name: { old: "a", new: "b" } });
		expect(JSON.stringify(fake.log.findMany.mock.calls[0][0].where)).toContain('".password."');
	});

	it("denies other users' history without view_dispatchers", async () => {
		const r = await callRoute(dispatchersRouter, "get", "/:id/changes", {
			user: { uid: "viewer", role: "dispatcher", permissions: [] },
			params: { id: "disp-1" },
		});
		expect(r.status).toBe(403);
	});
});
