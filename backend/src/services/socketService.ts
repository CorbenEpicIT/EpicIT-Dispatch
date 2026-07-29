import type { Server } from "socket.io";

let _io: Server | null = null;

export const initSocket = (io: Server): void => {
	_io = io;
};

export const getSocket = (): Server => {
	if (!_io) throw new Error("Socket.io not initialized");
	return _io;
};

// Scoped emit — never broadcast tenant data outside the caller's org room.
export const emitToOrg = (organizationId: string, event: string, payload: unknown): void => {
	getSocket().to(`org:${organizationId}`).emit(event, payload);
};

// Single-item inventory mutations pass itemId (scoped invalidation on the
// frontend); multi-item vehicle operations (restock/fill/adjust) pass
// vehicleId instead — itemId stays undefined since they touch an unknown
// set of items, so the frontend falls back to a broad inventory invalidation.
// Best-effort real-time push — an unavailable/uninitialized socket layer
// must never fail a mutation whose DB write already succeeded.
export const emitInventoryUpdated = (
	organizationId: string,
	opts?: { itemId?: string; vehicleId?: string },
): void => {
	try {
		emitToOrg(organizationId, "inventory:updated", {
			organizationId,
			itemId: opts?.itemId,
			vehicleId: opts?.vehicleId,
		});
	} catch {
		// no-op
	}
};
