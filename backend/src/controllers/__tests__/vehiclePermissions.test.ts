import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../db.js", () => ({
	db: {
		technician: { findFirst: vi.fn() },
	},
}));

import { requireVehiclePermission, requireAnyPermissionOrSelf } from "../../lib/requirePermissions.js";
import { db } from "../../db.js";

const mockFindFirst = vi.mocked(db.technician.findFirst);

function makeReq(user: Record<string, unknown>, vehicleId = "vehicle-1"): Request {
	return { user, params: { id: vehicleId } } as unknown as Request;
}

function makeRes() {
	const res = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	};
	return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("requireVehiclePermission", () => {
	const middleware = requireVehiclePermission("stock_own_vehicle");
	let next: NextFunction;

	beforeEach(() => {
		vi.clearAllMocks();
		next = vi.fn();
	});

	it("passes admins without permission checks", async () => {
		await middleware(makeReq({ role: "admin", permissions: [] }), makeRes(), next);
		expect(next).toHaveBeenCalledOnce();
		expect(mockFindFirst).not.toHaveBeenCalled();
	});

	it("passes holders of manage_inventory on any vehicle", async () => {
		await middleware(
			makeReq({ role: "dispatcher", permissions: ["manage_inventory"] }),
			makeRes(),
			next,
		);
		expect(next).toHaveBeenCalledOnce();
		expect(mockFindFirst).not.toHaveBeenCalled();
	});

	it("passes holders of manage_technicians on any vehicle", async () => {
		await middleware(
			makeReq({ role: "dispatcher", permissions: ["manage_technicians"] }),
			makeRes(),
			next,
		);
		expect(next).toHaveBeenCalledOnce();
	});

	it("passes a technician with the permission on their CURRENT vehicle", async () => {
		mockFindFirst.mockResolvedValue({ current_vehicle_id: "vehicle-1" } as never);
		await middleware(
			makeReq({
				role: "technician",
				uid: "tech-1",
				organization_id: "org-1",
				permissions: ["stock_own_vehicle"],
			}),
			makeRes(),
			next,
		);
		expect(next).toHaveBeenCalledOnce();
		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { id: "tech-1", organization_id: "org-1" },
			select: { current_vehicle_id: true },
		});
	});

	it("403s a technician acting on a vehicle that is not their current one", async () => {
		mockFindFirst.mockResolvedValue({ current_vehicle_id: "vehicle-2" } as never);
		const res = makeRes();
		await middleware(
			makeReq({
				role: "technician",
				uid: "tech-1",
				organization_id: "org-1",
				permissions: ["stock_own_vehicle"],
			}),
			res,
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.objectContaining({
					message: "You can only manage stock on your current vehicle",
				}),
			}),
		);
	});

	it("403s a technician with no current vehicle", async () => {
		mockFindFirst.mockResolvedValue({ current_vehicle_id: null } as never);
		const res = makeRes();
		await middleware(
			makeReq({
				role: "technician",
				uid: "tech-1",
				organization_id: "org-1",
				permissions: ["stock_own_vehicle"],
			}),
			res,
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("403s a technician missing the permission entirely", async () => {
		const res = makeRes();
		await middleware(
			makeReq({
				role: "technician",
				uid: "tech-1",
				organization_id: "org-1",
				permissions: ["use_inventory"],
			}),
			res,
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
		expect(mockFindFirst).not.toHaveBeenCalled();
	});

	it("403s non-technician users without manager permissions", async () => {
		const res = makeRes();
		await middleware(
			makeReq({ role: "dispatcher", permissions: ["view_inventory"] }),
			res,
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});
});

// Guards the PUT /technicians/:id/vehicle gate (Finding 1): a technician may set
// only their OWN current vehicle. use_vehicles must NOT grant cross-technician
// assignment — only manage_vehicles or a self match may.
describe("requireAnyPermissionOrSelf (vehicle assignment gate)", () => {
	const middleware = requireAnyPermissionOrSelf(["manage_vehicles"], "id");
	let next: NextFunction;

	function makeReqSelf(user: Record<string, unknown>, targetId: string): Request {
		return { user, params: { id: targetId } } as unknown as Request;
	}

	beforeEach(() => {
		next = vi.fn();
	});

	it("passes a user acting on their own id (self match), regardless of permissions", () => {
		middleware(makeReqSelf({ role: "technician", uid: "tech-1", permissions: [] }, "tech-1"), makeRes(), next);
		expect(next).toHaveBeenCalledOnce();
	});

	it("403s a technician with only use_vehicles targeting another technician", () => {
		const res = makeRes();
		middleware(
			makeReqSelf({ role: "technician", uid: "tech-1", permissions: ["use_vehicles", "view_vehicles"] }, "tech-2"),
			res,
			next,
		);
		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("passes a dispatcher with manage_vehicles targeting any technician", () => {
		middleware(
			makeReqSelf({ role: "dispatcher", uid: "disp-1", permissions: ["manage_vehicles"] }, "tech-2"),
			makeRes(),
			next,
		);
		expect(next).toHaveBeenCalledOnce();
	});

	it("passes admins on any id without a permission check", () => {
		middleware(makeReqSelf({ role: "admin", uid: "admin-1", permissions: [] }, "tech-2"), makeRes(), next);
		expect(next).toHaveBeenCalledOnce();
	});
});
