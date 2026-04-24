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
} from "../inventoryController.js";
import { db } from "../../db.js";
import { sendEmail } from "../../services/emailService.js";

vi.mock("../../db.js", () => ({
	db: {
		inventory_item: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
		},
		$transaction: vi.fn(),
	},
}));

vi.mock("../../services/logger.js", () => ({
	logActivity: vi.fn().mockResolvedValue(undefined),
	buildChanges: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/emailService.js", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
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
			expect(mockDb.inventory_item.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ where: { is_active: true } }),
			);
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
			await getAllInventory(sort);
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

		it("defaults quantity to 0 when not provided", async () => {
			const tx = setupTransaction();
			tx.inventory_item.create.mockResolvedValue(makeItem({ quantity: 0 }));

			const result = await createInventoryItem({ name: "Widget", location: "Shelf A" });
			expect(result.item?.quantity).toBe(0);
		});
	});

	// ---------------------------------------------------------------------------
	// updateInventoryItem
	// ---------------------------------------------------------------------------
	describe("updateInventoryItem", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(null);
			const result = await updateInventoryItem("missing", { name: "New" });
			expect(result.err).toBe("Inventory item not found");
		});

		it("updates item and returns it with stock_status", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem());
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ name: "Updated" }));

			const result = await updateInventoryItem("item-1", { name: "Updated" });
			expect(result.err).toBe("");
			expect(result.item?.name).toBe("Updated");
			expect(result.item).toHaveProperty("stock_status");
		});

		it("returns validation error for negative quantity", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem());
			const result = await updateInventoryItem("item-1", { quantity: -5 });
			expect(result.err).toMatch(/Validation failed/);
		});
	});

	// ---------------------------------------------------------------------------
	// deleteInventoryItem
	// ---------------------------------------------------------------------------
	describe("deleteInventoryItem", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(null);
			expect((await deleteInventoryItem("missing")).err).toBe("Inventory item not found");
		});

		it("soft-deletes by setting is_active to false", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem());
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
			mockDb.inventory_item.findUnique.mockResolvedValue(null);
			expect((await adjustInventoryStock("missing", { delta: 5 })).err).toBe(
				"Inventory item not found",
			);
		});

		it("prevents stock going below zero", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: 3 }));
			expect((await adjustInventoryStock("item-1", { delta: -5 })).err).toBe(
				"Stock cannot go below zero",
			);
		});

		it.each([
			["increase", 10, 5, 15],
			["decrease", 10, -3, 7],
		])("correctly applies %s delta", async (_, initial, delta, expected) => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem({ quantity: initial }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ quantity: expected }));

			const result = await adjustInventoryStock("item-1", { delta });
			expect(result.err).toBe("");
			expect(result.item?.quantity).toBe(expected);
		});

		it("triggers low stock alert when quantity first crosses below threshold", async () => {
			// quantity goes from 6 → 4, crossing threshold of 5
			mockDb.inventory_item.findUnique.mockResolvedValue(
				makeItem({ quantity: 6, low_stock_threshold: 5 }),
			);
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(
				makeItem({
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
			// existing quantity (3) already below threshold (5)
			mockDb.inventory_item.findUnique.mockResolvedValue(
				makeItem({ quantity: 3, low_stock_threshold: 5 }),
			);
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(
				makeItem({
					quantity: 2,
					low_stock_threshold: 5,
					alert_emails_enabled: true,
					alert_email: "ops@example.com",
				}),
			);

			await adjustInventoryStock("item-1", { delta: -1 });

			expect(mockSendEmail).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// deductInventoryForVisit
	// ---------------------------------------------------------------------------
	describe("deductInventoryForVisit", () => {
		type LineItem = { visit_id: string; inventory_item_id: string; quantity: number };
		type InventoryMap = Record<string, ReturnType<typeof makeItem>>;

		function makeTx(lineItems: LineItem[], inventory: InventoryMap) {
			return {
				job_visit_line_item: {
					findMany: vi.fn().mockResolvedValue(lineItems),
				},
				inventory_item: {
					findUnique: vi
						.fn()
						.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
							Promise.resolve(inventory[id] ?? null),
						),
					update: vi
						.fn()
						.mockImplementation(
							({
								where: { id },
								data,
							}: {
								where: { id: string };
								data: { quantity: number };
							}) => Promise.resolve({ ...inventory[id], ...data }),
						),
				},
			};
		}

		it("deducts the correct quantity for each line item in the visit", async () => {
			const lineItems: LineItem[] = [
				{ visit_id: "v1", inventory_item_id: "item-1", quantity: 3 },
				{ visit_id: "v1", inventory_item_id: "item-2", quantity: 2 },
			];
			const inventory: InventoryMap = {
				"item-1": makeItem({ id: "item-1", quantity: 10 }),
				"item-2": makeItem({ id: "item-2", quantity: 5 }),
			};
			const tx = makeTx(lineItems, inventory);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);

			expect(tx.inventory_item.update).toHaveBeenCalledWith(
				expect.objectContaining({ where: { id: "item-1" }, data: { quantity: 7 } }),
			);
			expect(tx.inventory_item.update).toHaveBeenCalledWith(
				expect.objectContaining({ where: { id: "item-2" }, data: { quantity: 3 } }),
			);
		});

		it("clamps quantity to 0 when deduction exceeds available stock", async () => {
			const tx = makeTx(
				[{ visit_id: "v1", inventory_item_id: "item-1", quantity: 20 }],
				{ "item-1": makeItem({ id: "item-1", quantity: 5 }) },
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);

			expect(tx.inventory_item.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: { quantity: 0 } }),
			);
		});

		it("skips line items whose inventory record is missing", async () => {
			const tx = makeTx(
				[{ visit_id: "v1", inventory_item_id: "ghost", quantity: 5 }],
				{},
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);

			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("does nothing when the visit has no linked line items", async () => {
			const tx = makeTx([], {});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);

			expect(tx.inventory_item.update).not.toHaveBeenCalled();
		});

		it("triggers low stock alert when quantity first crosses below threshold", async () => {
			// quantity drops from 7 → 4, crossing threshold of 5
			const item = makeItem({
				id: "item-1",
				quantity: 7,
				low_stock_threshold: 5,
				alert_emails_enabled: true,
				alert_email: "ops@example.com",
			});
			const tx = makeTx(
				[{ visit_id: "v1", inventory_item_id: "item-1", quantity: 3 }],
				{ "item-1": item },
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);
			// Fire-and-forget alert — flush microtask queue
			await new Promise<void>((resolve) => setTimeout(resolve, 0));

			expect(mockSendEmail).toHaveBeenCalledWith(
				"ops@example.com",
				"low-stock-alert",
				expect.objectContaining({ current_quantity: 4, threshold: 5 }),
			);
		});

		it("does not send alert when quantity was already below threshold", async () => {
			// quantity (3) already below threshold (5) before deduction
			const item = makeItem({
				id: "item-1",
				quantity: 3,
				low_stock_threshold: 5,
				alert_emails_enabled: true,
				alert_email: "ops@example.com",
			});
			const tx = makeTx(
				[{ visit_id: "v1", inventory_item_id: "item-1", quantity: 1 }],
				{ "item-1": item },
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await deductInventoryForVisit("v1", tx as any);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));

			expect(mockSendEmail).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// updateInventoryThreshold
	// ---------------------------------------------------------------------------
	describe("updateInventoryThreshold", () => {
		it("returns error when item not found", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(null);
			expect((await updateInventoryThreshold("missing", { low_stock_threshold: 10 })).err).toBe(
				"Inventory item not found",
			);
		});

		it("updates threshold and returns item with stock_status", async () => {
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem());
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
			mockDb.inventory_item.findUnique.mockResolvedValue(makeItem({ low_stock_threshold: 5 }));
			const tx = setupTransaction();
			tx.inventory_item.update.mockResolvedValue(makeItem({ low_stock_threshold: null }));

			const result = await updateInventoryThreshold("item-1", { low_stock_threshold: null });
			expect(result.err).toBe("");
			expect(result.item?.low_stock_threshold).toBeNull();
		});
	});
});
