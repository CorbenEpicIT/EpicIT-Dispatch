export type StockStatus = 'sufficient' | 'low' | 'out_of_stock' | null;

export interface InventoryItem {
	id: string;
	name: string;
	description: string;
	location: string;
	quantity: number;
	unit_price: number | null;
	cost: number | null;
	sku: string | null;
	is_active: boolean;
	low_stock_threshold: number | null;
	image_urls: string[];
	alert_emails_enabled: boolean;
	alert_email: string | null;
	created_at: string;
	updated_at: string;
	stock_status?: StockStatus;
	_count?: {
		visit_line_items: number;
	};
}

export type InventorySortOption =
	| "name"
	| "quantity_asc"
	| "quantity_desc"
	| "most_used"
	| "recently_added";

export interface CreateInventoryItemInput {
	name: string;
	description: string;
	location: string;
	quantity: number;
	unit_price?: number | null;
	cost?: number | null;
	sku?: string | null;
	low_stock_threshold?: number | null;
	image_urls: string[];
	alert_emails_enabled: boolean;
	alert_email?: string | null;
}

export interface UpdateInventoryItemInput {
	name?: string;
	description?: string;
	location?: string;
	quantity?: number;
	unit_price?: number | null;
	cost?: number | null;
	sku?: string | null;
	low_stock_threshold?: number | null;
	image_urls?: string[];
	alert_emails_enabled?: boolean;
	alert_email?: string | null;
}
