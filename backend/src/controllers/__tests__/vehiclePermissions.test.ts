import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../db.js", () => ({
	db: {
		technician: { findFirst: vi.fn() },
	},
}));

import { requireVehiclePermission } from "../../lib/requirePermissions.js";
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
