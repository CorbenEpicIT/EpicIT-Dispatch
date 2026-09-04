import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server } from "socket.io";
import { db } from "../../db.js";
import { createNotification, setSocketIo } from "../notificationsController.js";

vi.mock("../../db.js", () => ({
	db: {
		technician_notification: { create: vi.fn() },
	},
}));

vi.mock("../../services/appLogger.js", () => ({
	log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockDb = vi.mocked(db);
const TECH = "tech-1";
const ROW = { id: "notif-1", technician_id: TECH, type: "field_purchase_reviewed" };

describe("createNotification", () => {
	let emitMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		emitMock = vi.fn();
		// Stub Server: only the `to().emit()` chain notificationsController exercises.
		setSocketIo({ to: () => ({ emit: emitMock }) } as unknown as Server);
	});

	it("returns the notification it created even when the push fails", async () => {
		// The push is best-effort; the row is the record. Reporting a created row as
		// a failure tells the caller nothing reached the technician when the durable
		// half did.
		mockDb.technician_notification.create.mockResolvedValue(ROW);
		emitMock.mockImplementation(() => {
			throw new Error("socket gone");
		});

		const created = await createNotification({
			technicianId: TECH,
			type: "field_purchase_reviewed",
			title: "Purchase approved",
			body: "Your receipt was approved.",
		});

		expect(created).not.toBeNull();
	});

	it("returns null when the database write itself fails", async () => {
		mockDb.technician_notification.create.mockRejectedValue(new Error("db gone"));

		const created = await createNotification({
			technicianId: TECH,
			type: "field_purchase_reviewed",
			title: "Purchase approved",
			body: "Your receipt was approved.",
		});

		expect(created).toBeNull();
	});
});
