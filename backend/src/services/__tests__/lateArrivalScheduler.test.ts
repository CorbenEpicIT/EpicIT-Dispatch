import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startLateArrivalInterval } from "../lateArrivalScheduler.js";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { dbMock, createNotification, notifyDispatchers, fetchRoute, logError } = vi.hoisted(() => ({
	dbMock: {
		job_visit: { findMany: vi.fn() },
		technician_notification: { findMany: vi.fn() },
	},
	createNotification: vi.fn(),
	notifyDispatchers: vi.fn(),
	fetchRoute: vi.fn(),
	logError: vi.fn(),
}));

vi.mock("../../db.js", () => ({ db: dbMock }));
vi.mock("../../controllers/notificationsController.js", () => ({ createNotification, notifyDispatchers }));
vi.mock("../../lib/vehicleMileage.js", () => ({ fetchRoute }));
vi.mock("../appLogger.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: logError } }));

// Tick fires 5 min after start, so "now" inside the tick is 19:00Z = 2:00 PM CDT
const START = new Date("2026-10-01T18:55:00Z");
const TICK_MS = 5 * 60_000;

const tech = (over: Record<string, unknown> = {}) => ({
	tech_id: "t1",
	tech_status: "Assigned",
	tech: { name: "John Smith", coords: { lat: 43.8, lon: -91.2 } },
	...over,
});

function visit(over: Record<string, unknown> = {}) {
	return {
		id: "v1",
		arrival_constraint: "at",
		arrival_time: "14:30",
		arrival_window_end: null,
		scheduled_start_at: new Date("2026-10-01T18:00:00Z"),
		visit_techs: [tech()],
		job: {
			id: "j1",
			job_number: "J-0001",
			coords: { lat: 43.07, lon: -89.4 },
			organization_id: "org1",
			organization: { timezone: "America/Chicago" },
			client: { name: "Johnson Residence" },
		},
		...over,
	};
}

async function runTick(visits: unknown[]) {
	dbMock.job_visit.findMany.mockResolvedValue(visits);
	startLateArrivalInterval();
	await vi.advanceTimersByTimeAsync(TICK_MS);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ now: START });
	dbMock.technician_notification.findMany.mockResolvedValue([]);
	createNotification.mockResolvedValue({});
	notifyDispatchers.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("late arrival scheduler", () => {
	it("alerts on a passed deadline without calling Mapbox", async () => {
		await runTick([visit({ arrival_time: "13:50" })]);

		expect(fetchRoute).not.toHaveBeenCalled();
		expect(createNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				technicianId: "t1",
				type: "tech_running_late",
				title: "You're late to Johnson Residence",
				body: expect.stringMatching(/^Was due by 1:50\sPM and hasn't arrived\.$/),
				actionUrl: "/technician/visits/v1",
			}),
			"org1",
		);
		expect(notifyDispatchers).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "John Smith hasn't left for Johnson Residence",
				actionUrl: "/dispatch/jobs/j1/visits/v1",
			}),
			"org1",
		);
	});

	it("uses the traffic ETA for an en-route tech", async () => {
		fetchRoute.mockResolvedValue({ distanceMeters: 50_000, durationSeconds: 45 * 60 });
		await runTick([visit({ visit_techs: [tech({ tech_status: "EnRoute" })] })]);

		expect(fetchRoute).toHaveBeenCalledWith(
			{ lat: 43.8, lon: -91.2 },
			{ lat: 43.07, lon: -89.4 },
			"driving-traffic",
		);
		expect(createNotification.mock.calls[0][0]).toMatchObject({
			title: "You may be late to Johnson Residence",
			body: expect.stringMatching(/^ETA 2:45\sPM, due by 2:30\sPM \(~15 min late\)\.$/),
		});
		expect(notifyDispatchers.mock.calls[0][0].title).toBe("John Smith may be late — Job J-0001");
	});

	it("tells an assigned tech how long the drive is", async () => {
		fetchRoute.mockResolvedValue({ distanceMeters: 50_000, durationSeconds: 45 * 60 });
		await runTick([visit()]);

		expect(createNotification.mock.calls[0][0].body).toMatch(/^Needs ~45 min to drive; due by 2:30\sPM\.$/);
	});

	it("uses the window end for a between constraint", async () => {
		await runTick([visit({ arrival_constraint: "between", arrival_time: null, arrival_window_end: "13:40" })]);

		expect(createNotification.mock.calls[0][0].body).toMatch(/due by 1:40\sPM/);
	});

	it("stays quiet within the 5-minute grace", async () => {
		fetchRoute.mockResolvedValue({ distanceMeters: 50_000, durationSeconds: 33 * 60 });
		await runTick([visit()]);

		expect(createNotification).not.toHaveBeenCalled();
		expect(notifyDispatchers).not.toHaveBeenCalled();
	});

	it("skips deadlines beyond the lookahead and stale ones", async () => {
		await runTick([
			visit({ id: "far", arrival_time: "16:30" }), // 2.5h ahead
			visit({ id: "stale", arrival_time: "13:00" }), // 60 min ago
		]);

		expect(fetchRoute).not.toHaveBeenCalled();
		expect(createNotification).not.toHaveBeenCalled();
	});

	it("doesn't re-alert a tech already notified for the visit", async () => {
		dbMock.technician_notification.findMany.mockResolvedValue([
			{ technician_id: "t1", action_url: "/technician/visits/v1" },
		]);
		await runTick([visit({ arrival_time: "13:50", visit_techs: [tech(), tech({ tech_id: "t2" })] })]);

		expect(createNotification).toHaveBeenCalledTimes(1);
		expect(createNotification.mock.calls[0][0].technicianId).toBe("t2");
	});

	it("skips when there's no route", async () => {
		fetchRoute.mockResolvedValue(null);
		await runTick([visit()]);

		expect(createNotification).not.toHaveBeenCalled();
	});

	it("keeps going after one tech fails", async () => {
		createNotification.mockRejectedValueOnce(new Error("boom"));
		await runTick([visit({ arrival_time: "13:50", visit_techs: [tech(), tech({ tech_id: "t2" })] })]);

		expect(logError).toHaveBeenCalledTimes(1);
		expect(createNotification).toHaveBeenCalledTimes(2);
		expect(notifyDispatchers).toHaveBeenCalledTimes(1);
	});
});
