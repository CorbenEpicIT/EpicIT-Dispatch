import { z } from "zod";
import type { InventoryItem } from "./inventory";

export const CreateVehicleSchema = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.string().min(1, "Type is required"),
	license_plate: z.string().min(1, "License Plate / ID is required").max(50, "Max 50 characters"),
	year: z.number().int().min(1900).max(2100).nullable().optional(),
	make: z.string().max(50).nullable().optional(),
	model: z.string().max(50).nullable().optional(),
	color: z.string().max(50).nullable().optional(),
	status: z.enum(["active", "inactive"]).optional(),
	notes: z.string().max(1000).nullable().optional(),
});

export interface Vehicle {
	id: string;
	organization_id: string | null;
	name: string;
	type: string;
	license_plate: string | null;
	year: number | null;
	make: string | null;
	model: string | null;
	status: "active" | "inactive";
	color: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
	stock_items?: VehicleStockItem[];
	current_technicians?: { id: string; name: string }[];
}

export interface VehicleStockItem {
	id: string;
	vehicle_id: string;
	inventory_item_id: string;
	inventory_item: InventoryItem;
	qty_on_hand: number;
	qty_min: number;
	qty_standard: number | null;
	updated_at: string;
	created_at: string;
}

export interface VehicleStockUsage {
	id: string;
	stock_item_id: string;
	visit_id: string;
	technician_id: string;
	qty_used: number;
	visit_line_item_id: string | null;
	created_at: string;
}

export interface CreateVehicleInput {
	name: string;
	type: string;
	license_plate: string;
	year?: number | null;
	make?: string | null;
	model?: string | null;
	color?: string | null;
	status?: "active" | "inactive";
	notes?: string | null;
}

export interface UpdateVehicleInput extends Partial<CreateVehicleInput> {}

export interface AddVehicleStockItemInput {
	inventory_item_id: string;
	qty_on_hand?: number;
	qty_min?: number;
}

export interface UpdateVehicleStockItemInput {
	qty_on_hand?: number;
	qty_min?: number;
	qty_standard?: number | null;
}

export interface VehicleStockConflictItem {
	inventoryItemId: string;
	itemName: string;
	qtyNeeded: number;
	qtyOnHand: number;
}

export interface VehicleStockConflict {
	visitId: string;
	vehicleId: string;
	vehicleName: string;
	techNames: string[];
	visitName: string;
	clientName: string;
	scheduledAt: string;
	severity: "out" | "low";
	conflicts: VehicleStockConflictItem[];
}

export interface VehicleUsageTodayItem {
	itemName: string;
	qtyUsed: number;
}

export interface VehicleUsageTodayGroup {
	visitId: string;
	visitName: string;
	scheduledAt: string | null;
	items: VehicleUsageTodayItem[];
}

export type StockHealthStatus = "ok" | "low" | "out";

export interface AddPartsUsedInput {
	stock_item_id: string;
	qty_used: number;
	technician_id: string;
}

export interface SupplierPartUsedInput {
	technician_id: string;
	qty_used: number;
	inventory_item_id?: string;
	new_item?: { name: string; cost: number };
}

export interface RestockRequestInput {
	qty_requested?: number | null;
	note?: string | null;
}

export interface BulkRestockInput {
	items: Array<{ stock_item_id: string; qty_requested?: number | null; note?: string | null }>;
}

export interface ConfirmReceiptInput {
	items: Array<{ request_id: string; qty_received: number }>;
}

export type RestockRequestStatus = "pending" | "fulfilled" | "dismissed";

export interface RestockRequest {
	id: string;
	stock_item_id: string;
	technician_id: string;
	technician: { id: string; name: string } | null;
	qty_requested: number | string | null;
	note: string | null;
	status: RestockRequestStatus;
	created_at: string;
	fulfilled_at: string | null;
	received_at: string | null;
	qty_received: number | null;
	discrepant: boolean;
	dismissed_reason: string | null;
	qty_fulfilled: number | null;
	stock_item: {
		id: string;
		vehicle_id: string;
		inventory_item_id: string;
		inventory_item: { id: string; name: string; unit: string | null; quantity: number };
		vehicle: { id: string; name: string };
	};
}

export interface VehicleEodRestockLine {
	id: string;
	eod_record_id: string;
	stock_item_id: string;
	qty_restocked: number;
	qty_shortfall: number;
}

export interface VehicleEodRecord {
	id: string;
	vehicle_id: string;
	organization_id: string;
	completed_at: string;
	completed_by_id: string | null;
	completed_by: { id: string; name: string } | null;
	completed_by_tech_id: string | null;
	completed_by_tech: { id: string; name: string } | null;
	notes: string | null;
	restock_lines: VehicleEodRestockLine[];
	created_at: string;
}

export interface CompleteEodInput {
	notes?: string | null;
	restock_lines: Array<{
		stock_item_id: string;
		qty_to_restock: number;
	}>;
}

export type VehicleAdjustmentType = "warehouse_exchange" | "field_loss" | "transfer" | "audit" | "supplier_purchase";

export const ADJUSTMENT_TYPE_LABELS: Record<VehicleAdjustmentType, string> = {
	warehouse_exchange: "Warehouse Exchange",
	field_loss:         "Field Loss",
	transfer:           "Transfer In",
	audit:              "Audit Correction",
	supplier_purchase:  "Supplier Purchase",
};

export interface AdjustStockInput {
	type: VehicleAdjustmentType;
	note?: string | null;
	lines: Array<{
		stock_item_id?: string;
		inventory_item_id?: string;
		new_item?: { name: string; cost: number };
		qty_after: number;
	}>;
}

export interface VehicleStockAdjustmentLine {
	id: string;
	adjustment_id: string;
	stock_item_id: string;
	qty_before: number;
	qty_after: number;
	inventory_impact: number;
}

export interface VehicleStockAdjustment {
	id: string;
	vehicle_id: string;
	organization_id: string;
	type: VehicleAdjustmentType;
	note: string | null;
	created_by_id: string | null;
	created_by: { id: string; name: string } | null;
	created_by_tech_id: string | null;
	created_by_tech: { id: string; name: string } | null;
	created_at: string;
	lines: VehicleStockAdjustmentLine[];
}

export type ReadinessState =
	| "not_applicable"
	| "unknown"
	| "auto_ready"
	| "needs_action"
	| "confirmed";

export type ReadinessGap = {
	inventory_item_id: string;
	name: string;
	qty_needed: number;
	qty_on_hand: number;
	gap: number;
	visit_ids: string[];
};

export type VehicleReadiness = {
	state: ReadinessState;
	date: string;
	gaps: ReadinessGap[];
	confirmed?: {
		id: string;
		confirmed_by: string;
		confirmed_at: string;
		notes: string | null;
	};
};

export interface FillPlanLine {
	inventory_item_id: string;
	name: string;
	unit: string;
	on_hand: number;
	target: number;
	suggested_qty: number;
	warehouse_available: number;
}
export interface FillPlan {
	standard: FillPlanLine[];
	visits: FillPlanLine[];
}
export interface ApplyFillInput {
	lines: Array<{ inventory_item_id: string; qty: number }>;
}
export interface FillResultLine {
	inventory_item_id: string;
	qty_moved: number;
	shortfall: number;
}
