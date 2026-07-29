import type { VisitStatusEvent } from "./jobs";

export interface InventoryUpdatedEvent {
	organizationId: string;
	itemId?: string;
	vehicleId?: string;
}

export interface JobUpdatedEvent {
	jobId: string;
	organizationId: string;
}

export interface JobNoteCreatedEvent {
	organizationId: string;
}

export interface JobVisitCreatedEvent {
	visitId: string;
	organizationId: string;
}

export interface JobVisitUpdatedEvent {
	visitId: string | null;
	organizationId: string;
}

export interface JobVisitDeletedEvent {
	visitId: string;
	organizationId: string;
}

export interface VehicleRestockShortfallEvent {
	vehicle_name: string;
	date: string;
	shortfalls: { name: string; qty_shortfall: number }[];
}

export type { VisitStatusEvent };
