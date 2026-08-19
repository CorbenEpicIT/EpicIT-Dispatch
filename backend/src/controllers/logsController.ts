import { getScopedDb } from "../lib/context.js";
import { log } from "../services/appLogger.js";
import { Prisma } from "../../generated/prisma/client.js";

export type actor = "technician" | "dispatcher";
export type entity = "job" | "quote" | "request" | "invoice" | "client" | "project";

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 200;

const RENDERABLE = {
    OR: [
        { action: { not: "updated" } },
        {
            AND: [
                { changes: { not: Prisma.DbNull } },
                { changes: { not: {} } },
            ],
        },
    ],
};

/**
 * Read-side denylist for the change-history views. Credential and session
 * events (password changes/resets, logins, MFA, OAuth) are audit-only and are
 * never surfaced through /:id/changes, whatever the caller's permissions.
 */
const SENSITIVE_EVENT_PREFIXES = ["auth.", "mfa.", "oauth"] as const;
const NOT_SENSITIVE_EVENT = {
    NOT: [
        ...SENSITIVE_EVENT_PREFIXES.map((prefix) => ({ event_type: { startsWith: prefix } })),
        { event_type: { contains: ".password." } },
    ],
};

// Keys that must never leave the server inside `changes`, even on otherwise
// harmless events (defence in depth on top of the event-type denylist).
const SENSITIVE_CHANGE_KEY = /password|token|secret|otp|mfa/i;

export const redactSensitiveChanges = <T extends { changes: unknown }>(row: T): T => {
    const changes = row.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return row;
    const entries = Object.entries(changes as Record<string, unknown>);
    if (!entries.some(([key]) => SENSITIVE_CHANGE_KEY.test(key))) return row;
    return {
        ...row,
        changes: Object.fromEntries(entries.filter(([key]) => !SENSITIVE_CHANGE_KEY.test(key))),
    };
};

const ACTOR_TYPES: Record<actor, string[]> = {
    technician: ["technician"],
    dispatcher: ["dispatcher", "admin"],
}

type ScopedDb = ReturnType<typeof getScopedDb>;

type log_row = Prisma.logGetPayload<Record<string, never>>;

type GroupMember = {
    entity_type: string;
    resolve?: (sdb: ScopedDb, parentId: string) => Promise<string[]>;
};

const pluck = (rows: { id: string }[]) => rows.map((r) => r.id);

const ENTITY_GROUPS: Record<entity, GroupMember[]> = {
    job: [
        { entity_type: "job" },
        {
            entity_type: "job_visit",
            resolve: (sdb, jobId) =>
                sdb.job_visit
                    .findMany({ where: { job_id: jobId }, select: { id: true } })
                    .then(pluck),
        },
        {
            entity_type: "job_line_item",
            resolve: (sdb, jobId) =>
                sdb.job_line_item
                    .findMany({ where: { job_id: jobId }, select: { id: true } })
                    .then(pluck),
        },
        {
            entity_type: "job_note",
            resolve: (sdb, jobId) =>
                sdb.job_note
                    .findMany({ where: { job_id: jobId }, select: { id: true } })
                    .then(pluck),
        },
    ],
    quote: [
        { entity_type: "quote" },
        {
            entity_type: "quote_line_item",
            resolve: (sdb, quoteId) =>
                sdb.quote_line_item
                    .findMany({ where: { quote_id: quoteId }, select: { id: true } })
                    .then(pluck),
        },
        {
            entity_type: "quote_note",
            resolve: (sdb, quoteId) =>
                sdb.quote_note
                    .findMany({ where: { quote_id: quoteId }, select: { id: true } })
                    .then(pluck),
        },
    ],
    request: [
        { entity_type: "request" },
        {
            entity_type: "request_note",
            resolve: (sdb, requestId) =>
                sdb.request_note
                    .findMany({ where: { request_id: requestId }, select: { id: true } })
                    .then(pluck),
        },
    ],
    invoice: [
        { entity_type: "invoice" },
        {
            entity_type: "invoice_note",
            resolve: (sdb, invoiceId) =>
                sdb.invoice_note
                    .findMany({ where: { invoice_id: invoiceId }, select: { id: true } })
                    .then(pluck),
        },
        {
            entity_type: "invoice_payment",
            resolve: (sdb, invoiceId) =>
                sdb.invoice_payment
                    .findMany({ where: { invoice_id: invoiceId }, select: { id: true } })
                    .then(pluck),
        },
    ],
    client: [
        { entity_type: "client" },
        {
            entity_type: "client_note",
            resolve: (sdb, clientId) =>
                sdb.client_note
                    .findMany({ where: { client_id: clientId }, select: { id: true } })
                    .then(pluck),
        },
        {
            entity_type: "contact",
            resolve: (sdb, clientId) =>
                sdb.client_contact
                    .findMany({ where: { client_id: clientId }, select: { contact_id: true } })
                    .then((rows) => rows.map((r) => r.contact_id)),
        },
    ],
    project: [
        { entity_type: "project" },
        {
            entity_type: "job",
            resolve: (sdb, projectId) =>
                sdb.job
                    .findMany({ where: { project_id: projectId }, select: { id: true } })
                    .then(pluck),
        },
    ],
};

export const getActorHistory = async (orgId: string, type: actor, id: string, limit = DEFAULT_HISTORY_LIMIT) => {
    try {
        const actorTypes = ACTOR_TYPES[type];
        if (!actorTypes) return { err: `Unknown actor type: ${type}`, rows: [] as log_row[], hasMore: false, total: 0 };

        const sdb = getScopedDb(orgId);
        const scopedWhere = {
            AND: [{ actor_type: { in: actorTypes }, actor_id: id }, RENDERABLE, NOT_SENSITIVE_EVENT],
        };

        const [rows, total] = await Promise.all([
            sdb.log.findMany({
                where: scopedWhere,
                orderBy: [{ timestamp: "desc" }, { id: "desc"}],
                take: limit + 1,
            }),
            sdb.log.count({ where: scopedWhere }),
        ]);

        const hasMore = rows.length > limit;
        const page = (hasMore ? rows.slice(0, limit) : rows).map(redactSensitiveChanges);

        return { err: "", rows: page, hasMore, total };

    } catch (err) {
        if (err instanceof Error) {
            return { err: err.message, rows: [] as log_row[], hasMore: false, total: 0 };
        }
        log.error({ err }, "Get actor history error");
        return { err: "Internal server error", rows: [] as log_row[], hasMore: false, total: 0 };
    }
};

export const getEntityHistory = async (orgId: string, type: entity, id: string, limit = DEFAULT_HISTORY_LIMIT) => {
    try {
        const group = ENTITY_GROUPS[type];
        if (!group) return { err: `Unknown entity type: ${type}`, rows: [] as log_row[], hasMore: false, total: 0 };

        const sdb = getScopedDb(orgId);

        const groups = await Promise.all(
            group.map(async (member) => ({
                entity_type: member.entity_type,
                ids: member.resolve ? await member.resolve(sdb, id) : [id],
            })),
        );

        const scopedOr = groups
            .filter((g) => g.ids.length > 0)
            .map((g) => ({ entity_type: g.entity_type, entity_id: { in: g.ids } }));

        if (scopedOr.length === 0) return { err: "", rows: [] as log_row[], hasMore: false, total: 0 };

        const scopedWhere = { AND: [{ OR: scopedOr }, RENDERABLE, NOT_SENSITIVE_EVENT] };

        const [rows, total] = await Promise.all([
            sdb.log.findMany({
                where: scopedWhere,
                orderBy: [{ timestamp: "desc" }, { id: "desc"}],
                take: limit + 1,
            }),
            sdb.log.count({ where: scopedWhere }),
        ]);

        const hasMore = rows.length > limit;
        const page = (hasMore ? rows.slice(0, limit) : rows).map(redactSensitiveChanges);

        return { err: "", rows: page, hasMore, total };
    } catch (err) {
        if (err instanceof Error) {
            return { err: err.message, rows: [] as log_row[], hasMore: false, total: 0 };
        }
        log.error({ err }, "Get entity history error");
        return { err: "Internal server error", rows: [] as log_row[], hasMore: false, total: 0 };
    }
};