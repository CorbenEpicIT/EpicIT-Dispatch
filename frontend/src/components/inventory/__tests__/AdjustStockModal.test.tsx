import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import AdjustStockModal from "../AdjustStockModal";
import type { InventoryItem } from "../../../types/inventory";

const mockMutateAsync = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("../../../hooks/useInventory", () => ({
	useAdjustStockMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock("../../ui/useToast", () => ({
	useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: "item-1",
		name: "Line Set",
		description: "",
		location: "A1",
		quantity: 10,
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
		unit: "ft",
		is_serialized: false,
		is_batch_tracked: false,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		stock_status: null,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMutateAsync.mockResolvedValue(makeItem());
});

async function setTarget(value: string) {
	const input = screen.getByLabelText("New on-hand quantity");
	await userEvent.clear(input);
	await userEvent.type(input, value);
}

describe("AdjustStockModal — fractional on-hand", () => {
	it("accepts a fractional target and sends the fractional delta", async () => {
		render(<AdjustStockModal item={makeItem({ quantity: 10 })} isOpen onClose={vi.fn()} />);

		await setTarget("12.5");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(mockMutateAsync).toHaveBeenCalledWith({ itemId: "item-1", delta: 2.5 });
	});

	it("rejects a value with 3 decimal places", async () => {
		render(<AdjustStockModal item={makeItem({ quantity: 10 })} isOpen onClose={vi.fn()} />);

		await setTarget("12.505");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(
			screen.getByText("Quantity must be 0 or more, to two decimal places."),
		).toBeInTheDocument();
		expect(mockMutateAsync).not.toHaveBeenCalled();
	});

	it("rejects a negative target", async () => {
		render(<AdjustStockModal item={makeItem({ quantity: 10 })} isOpen onClose={vi.fn()} />);

		await setTarget("-1");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(
			screen.getByText("Quantity must be 0 or more, to two decimal places."),
		).toBeInTheDocument();
		expect(mockMutateAsync).not.toHaveBeenCalled();
	});

	// 12.2 - 10.1 === 2.0999999999999996 in IEEE-754; asserts it gets rounded before sending.
	it("rounds a float-drifted delta to 2 dp before sending", async () => {
		render(<AdjustStockModal item={makeItem({ quantity: 10.1 })} isOpen onClose={vi.fn()} />);

		await setTarget("12.2");
		await userEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(mockMutateAsync).toHaveBeenCalledWith({ itemId: "item-1", delta: 2.1 });
	});
});
