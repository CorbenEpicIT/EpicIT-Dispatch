import * as notificationsController from "../controllers/notificationsController.js";
import { db } from "../db.js";
import { classifyReminder, type MaintenanceReminderStatus } from "../lib/validate/vehicleMaintenanceStatus.js";
import { log } from "./appLogger.js";

let running = false;

export function startMaintenanceReminderInterval(): void {
    // Hourly: notify each vehicle's technicians of overdue/due-soon reminders.
    setInterval(async () => {
        if (running) return; // guard against overlapping ticks double-creating
        running = true;
        try {
            const openReminders = await db.vehicle_maintenance_reminder.findMany({
                where: {
                    completed_at: null
                },
                include: {
                    vehicle: {
                        include: { current_technicians: true }
                    }
                },
            });

            if (openReminders.length === 0) return;

            const dueReminders: { reminder: typeof openReminders[number]; status: MaintenanceReminderStatus }[] = [];
            for (const reminder of openReminders) {
                const status = classifyReminder(reminder, reminder.vehicle.current_odometer_mi);
                if (status === "overdue" || status === "duesoon") {
                    dueReminders.push({ reminder, status });
                }
            }

            if (dueReminders.length === 0) return;

            // Keyed per reminder so a second one going due still notifies.
            const actionUrls = dueReminders.map(({ reminder }) => `/technician/vehicles?reminder=${reminder.id}`);
            const existingNotifications = await db.technician_notification.findMany({
                where: { type: "vehicle_maintenance_due", action_url: { in: actionUrls } },
                select: { technician_id: true, action_url: true },
            });
            const sentKeys = new Set(
                existingNotifications.map(n => `${n.action_url}:${n.technician_id}`)
            );

            for (const { reminder, status } of dueReminders) {
                const actionUrl = `/technician/vehicles?reminder=${reminder.id}`;
                const urgency = status === "overdue" ? "overdue" : "due soon";

                for (const tech of reminder.vehicle.current_technicians) {
                    if (sentKeys.has(`${actionUrl}:${tech.id}`)) continue;

                    await notificationsController.createNotification({
                        technicianId: tech.id,
                        type: "vehicle_maintenance_due",
                        title: `${reminder.title} ${urgency} — ${reminder.vehicle.name}`,
                        body: `${reminder.vehicle.name}'s ${reminder.title.toLowerCase()} is ${urgency}.`,
                        actionUrl,
                    });
                }
            }
        } catch (e) {
            log.error({ err: e }, "Maintenance reminder interval failed");
        } finally {
            running = false;
        }
    }, 60 * 60_000);
}
