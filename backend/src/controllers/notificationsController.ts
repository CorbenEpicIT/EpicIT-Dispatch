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
	| "visit_reminder"
	| "field_purchase_preauth"
	| "field_purchase_reviewed";

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
	let created;
	try {
		created = await db.technician_notification.create({
			data: {
				technician_id: input.technicianId,
				type:          input.type,
				title:         input.title,
				body:          input.body,
				action_url:    input.actionUrl ?? null,
			},
		});
	} catch (e) {
		// For a field-purchase decision this row is the technician's only channel
		// for money they are owed or a receipt they have to fix. The durable trail
		// (`field_purchase_event`) still holds the decision, but nothing tells them.
		log.error(
			{ err: e, technicianId: input.technicianId, type: input.type, organizationId },
			"Technician notification NOT created — the technician has no other channel for this",
		);
		return null;
	}

	// Separate from the write above: the row exists, and a socket that is down must
	// not make a created notification look to the caller like a failed one.
	try {
		_io?.to(`tech:${input.technicianId}`).emit("notification:new", created);
	} catch (e) {
		log.error(
			{ err: e, technicianId: input.technicianId, type: input.type, notificationId: created.id },
			"Notification created but the real-time push failed — the technician sees it on next poll",
		);
	}
	return created;
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
