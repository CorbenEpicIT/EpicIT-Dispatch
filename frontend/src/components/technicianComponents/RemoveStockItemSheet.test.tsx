import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import RemoveStockItemSheet from "./RemoveStockItemSheet";
import type { VehicleStockItem } from "../../types/vehicles";

const mockMutateAsync = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("../../hooks/useVehicleStock", () => ({
	useDeleteVehicleStockItemMutation: () => ({
		mutateAsync: mockMutateAsync,
		isPending: false,
	}),
}));
vi.mock("../ui/useToast", () => ({
	useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

function stockItem(
	overrides: Partial<Omit<VehicleStockItem, "inventory_item">> & {
		inventory_item?: Partial<VehicleStockItem["inventory_item"]>;
	} = {},
): VehicleStockItem {
	const { inventory_item, ...rest } = overrides;
	return {
		id: "si1",
		inventory_item_id: "i1",
		qty_on_hand: 0,
		inventory_item: {
			id: "i1",
			name: "Capacitor 45/5",
			category: "Capacitors",
			unit: "each",
			...inventory_item,
		},
		...rest,
	} as VehicleStockItem;
}

function renderSheet(props: Partial<React.ComponentProps<typeof RemoveStockItemSheet>> = {}) {
	return render(
		<RemoveStockItemSheet
			vehicleId="v1"
			stockItems={[stockItem()]}
			onAdjust={() => {}}
			{...props}
		/>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMutateAsync.mockResolvedValue(undefined);
});

describe("RemoveStockItemSheet", () => {
	test("empty state when the stock list has no items", () => {
		renderSheet({ stockItems: [] });
		expect(screen.getByText(/no items on this vehicle's stock list/i)).toBeInTheDocument();
	});

	test("lists items with their on-hand quantity", () => {
		renderSheet({
			stockItems: [
				stockItem({ id: "a", inventory_item: { id: "i1", name: "Zeta Valve", category: null, unit: "each" }, qty_on_hand: 0 }),
				stockItem({ id: "b", inventory_item: { id: "i2", name: "Alpha Filter", category: null, unit: "each" }, qty_on_hand: 4 }),
			],
		});
		expect(screen.getByText("Alpha Filter")).toBeInTheDocument();
		expect(screen.getByText("Zeta Valve")).toBeInTheDocument();
		expect(screen.getByText("qty 4")).toBeInTheDocument();
	});

	test("filters by search", async () => {
		renderSheet({
			stockItems: [
				stockItem({ id: "a", inventory_item: { id: "i1", name: "Capacitor 45/5", category: null, unit: "each" } }),
				stockItem({ id: "b", inventory_item: { id: "i2", name: "Contactor 24V", category: null, unit: "each" } }),
			],
		});
		await userEvent.type(screen.getByPlaceholderText(/search stock list/i), "contact");
		expect(screen.getByText("Contactor 24V")).toBeInTheDocument();
		expect(screen.queryByText("Capacitor 45/5")).not.toBeInTheDocument();
	});

	describe("gate on qty > 0", () => {
		test("disables removal and offers a jump to Adjust", () => {
			renderSheet({ stockItems: [stockItem({ qty_on_hand: 3 })] });
			expect(screen.getByRole("button", { name: /remove capacitor/i })).toBeDisabled();
			expect(screen.getByRole("button", { name: /adjust to 0/i })).toBeInTheDocument();
		});

		test("tapping the adjust hint fires onAdjust with the item", async () => {
			const onAdjust = vi.fn();
			const item = stockItem({ qty_on_hand: 3 });
			renderSheet({ stockItems: [item], onAdjust });
			await userEvent.click(screen.getByRole("button", { name: /adjust to 0/i }));
			expect(onAdjust).toHaveBeenCalledWith(item);
		});

		test("does not delete a qty>0 item", async () => {
			renderSheet({ stockItems: [stockItem({ qty_on_hand: 3 })] });
			await userEvent.click(screen.getByRole("button", { name: /remove capacitor/i }));
			expect(mockMutateAsync).not.toHaveBeenCalled();
		});
	});

	describe("remove when qty === 0", () => {
		test("two-tap confirm then delete + success toast", async () => {
			renderSheet({ stockItems: [stockItem({ id: "si1", qty_on_hand: 0 })] });
			await userEvent.click(screen.getByRole("button", { name: /remove capacitor/i }));
			// first tap surfaces confirm, does not delete yet
			expect(mockMutateAsync).not.toHaveBeenCalled();
			await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
			expect(mockMutateAsync).toHaveBeenCalledWith({ vehicleId: "v1", itemId: "si1" });
			expect(mockToastSuccess).toHaveBeenCalled();
		});

		test("cancel backs out without deleting", async () => {
			renderSheet({ stockItems: [stockItem({ qty_on_hand: 0 })] });
			await userEvent.click(screen.getByRole("button", { name: /remove capacitor/i }));
			await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
			expect(mockMutateAsync).not.toHaveBeenCalled();
		});

		test("surfaces an error toast when delete fails", async () => {
			mockMutateAsync.mockRejectedValue(new Error("boom"));
			renderSheet({ stockItems: [stockItem({ qty_on_hand: 0 })] });
			await userEvent.click(screen.getByRole("button", { name: /remove capacitor/i }));
			await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
			expect(mockToastError).toHaveBeenCalledWith("boom");
		});
	});
});
