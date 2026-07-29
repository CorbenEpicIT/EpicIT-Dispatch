import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import RestockWorkflow from "./RestockWorkflow";
import type { VehicleStockItem } from "../../types/vehicles";

const mockCompleteMutate = vi.fn();
const mockTomorrowRequirementsQuery = vi.fn();
const mockVehicleUsageTodayQuery = vi.fn();
vi.mock("../../hooks/useVehicleStock", () => ({
	useCompleteRestockMutation: () => ({
		mutate: mockCompleteMutate,
		isPending: false,
	}),
	// mockReturnValue (not an inline arrow returning a literal) so `data` keeps
	// the same object/array reference across re-renders — RestockWorkflow's
	// useMemo/useEffect chain depends on that reference stability, exactly like
	// TanStack Query provides for real; a fresh literal each call causes an
	// infinite render loop (tomorrowVisits -> tomorrowNeeds -> effect -> setState -> …).
	useTomorrowRequirementsQuery: (...args: unknown[]) => mockTomorrowRequirementsQuery(...args),
	useVehicleUsageTodayQuery: (...args: unknown[]) => mockVehicleUsageTodayQuery(...args),
}));

const mockSerialsQuery = vi.fn();
const mockBatchesQuery = vi.fn();
vi.mock("../../hooks/useTracking", () => ({
	useSerialsQuery: (...args: unknown[]) => mockSerialsQuery(...args),
	useBatchesQuery: (...args: unknown[]) => mockBatchesQuery(...args),
	useResolveCodeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Camera scanning depends on getUserMedia/BarcodeDetector, unavailable in jsdom.
vi.mock("../inventory/BarcodeScanner", () => ({
	BarcodeScanner: () => null,
}));

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
		quantity: 10,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 2,
	qty_min: 1,
	qty_standard: 5,
	updated_at: "",
	created_at: "",
};

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
		quantity: 10,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 1,
	qty_min: 1,
	qty_standard: 4,
	updated_at: "",
	created_at: "",
};

// Known client-side shortfall: qtyToRestock (standard 5 - on_hand 2 = 3) exceeds
// warehouse quantity (2) — the "already known" shortfall signal RestockPanel's
// own anyShortfall check uses, reused here per-line. qtyToRestock (3) equals the
// mocked serials list length so a "fully selected" capture is reachable in the UI.
const shortSerializedStockItem: VehicleStockItem = {
	id: "si-serial-short",
	vehicle_id: "v1",
	inventory_item_id: "inv-serial-short",
	inventory_item: {
		id: "inv-serial-short",
		name: "Rare Compressor",
		category: null,
		is_serialized: true,
		is_batch_tracked: false,
		quantity: 2,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 2,
	qty_min: 1,
	qty_standard: 5,
	updated_at: "",
	created_at: "",
};

// Already met (qtyToRestock === 0) but serialized — dimmed row, must never show
// tracking UI even though the item itself is trackable.
const metSerializedStockItem: VehicleStockItem = {
	id: "si-serial-met",
	vehicle_id: "v1",
	inventory_item_id: "inv-serial-met",
	inventory_item: {
		id: "inv-serial-met",
		name: "Stocked Compressor",
		category: null,
		is_serialized: true,
		is_batch_tracked: false,
		quantity: 10,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 5,
	qty_min: 1,
	qty_standard: 5,
	updated_at: "",
	created_at: "",
};

// Already met (qtyToRestock === 0) but batch-tracked — same dimmed-row coverage
// for the batch-picker branch.
const metBatchStockItem: VehicleStockItem = {
	id: "si-batch-met",
	vehicle_id: "v1",
	inventory_item_id: "inv-batch-met",
	inventory_item: {
		id: "inv-batch-met",
		name: "Stocked Refrigerant Jug",
		category: null,
		is_serialized: false,
		is_batch_tracked: true,
		quantity: 10,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 4,
	qty_min: 1,
	qty_standard: 4,
	updated_at: "",
	created_at: "",
};

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
		quantity: 10,
	} as unknown as VehicleStockItem["inventory_item"],
	qty_on_hand: 2,
	qty_min: 1,
	qty_standard: 2,
	updated_at: "",
	created_at: "",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockTomorrowRequirementsQuery.mockReturnValue({ data: [] });
	mockVehicleUsageTodayQuery.mockReturnValue({ data: [], isLoading: false });
	mockSerialsQuery.mockReturnValue({
		data: {
			serials: [
				{ id: "su1", serial_number: "SN-A", status: "in_warehouse" },
				{ id: "su2", serial_number: "SN-B", status: "in_warehouse" },
				{ id: "su3", serial_number: "SN-C", status: "in_warehouse" },
			],
			nextCursor: null,
		},
		isLoading: false,
	});
	mockBatchesQuery.mockReturnValue({
		data: { batches: [{ id: "batch1", batch_number: "LOT-1", qty_in_warehouse: 20, vehicles: [], recalled_at: null }] },
		isLoading: false,
	});
});

function renderWorkflow(stockItems: VehicleStockItem[]) {
	return render(<RestockWorkflow vehicleId="v1" stockItems={stockItems} />);
}

describe("RestockWorkflow — tracking capture (P8-2)", () => {
	test("renders the existing-unit picker for a serialized line needing restock", async () => {
		renderWorkflow([serializedStockItem]);

		expect(await screen.findByText("Select existing units")).toBeInTheDocument();
		expect(mockSerialsQuery).toHaveBeenCalledWith("inv-serial", { status: "in_warehouse", vehicleId: undefined });
		expect(screen.getByText("SN-A")).toBeInTheDocument();
		// Warn-don't-block cue, not a blocker.
		expect(screen.getByText(/0 of 3 units scanned/)).toBeInTheDocument();
	});

	test("renders the existing-batch picker for a batch-tracked line needing restock", async () => {
		renderWorkflow([batchStockItem]);

		expect(await screen.findByLabelText("Batch / lot")).toBeInTheDocument();
	});

	test("does not render a picker for a plain (untracked) or already-met line", () => {
		renderWorkflow([plainStockItem]);

		expect(screen.queryByText("Select existing units")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Batch / lot")).not.toBeInTheDocument();
	});

	test("submitting with zero units scanned still applies — warn, don't block", async () => {
		renderWorkflow([serializedStockItem]);

		await userEvent.click(await screen.findByText("Apply Restock"));
		await userEvent.click(await screen.findByText("Confirm & Apply"));

		expect(mockCompleteMutate).toHaveBeenCalledTimes(1);
		const [input] = mockCompleteMutate.mock.calls[0];
		expect(input.restock_lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-serial",
				qty_to_restock: 3,
				serial_unit_ids: undefined,
				batch_picks: undefined,
			}),
		]);
	});

	test("submitting with a partial selection (fewer than qtyToRestock) omits serial_unit_ids entirely", async () => {
		// Finding 1: the backend's applySerialMovement requires unitIds.length to
		// exactly equal the movement qty, or it throws and aborts the whole
		// transaction (all lines) — a short array is NOT treated as "partial,
		// rest untracked." Only an omitted/empty field takes the safe gap path.
		renderWorkflow([serializedStockItem]);

		await screen.findByText("Select existing units");
		await userEvent.click(screen.getByLabelText("Select unit SN-A"));
		await userEvent.click(screen.getByLabelText("Select unit SN-B"));
		// 2 of 3 selected — qtyToRestock is 3, so this is a short (partial) capture.

		await userEvent.click(screen.getByText("Apply Restock"));
		await userEvent.click(await screen.findByText("Confirm & Apply"));

		expect(mockCompleteMutate).toHaveBeenCalledTimes(1);
		const [input] = mockCompleteMutate.mock.calls[0];
		expect(input.restock_lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-serial",
				qty_to_restock: 3,
				serial_unit_ids: undefined,
				batch_picks: undefined,
			}),
		]);
	});

	test("submitting with an exact-match selection (all qtyToRestock units) includes the full serial_unit_ids array", async () => {
		renderWorkflow([serializedStockItem]);

		await screen.findByText("Select existing units");
		await userEvent.click(screen.getByLabelText("Select unit SN-A"));
		await userEvent.click(screen.getByLabelText("Select unit SN-B"));
		await userEvent.click(screen.getByLabelText("Select unit SN-C"));
		// All 3 of 3 selected — qtyToRestock is 3, so this exactly matches.

		await userEvent.click(screen.getByText("Apply Restock"));
		await userEvent.click(await screen.findByText("Confirm & Apply"));

		expect(mockCompleteMutate).toHaveBeenCalledTimes(1);
		const [input] = mockCompleteMutate.mock.calls[0];
		expect(input.restock_lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-serial",
				qty_to_restock: 3,
				serial_unit_ids: ["su1", "su2", "su3"],
			}),
		]);
	});

	test("a line with a known client-side warehouse shortfall never sends serial_unit_ids, even when fully selected", async () => {
		// Finding 2: the backend caps qty_restocked at its own fresh-locked
		// warehouse availability, not the client's qtyToRestock, so an exact
		// client-side capture can still mismatch the server's capped `actual`.
		// When the client already knows (from its own last-known warehouse qty)
		// that this line will be capped, tracking fields are suppressed
		// proactively rather than risking a mismatch.
		renderWorkflow([shortSerializedStockItem]);

		await screen.findByText("Select existing units");
		await userEvent.click(screen.getByLabelText("Select unit SN-A"));
		await userEvent.click(screen.getByLabelText("Select unit SN-B"));
		await userEvent.click(screen.getByLabelText("Select unit SN-C"));
		// All 3 available units selected, matching this line's qtyToRestock (3) —
		// a "complete" capture that would otherwise pass Finding 1's exact-match
		// check, but the warehouse (quantity: 2) is already known to be short.

		await userEvent.click(screen.getByText("Apply Restock"));
		await userEvent.click(await screen.findByText("Confirm & Apply"));

		expect(mockCompleteMutate).toHaveBeenCalledTimes(1);
		const [input] = mockCompleteMutate.mock.calls[0];
		expect(input.restock_lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-serial-short",
				qty_to_restock: 3,
				serial_unit_ids: undefined,
				batch_picks: undefined,
			}),
		]);
	});

	test("a dimmed already-met tracked row (serialized or batch) never shows tracking UI", () => {
		// Both lines are "already met" (qtyToRestock === 0) despite being
		// trackable items — showTracking requires qtyToRestock > 0, so neither
		// picker should render for either row.
		renderWorkflow([metSerializedStockItem, metBatchStockItem]);

		expect(screen.queryByText("Select existing units")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Batch / lot")).not.toBeInTheDocument();
	});

	test("submitting with a batch selected includes batch_picks summed to qty_to_restock", async () => {
		renderWorkflow([batchStockItem]);

		await screen.findByLabelText("Batch / lot");
		await userEvent.selectOptions(screen.getByLabelText("Batch / lot"), "batch1");

		await userEvent.click(screen.getByText("Apply Restock"));
		await userEvent.click(await screen.findByText("Confirm & Apply"));

		expect(mockCompleteMutate).toHaveBeenCalledTimes(1);
		const [input] = mockCompleteMutate.mock.calls[0];
		expect(input.restock_lines).toEqual([
			expect.objectContaining({
				stock_item_id: "si-batch",
				qty_to_restock: 3,
				batch_picks: [{ batch_id: "batch1", qty: 3 }],
			}),
		]);
	});
});
