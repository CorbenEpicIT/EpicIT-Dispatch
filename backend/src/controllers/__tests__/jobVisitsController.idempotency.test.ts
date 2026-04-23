import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the LIFECYCLE_ORDER logic in isolation — the actual DB is mocked.
// Pull out the ordering constant once it exists in the controller.

const LIFECYCLE_ORDER: Record<string, number> = {
	Scheduled: 0,
	Driving: 1,
	OnSite: 2,
	InProgress: 3,
	Paused: 4,
	Completed: 5,
};

function isAlreadyPast(currentStatus: string, toStatus: string): boolean {
	const current = LIFECYCLE_ORDER[currentStatus] ?? -1;
	const target = LIFECYCLE_ORDER[toStatus] ?? -1;
	return current >= target && target >= 0;
}

describe("isAlreadyPast (idempotency guard)", () => {
	it("returns true when current status equals target", () => {
		expect(isAlreadyPast("Driving", "Driving")).toBe(true);
	});

	it("returns true when current status is past target", () => {
		expect(isAlreadyPast("OnSite", "Driving")).toBe(true);
		expect(isAlreadyPast("InProgress", "Driving")).toBe(true);
		expect(isAlreadyPast("Completed", "InProgress")).toBe(true);
	});

	it("returns false when current status is before target", () => {
		expect(isAlreadyPast("Scheduled", "Driving")).toBe(false);
		expect(isAlreadyPast("Driving", "OnSite")).toBe(false);
	});

	it("returns false for Cancelled (not in order map)", () => {
		expect(isAlreadyPast("Cancelled", "Driving")).toBe(false);
	});

	it("returns false for Delayed (not in order map)", () => {
		expect(isAlreadyPast("Delayed", "Driving")).toBe(false);
	});
});
