import * as notificationsController from "../controllers/notificationsController.js";
import { db } from "../db.js";
import { localTimeOnDay } from "../lib/dayRange.js";
import { Coords, fetchRoute } from "../lib/vehicleMileage.js";
import { log } from "./appLogger.js";

const LOOKAHEAD_MS = 2 * 3600_000;
// Deadline is on scheduled_start_at's local day, so it's within ±24h of it
const DAY_MS = 24 * 3600_000;
// Older deadlines are stale (e.g. yesterday's never-started visits)
const STALE_MS = 30 * 60_000;

const GRACE_MS = 5 * 60_000;

let running = false;

export function startLateArrivalInterval(): void {
    // Every 5 minutes check if a tech is estimated to be late to a job visit and alert dispatchers and the tech
    setInterval(async () => {
        if (running) return; // guard against overlapping ticks double-creating
        running = true;
        try {
            const now = new Date();
            const from = new Date(now.getTime() - DAY_MS);
            const to = new Date(now.getTime() + LOOKAHEAD_MS + DAY_MS);

            const visits = await db.job_visit.findMany({
                where: {
                    arrival_constraint: { not: "anytime" },
                    status: { in: ["Scheduled", "Driving", "Delayed"] },
                    scheduled_start_at: { gte: from, lte: to },
                },
                include: {
                    visit_techs: {
                        where: {
                            tech_status: { in: ["Assigned", "EnRoute"] },
                            tech: { status: { not: "Offline" } },
                        },
                        select: { tech_id: true, tech_status: true, tech: { select: { name: true, coords: true } } },
                    },
                    job: {
                        select: {
                            id: true,
                            job_number: true,
                            coords: true,
                            organization_id: true,
                            organization: { select: { timezone: true } },
                            client: { select: { name: true } },
                        },
                    },
                },
            });

            // Notify once per visit+tech; the tech row is always created, so it's the record
            const techUrl = (visitId: string) => `/technician/visits/${visitId}`;
            const sent = await db.technician_notification.findMany({
                where: { type: "tech_running_late", action_url: { in: visits.map((v) => techUrl(v.id)) } },
                select: { technician_id: true, action_url: true },
            });
            const sentKeys = new Set(sent.map((n) => `${n.action_url}:${n.technician_id}`));

            for (const visit of visits) {
                if (visit.visit_techs.length === 0 || !visit.job.organization) continue;
                const hhmm = visit.arrival_constraint === "at" ? visit.arrival_time : visit.arrival_window_end;
                if (!hhmm) continue;

                const tz = visit.job.organization.timezone;
                const deadline = localTimeOnDay(visit.scheduled_start_at, hhmm, tz);
                if (deadline.getTime() > now.getTime() + LOOKAHEAD_MS) continue;
                if (deadline.getTime() < now.getTime() - STALE_MS) continue;

                const orgId = visit.job.organization_id!;
                const jobCoords = visit.job.coords as { lat?: number; lon?: number; lng?: number } | null;
                const dest = jobCoords?.lat && (jobCoords.lon ?? jobCoords.lng)
                    ? { lat: jobCoords.lat, lon: (jobCoords.lon ?? jobCoords.lng)! }
                    : null;
                const fmt = (d: Date) =>
                    d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

                for (const vt of visit.visit_techs) {
                    const actionUrl = techUrl(visit.id);
                    if (sentKeys.has(`${actionUrl}:${vt.tech_id}`)) continue;

                    try {
                        let lateMs: number;
                        let etaSeconds: number | null = null;
                        if (now.getTime() > deadline.getTime()) {
                            lateMs = now.getTime() - deadline.getTime(); // already past, no Mapbox call
                        } else {
                            // one Mapbox call per candidate per tick; Matrix API if orgs get big
                            const route = await fetchRoute(vt.tech.coords as Coords, dest, "driving-traffic");
                            if (!route) continue;
                            etaSeconds = route.durationSeconds;
                            lateMs = now.getTime() + etaSeconds * 1000 - deadline.getTime();
                        }
                        if (lateMs <= GRACE_MS) continue;

                        const lateMin = Math.round(lateMs / 60_000);
                        const due = fmt(deadline);
                        const client = visit.job.client.name;
                        const body = vt.tech_status === "EnRoute" && etaSeconds !== null
                            ? `ETA ${fmt(new Date(now.getTime() + etaSeconds * 1000))}, due by ${due} (~${lateMin} min late).`
                            : etaSeconds !== null
                                ? `Needs ~${Math.round(etaSeconds / 60)} min to drive; due by ${due}.`
                                : `Was due by ${due} and hasn't arrived.`;

                        await notificationsController.createNotification({
                            technicianId: vt.tech_id,
                            type: "tech_running_late",
                            title: etaSeconds === null ? `You're late to ${client}` : `You may be late to ${client}`,
                            body,
                            actionUrl,
                        }, orgId);

                        await notificationsController.notifyDispatchers({
                            type: "tech_running_late",
                            title: vt.tech_status === "EnRoute"
                                ? `${vt.tech.name} may be late — Job ${visit.job.job_number}`
                                : `${vt.tech.name} hasn't left for ${client}`,
                            body,
                            actionUrl: `/dispatch/jobs/${visit.job.id}/visits/${visit.id}`,
                        }, orgId);
                    } catch (e) {
                        log.error({ err: e, visitId: visit.id, techId: vt.tech_id }, "Late arrival check failed for tech");
                    }
                }
            }

        } catch (e) {
            log.error({ err: e }, "Late arrival interval failed");
        } finally {
            running = false;
        }
    }, 5 * 60_000);
}
