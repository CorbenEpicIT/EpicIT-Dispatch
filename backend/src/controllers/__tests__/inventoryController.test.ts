import * as XLSX from "xlsx";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getAllInventory,
	getLowStockInventory,
	scanInventoryByCode,
	resolveInventoryCode,
	ensureItemCode,
	createInventoryItem,
	updateInventoryItem,
	deleteInventoryItem,
	adjustInventoryStock,
	deductInventoryForVisit,
	updateInventoryThreshold,
	importInventoryFromFile,
	exportLowStockToXlsx,
	getInventoryImportTemplate,
	receiveInventoryItem,
	updateItemTracking,
	listItemSerials,
	listItemBatches,
	getItemTrackingSummary,
	updateBatch,
	deleteBatch,
	getBatchImpact,
	getSerialHistory,
	updateSerial,
	deleteSerial,
	getTrackingReconciliation,
} from "../inventoryController.js";
import { db } from "../../db.js";
import { sendEmail } from "../../services/emailService.js";
import { Prisma } from "../../../generated/prisma/client.js";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		inventory_item: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
		},
		serial_unit: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			count: vi.fn(),
			groupBy: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		stock_batch: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			count: vi.fn(),
			aggregate: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		vehicle_stock_batch: {
			findMany: vi.fn(),
			aggregate: vi.fn(),
			deleteMany: vi.fn(),
		},
		stock_movement: {
			findMany: vi.fn(),
		},
		stock_movement_batch: {
			findMany: vi.fn(),
			count: vi.fn(),
		},
		stock_movement_serial: {
			findMany: vi.fn(),
		},
		$transaction: vi.fn(),
		$extends,
	};
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/emailService.js", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// vi.mock factories are hoisted before imports. Use vi.hoisted so refs are
// available inside the factory AND in the test body (same identity = instanceof works).
const {
	mockRecordMovements,
	MockInsufficientStockError,
	mockGetOrCreateBatch,
	MockInsufficientBatchStockError,
	MockTrackingValidationError,
	mockLockInventoryRows,
} = vi.hoisted(() => {
	class MockInsufficientStockError extends Error {
		available: Record<string, number>;
		constructor(available: Record<string, number>) {
			super("Insufficient warehouse stock");
			this.name = "InsufficientStockError";
			this.available = available;
		}
	}
	class MockInsufficientBatchStockError extends Error {
		available: Record<string, number>;
		constructor(available: Record<string, number>) {
			super("Insufficient batch stock for requested allocations");
			this.name = "InsufficientBatchStockError";
			this.available = available;
		}
	}
	class MockTrackingValidationError extends Error {
		constructor(message: string) {
			super(message);
			this.name = "TrackingValidationError";
		}
	}
	return {
		mockRecordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [] }),
		MockInsufficientStockError,
		mockGetOrCreateBatch: vi.fn(),
		MockInsufficientBatchStockError,
		MockTrackingValidationError,
		mockLockInventoryRows: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock("../../services/stockMovements.js", () => ({
	recordMovements: mockRecordMovements,
	InsufficientStockError: MockInsufficientStockError,
	getOrCreateBatch: mockGetOrCreateBatch,
	InsufficientBatchStockError: MockInsufficientBatchStockError,
	TrackingValidationError: MockTrackingValidationError,
	lockInventoryRows: mockLockInventoryRows,
}));

const mockDb = vi.mocked(db);
const mockSendEmail = vi.mocked(sendEmail);

function makeItem(overrides: Record<string, unknown> = {}) {
	return {
		id: "item-1",
		name: "Test Widget",
		description: "A test widget",
		location: "Shelf A",
		quantity: 10,
		unit_price: null,
		cost: null,
		sku: null,
		is_active: true,
		is_serialized: false,
		is_batch_tracked: false,
		provisional: false,
		low_stock_threshold: null as number | null,
		image_urls: [] as string[],
		alt_ids: [] as string[],
		alert_emails_enabled: false,
		alert_email: null as string | null,
		organization_id: null,
		created_at: new Date("2026-01-01"),
		updated_at: new Date("2026-01-01"),
		_count: { visit_line_items: 0 },
		...overrides,
	};
}

// Sets up db.$transaction to execute the callback with a mock tx client
function setupTransaction() {
	const mockTx = {
		inventory_item: {
			create: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
		},
		item_external_mapping: {
			deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
		},
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
		fn(mockTx),
	);
	return mockTx;
}

describe("inventoryController", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordMovements.mockResolvedValue({ lowStockItemIds: [] });
		mockGetOrCreateBatch.mockReset();
		mockLockInventoryRows.mockResolvedValue(undefined);
	});

	// ---------------------------------------------------------------------------
	// Stock status (tested via returned items)
	// ---------------------------------------------------------------------------
	describe("stock status", () => {
		it("is null when no threshold is set", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([makeItem({ low_stock_threshold: null })]);
			const [item] = await getAllInventory();
			expect(item.stock_status).toBeNull();
		});

		it("is out_of_stock when quantity is 0", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 0, low_stock_threshold: 5 }),
			]);
			const [item] = await getAllInventory();
			expect(item.stock_status).toBe("out_of_stock");
		});

		it("is low when quantity is below threshold", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 3, low_stock_threshold: 5 }),
			]);
			const [item] = await getAllInventory();
			expect(item.stock_status).toBe("low");
		});

		it("is sufficient when quantity meets or exceeds threshold", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 5, low_stock_threshold: 5 }),
			]);
			const [item] = await getAllInventory();
			expect(item.stock_status).toBe("sufficient");
		});
	});

	// ---------------------------------------------------------------------------
	// getAllInventory
	// ---------------------------------------------------------------------------
	describe("getAllInventory", () => {
		it("queries only active items", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			await getAllInventory();
			expect(mockDb.inventory_item.findMany.mock.calls[0][0].where).toMatchObject({ is_active: true });
		});

		it("excludes provisional items from the catalog list", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			await getAllInventory("org-1");
			expect(mockDb.inventory_item.findMany.mock.calls[0][0].where).toMatchObject({ provisional: false });
		});

		it.each([
			["quantity_asc", { quantity: "asc" }],
			["quantity_desc", { quantity: "desc" }],
			["recently_added", { created_at: "desc" }],
			["most_used", { visit_line_items: { _count: "desc" } }],
			["name", { name: "asc" }],
			[undefined, { name: "asc" }],
		] as const)('applies "%s" sort correctly', async (sort, expectedOrderBy) => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			await getAllInventory("org-1", sort);
			expect(mockDb.inventory_item.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ orderBy: expectedOrderBy }),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// getLowStockInventory
	// ---------------------------------------------------------------------------
	describe("getLowStockInventory", () => {
		it("excludes sufficient items from results", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ id: "oos", quantity: 0, low_stock_threshold: 5 }),
				makeItem({ id: "low", quantity: 3, low_stock_threshold: 5 }),
				makeItem({ id: "ok", quantity: 10, low_stock_threshold: 5 }),
			]);
			const result = await getLowStockInventory();
			expect(result).toHaveLength(2);
			expect(result.map((i) => i.id)).not.toContain("ok");
		});

		it("sorts out_of_stock items before low items", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ id: "low", quantity: 2, low_stock_threshold: 5 }),
				makeItem({ id: "oos", quantity: 0, low_stock_threshold: 5 }),
			]);
			const result = await getLowStockInventory();
			expect(result[0].id).toBe("oos");
			expect(result[1].id).toBe("low");
		});
	});

	// ---------------------------------------------------------------------------
	// scanInventoryByCode
	// ---------------------------------------------------------------------------
	describe("scanInventoryByCode", () => {
		it("returns NOT_FOUND after trying barcode, sku, then alt_ids", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			const result = await scanInventoryByCode("org-1", "012345678905");
			expect(result.err).toBe("NOT_FOUND");
			expect(mockDb.inventory_item.findFirst).toHaveBeenCalledTimes(3);
		});

		it("excludes provisional items from every lookup branch", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			await scanInventoryByCode("org-1", "012345678905");
			expect(mockDb.inventory_item.findFirst.mock.calls).toHaveLength(3);
			for (const call of mockDb.inventory_item.findFirst.mock.calls) {
				expect(call[0].where).toMatchObject({ is_active: true, provisional: false });
			}
		});

		it("returns the item on a barcode hit without falling through to sku", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(
				makeItem({ barcode: "012345678905" }),
			);
			const result = await scanInventoryByCode("org-1", "012345678905");
			expect(result.err).toBe("");
			expect(result.item).toHaveProperty("stock_status");
			expect(mockDb.inventory_item.findFirst).toHaveBeenCalledTimes(1);
		});

		it("rejects an empty code without querying", async () => {
			const result = await scanInventoryByCode("org-1", "   ");
			expect(result.err).toBe("Empty code");
			expect(mockDb.inventory_item.findFirst).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// resolveInventoryCode
	// ---------------------------------------------------------------------------
	describe("resolveInventoryCode", () => {
		it("falls through to item lookup for an unprefixed code", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(
				makeItem({ barcode: "012345678905" }),
			);
			const result = await resolveInventoryCode("org-1", "012345678905");
			expect(result.err).toBe("");
			expect(result.type).toBe("item");
			expect(result.item).toHaveProperty("stock_status");
			// Regression: existing item-lookup-success path must never touch serial/batch tables.
			expect(mockDb.serial_unit.findFirst).not.toHaveBeenCalled();
			expect(mockDb.stock_batch.findFirst).not.toHaveBeenCalled();
		});

		it("rejects an empty code without querying", async () => {
			const result = await resolveInventoryCode("org-1", "   ");
			expect(result.err).toBe("Empty code");
			expect(mockDb.inventory_item.findFirst).not.toHaveBeenCalled();
		});

		// -------------------------------------------------------------------------
		// SN: prefix — serial resolution
		// -------------------------------------------------------------------------
		it("resolves an SN: prefixed code to the serial's parent item", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValueOnce({
				id: "su-1",
				code: "SU-7K2M9QWX",
				status: "in_warehouse",
				inventory_item_id: "item-1",
			});
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-1" }));

			const result = await resolveInventoryCode("org-1", "SN:SU-7K2M9QWX");

			expect(mockDb.serial_unit.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({ where: { code: "SU-7K2M9QWX" } }),
			);
			expect(result.err).toBe("");
			expect(result.type).toBe("serial");
			expect(result.serialUnitId).toBe("su-1");
			expect(result.code).toBe("SU-7K2M9QWX");
			expect(result.status).toBe("in_warehouse");
			expect(result.item).toHaveProperty("stock_status");
			// Never falls through to the item barcode/sku/alt_id lookup for a prefixed code.
			expect(mockDb.inventory_item.findFirst).toHaveBeenCalledTimes(1);
		});

		it("returns NOT_FOUND for an SN: prefixed code with no matching serial", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValueOnce(null);
			const result = await resolveInventoryCode("org-1", "SN:UNKNOWN");
			expect(result.err).toBe("NOT_FOUND");
			expect(mockDb.inventory_item.findFirst).not.toHaveBeenCalled();
		});

		it.each(["SN-SU-7K2M9QWX", "sn:SU-7K2M9QWX", "sn-SU-7K2M9QWX"])(
			"accepts lenient SN prefix variant %s",
			async (code) => {
				mockDb.serial_unit.findFirst.mockResolvedValueOnce({
					id: "su-1",
					code: "SU-7K2M9QWX",
					status: "in_warehouse",
					inventory_item_id: "item-1",
				});
				mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-1" }));

				const result = await resolveInventoryCode("org-1", code);

				expect(result.err).toBe("");
				expect(result.type).toBe("serial");
				expect(mockDb.serial_unit.findFirst).toHaveBeenCalledWith(
					expect.objectContaining({ where: { code: "SU-7K2M9QWX" } }),
				);
			},
		);

		// -------------------------------------------------------------------------
		// LOT: prefix — batch resolution
		// -------------------------------------------------------------------------
		it("resolves a LOT: prefixed code to the batch's parent item", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValueOnce({
				id: "batch-1",
				code: "LOT-2607-03",
				batch_number: "B-100",
				inventory_item_id: "item-1",
			});
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-1" }));

			const result = await resolveInventoryCode("org-1", "LOT:LOT-2607-03");

			expect(mockDb.stock_batch.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({ where: { code: "LOT-2607-03" } }),
			);
			expect(result.err).toBe("");
			expect(result.type).toBe("batch");
			expect(result.batchId).toBe("batch-1");
			expect(result.code).toBe("LOT-2607-03");
			expect(result.batchNumber).toBe("B-100");
			expect(result.item).toHaveProperty("stock_status");
		});

		it("returns NOT_FOUND for a LOT: prefixed code with no matching batch", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValueOnce(null);
			const result = await resolveInventoryCode("org-1", "LOT:UNKNOWN");
			expect(result.err).toBe("NOT_FOUND");
			expect(mockDb.inventory_item.findFirst).not.toHaveBeenCalled();
		});

		it.each(["LOT-2607-03", "lot:2607-03", "lot-2607-03"])(
			"accepts lenient LOT prefix variant %s",
			async (code) => {
				const stripped = code.replace(/^lot[-:]/i, "");
				mockDb.stock_batch.findFirst.mockResolvedValueOnce({
					id: "batch-1",
					code: stripped,
					batch_number: "B-100",
					inventory_item_id: "item-1",
				});
				mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-1" }));

				const result = await resolveInventoryCode("org-1", code);

				expect(result.err).toBe("");
				expect(result.type).toBe("batch");
				expect(mockDb.stock_batch.findFirst).toHaveBeenCalledWith(
					expect.objectContaining({ where: { code: stripped } }),
				);
			},
		);

		// -------------------------------------------------------------------------
		// Unprefixed fallback — raw serial_number / batch_number exact match
		// -------------------------------------------------------------------------
		it("falls back to a raw serial_number match when the item lookup misses", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // barcode
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // sku
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // alt_ids
			mockDb.serial_unit.findFirst.mockResolvedValueOnce({
				id: "su-9",
				code: "SU-XYZ",
				status: "on_vehicle",
				inventory_item_id: "item-2",
			});
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-2" }));

			const result = await resolveInventoryCode("org-1", "RAW-SERIAL-1");

			expect(mockDb.serial_unit.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({ where: { serial_number: "RAW-SERIAL-1" } }),
			);
			expect(result.err).toBe("");
			expect(result.type).toBe("serial");
			expect(result.serialUnitId).toBe("su-9");
		});

		it("falls back to a raw batch_number match when item and serial lookups miss", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // barcode
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // sku
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(null); // alt_ids
			mockDb.serial_unit.findFirst.mockResolvedValueOnce(null);
			mockDb.stock_batch.findFirst.mockResolvedValueOnce({
				id: "batch-9",
				code: "LOT-RAW",
				batch_number: "RAW-BATCH-1",
				inventory_item_id: "item-3",
			});
			mockDb.inventory_item.findFirst.mockResolvedValueOnce(makeItem({ id: "item-3" }));

			const result = await resolveInventoryCode("org-1", "RAW-BATCH-1");

			expect(mockDb.stock_batch.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({ where: { batch_number: "RAW-BATCH-1" } }),
			);
			expect(result.err).toBe("");
			expect(result.type).toBe("batch");
			expect(result.batchId).toBe("batch-9");
		});

		it("returns NOT_FOUND when item, serial, and batch fallbacks all miss", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			mockDb.serial_unit.findFirst.mockResolvedValueOnce(null);
			mockDb.stock_batch.findFirst.mockResolvedValueOnce(null);

			const result = await resolveInventoryCode("org-1", "unknown-code");
			expect(result.err).toBe("NOT_FOUND");
		});
	});

	// ---------------------------------------------------------------------------
	// listItemSerials
	// ---------------------------------------------------------------------------
	describe("listItemSerials", () => {
		it("returns not found for a cross-org item id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			const result = await listItemSerials("missing", {}, "org-1");
			expect(result.err).toBe("Inventory item not found");
			expect(mockDb.serial_unit.findMany).not.toHaveBeenCalled();
		});

		it("filters by status", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.findMany.mockResolvedValue([]);

			await listItemSerials("item-1", { status: "on_vehicle" }, "org-1");

			expect(mockDb.serial_unit.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ inventory_item_id: "item-1", status: "on_vehicle" }),
				}),
			);
		});

		it("filters by vehicle_id (current_vehicle_id)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.findMany.mockResolvedValue([]);
			const vehicleId = "33333333-3333-4333-8333-333333333333";

			await listItemSerials("item-1", { vehicle_id: vehicleId }, "org-1");

			expect(mockDb.serial_unit.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ current_vehicle_id: vehicleId }),
				}),
			);
		});

		it("returns a nextCursor when more rows exist than the page size", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			const rows = Array.from({ length: 26 }, (_, i) => ({ id: `su-${i}` }));
			mockDb.serial_unit.findMany.mockResolvedValue(rows);

			const result = await listItemSerials("item-1", {}, "org-1");

			expect(result.serials).toHaveLength(25);
			expect(result.nextCursor).toBe("su-24");
		});

		it("returns a null nextCursor on the last page", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.findMany.mockResolvedValue([{ id: "su-0" }, { id: "su-1" }]);

			const result = await listItemSerials("item-1", {}, "org-1");

			expect(result.nextCursor).toBeNull();
		});

		it("passes the cursor through as a Prisma cursor/skip pair", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.findMany.mockResolvedValue([]);

			await listItemSerials("item-1", { cursor: "su-24" }, "org-1");

			expect(mockDb.serial_unit.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ cursor: { id: "su-24" }, skip: 1 }),
			);
		});

		it("returns a validation error for an invalid status value", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			const result = await listItemSerials("item-1", { status: "bogus" }, "org-1");
			expect(result.err).toMatch(/Validation failed/);
			expect(mockDb.serial_unit.findMany).not.toHaveBeenCalled();
		});

		it("filters by a case-insensitive search on serial_number/code", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.findMany.mockResolvedValue([]);

			await listItemSerials("item-1", { search: "SN-42" }, "org-1");

			expect(mockDb.serial_unit.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: [
							{ serial_number: { contains: "SN-42", mode: "insensitive" } },
							{ code: { contains: "SN-42", mode: "insensitive" } },
						],
					}),
				}),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// listItemBatches
	// ---------------------------------------------------------------------------
	describe("listItemBatches", () => {
		it("returns not found for a cross-org item id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			const result = await listItemBatches("missing", "org-1");
			expect(result.err).toBe("Inventory item not found");
			expect(mockDb.stock_batch.findMany).not.toHaveBeenCalled();
		});

		it("returns per-vehicle breakdown and plain-number Decimal fields", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			const decimalLike = (n: number) => ({ valueOf: () => n, toString: () => String(n) });
			mockDb.stock_batch.findMany.mockResolvedValue([
				{
					id: "batch-1",
					code: "LOT-AAA",
					batch_number: "B-1",
					expires_at: new Date("2027-01-01"),
					supplier: "Acme",
					recalled_at: null,
					qty_received: decimalLike(50),
					qty_in_warehouse: decimalLike(20),
					vehicle_batches: [
						{
							vehicle_id: "veh-1",
							qty_on_hand: decimalLike(15),
							vehicle: { id: "veh-1", name: "Van 1" },
						},
					],
				},
			]);

			const result = await listItemBatches("item-1", "org-1");

			expect(result.err).toBe("");
			expect(result.batches).toEqual([
				{
					id: "batch-1",
					code: "LOT-AAA",
					batch_number: "B-1",
					expires_at: "2027-01-01T00:00:00.000Z",
					supplier: "Acme",
					recalled_at: null,
					qty_received: 50,
					qty_in_warehouse: 20,
					vehicles: [{ vehicle_id: "veh-1", vehicle_name: "Van 1", qty_on_hand: 15 }],
				},
			]);
			expect(typeof result.batches![0].qty_received).toBe("number");
			expect(typeof result.batches![0].vehicles[0].qty_on_hand).toBe("number");
		});

		it("orders batches FIFO (received_at ascending)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.stock_batch.findMany.mockResolvedValue([]);

			await listItemBatches("item-1", "org-1");

			expect(mockDb.stock_batch.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ orderBy: { received_at: "asc" } }),
			);
		});

		it("filters by a case-insensitive search on batch_number/code", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.stock_batch.findMany.mockResolvedValue([]);

			await listItemBatches("item-1", "org-1", { search: "LOT-9" });

			expect(mockDb.stock_batch.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						OR: [
							{ batch_number: { contains: "LOT-9", mode: "insensitive" } },
							{ code: { contains: "LOT-9", mode: "insensitive" } },
						],
					}),
				}),
			);
		});

		it("returns a validation error for an invalid search query shape", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			const result = await listItemBatches("item-1", "org-1", { search: 123 });
			expect(result.err).toMatch(/Validation failed/);
			expect(mockDb.stock_batch.findMany).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// updateBatch
	// ---------------------------------------------------------------------------
	describe("updateBatch", () => {
		function makeBatch(overrides: Record<string, unknown> = {}) {
			return {
				id: "batch-1",
				code: "LOT-AAA",
				batch_number: "B-1",
				expires_at: null,
				supplier: null,
				note: null,
				recalled_at: null,
				qty_received: { valueOf: () => 50, toString: () => "50" },
				qty_in_warehouse: { valueOf: () => 20, toString: () => "20" },
				...overrides,
			};
		}

		it("returns not found for a cross-org batch id", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(null);
			const result = await updateBatch("missing", { recalled: true }, "org-1");
			expect(result.err).toBe("Batch not found");
			expect(mockDb.stock_batch.update).not.toHaveBeenCalled();
		});

		it("sets recalled_at when toggling recalled true", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch());
			mockDb.stock_batch.update.mockResolvedValue(makeBatch({ recalled_at: new Date("2026-07-14") }));

			const result = await updateBatch("batch-1", { recalled: true }, "org-1");

			expect(result.err).toBeUndefined();
			expect(mockDb.stock_batch.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "batch-1" },
					data: expect.objectContaining({ recalled_at: expect.any(Date) }),
				}),
			);
			expect((result.batch as { recalled_at: string }).recalled_at).toBe("2026-07-14T00:00:00.000Z");
		});

		it("clears recalled_at when toggling recalled false", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch({ recalled_at: new Date("2026-07-01") }));
			mockDb.stock_batch.update.mockResolvedValue(makeBatch({ recalled_at: null }));

			await updateBatch("batch-1", { recalled: false }, "org-1");

			expect(mockDb.stock_batch.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ recalled_at: null }) }),
			);
		});

		it("returns a validation error for a malformed body", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch());
			const result = await updateBatch("batch-1", { expires_at: "not-a-date" }, "org-1");
			expect(result.err).toMatch(/Validation failed/);
			expect(mockDb.stock_batch.update).not.toHaveBeenCalled();
		});

		it("renames the lot (batch_number) via a direct metadata update", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch());
			mockDb.stock_batch.update.mockResolvedValue(makeBatch({ batch_number: "LOT-99" }));

			const result = await updateBatch("batch-1", { batch_number: "LOT-99" }, "org-1");

			expect(result.err).toBeUndefined();
			expect(mockDb.stock_batch.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: "batch-1" },
					data: expect.objectContaining({ batch_number: "LOT-99" }),
				}),
			);
			expect((result.batch as { batch_number: string }).batch_number).toBe("LOT-99");
			// No quantity fields touched — stock is recordMovements-only.
			const data = mockDb.stock_batch.update.mock.calls[0][0].data;
			expect(data).not.toHaveProperty("qty_in_warehouse");
			expect(data).not.toHaveProperty("qty_received");
		});

		it("updates supplier and expires_at (nullable) directly", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch());
			mockDb.stock_batch.update.mockResolvedValue(
				makeBatch({ supplier: "Acme Supply", expires_at: null }),
			);

			const result = await updateBatch(
				"batch-1",
				{ supplier: "Acme Supply", expires_at: null },
				"org-1",
			);

			expect(result.err).toBeUndefined();
			expect(mockDb.stock_batch.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ supplier: "Acme Supply", expires_at: null }),
				}),
			);
			expect((result.batch as { supplier: string }).supplier).toBe("Acme Supply");
		});

		it("maps a batch_number unique conflict to a clean error, not a 500", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(makeBatch());
			const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
				code: "P2002",
				clientVersion: "0.0.0",
				meta: { target: ["organization_id", "inventory_item_id", "batch_number"] },
			});
			mockDb.stock_batch.update.mockRejectedValueOnce(conflict);

			const result = await updateBatch("batch-1", { batch_number: "DUP" }, "org-1");

			expect(result.err).toMatch(/already in use/i);
		});
	});

	// ---------------------------------------------------------------------------
	// deleteBatch
	// ---------------------------------------------------------------------------
	describe("deleteBatch", () => {
		function makeBatch(overrides: Record<string, unknown> = {}) {
			return {
				id: "batch-1",
				code: "LOT-AAA",
				batch_number: "B-1",
				inventory_item_id: "item-1",
				qty_in_warehouse: { valueOf: () => 0, toString: () => "0" },
				vehicle_batches: [] as { id: string; qty_on_hand: { valueOf: () => number } }[],
				_count: { serial_units: 0 },
				...overrides,
			};
		}

		// The guards now run INSIDE the tx against the LOCKED re-read, so the tx
		// mock owns the batch re-read (stock_batch.findFirst), the movement-history
		// count, and $queryRaw (the row lock). `lockedBatch` is what the re-read
		// returns; `movementJoins` is the strict-policy count.
		function setupBatchTransaction(lockedBatch: unknown, movementJoins = 0) {
			const mockTx = {
				$queryRaw: vi.fn().mockResolvedValue([]),
				stock_batch: {
					findFirst: vi.fn().mockResolvedValue(lockedBatch),
					delete: vi.fn(),
				},
				stock_movement_batch: { count: vi.fn().mockResolvedValue(movementJoins) },
				vehicle_stock_batch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
				fn(mockTx),
			);
			return mockTx;
		}

		it("returns not found for a cross-org batch id", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(null);

			const result = await deleteBatch("missing", "org-1");

			expect(result.err).toBe("Batch not found");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("deletes an empty, reference-free lot without any stock movement", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(makeBatch(), 0);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toBe("");
			// Row lock acquired before the guards re-read.
			expect(tx.$queryRaw).toHaveBeenCalled();
			expect(tx.stock_batch.delete).toHaveBeenCalledWith({ where: { id: "batch-1" } });
			// Empty batch → NO compensating movement (unlike deleteSerial).
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("clears residual zero-qty vehicle_stock_batch rows before deleting", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(
				makeBatch({
					vehicle_batches: [{ id: "vsb-1", qty_on_hand: { valueOf: () => 0, toString: () => "0" } }],
				}),
				0,
			);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toBe("");
			expect(tx.vehicle_stock_batch.deleteMany).toHaveBeenCalledWith({
				where: { batch_id: "batch-1" },
			});
			expect(tx.stock_batch.delete).toHaveBeenCalledOnce();
		});

		it("refuses to delete a batch with warehouse stock", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(
				makeBatch({ qty_in_warehouse: { valueOf: () => 12, toString: () => "12" } }),
				0,
			);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toMatch(/12 unit\(s\) still in the warehouse/);
			expect(tx.stock_batch.delete).not.toHaveBeenCalled();
		});

		it("refuses to delete a batch still held on a vehicle", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(
				makeBatch({
					vehicle_batches: [{ id: "vsb-1", qty_on_hand: { valueOf: () => 4, toString: () => "4" } }],
				}),
				0,
			);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toMatch(/still held on a vehicle/);
			expect(tx.stock_batch.delete).not.toHaveBeenCalled();
		});

		it("refuses to delete a batch with associated serial units (SET NULL guard)", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(makeBatch({ _count: { serial_units: 3 } }), 0);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toMatch(/serial units/i);
			expect(tx.stock_batch.delete).not.toHaveBeenCalled();
		});

		// STRICT policy (Decision 1): ANY movement-history join blocks the delete,
		// not just "consumed" — the join IS the recall/audit trail. count() is now
		// keyed on batch_id alone (no to_location_type filter).
		it("refuses to delete a batch with ANY movement history (strict policy)", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(makeBatch(), 1);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toMatch(/movement history/i);
			expect(tx.stock_movement_batch.count).toHaveBeenCalledWith({ where: { batch_id: "batch-1" } });
			expect(tx.stock_batch.delete).not.toHaveBeenCalled();
		});

		// TOCTOU: the pre-tx existence check passes, but the LOCKED re-read inside
		// the tx sees a concurrent warehouse bump → delete is rejected.
		it("re-checks guards against the locked row so a concurrent bump is rejected (TOCTOU)", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({ id: "batch-1", inventory_item_id: "item-1" });
			const tx = setupBatchTransaction(
				makeBatch({ qty_in_warehouse: { valueOf: () => 5, toString: () => "5" } }),
				0,
			);

			const result = await deleteBatch("batch-1", "org-1");

			expect(result.err).toMatch(/still in the warehouse/);
			expect(tx.$queryRaw).toHaveBeenCalled(); // lock acquired first
			expect(tx.stock_batch.delete).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// getBatchImpact
	// ---------------------------------------------------------------------------
	describe("getBatchImpact", () => {
		it("returns not found for a cross-org batch id", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue(null);
			const result = await getBatchImpact("missing", "org-1");
			expect(result.err).toBe("Batch not found");
		});

		it("nets consumed vs. reversed qty by visit_line_item_id", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({
				id: "batch-1",
				code: "LOT-AAA",
				batch_number: "B-1",
				expires_at: null,
				recalled_at: null,
				qty_in_warehouse: { valueOf: () => 5, toString: () => "5" },
				inventory_item: { id: "item-1", name: "Widget", is_serialized: false },
				vehicle_batches: [],
			});
			mockDb.serial_unit.findMany.mockResolvedValue([]);
			const job = { id: "job-1", job_number: "J-1", name: "Furnace repair", client: { id: "client-1", name: "Acme" } };
			const visit = { id: "visit-1", name: "Visit 1", job };
			const lineItem = { id: "li-1", name: "Filter" };
			mockDb.stock_movement_batch.findMany.mockResolvedValue([
				{
					qty: { valueOf: () => 3, toString: () => "3" },
					movement: { reason: "parts_used", to_location_type: "consumed", visit_line_item: lineItem, visit },
				},
				{
					qty: { valueOf: () => 1, toString: () => "1" },
					movement: { reason: "reversal", to_location_type: "vehicle", visit_line_item: lineItem, visit },
				},
			]);

			const result = await getBatchImpact("batch-1", "org-1");

			expect(result.err).toBe("");
			expect(result.affected_jobs).toEqual([
				expect.objectContaining({
					visit_line_item_id: "li-1",
					consumed_qty: 3,
					reversed_qty: 1,
					net_qty: 2,
					fully_reversed: false,
					client_name: "Acme",
					job_number: "J-1",
				}),
			]);
		});

		it("reads consumed-status serial units directly for serialized batches (no netting)", async () => {
			mockDb.stock_batch.findFirst.mockResolvedValue({
				id: "batch-1",
				code: "LOT-AAA",
				batch_number: "B-1",
				expires_at: null,
				recalled_at: null,
				qty_in_warehouse: { valueOf: () => 0, toString: () => "0" },
				inventory_item: { id: "item-1", name: "Compressor", is_serialized: true },
				vehicle_batches: [],
			});
			mockDb.stock_movement_batch.findMany.mockResolvedValue([]);
			mockDb.serial_unit.findMany.mockResolvedValue([
				{
					id: "su-1",
					code: "SU-1",
					serial_number: "SN1",
					consumed_at: new Date("2026-07-01"),
					client: { id: "client-1", name: "Acme" },
					consumed_visit: { id: "visit-1", name: "Visit 1", job: { id: "job-1", job_number: "J-1", name: "Repair" } },
				},
			]);

			const result = await getBatchImpact("batch-1", "org-1");

			expect(mockDb.serial_unit.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ where: expect.objectContaining({ batch_id: "batch-1", status: "consumed" }) }),
			);
			expect(result.affected_serials).toHaveLength(1);
			expect(result.affected_serials![0].client?.name).toBe("Acme");
		});
	});

	// ---------------------------------------------------------------------------
	// getSerialHistory
	// ---------------------------------------------------------------------------
	describe("getSerialHistory", () => {
		it("returns not found for a cross-org serial id", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(null);
			const result = await getSerialHistory("missing", "org-1");
			expect(result.err).toBe("Serial unit not found");
		});

		it("orders the timeline chronologically", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue({
				id: "su-1",
				code: "SU-1",
				serial_number: "SN1",
				status: "on_vehicle",
				inventory_item: { id: "item-1", name: "Widget" },
				current_vehicle: { id: "veh-1", name: "Van 1" },
				batch: null,
				received_at: new Date("2026-01-01"),
				consumed_at: null,
				client: null,
				consumed_visit: null,
				note: null,
			});
			mockDb.stock_movement_serial.findMany.mockResolvedValue([
				{
					movement: {
						id: "mv-2",
						reason: "restock",
						from_location_type: "warehouse",
						from_vehicle: null,
						to_location_type: "vehicle",
						to_vehicle: { id: "veh-1", name: "Van 1" },
						note: null,
						actor_type: "dispatcher",
						created_at: new Date("2026-01-05"),
						visit: null,
					},
				},
				{
					movement: {
						id: "mv-1",
						reason: "receive",
						from_location_type: "external",
						from_vehicle: null,
						to_location_type: "warehouse",
						to_vehicle: null,
						note: null,
						actor_type: "dispatcher",
						created_at: new Date("2026-01-01"),
						visit: null,
					},
				},
			]);

			const result = await getSerialHistory("su-1", "org-1");

			expect(result.timeline!.map((t) => t.id)).toEqual(["mv-1", "mv-2"]);
		});
	});

	// ---------------------------------------------------------------------------
	// updateSerial
	// ---------------------------------------------------------------------------
	describe("updateSerial", () => {
		function makeSerial(overrides: Record<string, unknown> = {}) {
			return {
				id: "su-1",
				code: "SU-AAA",
				serial_number: "SN1",
				status: "in_warehouse",
				inventory_item_id: "item-1",
				current_vehicle_id: null,
				consumed_at: null,
				note: null,
				...overrides,
			};
		}

		function setupSerialTransaction() {
			const mockTx = {
				serial_unit: {
					update: vi.fn(),
					findFirst: vi.fn(),
					delete: vi.fn(),
				},
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
				fn(mockTx),
			);
			return mockTx;
		}

		it("returns not found for a cross-org serial id", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(null);

			const result = await updateSerial("missing", { note: "x" }, "org-1");

			expect(result.err).toBe("Serial unit not found");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("returns a validation error for an empty body", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial());

			const result = await updateSerial("su-1", {}, "org-1");

			expect(result.err).toMatch(/Validation failed/);
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("edits the note without recording a movement", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial());
			const tx = setupSerialTransaction();
			tx.serial_unit.findFirst.mockResolvedValue(makeSerial({ note: "damaged box" }));

			const result = await updateSerial("su-1", { note: "damaged box" }, "org-1");

			expect(result.err).toBe("");
			expect(tx.serial_unit.update).toHaveBeenCalledWith({
				where: { id: "su-1" },
				data: { note: "damaged box" },
			});
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("records a loss movement when status is lost", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial());
			const tx = setupSerialTransaction();
			tx.serial_unit.findFirst.mockResolvedValue(makeSerial({ status: "lost" }));

			const result = await updateSerial("su-1", { status: "lost" }, "org-1");

			expect(result.err).toBe("");
			expect(mockRecordMovements).toHaveBeenCalledOnce();
			const movement = mockRecordMovements.mock.calls[0][3][0];
			expect(movement).toMatchObject({
				inventory_item_id: "item-1",
				qty: 1,
				from_location_type: "warehouse",
				to_location_type: "adjustment",
				reason: "loss",
				serial: { unit_ids: ["su-1"] },
			});
		});

		it("records an external audit_correction movement when status is returned", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial());
			const tx = setupSerialTransaction();
			tx.serial_unit.findFirst.mockResolvedValue(makeSerial({ status: "returned" }));

			const result = await updateSerial("su-1", { status: "returned" }, "org-1");

			expect(result.err).toBe("");
			const movement = mockRecordMovements.mock.calls[0][3][0];
			expect(movement).toMatchObject({
				qty: 1,
				from_location_type: "warehouse",
				to_location_type: "external",
				reason: "audit_correction",
				serial: { unit_ids: ["su-1"] },
			});
		});

		it("rejects a status change on a non-in_warehouse unit without recording a movement", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial({ status: "on_vehicle" }));
			setupSerialTransaction();

			const result = await updateSerial("su-1", { status: "lost" }, "org-1");

			expect(result.err).toMatch(/Only in-warehouse units/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// deleteSerial
	// ---------------------------------------------------------------------------
	describe("deleteSerial", () => {
		function makeSerial(overrides: Record<string, unknown> = {}) {
			return {
				id: "su-1",
				code: "SU-AAA",
				serial_number: "SN1",
				status: "in_warehouse",
				inventory_item_id: "item-1",
				current_vehicle_id: null,
				consumed_at: null,
				note: null,
				movement_serials: [{ movement: { reason: "receive" } }],
				...overrides,
			};
		}

		// Eligibility is now computed from the LOCKED re-read inside the tx, so the
		// tx mock owns serial_unit.findFirst (the re-read) and $queryRaw (the lock).
		function setupSerialTransaction(lockedSerial: unknown) {
			const mockTx = {
				$queryRaw: vi.fn().mockResolvedValue([]),
				serial_unit: {
					update: vi.fn(),
					findFirst: vi.fn().mockResolvedValue(lockedSerial),
					delete: vi.fn(),
				},
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
				fn(mockTx),
			);
			return mockTx;
		}

		it("returns not found for a cross-org serial id", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(null);

			const result = await deleteSerial("missing", "org-1");

			expect(result.err).toBe("Serial unit not found");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("deletes an eligible never-moved unit after a compensating movement", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue({
				id: "su-1",
				inventory_item_id: "item-1",
				serial_number: "SN1",
			});
			const tx = setupSerialTransaction(makeSerial());

			const result = await deleteSerial("su-1", "org-1");

			expect(result.err).toBe("");
			expect(tx.$queryRaw).toHaveBeenCalled(); // lock acquired before eligibility read
			expect(mockRecordMovements).toHaveBeenCalledOnce();
			const movement = mockRecordMovements.mock.calls[0][3][0];
			expect(movement).toMatchObject({
				inventory_item_id: "item-1",
				qty: 1,
				from_location_type: "warehouse",
				to_location_type: "adjustment",
				reason: "audit_correction",
				serial: { unit_ids: ["su-1"] },
			});
			expect(tx.serial_unit.delete).toHaveBeenCalledWith({ where: { id: "su-1" } });
		});

		it("refuses to delete an on-vehicle unit", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue({ id: "su-1", inventory_item_id: "item-1" });
			const tx = setupSerialTransaction(
				makeSerial({ status: "on_vehicle", current_vehicle_id: "veh-1" }),
			);

			const result = await deleteSerial("su-1", "org-1");

			expect(result.err).toMatch(/never-moved, in-warehouse/);
			expect(tx.serial_unit.delete).not.toHaveBeenCalled();
		});

		it("refuses to delete a consumed unit", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue({ id: "su-1", inventory_item_id: "item-1" });
			const tx = setupSerialTransaction(
				makeSerial({ status: "consumed", consumed_at: new Date("2026-07-01") }),
			);

			const result = await deleteSerial("su-1", "org-1");

			expect(result.err).toMatch(/never-moved, in-warehouse/);
			expect(tx.serial_unit.delete).not.toHaveBeenCalled();
		});

		it("refuses to delete a unit with a movement beyond its initial receive", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue({ id: "su-1", inventory_item_id: "item-1" });
			const tx = setupSerialTransaction(
				makeSerial({
					movement_serials: [
						{ movement: { reason: "receive" } },
						{ movement: { reason: "restock" } },
					],
				}),
			);

			const result = await deleteSerial("su-1", "org-1");

			expect(result.err).toMatch(/never-moved, in-warehouse/);
			expect(tx.serial_unit.delete).not.toHaveBeenCalled();
		});

		// TOCTOU: the pre-tx snapshot looks eligible (a lone receive), but the
		// LOCKED re-read inside the tx shows a concurrently-added restock movement,
		// so eligibility — computed from the locked read — rejects the delete.
		it("rejects a unit that gains a non-initial movement between the pre-tx read and the lock (TOCTOU)", async () => {
			mockDb.serial_unit.findFirst.mockResolvedValue(makeSerial());
			const tx = setupSerialTransaction(
				makeSerial({
					movement_serials: [
						{ movement: { reason: "receive" } },
						{ movement: { reason: "restock" } },
					],
				}),
			);

			const result = await deleteSerial("su-1", "org-1");

			expect(result.err).toMatch(/never-moved, in-warehouse/);
			expect(tx.$queryRaw).toHaveBeenCalled();
			expect(mockRecordMovements).not.toHaveBeenCalled();
			expect(tx.serial_unit.delete).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// getTrackingReconciliation
	// ---------------------------------------------------------------------------
	describe("getTrackingReconciliation", () => {
		it("flags a warehouse serial-count drift against inventory_item.quantity", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				{
					id: "item-1",
					name: "Widget",
					quantity: 10,
					is_serialized: true,
					is_batch_tracked: false,
					vehicle_stocks: [],
				},
			]);
			mockDb.serial_unit.groupBy.mockResolvedValue([
				{ inventory_item_id: "item-1", status: "in_warehouse", current_vehicle_id: null, _count: { id: 8 } },
			]);
			mockDb.stock_movement.findMany.mockResolvedValue([]);

			const result = await getTrackingReconciliation("org-1");

			expect(result.drifts).toEqual([
				expect.objectContaining({ item_id: "item-1", scope: "warehouse", expected: 10, actual: 8 }),
			]);
		});

		it("returns no drift when serial count matches quantity", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				{
					id: "item-1",
					name: "Widget",
					quantity: 10,
					is_serialized: true,
					is_batch_tracked: false,
					vehicle_stocks: [],
				},
			]);
			mockDb.serial_unit.groupBy.mockResolvedValue([
				{ inventory_item_id: "item-1", status: "in_warehouse", current_vehicle_id: null, _count: { id: 10 } },
			]);
			mockDb.stock_movement.findMany.mockResolvedValue([]);

			const result = await getTrackingReconciliation("org-1");

			expect(result.drifts).toEqual([]);
		});

		it("defaults a vehicle scope to actual:0 when groupBy has no row for it (zero-count drift)", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				{
					id: "item-1",
					name: "Widget",
					quantity: 0,
					is_serialized: true,
					is_batch_tracked: false,
					vehicle_stocks: [
						{ vehicle_id: "veh-1", qty_on_hand: 3, vehicle: { name: "Truck 1" } },
					],
				},
			]);
			// No groupBy rows at all for item-1/on_vehicle/veh-1 — simulates the
			// zero-serial-rows case, which must still surface as actual: 0.
			mockDb.serial_unit.groupBy.mockResolvedValue([]);
			mockDb.stock_movement.findMany.mockResolvedValue([]);

			const result = await getTrackingReconciliation("org-1");

			expect(result.drifts).toEqual([
				expect.objectContaining({
					item_id: "item-1",
					scope: "vehicle",
					vehicle_id: "veh-1",
					expected: 3,
					actual: 0,
				}),
			]);
			expect(mockDb.serial_unit.groupBy).toHaveBeenCalledTimes(1);
			expect(mockDb.serial_unit.count).not.toHaveBeenCalled();
		});

		it("issues one groupBy call regardless of item count (no N+1)", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				{ id: "item-1", name: "A", quantity: 5, is_serialized: true, is_batch_tracked: false, vehicle_stocks: [] },
				{ id: "item-2", name: "B", quantity: 5, is_serialized: true, is_batch_tracked: false, vehicle_stocks: [] },
				{ id: "item-3", name: "C", quantity: 5, is_serialized: true, is_batch_tracked: false, vehicle_stocks: [] },
			]);
			mockDb.serial_unit.groupBy.mockResolvedValue([
				{ inventory_item_id: "item-1", status: "in_warehouse", current_vehicle_id: null, _count: { id: 5 } },
				{ inventory_item_id: "item-2", status: "in_warehouse", current_vehicle_id: null, _count: { id: 5 } },
				{ inventory_item_id: "item-3", status: "in_warehouse", current_vehicle_id: null, _count: { id: 5 } },
			]);
			mockDb.stock_movement.findMany.mockResolvedValue([]);

			const result = await getTrackingReconciliation("org-1");

			expect(result.drifts).toEqual([]);
			expect(mockDb.serial_unit.groupBy).toHaveBeenCalledTimes(1);
		});

		it("surfaces [TRACKING_GAP] movements", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			mockDb.stock_movement.findMany.mockResolvedValue([
				{
					id: "mv-1",
					inventory_item: { id: "item-1", name: "Widget" },
					qty: { valueOf: () => 2, toString: () => "2" },
					reason: "parts_used",
					note: "[TRACKING_GAP]",
					created_at: new Date("2026-07-10"),
					visit: null,
				},
			]);

			const result = await getTrackingReconciliation("org-1");

			expect(result.gaps).toHaveLength(1);
			expect(result.gaps![0].note).toBe("[TRACKING_GAP]");
			expect(mockDb.stock_movement.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ where: { note: { contains: "[TRACKING_GAP]" } } }),
			);
		});
	});

	// ---------------------------------------------------------------------------
	// ensureItemCode
	// ---------------------------------------------------------------------------
	describe("ensureItemCode", () => {
		it("returns the item unchanged when it already has a barcode", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ barcode: "EXISTING" }));
			const result = await ensureItemCode("item-1", "org-1");
			expect(result.err).toBeUndefined();
			expect((result.item as { barcode: string }).barcode).toBe("EXISTING");
			expect(mockDb.inventory_item.updateMany).not.toHaveBeenCalled();
		});

		it("assigns an ITM- code when the item has no barcode", async () => {
			mockDb.inventory_item.findFirst
				.mockResolvedValueOnce(makeItem({ barcode: null }))
				.mockResolvedValueOnce(makeItem({ barcode: "ITM-ABCDEFGH" }));
			mockDb.inventory_item.updateMany.mockResolvedValue({ count: 1 });
			const result = await ensureItemCode("item-1", "org-1");
			expect(result.err).toBeUndefined();
			expect(mockDb.inventory_item.updateMany).toHaveBeenCalledTimes(1);
			expect(mockDb.inventory_item.updateMany.mock.calls[0][0].where).toMatchObject({ barcode: null });
			expect((result.item as { barcode: string }).barcode).toMatch(/^ITM-/);
		});

		it("retries the write on a barcode unique-conflict then succeeds", async () => {
			mockDb.inventory_item.findFirst
				.mockResolvedValueOnce(makeItem({ barcode: null }))
				.mockResolvedValueOnce(makeItem({ barcode: "ITM-ABCDEFGH" }));
			const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
				code: "P2002",
				clientVersion: "0.0.0",
				meta: { target: ["organization_id", "barcode"] },
			});
			mockDb.inventory_item.updateMany
				.mockRejectedValueOnce(conflict)
				.mockResolvedValueOnce({ count: 1 });
			const result = await ensureItemCode("item-1", "org-1");
			expect(result.err).toBeUndefined();
			expect(mockDb.inventory_item.updateMany).toHaveBeenCalledTimes(2);
			expect((result.item as { barcode: string }).barcode).toMatch(/^ITM-/);
		});

		it("returns the winning barcode when a concurrent call already claimed it (lost race)", async () => {
			mockDb.inventory_item.findFirst
				.mockResolvedValueOnce(makeItem({ barcode: null }))
				.mockResolvedValueOnce(makeItem({ barcode: "ITM-WINNER1" }));
			mockDb.inventory_item.updateMany.mockResolvedValue({ count: 0 });
			const result = await ensureItemCode("item-1", "org-1");
			expect(result.err).toBeUndefined();
			expect((result.item as { barcode: string }).barcode).toBe("ITM-WINNER1");
		});

		it("returns not found for a missing item", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			const result = await ensureItemCode("item-1", "org-1");
			expect(result.err).toBe("Inventory item not found");
		});
	});

	// ---------------------------------------------------------------------------
	// createInventoryItem
	// ---------------------------------------------------------------------------
	describe("createInventoryItem", () => {
		it("creates item and returns it with stock_status", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ name: "Filter", location: "Warehouse" }));

			const result = await createInventoryItem({ name: "Filter", location: "Warehouse" });

			expect(result.err).toBe("");
			expect(result.item).toMatchObject({ name: "Filter", stock_status: null });
		});

		it.each([
			["missing name", { location: "Shelf A" }],
			["missing location", { name: "Widget" }],
			["negative quantity", { name: "Widget", location: "A", quantity: -1 }],
		])("returns validation error for %s", async (_, data) => {
			const result = await createInventoryItem(data);
			expect(result.err).toMatch(/Validation failed/);
			expect(result.item).toBeUndefined();
		});

		it("creates item with quantity 0 and delegates qty to recordMovements", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));

			const result = await createInventoryItem({ name: "Widget", location: "Shelf A", quantity: 10 });

			expect(tx.inventory_item.create).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ quantity: 0 }) }),
			);
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ qty: 10, reason: "receive" }),
				]),
			);
			expect(result.item?.quantity).toBe(10);
		});

		it("defaults quantity to 0 and does not call recordMovements when no qty", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));

			await createInventoryItem({ name: "Widget", location: "Shelf A" });
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// createInventoryItem — alt_ids
	// ---------------------------------------------------------------------------
	describe("createInventoryItem — alt_ids", () => {
		it("strips whitespace-only entries from alt_ids on create", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ alt_ids: ["MFR-001"] }));

			await createInventoryItem({
				name: "Widget",
				location: "Shelf A",
				alt_ids: ["MFR-001", "  ", ""],
			});

			expect(tx.inventory_item.create.mock.calls[0][0].data.alt_ids).toEqual(["MFR-001"]);
		});

		it("defaults alt_ids to [] when not provided on create", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem());

			await createInventoryItem({ name: "Widget", location: "Shelf A" });

			expect(tx.inventory_item.create.mock.calls[0][0].data.alt_ids).toEqual([]);
		});
	});

	// ---------------------------------------------------------------------------
	// barcode normalization
	// ---------------------------------------------------------------------------
	describe("barcode normalization", () => {
		it("trims barcode whitespace on create", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ barcode: "012345678905" }));

			await createInventoryItem({ name: "W", location: "A", barcode: "  012345678905 " });

			expect(tx.inventory_item.create.mock.calls[0][0].data.barcode).toBe("012345678905");
		});

		it("stores null for a whitespace-only barcode on create", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem());

			await createInventoryItem({ name: "W", location: "A", barcode: "   " });

			expect(tx.inventory_item.create.mock.calls[0][0].data.barcode).toBeNull();
		});

		it("normalizes empty-string barcode to null on update", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ barcode: "OLD" }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ barcode: null }));

			await updateInventoryItem("item-1", { barcode: "" }, "org-1");

			expect(tx.inventory_item.update.mock.calls[0][0].data.barcode).toBeNull();
		});

		it("leaves barcode absent on update when not provided", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem());

			await updateInventoryItem("item-1", { name: "New Name" }, "org-1");

			expect(tx.inventory_item.update.mock.calls[0][0].data.barcode).toBeUndefined();
		});
	});

	// ---------------------------------------------------------------------------
	// updateInventoryItem — alt_ids
	// ---------------------------------------------------------------------------
	describe("updateInventoryItem — alt_ids", () => {
		it("strips whitespace-only entries from alt_ids on update", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ alt_ids: ["ABC"] }));

			await updateInventoryItem("item-1", { alt_ids: ["ABC", "  ", ""] }, "org-1");

			expect(tx.inventory_item.update.mock.calls[0][0].data.alt_ids).toEqual(["ABC"]);
		});

		it("omits alt_ids from update data when not provided", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem());

			await updateInventoryItem("item-1", { name: "New Name" }, "org-1");

			const updateData = tx.inventory_item.update.mock.calls[0][0].data;
			expect(updateData.alt_ids).toBeUndefined();
		});

		it("clears alt_ids when explicitly set to empty array on update", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ alt_ids: ["OLD-123"] }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ alt_ids: [] }));

			await updateInventoryItem("item-1", { alt_ids: [] }, "org-1");

			expect(tx.inventory_item.update.mock.calls[0][0].data.alt_ids).toEqual([]);
		});
	});

	// ---------------------------------------------------------------------------
	// updateInventoryItem
	// ---------------------------------------------------------------------------
	describe("updateInventoryItem", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			const result = await updateInventoryItem("missing", { name: "New" });
			expect(result.err).toBe("Inventory item not found");
		});

		it("updates item and returns it with stock_status", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ name: "Updated" }));

			const result = await updateInventoryItem("item-1", { name: "Updated" });
			expect(result.err).toBe("");
			expect(result.item?.name).toBe("Updated");
			expect(result.item).toHaveProperty("stock_status");
		});

		it("silently ignores quantity field (not in schema — use adjustInventoryStock)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ name: "Widget" }));
			// quantity is stripped by Zod; should not cause a validation error
			const result = await updateInventoryItem("item-1", { quantity: -5, name: "Widget" } as never);
			expect(result.err).toBe("");
		});
	});

	// ---------------------------------------------------------------------------
	// deleteInventoryItem
	// ---------------------------------------------------------------------------
	describe("deleteInventoryItem", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			expect((await deleteInventoryItem("missing")).err).toBe("Inventory item not found");
		});

		it("soft-deletes by setting is_active to false and releasing the barcode and sku", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ barcode: "012345678905", sku: "SKU-1" }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ is_active: false, barcode: null, sku: null }));

			const result = await deleteInventoryItem("item-1");
			expect(result.err).toBe("");
			expect(tx.inventory_item.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: { is_active: false, barcode: null, sku: null } }),
			);
			expect(tx.item_external_mapping.deleteMany).toHaveBeenCalledWith({
				where: { inventory_item_id: "item-1" },
			});
		});
	});

	// ---------------------------------------------------------------------------
	// adjustInventoryStock
	// ---------------------------------------------------------------------------
	describe("adjustInventoryStock", () => {
		it("returns validation error for delta of zero", async () => {
			expect((await adjustInventoryStock("item-1", { delta: 0 })).err).toMatch(/Validation failed/);
		});

		it("returns error when item not found", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			expect((await adjustInventoryStock("missing", { delta: 5 })).err).toBe(
				"Inventory item not found",
			);
		});

		it("prevents stock going below zero (InsufficientStockError from recordMovements)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ quantity: 3 }));
			mockRecordMovements.mockRejectedValueOnce(new MockInsufficientStockError({ "item-1": 3 }));
			expect((await adjustInventoryStock("item-1", { delta: -5 })).err).toBe(
				"Stock cannot go below zero",
			);
		});

		it.each([
			["increase", 10, 5, 15],
			["decrease", 10, -3, 7],
		])("correctly applies %s delta", async (_, initial, delta, expected) => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ quantity: initial }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: expected }));

			const result = await adjustInventoryStock("item-1", { delta });
			expect(result.err).toBe("");
			expect(result.item?.quantity).toBe(expected);
		});

		it("calls recordMovements with receive movement on positive delta", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ quantity: 10 }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: 15 }));

			await adjustInventoryStock("item-1", { delta: 5 });

			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ qty: 5, reason: "receive", from_location_type: "external", to_location_type: "warehouse" }),
				]),
			);
		});

		it("calls recordMovements with loss movement on negative delta", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ quantity: 10 }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: 7 }));

			await adjustInventoryStock("item-1", { delta: -3 });

			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ qty: 3, reason: "loss", from_location_type: "warehouse", to_location_type: "adjustment" }),
				]),
			);
		});

		it("triggers low stock alert when quantity first crosses below threshold", async () => {
			// existing quantity (6) > threshold (5), so alert fires on first cross
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ quantity: 6, low_stock_threshold: 5 }),
			);
			mockRecordMovements.mockResolvedValueOnce({ lowStockItemIds: ["item-1"] });
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({
					id: "item-1",
					quantity: 4,
					low_stock_threshold: 5,
					alert_emails_enabled: true,
					alert_email: "ops@example.com",
				}),
			);

			await adjustInventoryStock("item-1", { delta: -2 });

			expect(mockSendEmail).toHaveBeenCalledWith(
				"ops@example.com",
				"low-stock-alert",
				expect.objectContaining({ current_quantity: 4, threshold: 5 }),
			);
		});

		it("does not re-trigger alert when quantity was already below threshold", async () => {
			// existing quantity (3) already below threshold (5) → hysteresis blocks alert
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ quantity: 3, low_stock_threshold: 5 }),
			);
			mockRecordMovements.mockResolvedValueOnce({ lowStockItemIds: ["item-1"] });
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 2, low_stock_threshold: 5, alert_emails_enabled: true, alert_email: "ops@example.com" }),
			);

			await adjustInventoryStock("item-1", { delta: -1 });

			expect(mockSendEmail).not.toHaveBeenCalled();
		});

		// -------------------------------------------------------------------------
		// adjustInventoryStock — serial/batch tracked items (B-T3)
		// -------------------------------------------------------------------------
		it("rejects positive delta for a serialized item, pointing the caller at /receive", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_serialized: true }));

			const result = await adjustInventoryStock("item-1", { delta: 5 });

			expect(result.err).toMatch(/\/inventory\/:id\/receive/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("rejects positive delta for a batch-tracked item, pointing the caller at /receive", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_batch_tracked: true }));

			const result = await adjustInventoryStock("item-1", { delta: 5 });

			expect(result.err).toMatch(/\/inventory\/:id\/receive/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("negative delta on a serialized item with matching serial_unit_ids builds a loss movement carrying serial.unit_ids", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_serialized: true, quantity: 10 }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ is_serialized: true, quantity: 8 }));
			const suIds = [
				"11111111-1111-4111-8111-111111111111",
				"22222222-2222-4222-8222-222222222222",
			];

			const result = await adjustInventoryStock("item-1", { delta: -2, serial_unit_ids: suIds });

			expect(result.err).toBe("");
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						qty: 2,
						reason: "loss",
						from_location_type: "warehouse",
						to_location_type: "adjustment",
						serial: { unit_ids: suIds },
					}),
				]),
			);
		});

		it("rejects negative delta on a serialized item when serial_unit_ids is missing", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_serialized: true, quantity: 10 }));

			const result = await adjustInventoryStock("item-1", { delta: -2 });

			expect(result.err).toMatch(/serial_unit_ids/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("rejects negative delta on a serialized item when serial_unit_ids count mismatches abs(delta)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_serialized: true, quantity: 10 }));

			const result = await adjustInventoryStock("item-1", {
				delta: -3,
				serial_unit_ids: ["11111111-1111-4111-8111-111111111111"],
			});

			expect(result.err).toMatch(/serial_unit_ids/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
		});

		it("negative delta on a batch-tracked item passes batch_picks through as batch_allocations", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_batch_tracked: true, quantity: 10 }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ is_batch_tracked: true, quantity: 6 }));
			const batchId = "33333333-3333-4333-8333-333333333333";

			const result = await adjustInventoryStock("item-1", {
				delta: -4,
				batch_picks: [{ batch_id: batchId, qty: 4 }],
			});

			expect(result.err).toBe("");
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						qty: 4,
						reason: "loss",
						batch_allocations: [{ batch_id: batchId, qty: 4 }],
					}),
				]),
			);
		});

		it("negative delta on a batch-tracked item with no batch_picks omits batch_allocations (FIFO auto-allocates)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_batch_tracked: true, quantity: 10 }));
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ is_batch_tracked: true, quantity: 6 }));

			const result = await adjustInventoryStock("item-1", { delta: -4 });

			expect(result.err).toBe("");
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), undefined, expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ qty: 4, reason: "loss", batch_allocations: undefined }),
				]),
			);
		});

		it("does not attach serial/batch tracking fields for a non-tracked item (regression)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ is_serialized: false, is_batch_tracked: false, quantity: 10 }),
			);
			const tx = setupTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: 15 }));

			await adjustInventoryStock("item-1", { delta: 5 });

			const movement = mockRecordMovements.mock.calls[0][3][0];
			expect(movement.serial).toBeUndefined();
			expect(movement.batch_allocations).toBeUndefined();
		});

		it("surfaces InsufficientBatchStockError as a validation error", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_batch_tracked: true, quantity: 10 }));
			mockRecordMovements.mockRejectedValueOnce(new MockInsufficientBatchStockError({ "batch-1": 2 }));

			const result = await adjustInventoryStock("item-1", { delta: -4 });

			expect(result.err).toBe("Insufficient batch stock for requested allocations");
		});

		it("surfaces TrackingValidationError as a validation error", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ is_serialized: true, quantity: 10 }));
			mockRecordMovements.mockRejectedValueOnce(new MockTrackingValidationError("Serial unit su-1 is on_vehicle, expected in_warehouse for this movement"));

			const result = await adjustInventoryStock("item-1", {
				delta: -2,
				serial_unit_ids: [
					"11111111-1111-4111-8111-111111111111",
					"22222222-2222-4222-8222-222222222222",
				],
			});

			expect(result.err).toBe("Serial unit su-1 is on_vehicle, expected in_warehouse for this movement");
		});
	});

	// ---------------------------------------------------------------------------
	// deductInventoryForVisit
	// ---------------------------------------------------------------------------
	describe("deductInventoryForVisit", () => {
		type LineItem = { id: string; visit_id: string; inventory_item_id: string; quantity: number };

		function makeTx(lineItems: LineItem[]) {
			return {
				job_visit_line_item: {
					findMany: vi.fn().mockResolvedValue(lineItems),
					updateMany: vi.fn().mockResolvedValue({ count: lineItems.length }),
				},
			};
		}

		it("emits one batched direct_consumption movement set with allowNegative", async () => {
			const tx = makeTx([
				{ id: "li-1", visit_id: "v1", inventory_item_id: "item-1", quantity: 3 },
				{ id: "li-2", visit_id: "v1", inventory_item_id: "item-2", quantity: 2 },
			]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any, "org-1");

			expect(mockRecordMovements).toHaveBeenCalledOnce();
			const [, orgId, , movements, opts] = mockRecordMovements.mock.calls[0];
			expect(orgId).toBe("org-1");
			expect(opts).toEqual({ allowNegative: true });
			expect(movements).toEqual([
				expect.objectContaining({
					inventory_item_id: "item-1",
					qty: 3,
					from_location_type: "warehouse",
					to_location_type: "consumed",
					reason: "direct_consumption",
					visit_id: "v1",
					visit_line_item_id: "li-1",
				}),
				expect.objectContaining({
					inventory_item_id: "item-2",
					qty: 2,
					visit_line_item_id: "li-2",
				}),
			]);
		});

		it("retains the fulfillment-status filter (skips used, matches NULL)", async () => {
			const tx = makeTx([]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any, "org-1");

			expect(tx.job_visit_line_item.findMany).toHaveBeenCalledWith({
				where: {
					visit_id: "v1",
					inventory_item_id: { not: null },
					OR: [{ fulfillment_status: null }, { fulfillment_status: { not: "used" } }],
				},
			});
		});

		it("ceils fractional billed quantities (warehouse is integer)", async () => {
			const tx = makeTx([
				{ id: "li-1", visit_id: "v1", inventory_item_id: "item-1", quantity: 2.3 },
			]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any, "org-1");

			const movements = mockRecordMovements.mock.calls[0][3];
			expect(movements[0].qty).toBe(3);
		});

		it("does nothing when the visit has no linked line items", async () => {
			const tx = makeTx([]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await deductInventoryForVisit("v1", tx as any, "org-1");

			expect(mockRecordMovements).not.toHaveBeenCalled();
			expect(result).toEqual({ lowStockItemIds: [] });
		});

		it("propagates lowStockItemIds from recordMovements", async () => {
			mockRecordMovements.mockResolvedValueOnce({ lowStockItemIds: ["item-1"] });
			const tx = makeTx([
				{ id: "li-1", visit_id: "v1", inventory_item_id: "item-1", quantity: 1 },
			]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await deductInventoryForVisit("v1", tx as any, "org-1");

			expect(result.lowStockItemIds).toEqual(["item-1"]);
		});
	});

	// ---------------------------------------------------------------------------
	// updateInventoryThreshold
	// ---------------------------------------------------------------------------
	describe("updateInventoryThreshold", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);
			expect((await updateInventoryThreshold("missing", { low_stock_threshold: 10 })).err).toBe(
				"Inventory item not found",
			);
		});

		it("updates threshold and returns item with stock_status", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ low_stock_threshold: 10 }));

			const result = await updateInventoryThreshold("item-1", { low_stock_threshold: 10 });
			expect(result.err).toBe("");
			expect(result.item?.low_stock_threshold).toBe(10);
			expect(result.item).toHaveProperty("stock_status");
		});

		it("rejects a negative threshold", async () => {
			const result = await updateInventoryThreshold("item-1", { low_stock_threshold: -1 });
			expect(result.err).toMatch(/Validation failed/);
		});

		it("accepts null to clear the threshold", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ low_stock_threshold: 5 }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ low_stock_threshold: null }));

			const result = await updateInventoryThreshold("item-1", { low_stock_threshold: null });
			expect(result.err).toBe("");
			expect(result.item?.low_stock_threshold).toBeNull();
		});
	});

	// ---------------------------------------------------------------------------
	// receiveInventoryItem
	// ---------------------------------------------------------------------------
	describe("receiveInventoryItem", () => {
		function setupReceiveTransaction() {
			const mockTx = {
				inventory_item: {
					findUnique: vi.fn(),
				},
				stock_batch: {
					findFirst: vi.fn(),
				},
				serial_unit: {
					findMany: vi.fn().mockResolvedValue([]),
				},
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
				fn(mockTx),
			);
			return mockTx;
		}

		it("returns not found for a cross-org item id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);

			const result = await receiveInventoryItem("missing", { qty: 5 }, "org-1");

			expect(result.err).toBe("Inventory item not found");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("receives serialized stock when serial_numbers length matches qty", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true, quantity: 2 }),
			);
			tx.serial_unit.findMany.mockResolvedValue([
				{ id: "su-1", code: "SU-AAA", serial_number: "SN1", status: "in_warehouse" },
				{ id: "su-2", code: "SU-BBB", serial_number: "SN2", status: "in_warehouse" },
			]);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 2, serial_numbers: ["SN1", "SN2"] },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(result.created_serials).toEqual([
				{ id: "su-1", code: "SU-AAA", serial_number: "SN1", status: "in_warehouse" },
				{ id: "su-2", code: "SU-BBB", serial_number: "SN2", status: "in_warehouse" },
			]);
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						qty: 2,
						reason: "receive",
						from_location_type: "external",
						to_location_type: "warehouse",
						serial: {
							create: [
								{ serial_number: "SN1", batch_id: undefined },
								{ serial_number: "SN2", batch_id: undefined },
							],
						},
					}),
				]),
			);
		});

		it("auto-assigns AUTO- serial numbers when auto_serial is set (no serial_numbers supplied)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true, quantity: 3 }),
			);
			tx.serial_unit.findMany.mockResolvedValue([
				{ id: "su-1", code: "SU-AAA", serial_number: "AUTO-1", status: "in_warehouse" },
				{ id: "su-2", code: "SU-BBB", serial_number: "AUTO-2", status: "in_warehouse" },
				{ id: "su-3", code: "SU-CCC", serial_number: "AUTO-3", status: "in_warehouse" },
			]);

			const result = await receiveInventoryItem("item-1", { qty: 3, auto_serial: true }, "org-1");

			expect(result.err).toBe("");
			// One synthesized serial per unit, each an AUTO- code — proving the
			// controller filled them without any caller-supplied serial_numbers.
			const movements = mockRecordMovements.mock.calls.at(-1)![3] as Array<{
				serial?: { create?: Array<{ serial_number: string }> };
			}>;
			const created = movements[0].serial!.create!;
			expect(created).toHaveLength(3);
			for (const c of created) expect(c.serial_number).toMatch(/^AUTO-/);
		});

		it("rejects a dual-tracked (serialized + batch) item with no batch or batch_id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true, is_batch_tracked: true }),
			);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 2, serial_numbers: ["SN1", "SN2"] },
				"org-1",
			);

			expect(result.err).toMatch(/Provide either batch or batch_id/);
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("receives a dual-tracked (serialized + batch) item with both serial_numbers and batch", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true, is_batch_tracked: true }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true, is_batch_tracked: true, quantity: 2 }),
			);
			mockGetOrCreateBatch.mockResolvedValue({ id: "batch-1", code: "LOT-XXXX" });
			tx.serial_unit.findMany.mockResolvedValue([
				{ id: "su-1", code: "SU-AAA", serial_number: "SN1", status: "in_warehouse" },
				{ id: "su-2", code: "SU-BBB", serial_number: "SN2", status: "in_warehouse" },
			]);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 2, serial_numbers: ["SN1", "SN2"], batch: { batch_number: "B-100" } },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						serial: {
							create: [
								{ serial_number: "SN1", batch_id: "batch-1" },
								{ serial_number: "SN2", batch_id: "batch-1" },
							],
						},
					}),
				]),
			);
		});

		it("rejects when serial_numbers length does not match qty (no partial writes)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true }),
			);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 3, serial_numbers: ["SN1", "SN2"] },
				"org-1",
			);

			expect(result.err).toMatch(/serial_numbers/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("creates a new batch header and allocates against it", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_batch_tracked: true }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", is_batch_tracked: true, quantity: 10 }),
			);
			mockGetOrCreateBatch.mockResolvedValue({ id: "batch-1", code: "LOT-XXXX" });

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 10, batch: { batch_number: "B-100" } },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(mockGetOrCreateBatch).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.objectContaining({ inventory_item_id: "item-1", batch_number: "B-100" }),
			);
			expect(result.batch).toEqual({ id: "batch-1", code: "LOT-XXXX", batch_number: "B-100" });
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ batch_allocations: [{ batch_id: "batch-1", qty: 10 }] }),
				]),
			);
		});

		it("allocates against an existing batch_id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_batch_tracked: true }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(
				makeItem({ id: "item-1", is_batch_tracked: true, quantity: 10 }),
			);
			const existingBatchId = "22222222-2222-4222-8222-222222222222";
			tx.stock_batch.findFirst.mockResolvedValue({
				id: existingBatchId,
				code: "LOT-EXIST",
				batch_number: "B-9",
			});

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 5, batch_id: existingBatchId },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(mockGetOrCreateBatch).not.toHaveBeenCalled();
			expect(result.batch).toEqual({ id: existingBatchId, code: "LOT-EXIST", batch_number: "B-9" });
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({ batch_allocations: [{ batch_id: existingBatchId, qty: 5 }] }),
				]),
			);
		});

		it("rejects when both batch and batch_id are provided", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_batch_tracked: true }),
			);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 5, batch: { batch_number: "B-1" }, batch_id: "11111111-1111-4111-8111-111111111111" },
				"org-1",
			);

			expect(result.err).toMatch(/Validation failed/);
			expect(mockRecordMovements).not.toHaveBeenCalled();
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("receives plain (non-tracked) stock without serial or batch fields", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: false, is_batch_tracked: false }),
			);
			const tx = setupReceiveTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 20 }));

			const result = await receiveInventoryItem("item-1", { qty: 20 }, "org-1");

			expect(result.err).toBe("");
			expect(result.created_serials).toBeUndefined();
			expect(result.batch).toBeUndefined();
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(),
				"org-1",
				expect.anything(),
				expect.arrayContaining([
					expect.objectContaining({
						qty: 20,
						reason: "receive",
						from_location_type: "external",
						to_location_type: "warehouse",
						serial: undefined,
						batch_allocations: undefined,
					}),
				]),
			);
		});

		it("maps a serial_number re-receive collision to a conflict result, not a 500", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", is_serialized: true }),
			);
			setupReceiveTransaction();
			const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
				code: "P2002",
				clientVersion: "0.0.0",
				meta: { target: ["organization_id", "inventory_item_id", "serial_number"] },
			});
			mockRecordMovements.mockRejectedValueOnce(conflict);

			const result = await receiveInventoryItem(
				"item-1",
				{ qty: 1, serial_numbers: ["SN1"] },
				"org-1",
			);

			expect(result.conflict).toBe(true);
			expect(result.err).toMatch(/already exist/i);
		});
	});

	// ---------------------------------------------------------------------------
	// updateItemTracking
	// ---------------------------------------------------------------------------
	describe("updateItemTracking", () => {
		function setupTrackingTransaction() {
			const mockTx = {
				inventory_item: {
					findUnique: vi.fn(),
					update: vi.fn(),
				},
				vehicle_stock_item: {
					aggregate: vi.fn().mockResolvedValue({ _sum: { qty_on_hand: null } }),
				},
				serial_unit: {
					count: vi.fn().mockResolvedValue(0),
				},
				stock_batch: {
					count: vi.fn().mockResolvedValue(0),
				},
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
				fn(mockTx),
			);
			return mockTx;
		}

		it("returns not found for a cross-org item id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);

			const result = await updateItemTracking("missing", { is_serialized: true }, "org-1");

			expect(result.err).toBe("Inventory item not found");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("enables is_serialized when warehouse quantity is 0 and no vehicle has stock", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.inventory_item.update.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true }),
			);

			const result = await updateItemTracking("item-1", { is_serialized: true }, "org-1");

			expect(result.err).toBe("");
			expect(result.item?.is_serialized).toBe(true);
			expect(mockLockInventoryRows).toHaveBeenCalledWith(expect.anything(), ["item-1"]);
			expect(tx.inventory_item.update).toHaveBeenCalledWith({
				where: { id: "item-1" },
				data: { is_serialized: true },
			});
		});

		it("rejects when warehouse quantity is greater than 0", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 5, is_serialized: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 5 }));

			const result = await updateItemTracking("item-1", { is_serialized: true }, "org-1");

			expect(result.err).toMatch(/units are on hand/);
			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("rejects when warehouse quantity is 0 but a vehicle has stock for this item", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.vehicle_stock_item.aggregate.mockResolvedValue({ _sum: { qty_on_hand: 3 } });

			const result = await updateItemTracking("item-1", { is_serialized: true }, "org-1");

			expect(result.err).toMatch(/units are on hand/);
			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("rejects for a provisional item regardless of on-hand quantity", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, provisional: true }),
			);

			const result = await updateItemTracking("item-1", { is_serialized: true }, "org-1");

			expect(result.err).toBe("Provisional items cannot be tracked");
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("allows setting both is_serialized and is_batch_tracked true in the same call when on-hand is zero", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: false, is_batch_tracked: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.inventory_item.update.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true, is_batch_tracked: true }),
			);

			const result = await updateItemTracking(
				"item-1",
				{ is_serialized: true, is_batch_tracked: true },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(result.item?.is_serialized).toBe(true);
			expect(result.item?.is_batch_tracked).toBe(true);
			expect(tx.inventory_item.update).toHaveBeenCalledWith({
				where: { id: "item-1" },
				data: { is_serialized: true, is_batch_tracked: true },
			});
		});

		it("is a no-op that skips the lock/transaction when values already match", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 5, is_serialized: true }),
			);

			const result = await updateItemTracking("item-1", { is_serialized: true }, "org-1");

			expect(result.err).toBe("");
			expect(result.item?.is_serialized).toBe(true);
			expect(mockDb.$transaction).not.toHaveBeenCalled();
			expect(mockLockInventoryRows).not.toHaveBeenCalled();
		});

		it("rejects when neither is_serialized nor is_batch_tracked is provided", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));

			const result = await updateItemTracking("item-1", {}, "org-1");

			expect(result.err).toMatch(/Validation failed/);
			expect(mockDb.$transaction).not.toHaveBeenCalled();
		});

		it("disables is_serialized when the item is empty (zero qty, no serials/batches)", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.inventory_item.update.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: false }),
			);

			const result = await updateItemTracking("item-1", { is_serialized: false }, "org-1");

			expect(result.err).toBe("");
			expect(result.item?.is_serialized).toBe(false);
			expect(tx.serial_unit.count).toHaveBeenCalled();
			expect(tx.stock_batch.count).toHaveBeenCalled();
			expect(tx.inventory_item.update).toHaveBeenCalledWith({
				where: { id: "item-1" },
				data: { is_serialized: false },
			});
		});

		it("rejects disabling tracking when serial units still exist even at zero on-hand", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.serial_unit.count.mockResolvedValue(2); // e.g. consumed units retaining recall history

			const result = await updateItemTracking("item-1", { is_serialized: false }, "org-1");

			expect(result.err).toMatch(/serial unit\(s\) and .* batch\(es\) still exist/);
			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("rejects disabling batch tracking when batch lots still exist", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_batch_tracked: true }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.stock_batch.count.mockResolvedValue(1);

			const result = await updateItemTracking("item-1", { is_batch_tracked: false }, "org-1");

			expect(result.err).toMatch(/still exist/);
			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("rejects switching serialized→batch when serial units still exist", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true, is_batch_tracked: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.serial_unit.count.mockResolvedValue(3);

			const result = await updateItemTracking(
				"item-1",
				{ is_serialized: false, is_batch_tracked: true },
				"org-1",
			);

			expect(result.err).toMatch(/still exist/);
			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("allows switching serialized→batch when the item is fully empty", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: true, is_batch_tracked: false }),
			);
			const tx = setupTrackingTransaction();
			tx.inventory_item.findUnique.mockResolvedValue(makeItem({ id: "item-1", quantity: 0 }));
			tx.inventory_item.update.mockResolvedValue(
				makeItem({ id: "item-1", quantity: 0, is_serialized: false, is_batch_tracked: true }),
			);

			const result = await updateItemTracking(
				"item-1",
				{ is_serialized: false, is_batch_tracked: true },
				"org-1",
			);

			expect(result.err).toBe("");
			expect(result.item?.is_serialized).toBe(false);
			expect(result.item?.is_batch_tracked).toBe(true);
			expect(tx.inventory_item.update).toHaveBeenCalledWith({
				where: { id: "item-1" },
				data: { is_serialized: false, is_batch_tracked: true },
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getItemTrackingSummary
	// ---------------------------------------------------------------------------
	describe("getItemTrackingSummary", () => {
		it("returns not found for a cross-org item id", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(null);

			const result = await getItemTrackingSummary("missing", "org-1");

			expect(result.err).toBe("Inventory item not found");
			expect(mockDb.serial_unit.groupBy).not.toHaveBeenCalled();
		});

		it("rolls up serial statuses and batch quantities", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.groupBy.mockResolvedValue([
				{ status: "in_warehouse", _count: { _all: 4 } },
				{ status: "on_vehicle", _count: { _all: 2 } },
				{ status: "consumed", _count: { _all: 5 } },
			]);
			mockDb.stock_batch.count.mockResolvedValue(3);
			mockDb.stock_batch.aggregate.mockResolvedValue({ _sum: { qty_in_warehouse: 12 } });
			mockDb.vehicle_stock_batch.aggregate.mockResolvedValue({ _sum: { qty_on_hand: 7 } });

			const result = await getItemTrackingSummary("item-1", "org-1");

			expect(result.err).toBe("");
			expect(result.summary?.serials).toEqual({
				in_warehouse: 4,
				on_vehicle: 2,
				consumed: 5,
				lost: 0,
				returned: 0,
			});
			expect(result.summary?.batches).toEqual({
				lots: 3,
				qty_in_warehouse: 12,
				qty_on_vehicles: 7,
			});
			expect(mockDb.serial_unit.groupBy).toHaveBeenCalledWith(
				expect.objectContaining({
					by: ["status"],
					where: { inventory_item_id: "item-1", organization_id: "org-1" },
				}),
			);
		});

		it("returns all-zero rollups when the item has no serials or batches", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem({ id: "item-1" }));
			mockDb.serial_unit.groupBy.mockResolvedValue([]);
			mockDb.stock_batch.count.mockResolvedValue(0);
			mockDb.stock_batch.aggregate.mockResolvedValue({ _sum: { qty_in_warehouse: null } });
			mockDb.vehicle_stock_batch.aggregate.mockResolvedValue({ _sum: { qty_on_hand: null } });

			const result = await getItemTrackingSummary("item-1", "org-1");

			expect(result.err).toBe("");
			expect(result.summary?.serials).toEqual({
				in_warehouse: 0,
				on_vehicle: 0,
				consumed: 0,
				lost: 0,
				returned: 0,
			});
			expect(result.summary?.batches).toEqual({
				lots: 0,
				qty_in_warehouse: 0,
				qty_on_vehicles: 0,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// importInventoryFromFile
	// ---------------------------------------------------------------------------
	describe("importInventoryFromFile", () => {
		function makeXlsxBuffer(rows: Record<string, unknown>[]) {
			const ws = XLSX.utils.json_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
			return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
		}

		function makeCsvBuffer(rows: Record<string, unknown>[]) {
			const ws = XLSX.utils.json_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
			return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "csv" }));
		}

		it("imports valid rows and returns the imported count", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ name: "Widget", location: "Shelf A" }));

			const buf = makeXlsxBuffer([{ name: "Widget", location: "Shelf A" }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(1);
			expect(result.skipped).toHaveLength(0);
		});

		it("skips rows missing name and reports the reason", async () => {
			const buf = makeXlsxBuffer([{ location: "Shelf A" }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(0);
			expect(result.skipped[0]).toMatchObject({ row: 2, reason: expect.stringContaining("name") });
		});

		it("skips rows missing location and reports the reason", async () => {
			const buf = makeXlsxBuffer([{ name: "Widget" }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(0);
			expect(result.skipped[0]).toMatchObject({ row: 2, reason: expect.stringContaining("location") });
		});

		it("accepts name* and location* column headers from the downloaded template", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ name: "Filter", location: "Warehouse" }));

			const buf = makeXlsxBuffer([{ "name*": "Filter", "location*": "Warehouse" }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(1);
		});

		it("passes numeric fields through to createInventoryItem correctly", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem());

			const buf = makeXlsxBuffer([{
				name: "Filter", location: "Warehouse A",
				quantity: 50, unit_price: 12.99, cost: 8.0, low_stock_threshold: 10,
			}]);
			await importInventoryFromFile(buf, "org-1");

			// quantity starts at 0; recordMovements handles the initial stock
			expect(tx.inventory_item.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						quantity: 0, unit_price: 12.99, cost: 8.0, low_stock_threshold: 10,
					}),
				}),
			);
			expect(mockRecordMovements).toHaveBeenCalledWith(
				expect.anything(), expect.anything(), expect.anything(),
				expect.arrayContaining([expect.objectContaining({ qty: 50, reason: "receive" })]),
			);
		});

		it("assigns correct row numbers to skipped rows in a mixed sheet", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem());

			const buf = makeXlsxBuffer([
				{ name: "Valid A", location: "Shelf A" },
				{ location: "Shelf B" },               // missing name → row 3
				{ name: "Valid B", location: "Shelf C" },
			]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(2);
			expect(result.skipped).toHaveLength(1);
			expect(result.skipped[0].row).toBe(3);
		});

		it("includes createInventoryItem validation errors in skipped rows", async () => {
			// quantity: -5 passes our pre-check but fails Zod validation
			const buf = makeXlsxBuffer([{ name: "Widget", location: "Shelf A", quantity: -5 }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(0);
			expect(result.skipped[0].reason).toMatch(/Validation failed/);
		});

		it("parses CSV buffers in addition to xlsx", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ name: "CSV Item", location: "Rack 1" }));

			const buf = makeCsvBuffer([{ name: "CSV Item", location: "Rack 1" }]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(1);
		});

		it("returns zero imports and no skipped rows for an empty sheet", async () => {
			const buf = makeXlsxBuffer([]);
			const result = await importInventoryFromFile(buf, "org-1");

			expect(result.imported).toBe(0);
			expect(result.skipped).toHaveLength(0);
		});
	});

	// ---------------------------------------------------------------------------
	// exportLowStockToXlsx
	// ---------------------------------------------------------------------------
	describe("exportLowStockToXlsx", () => {
		function parseXlsx(buf: Buffer) {
			const wb = XLSX.read(buf, { type: "buffer" });
			const ws = wb.Sheets[wb.SheetNames[0]];
			return {
				sheetName: wb.SheetNames[0],
				rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(ws),
				headers: (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0] ?? []) as string[],
			};
		}

		it("returns a Buffer", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			expect(Buffer.isBuffer(await exportLowStockToXlsx("org-1"))).toBe(true);
		});

		it("names the sheet 'Low Stock Report'", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			const { sheetName } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(sheetName).toBe("Low Stock Report");
		});

		it("includes Name, Unit Price, Cost, and Stock Status columns", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 2, low_stock_threshold: 5 }),
			]);
			const { headers } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(headers).toContain("Name");
			expect(headers).toContain("Unit Price");
			expect(headers).toContain("Cost");
			expect(headers).toContain("Stock Status");
		});

		it("serializes unit_price as a number (Decimal fix)", async () => {
			// Mimics Prisma Decimal: not null, but not a plain number primitive
			const decimalLike = { valueOf: () => 12.99, toString: () => "12.99" };
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 2, low_stock_threshold: 5, unit_price: decimalLike }),
			]);

			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(typeof rows[0]["Unit Price"]).toBe("number");
			expect(rows[0]["Unit Price"]).toBe(12.99);
		});

		it("serializes cost as a number (Decimal fix)", async () => {
			const decimalLike = { valueOf: () => 4.5, toString: () => "4.5" };
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 2, low_stock_threshold: 5, cost: decimalLike }),
			]);

			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(typeof rows[0]["Cost"]).toBe("number");
			expect(rows[0]["Cost"]).toBe(4.5);
		});

		it("uses empty string for null unit_price and cost", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 2, low_stock_threshold: 5, unit_price: null, cost: null }),
			]);

			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(rows[0]["Unit Price"]).toBe("");
			expect(rows[0]["Cost"]).toBe("");
		});

		it("labels out-of-stock items as 'Out of Stock'", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 0, low_stock_threshold: 5 }),
			]);
			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(rows[0]["Stock Status"]).toBe("Out of Stock");
		});

		it("labels low-stock items as 'Low'", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([
				makeItem({ quantity: 2, low_stock_threshold: 5 }),
			]);
			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(rows[0]["Stock Status"]).toBe("Low");
		});

		it("returns an empty sheet body when no items are low-stock", async () => {
			mockDb.inventory_item.findMany.mockResolvedValue([]);
			const { rows } = parseXlsx(await exportLowStockToXlsx("org-1"));
			expect(rows).toHaveLength(0);
		});
	});

	// ---------------------------------------------------------------------------
	// getInventoryImportTemplate
	// ---------------------------------------------------------------------------
	describe("getInventoryImportTemplate", () => {
		function parseTemplate() {
			const buf = getInventoryImportTemplate();
			const wb = XLSX.read(buf, { type: "buffer" });
			const ws = wb.Sheets[wb.SheetNames[0]];
			const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
			return { sheetName: wb.SheetNames[0], headers: allRows[0] as string[], allRows };
		}

		it("returns a Buffer", () => {
			expect(Buffer.isBuffer(getInventoryImportTemplate())).toBe(true);
		});

		it("names the sheet 'Inventory Import Template'", () => {
			expect(parseTemplate().sheetName).toBe("Inventory Import Template");
		});

		it("includes name* and location* as required-field headers", () => {
			const { headers } = parseTemplate();
			expect(headers).toContain("name*");
			expect(headers).toContain("location*");
		});

		it("includes all expected column headers", () => {
			const { headers } = parseTemplate();
			for (const col of ["name*", "sku", "description", "location*", "quantity", "unit_price", "cost", "low_stock_threshold", "alert_email"]) {
				expect(headers).toContain(col);
			}
		});

		it("has exactly two rows: header and one example row", () => {
			expect(parseTemplate().allRows).toHaveLength(2);
		});

		it("example row is non-empty", () => {
			const { allRows } = parseTemplate();
			const exampleRow = allRows[1] as unknown[];
			expect(exampleRow.some((cell) => String(cell).trim() !== "")).toBe(true);
		});
	});
});
