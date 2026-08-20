import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db.js", async () => {
	const { createFakeDb } = await import("../../routes/__tests__/harness.js");
	return { db: createFakeDb() };
});

import { db } from "../../db.js";
import { redactFeedRow, recentActivityRoute } from "../logsController.js";
import { callHandlers, leaves, makeLogRow as row, type FakeDb } from "../../routes/__tests__/harness.js";

const fake = db as unknown as FakeDb;

beforeEach(() => {
	vi.clearAllMocks();
	fake.log.findMany.mockResolvedValue([]);
});

describe("redactFeedRow (review P1-3 / S4)", () => {
	it("drops technician PII from technician.updated only", () => {
		const tech = row({
			event_type: "technician.updated",
			entity_type: "technician",
			changes: {
				status: { old: "Offline", new: "Available" },
				email: { old: "a@x", new: "b@x" },
				phone: { old: "1", new: "2" },
				coords: { old: {}, new: { lat: 1 } },
				hire_date: { old: "2020", new: "2021" },
			},
		});
		expect(redactFeedRow(tech).changes).toEqual({ status: { old: "Offline", new: "Available" } });

		const other = row({ event_type: "job.updated", changes: { email: { old: "a", new: "b" } } });
		expect(redactFeedRow(other)).toBe(other);
	});
});

describe("GET /logs/recent access + redaction (review P1-3 / S4)", () => {
	it("denies technicians the unfiltered org feed", async () => {
		const r = await callHandlers(recentActivityRoute, { user: { uid: "tech-1", role: "technician", permissions: ["view_visits"] } });
		expect(r.status).toBe(403);
		expect(r.body).toMatchObject({ success: false, error: { code: "INVALID_CREDENTIALS" } });
		expect(fake.log.findMany).not.toHaveBeenCalled();
	});

	it("lets a technician read their own activity via userId", async () => {
		const r = await callHandlers(recentActivityRoute, {
			user: { uid: "tech-1", role: "technician", permissions: [] },
			query: { userId: "tech-1" },
		});
		expect(r.status).toBe(200);
		expect(r.body.success).toBe(true);
		const where = fake.log.findMany.mock.calls[0][0].where;
		expect(leaves(where)).toEqual(expect.arrayContaining([{ actor_id: "tech-1" }, { entity_id: "tech-1" }, { organization_id: "org-1" }]));
	});

	it("denies a technician another user's activity", async () => {
		const r = await callHandlers(recentActivityRoute, {
			user: { uid: "tech-1", role: "technician", permissions: [] },
			query: { userId: "tech-2" },
		});
		expect(r.status).toBe(403);
	});

	it("denies a dispatcher without view_* another user's activity, allows with view_technicians", async () => {
		const denied = await callHandlers(recentActivityRoute, {
			user: { uid: "disp-1", role: "dispatcher", permissions: ["view_jobs"] },
			query: { userId: "tech-2" },
		});
		expect(denied.status).toBe(403);
		const ok = await callHandlers(recentActivityRoute, {
			user: { uid: "disp-1", role: "dispatcher", permissions: ["view_technicians"] },
			query: { userId: "tech-2" },
		});
		expect(ok.status).toBe(200);
	});

	it("lets dispatchers and admins read the org feed", async () => {
		const disp = await callHandlers(recentActivityRoute, { user: { uid: "disp-1", role: "dispatcher", permissions: [] } });
		expect(disp.status).toBe(200);
		const admin = await callHandlers(recentActivityRoute, { user: { uid: "adm-1", role: "admin", permissions: [] } });
		expect(admin.status).toBe(200);
	});

	it("redacts technician.updated PII, caps the limit at 50 and honours the cursor", async () => {
		fake.log.findMany.mockResolvedValue([
			row({ event_type: "technician.updated", entity_type: "technician", changes: { status: { old: "Offline", new: "Available" }, email: { old: "a", new: "b" }, coords: { old: {}, new: {} } } }),
		]);
		const r = await callHandlers(recentActivityRoute, {
			user: { uid: "disp-1", role: "dispatcher", permissions: [] },
			query: { limit: "500", cursor: "2026-08-01T00:00:00.000Z" },
		});
		expect(r.status).toBe(200);
		expect(r.body.data[0].changes).toEqual({ status: { old: "Offline", new: "Available" } });
		expect(r.body.meta).toMatchObject({ count: 1, hasMore: false });
		const args = fake.log.findMany.mock.calls[0][0];
		expect(args.take).toBe(50);
		expect(leaves(args.where)).toEqual(expect.arrayContaining([{ timestamp: { lt: new Date("2026-08-01T00:00:00.000Z") } }]));
	});
});
