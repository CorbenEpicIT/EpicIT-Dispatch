import * as XLSX from "xlsx";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getAllInventory,
	getLowStockInventory,
	createInventoryItem,
	updateInventoryItem,
	deleteInventoryItem,
	adjustInventoryStock,
	deductInventoryForVisit,
	updateInventoryThreshold,
	importInventoryFromFile,
	exportLowStockToXlsx,
	getInventoryImportTemplate,
} from "../inventoryController.js";
import { db } from "../../db.js";
import { sendEmail } from "../../services/emailService.js";

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = {
		inventory_item: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			findUnique: vi.fn(),
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
const { mockRecordMovements, MockInsufficientStockError } = vi.hoisted(() => {
	class MockInsufficientStockError extends Error {
		available: Record<string, number>;
		constructor(available: Record<string, number>) {
			super("Insufficient warehouse stock");
			this.name = "InsufficientStockError";
			this.available = available;
		}
	}
	return {
		mockRecordMovements: vi.fn().mockResolvedValue({ lowStockItemIds: [] }),
		MockInsufficientStockError,
	};
});

vi.mock("../../services/stockMovements.js", () => ({
	recordMovements: mockRecordMovements,
	InsufficientStockError: MockInsufficientStockError,
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
		low_stock_threshold: null as number | null,
		image_urls: [] as string[],
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

		it("soft-deletes by setting is_active to false", async () => {
			mockDb.inventory_item.findFirst.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ is_active: false }));

			const result = await deleteInventoryItem("item-1");
			expect(result.err).toBe("");
			expect(tx.inventory_item.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: { is_active: false } }),
			);
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
