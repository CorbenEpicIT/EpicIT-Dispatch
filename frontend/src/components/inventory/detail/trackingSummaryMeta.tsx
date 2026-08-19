import {
	Layers,
	PackageCheck,
	PackageX,
	Truck,
	Undo2,
	Warehouse,
	type LucideIcon,
} from "lucide-react";
import type { TrackingSummary } from "../../../types/tracking";

// Single source of truth for labels/icons on GET /inventory/:itemId/tracking-summary
// rollups, shared by TrackingSummaryStats and StockPlacementCard so the same
// number isn't labelled differently in each place.
//
// `terminal` marks a lifetime total rather than live stock (consumed/lost/
// returned) — consumers should de-emphasize those.
export interface SummaryRowMeta<K extends string> {
	key: K;
	label: string;
	icon: LucideIcon;
	terminal?: boolean;
}

export type SerialSummaryKey = keyof TrackingSummary["serials"];
export type BatchSummaryKey = keyof TrackingSummary["batches"];

export const SERIAL_SUMMARY_ROWS: SummaryRowMeta<SerialSummaryKey>[] = [
	{ key: "in_warehouse", label: "In Warehouse", icon: Warehouse },
	{ key: "on_vehicle", label: "On Vehicles", icon: Truck },
	{ key: "consumed", label: "Consumed", icon: PackageCheck, terminal: true },
	{ key: "lost", label: "Lost", icon: PackageX, terminal: true },
	{ key: "returned", label: "Returned", icon: Undo2, terminal: true },
];

export const BATCH_SUMMARY_ROWS: SummaryRowMeta<BatchSummaryKey>[] = [
	{ key: "lots", label: "Lots", icon: Layers },
	{ key: "qty_in_warehouse", label: "Qty in Warehouse", icon: Warehouse },
	{ key: "qty_on_vehicles", label: "Qty on Vehicles", icon: Truck },
];

export const SERIAL_GROUP_HEADING = "Serialized units";
export const BATCH_GROUP_HEADING = "Batch lots";
