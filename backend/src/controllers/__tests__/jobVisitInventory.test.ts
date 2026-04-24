/**
 * Tests for inventory deduction logic triggered by job visit status changes.
 * Covers both "visit_completion" and "job_completion" deduction modes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateJobVisit } from "../jobVisitsController.js";
import { db } from "../../db.js";
import { deductInventoryForVisit } from "../inventoryController.js";
import type { Request } from "express";

vi.mock("../../db.js", () => ({
	db: {
		job_visit: {
			findUnique: vi.fn(),
		},
		$transaction: vi.fn(),
	},
}));

vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));

// Mock deductInventoryForVisit so we can assert when/how it's called
vi.mock("../inventoryController.js", () => ({
	deductInventoryForVisit: vi.fn().mockResolvedValue(undefined),
}));

const mockDb = vi.mocked(db);
const mockDeduct = vi.mocked(deductInventoryForVisit);

function makeRequest(visitId: string, body: object): Request {
	return { params: { id: visitId }, body } as unknown as Request;
}

function makeExistingVisit(
	status: string,
	jobStatus: string,
	deductOn: "visit_completion" | "job_completion",
) {
	return {
		id: "visit-1",
		job_id: "job-1",
		status,
		name: "Visit 1",
		description: "",
		arrival_constraint: null,
		finish_constraint: null,
		scheduled_start_at: null,
		scheduled_end_at: null,
		arrival_time: null,
		arrival_window_start: null,
		arrival_window_end: null,
		finish_time: null,
		actual_start_at: null,
		actual_end_at: null,
		job: {
			id: "job-1",
			status: jobStatus,
			deduct_inventory_on: deductOn,
		},
	};
}

// Sets up $transaction to execute the callback with a mock tx
function setupTransaction(allVisits: { id: string; status: string }[]) {
	const updatedVisit = {
		id: "visit-1",
		status: "Completed",
		job: { id: "job-1", client: {} },
		visit_techs: [],
		notes: [],
	};
	const mockTx = {
		job_visit: {
			update: vi.fn().mockResolvedValue(updatedVisit),
			findMany: vi.fn().mockResolvedValue(allVisits),
			findUnique: vi.fn().mockResolvedValue(updatedVisit),
		},
		job: {
			update: vi.fn().mockResolvedValue(undefined),
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
		fn(mockTx),
	);
	return mockTx;
}

describe("updateJobVisit — inventory deduction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---------------------------------------------------------------------------
	// visit_completion mode
	// ---------------------------------------------------------------------------
	describe("visit_completion mode", () => {
		it("deducts inventory immediately when a visit is marked Completed", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "InProgress", "visit_completion") as any,
			);
			setupTransaction([{ id: "visit-1", status: "Completed" }]);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).toHaveBeenCalledOnce();
			expect(mockDeduct).toHaveBeenCalledWith("visit-1", expect.anything(), undefined);
		});

		it("does not deduct if the visit was already Completed before this update", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Completed", "InProgress", "visit_completion") as any,
			);
			setupTransaction([{ id: "visit-1", status: "Completed" }]);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).not.toHaveBeenCalled();
		});

		it("does not deduct when status changes to something other than Completed", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "Scheduled", "visit_completion") as any,
			);
			setupTransaction([{ id: "visit-1", status: "InProgress" }]);

			await updateJobVisit(makeRequest("visit-1", { status: "InProgress" }));

			expect(mockDeduct).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// job_completion mode
	// ---------------------------------------------------------------------------
	describe("job_completion mode", () => {
		it("deducts inventory for every visit when the last visit completes the job", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "InProgress", "job_completion") as any,
			);
			// After the update, all visits are Completed → job becomes Completed
			const allVisits = [
				{ id: "visit-1", status: "Completed" },
				{ id: "visit-2", status: "Completed" },
			];
			setupTransaction(allVisits);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).toHaveBeenCalledTimes(2);
			expect(mockDeduct).toHaveBeenCalledWith("visit-1", expect.anything(), undefined);
			expect(mockDeduct).toHaveBeenCalledWith("visit-2", expect.anything(), undefined);
		});

		it("does not deduct when some visits are still incomplete", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "Scheduled", "job_completion") as any,
			);
			// One visit still Scheduled → job is not yet Completed
			setupTransaction([
				{ id: "visit-1", status: "Completed" },
				{ id: "visit-2", status: "Scheduled" },
			]);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).not.toHaveBeenCalled();
		});

		it("does not deduct again if the job was already Completed before this update", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "Completed", "job_completion") as any,
			);
			setupTransaction([
				{ id: "visit-1", status: "Completed" },
				{ id: "visit-2", status: "Completed" },
			]);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).not.toHaveBeenCalled();
		});

		it("does not deduct inventory via visit_completion path when mode is job_completion", async () => {
			mockDb.job_visit.findUnique.mockResolvedValue(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				makeExistingVisit("Scheduled", "InProgress", "job_completion") as any,
			);
			// Not all visits done → job stays InProgress
			setupTransaction([
				{ id: "visit-1", status: "Completed" },
				{ id: "visit-2", status: "InProgress" },
			]);

			await updateJobVisit(makeRequest("visit-1", { status: "Completed" }));

			expect(mockDeduct).not.toHaveBeenCalled();
		});
	});
});
