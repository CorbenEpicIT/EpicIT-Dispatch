import type { InventoryItem } from "./inventory";

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
	license_plate?: string | null;
	year?: number | null;
	make?: string | null;
	model?: string | null;
	status?: "active" | "inactive";
	color?: string | null;
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
}

export interface AddPartsUsedInput {
	stock_item_id: string;
	qty_used: number;
	technician_id: string;
}

export interface RestockRequestInput {
	qty_requested?: number | null;
	note?: string | null;
}
