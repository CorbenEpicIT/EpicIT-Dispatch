import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../../test/testUtils";
import CreateInventoryItem from "../CreateInventoryItem";
import type { InventoryItem } from "../../../types/inventory";
import type { ReceiveInventoryResponse } from "../../../types/tracking";
import type { SerialCaptureListProps } from "../tracking/SerialCaptureList";
import type { BatchCaptureFieldsProps } from "../tracking/BatchCaptureFields";

// ── Mocks ────────────────────────────────────────────────────────────────
// This suite exercises CreateInventoryItem's own orchestration (tracking
// toggle, wizard restructuring, deferred create/receive at Submit, label
// queueing). SerialCaptureList / BatchCaptureFields are already covered by
// their own test suites — here they're replaced with trivial stand-ins that
// let a test commit a capture value without dealing with debounce timers,
// scanner mounts, or a real /resolve-code network mock.

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockUploadMutateAsync = vi.fn();
const mockSetTagsMutateAsync = vi.fn();

vi.mock("../../../hooks/useInventory", () => ({
	useCreateInventoryItemMutation: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
	useUpdateInventoryItemMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
	useUploadInventoryImageMutation: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false }),
	useInventoryTagsQuery: () => ({ data: [] }),
	useSetItemTagsMutation: () => ({ mutateAsync: mockSetTagsMutateAsync, isPending: false }),
}));

const mockEnsureCodeMutateAsync = vi.fn();

vi.mock("../../../hooks/useTracking", () => ({
	useEnsureItemCodeMutation: () => ({ mutateAsync: mockEnsureCodeMutateAsync, isPending: false }),
	useUpdateItemTrackingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Receive is now a direct api call fired at Submit (not a hook bound to a
// pre-existing itemId), so it's mocked at the api layer.
const mockReceiveInventory = vi.fn();

vi.mock("../../../api/tracking", () => ({
	receiveInventory: (itemId: string, input: unknown) => mockReceiveInventory(itemId, input),
}));

// The component invalidates the warehouse tree after a receive — no-op it so
// the test doesn't depend on real query invalidation.
vi.mock("../../../lib/queryKeys", () => ({
	invalidate: { warehouse: vi.fn() },
}));

vi.mock("../../../hooks/useQuickbooks", () => ({
	useQBStatusQuery: () => ({ data: { connected: false } }),
	useQBItemsQuery: () => ({ data: [], isLoading: false }),
	useQBMappedItemsQuery: () => ({ data: [] }),
	useImportQBItemMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockAddToLabelQueue = vi.fn();

vi.mock("../../../stores/labelQueueStore", () => ({
	useLabelQueueStore: (selector: (s: { add: typeof mockAddToLabelQueue }) => unknown) =>
		selector({ add: mockAddToLabelQueue }),
}));

vi.mock("../tracking/SerialCaptureList", () => ({
	default: ({ itemId, targetCount, value, onChange }: SerialCaptureListProps) => (
		<div data-testid="serial-capture" data-item-id={itemId} data-target={targetCount}>
			<span data-testid="serial-count">{value.length}</span>
			<button
				type="button"
				onClick={() =>
					onChange(Array.from({ length: targetCount }, (_, i) => `SN-${i + 1}`))
				}
			>
				Fill Serials
			</button>
		</div>
	),
}));

vi.mock("../tracking/BatchCaptureFields", () => ({
	default: ({ itemId, onChange }: BatchCaptureFieldsProps) => (
		<div data-testid="batch-capture" data-item-id={itemId}>
			<button
				type="button"
				onClick={() =>
					onChange({ mode: "new", batch_number: "LOT-1", expires_at: null, supplier: "" })
				}
			>
				Fill Batch
			</button>
		</div>
	),
}));

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: "item-1",
		name: "Widget",
		description: "",
		location: "A1",
		quantity: 0,
		unit_price: null,
		cost: null,
		sku: null,
		barcode: null,
		is_active: true,
		low_stock_threshold: null,
		image_urls: [],
		alert_emails_enabled: false,
		alert_email: null,
		category: null,
		unit: "each",
		is_serialized: false,
		is_batch_tracked: false,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		stock_status: null,
		...overrides,
	};
}

async function fillBasicsAndAdvance(name: string) {
	await userEvent.type(screen.getByPlaceholderText("Item Name"), name);
	await userEvent.type(screen.getByPlaceholderText("e.g. A42 - 325"), "A1-100");
	await userEvent.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("tracked item create — serialized, quantity > 0", () => {
	it("captures serials in the wizard and writes create + receive only on Finish", async () => {
		const onClose = vi.fn();
		mockCreateMutateAsync.mockResolvedValue(makeItem({ id: "item-1", name: "Widget", barcode: null }));
		mockEnsureCodeMutateAsync.mockResolvedValue(makeItem({ barcode: "ITM-CODE" }));
		const receiveResult: ReceiveInventoryResponse = {
			item: makeItem({ id: "item-1", quantity: 2, is_serialized: true }),
			created_serials: [
				{ id: "s1", code: "SU-1", serial_number: "SN-1", status: "in_warehouse" },
				{ id: "s2", code: "SU-2", serial_number: "SN-2", status: "in_warehouse" },
			],
		};
		mockReceiveInventory.mockResolvedValue(receiveResult);

		render(<CreateInventoryItem isOpen onClose={onClose} />);

		await fillBasicsAndAdvance("Widget");

		// Step 2 — set quantity, toggle serial tracking on.
		await userEvent.clear(screen.getByLabelText("Quantity"));
		await userEvent.type(screen.getByLabelText("Quantity"), "2");
		await userEvent.click(screen.getByLabelText("Track by serial number"));
		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		// Step 3 — capture step. Nothing is created yet, and the capture
		// components no longer receive a real itemId (it doesn't exist until
		// Submit).
		expect(mockCreateMutateAsync).not.toHaveBeenCalled();
		const captureEl = await screen.findByTestId("serial-capture");
		expect(captureEl).toHaveAttribute("data-item-id", "");
		expect(captureEl).toHaveAttribute("data-target", "2");

		await userEvent.click(screen.getByRole("button", { name: "Fill Serials" }));
		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		// Step 4 — images/review. Still no write until the user clicks Finish.
		await screen.findByText(/will be recorded/i);
		expect(mockCreateMutateAsync).not.toHaveBeenCalled();
		expect(mockReceiveInventory).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole("button", { name: "Finish" }));

		// Finish creates the item (qty 0 + flags) then receives the captured
		// serials as initial stock.
		await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
		expect(mockCreateMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Widget",
				quantity: 0,
				is_serialized: true,
				is_batch_tracked: false,
			}),
		);
		expect(mockAddToLabelQueue).toHaveBeenCalledWith(
			expect.objectContaining({ id: "item-1", kind: "item", code: "ITM-CODE" }),
		);

		await waitFor(() => expect(mockReceiveInventory).toHaveBeenCalledTimes(1));
		expect(mockReceiveInventory).toHaveBeenCalledWith("item-1", {
			qty: 2,
			serial_numbers: ["SN-1", "SN-2"],
		});

		expect(mockAddToLabelQueue).toHaveBeenCalledWith(
			expect.objectContaining({ id: "s1", code: "SU-1", kind: "serial", secondaryLabel: "SN-1" }),
		);
		expect(mockAddToLabelQueue).toHaveBeenCalledWith(
			expect.objectContaining({ id: "s2", code: "SU-2", kind: "serial", secondaryLabel: "SN-2" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		// Images attach via the create payload — no follow-up update call.
		expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
	});
});

describe("tracked item create — serialized AND batch-tracked, quantity > 0", () => {
	it("captures both and sends serial_numbers + batch together on Finish", async () => {
		const onClose = vi.fn();
		mockCreateMutateAsync.mockResolvedValue(makeItem({ id: "item-1", name: "Dual", barcode: null }));
		mockEnsureCodeMutateAsync.mockResolvedValue(makeItem({ barcode: "ITM-CODE" }));
		const receiveResult: ReceiveInventoryResponse = {
			item: makeItem({ id: "item-1", quantity: 2, is_serialized: true, is_batch_tracked: true }),
			created_serials: [
				{ id: "s1", code: "SU-1", serial_number: "SN-1", status: "in_warehouse" },
				{ id: "s2", code: "SU-2", serial_number: "SN-2", status: "in_warehouse" },
			],
			batch: { id: "b1", code: "LOT-1", batch_number: "LOT-1" },
		};
		mockReceiveInventory.mockResolvedValue(receiveResult);

		render(<CreateInventoryItem isOpen onClose={onClose} />);

		await fillBasicsAndAdvance("Dual");

		await userEvent.clear(screen.getByLabelText("Quantity"));
		await userEvent.type(screen.getByLabelText("Quantity"), "2");
		await userEvent.click(screen.getByLabelText("Track by serial number"));
		await userEvent.click(screen.getByLabelText("Track by batch or lot"));

		// Both toggles stay on — turning batch on no longer clears serial.
		expect(screen.getByLabelText("Track by serial number")).toHaveAttribute("aria-checked", "true");
		expect(screen.getByLabelText("Track by batch or lot")).toHaveAttribute("aria-checked", "true");

		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		// Capture step renders both stand-ins with no real itemId; still no write.
		const serialEl = await screen.findByTestId("serial-capture");
		expect(serialEl).toHaveAttribute("data-item-id", "");
		expect(screen.getByTestId("batch-capture")).toHaveAttribute("data-item-id", "");
		expect(mockCreateMutateAsync).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole("button", { name: "Fill Serials" }));
		await userEvent.click(screen.getByRole("button", { name: "Fill Batch" }));
		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		await screen.findByText(/will be recorded/i);
		await userEvent.click(screen.getByRole("button", { name: "Finish" }));

		await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
		expect(mockCreateMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ quantity: 0, is_serialized: true, is_batch_tracked: true }),
		);

		await waitFor(() => expect(mockReceiveInventory).toHaveBeenCalledTimes(1));
		expect(mockReceiveInventory).toHaveBeenCalledWith("item-1", {
			qty: 2,
			serial_numbers: ["SN-1", "SN-2"],
			batch: { batch_number: "LOT-1", expires_at: null, supplier: undefined },
		});
	});
});

describe("tracked item create — quantity 0", () => {
	it("creates the item with tracking flags in a single call and never calls receive", async () => {
		const onClose = vi.fn();
		mockCreateMutateAsync.mockResolvedValue(makeItem({ id: "item-2", name: "Zero Qty", barcode: "BC-1" }));

		render(<CreateInventoryItem isOpen onClose={onClose} />);

		await fillBasicsAndAdvance("Zero Qty");

		// Quantity stays at 0 (default) — just toggle tracking on.
		await userEvent.click(screen.getByLabelText("Track by batch or lot"));
		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		// Step 3 is the last step here (showCaptureStep is false since qty is 0)
		// — the button reads "Create Item" and calls the plain single-call flow.
		await userEvent.click(screen.getByRole("button", { name: "Create Item" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

		expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
		expect(mockCreateMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Zero Qty", quantity: 0, is_batch_tracked: true }),
		);
		expect(mockReceiveInventory).not.toHaveBeenCalled();
	});
});

describe("non-tracked item create (regression)", () => {
	it("keeps the exact single-call create flow with no tracking flags", async () => {
		const onClose = vi.fn();
		mockCreateMutateAsync.mockResolvedValue(makeItem({ id: "item-3", name: "Plain", barcode: "BC-2" }));

		render(<CreateInventoryItem isOpen onClose={onClose} />);

		await fillBasicsAndAdvance("Plain");

		await userEvent.clear(screen.getByLabelText("Quantity"));
		await userEvent.type(screen.getByLabelText("Quantity"), "5");
		await userEvent.click(screen.getByRole("button", { name: "Next" }));

		await userEvent.click(screen.getByRole("button", { name: "Create Item" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

		expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1);
		const payload = mockCreateMutateAsync.mock.calls[0][0];
		expect(payload.quantity).toBe(5);
		expect(payload.is_serialized).toBeUndefined();
		expect(payload.is_batch_tracked).toBeUndefined();
		expect(mockReceiveInventory).not.toHaveBeenCalled();

		expect(mockAddToLabelQueue).toHaveBeenCalledWith(
			expect.objectContaining({ id: "item-3", kind: "item", code: "BC-2" }),
		);
	});
});
