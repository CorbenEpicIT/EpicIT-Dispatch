import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, test, vi, beforeEach } from "vitest";
import AdjustStockModal from "./AdjustStockModal";
import { ADJUSTMENT_TYPE_LABELS } from "../../types/vehicles";
import type { VehicleStockItem, AdjustStockInput } from "../../types/vehicles";

const mockAdjustMutateAsync = vi.fn();
vi.mock("../../hooks/useVehicleStock", () => ({
	useAdjustStockMutation: () => ({
		mutateAsync: mockAdjustMutateAsync,
		isPending: false,
	}),
}));

const mockCatalogQuery = vi.fn();
vi.mock("../../hooks/useInventory", () => ({
	useAllInventoryQuery: () => mockCatalogQuery(),
	useBarcodeScanHandler: () => ({ handleScan: vi.fn(), isScanning: false }),
}));

const mockSerialsQuery = vi.fn();
const mockBatchesQuery = vi.fn();
const mockResolveMutateAsync = vi.fn();
vi.mock("../../hooks/useTracking", () => ({
	useSerialsQuery: (...args: unknown[]) => mockSerialsQuery(...args),
	useBatchesQuery: (...args: unknown[]) => mockBatchesQuery(...args),
	useResolveCodeMutation: () => ({ mutateAsync: mockResolveMutateAsync, isPending: false }),
}));

// Camera scanning depends on getUserMedia/BarcodeDetector, unavailable in jsdom.
vi.mock("../inventory/BarcodeScanner", () => ({
	BarcodeScanner: () => null,
}));

function renderModal(props: Partial<React.ComponentProps<typeof AdjustStockModal>> = {}) {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<AdjustStockModal
				vehicleId="v1"
				stockItems={[]}
				onClose={() => {}}
				{...props}
			/>
		</QueryClientProvider>
	);
}

// SerialCaptureList's per-row "already exists" check debounces 400ms on a real
// timer — settle it so the state update lands inside act() instead of leaking.
async function settleDebounce() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 450));
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockCatalogQuery.mockReturnValue({ data: [], isLoading: false });
	mockSerialsQuery.mockReturnValue({
		data: { serials: [], nextCursor: null },
		isLoading: false,
	});
	mockBatchesQuery.mockReturnValue({ data: { batches: [] }, isLoading: false });
	mockResolveMutateAsync.mockRejectedValue(new Error("No match found"));
	mockAdjustMutateAsync.mockResolvedValue({});
});

describe("AdjustStockModal type picker", () => {
	test("shows exactly the four adjustment types", () => {
		renderModal();
		expect(screen.getByText("Field Loss")).toBeInTheDocument();
		expect(screen.getByText("Transfer In")).toBeInTheDocument();
		expect(screen.getByText("Audit Correction")).toBeInTheDocument();
		expect(screen.getByText("Supplier Purchase")).toBeInTheDocument();
	});

	test("no longer offers warehouse exchange or add-from-warehouse", () => {
		renderModal();
		expect(screen.queryByText("Warehouse Exchange")).not.toBeInTheDocument();
		expect(screen.queryByText("Add from warehouse")).not.toBeInTheDocument();
	});
});

describe("historical record support", () => {
	test("warehouse_exchange label is retained for past records", () => {
		expect(ADJUSTMENT_TYPE_LABELS.warehouse_exchange).toBe("Warehouse Exchange");
	});
});

describe("tracking step — supplier_purchase serialized item", () => {
	test("requires new_serials matching qty and submits the right shape", async () => {
		mockCatalogQuery.mockReturnValue({
			data: [
				{
					id: "inv-serial",
					name: "Compressor",
					category: null,
					is_serialized: true,
					is_batch_tracked: false,
				},
			],
			isLoading: false,
		});

		renderModal({ initialType: "supplier_purchase" });

		await userEvent.click(screen.getByText("+ Add"));
		await userEvent.click(screen.getByText("Review →"));

		// Tracking step should appear — SerialCaptureList's count indicator.
		expect(await screen.findByText("0 / 1 serials")).toBeInTheDocument();
		// Blocked until a serial is captured.
		expect(screen.getByText("Review →").closest("button")).toBeDisabled();

		const input = screen.getByLabelText("Add serial number");
		await userEvent.type(input, "SN-100{Enter}");
		await settleDebounce();

		expect(screen.getByText("1 / 1 serials")).toBeInTheDocument();
		expect(screen.getByText("Review →").closest("button")).not.toBeDisabled();

		await userEvent.click(screen.getByText("Review →"));
		await userEvent.click(screen.getByText("Apply Adjustment"));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.type).toBe("supplier_purchase");
		expect(submitted.lines).toEqual([
			expect.objectContaining({
				inventory_item_id: "inv-serial",
				qty_after: 1,
				new_serials: ["SN-100"],
			}),
		]);
	});
});

describe("tracking step — supplier_purchase batch-tracked item", () => {
	test("requires new_batch and submits correctly", async () => {
		mockCatalogQuery.mockReturnValue({
			data: [
				{
					id: "inv-batch",
					name: "Refrigerant Jug",
					category: null,
					is_serialized: false,
					is_batch_tracked: true,
				},
			],
			isLoading: false,
		});

		renderModal({ initialType: "supplier_purchase" });

		await userEvent.click(screen.getByText("+ Add"));
		await userEvent.click(screen.getByText("Review →"));

		const batchInput = await screen.findByLabelText("Batch or lot number");
		expect(screen.getByText("Review →").closest("button")).toBeDisabled();

		await userEvent.type(batchInput, "LOT-2026-01");

		expect(screen.getByText("Review →").closest("button")).not.toBeDisabled();

		await userEvent.click(screen.getByText("Review →"));
		await userEvent.click(screen.getByText("Apply Adjustment"));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.lines).toEqual([
			expect.objectContaining({
				inventory_item_id: "inv-batch",
				qty_after: 1,
				new_batch: expect.objectContaining({ batch_number: "LOT-2026-01" }),
			}),
		]);
	});
});

describe("tracking step — supplier_purchase dual-tracked (serialized + batch) item", () => {
	test("requires both serials and batch, and submits both on one line", async () => {
		mockCatalogQuery.mockReturnValue({
			data: [
				{
					id: "inv-dual",
					name: "Compressor",
					category: null,
					is_serialized: true,
					is_batch_tracked: true,
				},
			],
			isLoading: false,
		});

		renderModal({ initialType: "supplier_purchase" });

		await userEvent.click(screen.getByText("+ Add"));
		await userEvent.click(screen.getByText("Review →"));

		// Both capture UIs render for a dual-tracked line.
		expect(await screen.findByText("0 / 1 serials")).toBeInTheDocument();
		expect(screen.getByLabelText("Batch or lot number")).toBeInTheDocument();
		expect(screen.getByText("Review →").closest("button")).toBeDisabled();

		const serialInput = screen.getByLabelText("Add serial number");
		await userEvent.type(serialInput, "SN-200{Enter}");
		await settleDebounce();

		// Serials alone aren't enough — batch is still required.
		expect(screen.getByText("Review →").closest("button")).toBeDisabled();

		await userEvent.type(screen.getByLabelText("Batch or lot number"), "LOT-2026-02");

		expect(screen.getByText("Review →").closest("button")).not.toBeDisabled();

		await userEvent.click(screen.getByText("Review →"));
		await userEvent.click(screen.getByText("Apply Adjustment"));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.lines).toEqual([
			expect.objectContaining({
				inventory_item_id: "inv-dual",
				qty_after: 1,
				new_serials: ["SN-200"],
				new_batch: expect.objectContaining({ batch_number: "LOT-2026-02" }),
			}),
		]);
	});
});

const serializedStockItem: VehicleStockItem = {
	id: "si-serial",
	vehicle_id: "v1",
	inventory_item_id: "inv-serial",
	inventory_item: {
		id: "inv-serial",
		name: "Compressor",
		category: null,
		is_serialized: true,
		is_batch_tracked: false,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 3,
	qty_min: 1,
	qty_standard: null,
	updated_at: "",
	created_at: "",
};

describe("tracking step — field_loss existing-unit picker", () => {
	test("lists on-vehicle candidates, requires exact count, submits serial_unit_ids", async () => {
		mockSerialsQuery.mockReturnValue({
			data: {
				serials: [
					{ id: "su1", serial_number: "SN-A", status: "on_vehicle" },
					{ id: "su2", serial_number: "SN-B", status: "on_vehicle" },
				],
				nextCursor: null,
			},
			isLoading: false,
		});

		renderModal({ initialType: "field_loss", stockItems: [serializedStockItem] });

		const qtyInput = screen.getByDisplayValue("3");
		fireEvent.change(qtyInput, { target: { value: "2" } });
		await userEvent.click(screen.getByText("Review →"));

		expect(await screen.findByText("Select existing units")).toBeInTheDocument();
		expect(mockSerialsQuery).toHaveBeenCalledWith("inv-serial", {
			status: "on_vehicle",
			vehicleId: "v1",
		});
		expect(screen.getByText("SN-A")).toBeInTheDocument();
		expect(screen.getByText("SN-B")).toBeInTheDocument();
		expect(screen.getByText("Review →").closest("button")).toBeDisabled();

		await userEvent.click(screen.getByLabelText("Select unit SN-A"));
		expect(screen.getByText("1 / 1 selected")).toBeInTheDocument();
		expect(screen.getByText("Review →").closest("button")).not.toBeDisabled();

		await userEvent.click(screen.getByText("Review →"));
		await userEvent.click(screen.getByText("Apply Adjustment"));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-serial",
				qty_after: 2,
				serial_unit_ids: ["su1"],
			}),
		]);
	});
});

const batchStockItem: VehicleStockItem = {
	id: "si-batch",
	vehicle_id: "v1",
	inventory_item_id: "inv-batch",
	inventory_item: {
		id: "inv-batch",
		name: "Refrigerant Jug",
		category: null,
		is_serialized: false,
		is_batch_tracked: true,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 5,
	qty_min: 1,
	qty_standard: null,
	updated_at: "",
	created_at: "",
};

describe("tracking step — batch-tracked line without explicit pick", () => {
	test("submits without batch_picks, letting FIFO handle it", async () => {
		renderModal({ initialType: "field_loss", stockItems: [batchStockItem] });

		const qtyInput = screen.getByDisplayValue("5");
		fireEvent.change(qtyInput, { target: { value: "4" } });
		await userEvent.click(screen.getByText("Review →"));

		expect(await screen.findByLabelText("Batch / lot")).toBeInTheDocument();
		// No pick required — Next is enabled immediately.
		expect(screen.getByText("Review →").closest("button")).not.toBeDisabled();

		await userEvent.click(screen.getByText("Review →"));
		await userEvent.click(screen.getByText("Apply Adjustment"));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.lines).toHaveLength(1);
		expect(submitted.lines[0]).not.toHaveProperty("batch_picks");
		expect(submitted.lines[0]).toEqual(
			expect.objectContaining({ stock_item_id: "si-batch", qty_after: 4 })
		);
	});
});

const plainStockItem: VehicleStockItem = {
	id: "si-plain",
	vehicle_id: "v1",
	inventory_item_id: "inv-plain",
	inventory_item: {
		id: "inv-plain",
		name: "Zip Ties",
		category: null,
		is_serialized: false,
		is_batch_tracked: false,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 10,
	qty_min: 1,
	qty_standard: null,
	updated_at: "",
	created_at: "",
};

describe("tracking step — all-non-tracked lines", () => {
	test("does not appear at all; existing flow proceeds straight to confirm", async () => {
		renderModal({ initialType: "field_loss", stockItems: [plainStockItem] });

		const qtyInput = screen.getByDisplayValue("10");
		fireEvent.change(qtyInput, { target: { value: "8" } });
		await userEvent.click(screen.getByText("Review →"));

		// Straight to Confirm — no tracking-step content anywhere.
		expect(await screen.findByText("Apply Adjustment")).toBeInTheDocument();
		expect(screen.queryByText("Select existing units")).not.toBeInTheDocument();
		expect(screen.queryByText("Batch / lot")).not.toBeInTheDocument();

		await userEvent.click(screen.getByText("Apply Adjustment"));
		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const submitted = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(submitted.lines).toEqual([
			expect.objectContaining({ stock_item_id: "si-plain", qty_after: 8 }),
		]);
	});
});

describe("serial preselection via initialSerialUnitId", () => {
	const serializedStockItem = {
		id: "st1",
		vehicle_id: "v1",
		inventory_item_id: "i1",
		qty_on_hand: 2,
		qty_min: 0,
		qty_standard: null,
		inventory_item: {
			id: "i1",
			name: "Capacitor 45/5",
			quantity: 10,
			unit: "each",
			category: null,
			low_stock_threshold: null,
			is_serialized: true,
			is_batch_tracked: false,
		},
	} as unknown as VehicleStockItem;

	const units = [
		{ id: "su1", serial_number: "SN-ABC-123" },
		{ id: "su2", serial_number: "SN-XYZ-789" },
	];

	beforeEach(() => {
		mockSerialsQuery.mockReturnValue({
			data: { serials: units, nextCursor: null },
			isLoading: false,
		});
	});

	test("preselects the given unit in the picker", async () => {
		renderModal({
			stockItems: [serializedStockItem],
			initialType: "field_loss",
			initialFocusItemId: "st1",
			initialSerialUnitId: "su2",
		});

		// initialType=field_loss + focus opens on the quantities step with qty
		// already decremented by 1 (AdjustStockModal.tsx:754) — advance to tracking.
		await userEvent.click(screen.getByRole("button", { name: /review/i }));

		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-XYZ-789" })
		).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-ABC-123" })
		).not.toBeChecked();
	});

	test("submits the preselected unit without further picking", async () => {
		renderModal({
			stockItems: [serializedStockItem],
			initialType: "field_loss",
			initialFocusItemId: "st1",
			initialSerialUnitId: "su2",
		});

		await userEvent.click(screen.getByRole("button", { name: /review/i }));
		await userEvent.click(screen.getByRole("button", { name: /review/i }));
		await userEvent.click(screen.getByRole("button", { name: /apply/i }));

		await waitFor(() => expect(mockAdjustMutateAsync).toHaveBeenCalled());
		const payload = mockAdjustMutateAsync.mock.calls[0][0] as AdjustStockInput;
		expect(payload.lines[0].serial_unit_ids).toEqual(["su2"]);
	});

	test("omitting initialSerialUnitId leaves the picker empty", async () => {
		renderModal({
			stockItems: [serializedStockItem],
			initialType: "field_loss",
			initialFocusItemId: "st1",
		});

		await userEvent.click(screen.getByRole("button", { name: /review/i }));

		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-ABC-123" })
		).not.toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-XYZ-789" })
		).not.toBeChecked();
	});

	// TechnicianVehiclePage remounts this modal with
	// key={`${scanFocusItemId ?? "manual"}:${pendingLostSerialId ?? ""}`} so a
	// second scan-a-lost-unit flow (a fresh initialSerialUnitId) reseeds
	// instead of reusing the previous instance's stale internal state. A
	// changed `key` on re-render is exactly what forces React to unmount the
	// old instance and mount a fresh one, so exercising that here via
	// `rerender` with a different key is a faithful stand-in for the parent's
	// remount behavior.
	test("reopening with a new initialSerialUnitId (new key) reseeds instead of keeping the stale selection", async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const props = {
			vehicleId: "v1",
			stockItems: [serializedStockItem],
			onClose: () => {},
			initialType: "field_loss" as const,
			initialFocusItemId: "st1",
		};

		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<AdjustStockModal key="su1" {...props} initialSerialUnitId="su1" />
			</QueryClientProvider>
		);

		await userEvent.click(screen.getByRole("button", { name: /review/i }));
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-ABC-123" })
		).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-XYZ-789" })
		).not.toBeChecked();

		rerender(
			<QueryClientProvider client={qc}>
				<AdjustStockModal key="su2" {...props} initialSerialUnitId="su2" />
			</QueryClientProvider>
		);

		await userEvent.click(screen.getByRole("button", { name: /review/i }));
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-XYZ-789" })
		).toBeChecked();
		expect(
			screen.getByRole("checkbox", { name: "Select unit SN-ABC-123" })
		).not.toBeChecked();
	});
});
