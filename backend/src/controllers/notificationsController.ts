import { db } from "../db.js";
import { log } from "../services/appLogger.js";
import type { Server } from "socket.io";
import { getScopedDb } from "../lib/context.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
	| "visit_assigned"
	| "visit_changed"
	| "visit_cancelled"
	| "note_added"
	| "visit_reminder";

// ── Socket.io injection ───────────────────────────────────────────────────────

let _io: Server | null = null;
export function setSocketIo(io: Server) { _io = io; }

interface CreateNotificationInput {
	technicianId: string;
	type:         NotificationType;
	title:        string;
	body:         string;
	actionUrl?:   string;
}

// ── Internal: create a notification ─────────────────────────────────────────

export const createNotification = async (input: CreateNotificationInput, organizationId?: string) => {
	try {
		const created = await db.technician_notification.create({
			data: {
				technician_id: input.technicianId,
				type:          input.type,
				title:         input.title,
				body:          input.body,
				action_url:    input.actionUrl ?? null,
			},
		});
		_io?.to(`tech:${input.technicianId}`).emit("notification:new", created);
		return created;
	} catch (e) {
		// Notifications are non-critical — log but don't throw
		log.error({ err: e }, "Failed to create technician notification");
		return null;
	}
};

// ── API handlers ──────────────────────────────────────────────────────────────

export const listNotifications = async (technicianId: string, unreadOnly = false, organizationId: string) => {
	const sdb = getScopedDb(organizationId);
	const notifications = await sdb.technician_notification.findMany({
		where: {
			technician_id: technicianId,
			...(unreadOnly && { read_at: null }),
		},
		orderBy: { created_at: "desc" },
	});
	return notifications;
};

export const markNotificationRead = async (technicianId: string, notifId: string, organizationId: string) => {
	try {
		const sdb = getScopedDb(organizationId);
		const notif = await sdb.technician_notification.findFirst({
			where: { id: notifId, technician_id: technicianId },
		});
		if (!notif) return { err: "Notification not found" };

		const updated = await sdb.technician_notification.update({
			where: { id: notifId },
			data: { read_at: notif.read_at ?? new Date() },
		});
		return { err: "", item: updated };
	} catch (e) {
		log.error({ err: e }, "Failed to mark notification read");
		return { err: "Failed to mark notification read" };
	}
};

export const markAllNotificationsRead = async (technicianId: string, organizationId: string) => {
	try {
		const sdb = getScopedDb(organizationId);
		await sdb.technician_notification.updateMany({
			where: { technician_id: technicianId, read_at: null },
			data:  { read_at: new Date() },
		});
		return { err: "" };
	} catch (e) {
		log.error({ err: e }, "Failed to mark all notifications read");
		return { err: "Failed to mark all notifications read" };
	}
};
