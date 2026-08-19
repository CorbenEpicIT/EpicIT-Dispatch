import { describe, it, expect, vi } from "vitest";
import type { Request } from "express";

vi.mock("../../db.js", () => ({ db: { $extends: () => ({}) } }));

import { getUserContext } from "../context.js";

function req(user: Record<string, unknown> | undefined, headers: Record<string, string> = {}): Request {
	return { user, headers } as unknown as Request;
}

describe("getUserContext — actor identity comes only from the JWT (review B4)", () => {
	it("maps a technician JWT to techId", () => {
		const ctx = getUserContext(req({ uid: "tech-1", role: "technician" }, { "user-agent": "ua" }));
		expect(ctx).toEqual({ techId: "tech-1", dispatcherId: undefined, ipAddress: undefined, userAgent: "ua" });
	});

	it.each(["dispatcher", "admin"])("maps a %s JWT to dispatcherId", (role) => {
		const ctx = getUserContext(req({ uid: "disp-1", role }));
		expect(ctx.dispatcherId).toBe("disp-1");
		expect(ctx.techId).toBeUndefined();
	});

	it("ignores x-user-id / x-user-type headers (no identity override)", () => {
		const ctx = getUserContext(
			req({ uid: "tech-1", role: "technician" }, { "x-user-id": "tech-2", "x-user-type": "tech" }),
		);
		expect(ctx.techId).toBe("tech-1");

		const asDisp = getUserContext(
			req({ uid: "tech-1", role: "technician" }, { "x-user-id": "disp-9", "x-user-type": "dispatcher" }),
		);
		expect(asDisp.techId).toBe("tech-1");
		expect(asDisp.dispatcherId).toBeUndefined();
	});

	it("yields no actor when there is no authenticated user, even with headers", () => {
		const ctx = getUserContext(req(undefined, { "x-user-id": "tech-2", "x-user-type": "tech" }));
		expect(ctx.techId).toBeUndefined();
		expect(ctx.dispatcherId).toBeUndefined();
	});
});
