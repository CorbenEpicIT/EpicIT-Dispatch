import { db } from "../db.js";

// ============================================================================
// UNIFIED ACTIVITY LOGGING
// Replaces both logAction() and auditLog() with a single function
// ============================================================================

interface LogActivityParams {
	event_type: string; // "client_note.created", "job.status_changed"
	action: string; // "created", "updated", "deleted", "viewed"
	entity_type: string; // "client_note", "job", "request", "quote"
	entity_id: string; // UUID of the entity

	actor_type: string; // "technician", "dispatcher", "system"
	actor_id?: string | null; // UUID (null for system events)

	changes?: any; // For audit trail: { field: { old, new } }
	reason?: string;
	ip_address?: string;
	user_agent?: string;
}

/**
 * Unified activity logging
 * Serves both business event tracking AND audit trail purposes
 */
export const logActivity = async (params: LogActivityParams) => {
	try {
		// Auto-populate actor_name from database
		let actorName: string | null = null;

		if (params.actor_id) {
			if (params.actor_type === "technician") {
				const tech = await db.technician.findUnique({
					where: { id: params.actor_id },
					select: { name: true },
				});
				actorName = tech?.name || "Unknown Technician";
			} else if (params.actor_type === "dispatcher") {
				const dispatcher = await db.dispatcher.findUnique({
					where: { id: params.actor_id },
					select: { name: true },
				});
				actorName = dispatcher?.name || "Unknown Dispatcher";
			} else if (params.actor_type === "customer") {
				const client = await db.client.findUnique({
					where: { id: params.actor_id },
					select: { name: true },
				});
				actorName = client?.name || "Unknown Customer";
			}
		}

		await db.log.create({
			data: {
				event_type: params.event_type,
				action: params.action,
				entity_type: params.entity_type,
				entity_id: params.entity_id,
				actor_type: params.actor_type,
				actor_id: params.actor_id || null,
				actor_name: actorName,
				changes: params.changes || null,
				timestamp: new Date(),
				ip_address: params.ip_address || null,
				user_agent: params.user_agent || null,
				reason: params.reason || null,
			},
		});
	} catch (error) {
		// Use stderr directly to avoid a circular dependency with appLogger
		process.stderr.write(JSON.stringify({ level: "error", msg: "Failed to create activity log", err: String(error) }) + "\n");
	}
};

// ============================================================================
// QUERY HELPERS
// ============================================================================

export const getEntityActivity = async (
	entityType: string,
	entityId: string
) => {
	return await db.log.findMany({
		where: {
			entity_type: entityType,
			entity_id: entityId,
		},
		orderBy: { timestamp: "desc" },
	});
};

export const getActorActivity = async (actorType: string, actorId: string) => {
	return await db.log.findMany({
		where: {
			actor_type: actorType,
			actor_id: actorId,
		},
		orderBy: { timestamp: "desc" },
	});
};

export const getActivityByEventType = async (
	eventType: string,
	limit?: number
) => {
	return await db.log.findMany({
		where: { event_type: eventType },
		orderBy: { timestamp: "desc" },
		take: limit,
	});
};

export const getRecentActivity = async (limit: number = 50) => {
	return await db.log.findMany({
		orderBy: { timestamp: "desc" },
		take: limit,
	});
};

export const getActivityInDateRange = async (
	startDate: Date,
	endDate: Date,
	filters?: {
		event_type?: string;
		actor_type?: string;
		entity_type?: string;
		action?: string;
	}
) => {
	return await db.log.findMany({
		where: {
			timestamp: {
				gte: startDate,
				lte: endDate,
			},
			...(filters?.event_type && { event_type: filters.event_type }),
			...(filters?.actor_type && { actor_type: filters.actor_type }),
			...(filters?.entity_type && { entity_type: filters.entity_type }),
			...(filters?.action && { action: filters.action }),
		},
		orderBy: { timestamp: "desc" },
	});
};

export const getAuditTrail = async (entityType: string, entityId: string) => {
	const allLogs = await db.log.findMany({
		where: {
			entity_type: entityType,
			entity_id: entityId,
		},
		orderBy: { timestamp: "desc" },
	});

	return allLogs.filter((log) => log.changes !== null);
};

// ============================================================================
// HELPERS
// ============================================================================

export const getEventTypeCounts = async (startDate?: Date, endDate?: Date) => {
	const where =
		startDate && endDate
			? {
					timestamp: {
						gte: startDate,
						lte: endDate,
					},
			  }
			: {};

	return await db.log.groupBy({
		by: ["event_type"],
		where,
		_count: {
			id: true,
		},
		orderBy: {
			_count: {
				id: "desc",
			},
		},
	});
};

export const getMostActiveActors = async (
	actorType: string,
	limit: number = 10,
	startDate?: Date,
	endDate?: Date
) => {
	const where = {
		actor_type: actorType,
		actor_id: { not: null },
		...(startDate &&
			endDate && {
				timestamp: {
					gte: startDate,
					lte: endDate,
				},
			}),
	};

	return await db.log.groupBy({
		by: ["actor_id", "actor_name"],
		where,
		_count: {
			id: true,
		},
		orderBy: {
			_count: {
				id: "desc",
			},
		},
		take: limit,
	});
};

export const getActivitySummary = async (startDate: Date, endDate: Date) => {
	const [totalEvents, eventsByType, eventsByActor, allLogsInRange] =
		await Promise.all([
			db.log.count({
				where: {
					timestamp: { gte: startDate, lte: endDate },
				},
			}),

			db.log.groupBy({
				by: ["event_type"],
				where: {
					timestamp: { gte: startDate, lte: endDate },
				},
				_count: { id: true },
				orderBy: { _count: { id: "desc" } },
				take: 10,
			}),

			db.log.groupBy({
				by: ["actor_type"],
				where: {
					timestamp: { gte: startDate, lte: endDate },
				},
				_count: { id: true },
			}),

			// Get all logs to filter
			db.log.findMany({
				where: {
					timestamp: { gte: startDate, lte: endDate },
				},
				select: { changes: true },
			}),
		]);

	const dataModifications = allLogsInRange.filter(
		(log) => log.changes !== null
	).length;

	return {
		totalEvents,
		dataModifications,
		topEventTypes: eventsByType,
		activityByActorType: eventsByActor,
	};
};
// ============================================================================
// BuildChanges
// ============================================================================

export type ChangeSet = Record<string, { old: any; new: any }>;

//handles number/decimal mismatches, date objects, nested objects/arrays
export const buildChanges = <T extends Record<string, any>>(
	oldRecord: T,
	newData: Record<string, any>,
	fields: readonly (keyof T)[]
): ChangeSet => {
	const changes: ChangeSet = {};

	for (const field of fields) {
		const newValue = newData[field as string];
		const oldValue = oldRecord[field];

		if (newValue === undefined) continue;

		const normalizedOld = normalizeValue(oldValue);
		const normalizedNew = normalizeValue(newValue);

		if (!deepEqual(normalizedOld, normalizedNew)) {
			changes[field as string] = {
				old: oldValue,
				new: newValue,
			};
		}
	}

	return changes;
};

function normalizeValue(value: any): any {
	if (value === null || value === undefined) return value;
	// Prisma Decimal → number
	if (value?.toNumber && typeof value.toNumber === "function") {
		return value.toNumber();
	}
	// Date → timestamp
	if (value instanceof Date) {
		return value.getTime();
	}
	// Array
	if (Array.isArray(value)) {
		return value.map(normalizeValue);
	}
	// Plain object
	if (isPlainObject(value)) {
		const normalized: any = {};
		for (const key in value) {
			normalized[key] = normalizeValue(value[key]);
		}
		return normalized;
	}

	return value;
}

function isPlainObject(value: any): boolean {
	if (value === null || typeof value !== "object") return false;
	if (Array.isArray(value)) return false;
	if (value instanceof Date) return false;
	return value.constructor === Object || value.constructor === undefined;
}

function deepEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (typeof a !== typeof b) return false;

	if (typeof a !== "object") return a === b;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, index) => deepEqual(item, b[index]));
	}

	if (Array.isArray(a) !== Array.isArray(b)) return false;

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;

	return keysA.every((key) => deepEqual(a[key], b[key]));
}
