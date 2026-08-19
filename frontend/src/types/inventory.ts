import type { ReorderSeverity } from './reports';

export type StockStatus = 'sufficient' | 'low' | 'out_of_stock' | null;

export interface InventoryTag {
	id: string;
	label: string;
	organization_id: string;
	created_at: string;
	updated_at: string;
}

export interface InventoryItem {
	id: string;
	name: string;
	description: string;
	location: string;
	quantity: number;
	unit_price: number | null;
	cost: number | null;
	sku: string | null;
	barcode: string | null;
	is_active: boolean;
	low_stock_threshold: number | null;
	image_urls: string[];
	alt_ids?: string[];
	alert_emails_enabled: boolean;
	alert_email: string | null;
	category: string | null;
	unit: string;
	is_serialized: boolean;
	is_batch_tracked: boolean;
	created_at: string;
	updated_at: string;
	stock_status: StockStatus;
	tags?: InventoryTag[];
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
	unit?: string;
	unit_price?: number | null;
	cost?: number | null;
	sku?: string | null;
	/** Freetext grouping axis — single-valued, unlike tags. Blank sends null. */
	category?: string | null;
	barcode?: string | null;
	low_stock_threshold?: number | null;
	image_urls: string[];
	alt_ids?: string[];
	alert_emails_enabled: boolean;
	alert_email?: string | null;
	is_serialized?: boolean;
	is_batch_tracked?: boolean;
}

export type UpdateInventoryItemInput = Partial<CreateInventoryItemInput> & {
	/**
	 * Required by PATCH /inventory/:id when `unit` changes on an item with
	 * stock on hand (warehouse + vehicles, or live serials/lots): the quantity
	 * is re-read in the new unit, not converted, so the server refuses the
	 * change without this explicit confirmation (400 otherwise).
	 */
	acknowledge_unit_change?: boolean;
};

// Mirrors backend enum stock_location_type (schema.prisma).
export type StockLocationType =
	| "warehouse"
	| "vehicle"
	| "consumed"
	| "adjustment"
	| "external";

// Mirrors backend enum stock_movement_reason (schema.prisma).
export type StockMovementReason =
	| "receive"
	| "restock"
	| "return_to_warehouse"
	| "parts_used"
	| "direct_consumption"
	| "loss"
	| "audit_correction"
	| "transfer"
	| "reversal"
	| "initial"
	| "supplier_purchase";

// One row of the per-item stock-movement ledger — GET /inventory/:id/movements.
// qty is always positive; direction is from_location_type → to_location_type
// (vehicle names populated only when the corresponding side is a vehicle).
export interface StockMovement {
	id: string;
	qty: number | string;
	// Stamped at write time from the item's unit THEN, not the item's unit now
	// — a ledger can span a unit change, so a row must carry its own (see
	// UnitBasis below). Render qty with this, never with the item's current unit.
	unit: string;
	from_location_type: StockLocationType;
	from_vehicle: { id: string; name: string } | null;
	to_location_type: StockLocationType;
	to_vehicle: { id: string; name: string } | null;
	reason: StockMovementReason;
	note: string | null;
	actor_type: string;
	actor_id: string | null;
	visit_id: string | null;
	created_at: string;
}

export interface MovementsPage {
	movements: StockMovement[];
	nextCursor: string | null;
}

// ── Mixed-unit aggregates ────────────────────────────────────────────────────

/**
 * How an aggregated quantity is DENOMINATED. Mirrors backend `UnitBasis`
 * (lib/inventory.ts) — one shape shared by every endpoint that sums `stock_movement.qty`.
 *
 * A unit is stamped at write time and frozen, so a ledger spanning a unit change is
 * detectable but not summable — no conversion exists, by design. When `mixed` is true,
 * the server has already withheld the quantity (`null`, never `0`); the UI's job is to
 * say WHY, not recompute. `units` is sorted, not chronological — copy must not imply direction.
 */
export interface UnitBasis {
	units: string[];
	unit: string | null;
	mixed: boolean;
}

// ── History & Reports tab (item detail page) ─────────────────────────────────
// Field names mirror the backend handlers verbatim (inventoryController.ts) —
// do not rename on this side.

// One row of GET /inventory/:id/usage — this item's consumption traced back to
// the job + client it was used on (grouped per job+client).
export interface ItemUsageRow {
	jobId: string;
	jobNumber: string;
	jobName: string;
	clientId: string;
	clientName: string;
	// null when THIS row's movements span a unit change — see unitBasis.
	qtyConsumed: number | null;
	unitBasis: UnitBasis;
	lastConsumedAt: string;
}

export interface ItemUsage {
	usage: ItemUsageRow[];
	// Union across the page. Distinct from the per-row basis: every row can be
	// internally single-unit while the column still stacks `each` totals against
	// `box` totals, which only a page-level basis can see.
	unitBasis: UnitBasis;
	hasMore: boolean;
}

// One bucket of GET /inventory/:id/consumption-trend — bucketed CONSUMPTION
// totals only (same parts_used / direct_consumption reason set as ItemUsage /
// the reorder forecast). The bucket series is zero-filled server-side, so a
// bucket with no consumption is a real 0, never a missing point.
export interface ConsumptionTrendPoint {
	periodStart: string;
	// null ONLY on a unit break (unitBasis.mixed). A real zero-consumption bucket is
	// still 0 — the two must stay distinguishable on a series that zero-fills.
	qtyConsumed: number | null;
}

export interface ItemConsumptionTrend {
	bucket: "week" | "month";
	points: ConsumptionTrendPoint[];
	// Series-wide, not per bucket: numbering the clean buckets and blanking only the
	// seam would still plot two denominations on one y-axis.
	unitBasis: UnitBasis;
}

// GET /inventory/:id/forecast — single-item reorder forecast. `forecast` is a
// legitimate `null` (HTTP 200) when there's nothing to forecast, and `reason`
// says which of the two unrelated causes it was: the item is inactive, or it's
// active but produced no forecastable row (no recorded usage in the window).
// Rendering "unavailable for inactive items" over an active item is simply
// wrong, so callers branch on `reason` rather than assuming.
export interface ItemForecast {
	itemId: string;
	itemName: string;
	sku: string | null;
	category: string | null;
	unit: string;
	// Org-wide (warehouse + vehicles) — what the runway is computed from. The
	// split matters on this card because the reorder point below is a WAREHOUSE
	// threshold, so the two can't share one marker.
	currentQuantity: number;
	warehouseQuantity: number;
	vehicleQuantity: number;
	// null when the consumption behind them spans a unit change. The on-hand figures
	// above are not nullable — they come from the cached quantity columns, always in
	// the item's current unit, not from a ledger sum.
	qtyConsumed: number | null;
	avgDailyUsage: number | null;
	// Denomination of the consumption this forecast burns down. When mixed, the rate,
	// runway and stockout date are all withheld and `severity` falls back to the bands
	// that need no rate — `belowReorderPoint` still holds, since it compares two
	// cached columns and never touches the ledger.
	consumptionBasis: UnitBasis;
	// Days of history the rate was measured over, capped at the window. A time span,
	// so it survives a unit break.
	observedDays: number;
	daysOfStock: number | null;
	projectedStockoutDate: string | null;
	lowStockThreshold: number | null;
	belowReorderPoint: boolean;
	// Server-computed verdict, shared with the org-wide reorder report so both
	// surfaces read the same band for the same item. Do not derive locally.
	severity: ReorderSeverity;
}

export type ItemForecastReason = 'inactive' | 'no_forecast_row' | null;

export interface ItemForecastResult {
	forecast: ItemForecast | null;
	reason: ItemForecastReason;
}

// One point of GET /inventory/:id/value-history — running warehouse quantity
// over time, priced at the item's CURRENT cost (not the historical cost at
// that point in time — stock_movement has no per-movement cost capture).
// APPROXIMATE, directional trend only. value is null when the item has no cost set.
export interface ValueHistoryPoint {
	date: string;
	quantity: number;
	value: number | null;
}

// The series is a NEWEST-N window, not the whole ledger from the beginning:
//  - `truncated` — the row cap cut older movements off the front
//  - `windowStart` — the timestamp the returned series actually begins at
//  - `openingQuantity` — stock on hand immediately before that first point, so
//    a windowed series starts from real stock instead of zero
//  - `hasNegative` — the running quantity dips below zero somewhere, which means
//    incomplete ledger coverage (consumption recorded with no matching receipt),
//    not a rendering bug. Values are returned unclamped; the chart must show
//    them and explain them rather than hide them behind a [0, …] domain.
export interface ValueHistory {
	// The item's CONFIGURED cost right now.
	currentCost: number | null;
	// The cost every point was actually priced at, and which kind of cost that is:
	//   "paid"       — weighted average of per-receipt supplier costs (the real basis)
	//   "configured" — no receipt recorded a cost, so currentCost was used and the
	//                  series is a directional trend, not realized COGS
	//   null         — no cost of either kind, so `value` is null throughout
	costUsed: number | null;
	costBasis: "paid" | "configured" | null;
	// Denomination of the ledger BEHIND this series — deliberately wider than the
	// displayed window, since the window's starting level is recovered by summing
	// every older row. When mixed, `points` is empty and `costUsed` is null: a running
	// balance is cumulative, so no subset of it is salvageable, and the chart must
	// render an explained state rather than its "No history yet" empty state.
	unitBasis: UnitBasis;
	points: ValueHistoryPoint[];
	truncated: boolean;
	openingQuantity: number | null;
	windowStart: string | null;
	hasNegative: boolean;
}

// GET /inventory/:id/price-history — four series that must never be conflated:
//
//   cost     SET cost — what the item is CONFIGURED to cost, as a step function
//            over time (a configured amount holds until someone edits it)
//   price    LIST price — the configured customer unit_price, same step shape
//   charged  what was actually BILLED, averaged per bucket from visit line items
//   wac      PAID cost — running weighted average over receipts that recorded a
//            per-unit supplier cost
//
// Step points come from the audit log, so `coverageStart` says how far back that
// record actually reaches. A null `value` means the field was cleared, not that
// the data is missing.
export interface PricePoint {
	at: string;
	value: number | null;
}

export interface ChargedPricePoint {
	periodStart: string;
	qty: number;
	revenue: number;
	// null when nothing sold in the bucket — a zero-filled period has no price.
	avgUnitPrice: number | null;
}

export interface PaidCostReceipt {
	at: string;
	unitCost: number;
	qty: number;
	// Stamped on the movement. A receipt is a single fact ("$18 per box on this date")
	// and stays truthful across a unit break, so the markers survive where the running
	// average can't — but only because each one names its own denomination now instead
	// of borrowing the item's current unit.
	unit: string;
	batchNumber: string | null;
}

export interface PriceHistory {
	cost: { current: number | null; points: PricePoint[] };
	price: { current: number | null; points: PricePoint[] };
	charged: { bucket: "week" | "month"; points: ChargedPricePoint[] };
	receipts: PaidCostReceipt[];
	// Empty on a unit break: the average divides spend by a quantity, and a plotted
	// line invites the eye to read a trend off it no matter what a note says.
	wac: { at: string; value: number }[];
	// Covers the two MOVEMENT-derived series only (receipts + wac). `cost` and `price`
	// are configured amounts off the item, not ledger aggregates, so a unit break says
	// nothing about them and they are returned untouched.
	unitBasis: UnitBasis;
	// receipts/withCost describe the requested window; wacBasisReceipts is how many
	// priced receipts the running average is built from — an average over ALL
	// history, only DISPLAYED for the window, so the same instant reads the same
	// on every range chip. Receipts with no recorded cost count here but are excluded from wac.
	costCoverage: { receipts: number; withCost: number; wacBasisReceipts: number };
	coverageStart: string | null;
	// Where the charged series starts, and whether older sales fell outside the
	// bucket cap. A leading zero-filled bucket is indistinguishable from a cut-off
	// one, so truncation is reported rather than inferred.
	chargedWindowStart: string;
	chargedTruncated: boolean;
	itemCreatedAt: string;
}

export interface ProvisionalItem {
	id: string;
	name: string;
	cost: number | null;
	unit_price: number | null;
	unit: string | null;
	provisional: boolean;
	created_at: string;
	created_by_tech: { id: string; name: string } | null;
	vehicle_stocks: Array<{
		qty_on_hand: number;
		vehicle: { id: string; name: string };
	}>;
}
