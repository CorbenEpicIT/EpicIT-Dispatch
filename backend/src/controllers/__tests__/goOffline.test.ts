import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetchRouteDistanceMiles, mockApplyOdometerIncrement } = vi.hoisted(() => ({
	mockFetchRouteDistanceMiles: vi.fn(),
	mockApplyOdometerIncrement: vi.fn(),
}));

vi.mock("../../lib/vehicleMileage.js", () => ({
	fetchRouteDistanceMiles: mockFetchRouteDistanceMiles,
	applyOdometerIncrement: mockApplyOdometerIncrement,
}));

vi.mock("../../services/wrappingUpTimer.js", () => ({
	cancelWrappingUpTimer: vi.fn(),
}));

const techFindUnique = vi.fn();
const openEntryFindFirst = vi.fn();
const organizationFindFirst = vi.fn();
const jobVisitFindFirst = vi.fn();
const jobVisitUpdate = vi.fn();
const shiftBreakFindFirst = vi.fn();
const shiftFindFirst = vi.fn();
const technicianUpdate = vi.fn();

function makeSdb() {
	const tx = {
		technician_shift_break: { findFirst: shiftBreakFindFirst, findMany: vi.fn().mockResolvedValue([]) },
		technician_shift: { findFirst: shiftFindFirst },
		technician: { update: technicianUpdate },
	};
	return {
		technician: { findUnique: techFindUnique },
		visit_tech_time_entry: { findFirst: openEntryFindFirst },
		organization: { findFirst: organizationFindFirst },
		job_visit: { findFirst: jobVisitFindFirst, update: jobVisitUpdate },
		$transaction: vi.fn((cb: (tx: typeof tx) => unknown) => cb(tx)),
	};
}

vi.mock("../../lib/context.js", () => ({
	getScopedDb: vi.fn(() => makeSdb()),
}));

import { goOffline } from "../techniciansController.js";

const TECH_ID = "tech-1";
const ORG_ID = "org-1";
const TECH_COORDS = { lat: 43.83, lon: -91.22 };
const JOB_COORDS = { lat: 43.8124, lon: -91.2568 };
const COMPLETED_VISIT = {
	id: "visit-1",
	job: { coords: JOB_COORDS },
};

describe("goOffline — return-leg mileage capture", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		techFindUnique.mockResolvedValue({ id: TECH_ID });
		openEntryFindFirst.mockResolvedValue(null);
		organizationFindFirst.mockResolvedValue({ timezone: "America/Chicago" });
		shiftBreakFindFirst.mockResolvedValue(null);
		shiftFindFirst.mockResolvedValue(null);
		technicianUpdate.mockResolvedValue({ id: TECH_ID, status: "Offline" });
	});

	it("computes and persists return miles when a completed-today visit and techCoords are both present", async () => {
		jobVisitFindFirst.mockResolvedValue(COMPLETED_VISIT);
		mockFetchRouteDistanceMiles.mockResolvedValue(2.9);

		const result = await goOffline(TECH_ID, ORG_ID, TECH_COORDS);

		expect(result.err).toBe("");
		expect(mockFetchRouteDistanceMiles).toHaveBeenCalledWith(JOB_COORDS, TECH_COORDS);
		expect(jobVisitUpdate).toHaveBeenCalledWith({
			where: { id: COMPLETED_VISIT.id },
			data: { estimated_return_drive_miles: 2.9 },
		});
		expect(mockApplyOdometerIncrement).toHaveBeenCalledWith(expect.anything(), TECH_ID, 2.9);
	});

	it("is a no-op when techCoords is missing", async () => {
		const result = await goOffline(TECH_ID, ORG_ID);

		expect(result.err).toBe("");
		expect(jobVisitFindFirst).not.toHaveBeenCalled();
		expect(mockFetchRouteDistanceMiles).not.toHaveBeenCalled();
		expect(jobVisitUpdate).not.toHaveBeenCalled();
	});

	it("is a no-op when there's no completed-today visit missing its return leg", async () => {
		jobVisitFindFirst.mockResolvedValue(null);

		const result = await goOffline(TECH_ID, ORG_ID, TECH_COORDS);

		expect(result.err).toBe("");
		expect(mockFetchRouteDistanceMiles).not.toHaveBeenCalled();
		expect(jobVisitUpdate).not.toHaveBeenCalled();
		expect(mockApplyOdometerIncrement).not.toHaveBeenCalled();
	});
});
