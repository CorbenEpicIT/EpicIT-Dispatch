import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import LotSheet from "./LotSheet";
import type { BatchListRow } from "../../../types/tracking";

const mockBatchesQuery = vi.fn();
vi.mock("../../../hooks/useTracking", () => ({
	useBatchesQuery: (...args: unknown[]) => mockBatchesQuery(...args),
}));

function lot(overrides: Partial<BatchListRow> = {}): BatchListRow {
	return {
		id: "b1",
		code: "LOT-0001",
		batch_number: "LOT-ABC-123",
		expires_at: "2027-01-01T00:00:00.000Z",
		supplier: "Acme Supply",
		recalled_at: null,
		qty_received: 50,
		qty_in_warehouse: 10,
		vehicles: [{ vehicle_id: "v1", vehicle_name: "Truck 12", qty_on_hand: 5 }],
		...overrides,
	};
}

// The Drawer panel transitions in on a 10ms timer — advance past it.
async function renderSheet(props: Partial<React.ComponentProps<typeof LotSheet>> = {}) {
	const result = render(
		<LotSheet
			target={{ itemId: "i1", itemName: "Capacitor 45/5" }}
			onClose={() => {}}
			vehicleId="v1"
			{...props}
		/>,
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
	return result;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockBatchesQuery.mockReturnValue({ data: { batches: [lot()] }, isLoading: false });
});

describe("LotSheet render-phase guard (regression)", () => {
	// The bug: the guard compared the raw `target?.itemId` (undefined when the
	// sheet is closed) against a null-normalized stored id, so `undefined !== null`
	// re-fired setState every render forever — "Too many re-renders". The page
	// keeps LotSheet mounted with target=null while closed, so this is the crash
	// path. Rendering closed must be a no-op, not a loop.
	test("renders closed (target null) without an infinite re-render loop", () => {
		expect(() =>
			render(<LotSheet target={null} onClose={() => {}} vehicleId="v1" />),
		).not.toThrow();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	test("open → close → reopen stays stable and starts back at the list", async () => {
		const { rerender } = await renderSheet();
		await userEvent.click(screen.getByRole("button", { name: /LOT-ABC-123/ }));
		// drilled into detail
		expect(screen.getByText("Received (total)")).toBeInTheDocument();

		rerender(<LotSheet target={null} onClose={() => {}} vehicleId="v1" />);
		rerender(
			<LotSheet
				target={{ itemId: "i1", itemName: "Capacitor 45/5" }}
				onClose={() => {}}
				vehicleId="v1"
			/>,
		);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});
		// back at the list, not the previously drilled lot
		expect(screen.getByText(/lot on this vehicle/i)).toBeInTheDocument();
	});
});

describe("LotSheet list mode", () => {
	test("lists the lots on this vehicle for the item", async () => {
		mockBatchesQuery.mockReturnValue({
			data: {
				batches: [
					lot({ id: "b1", batch_number: "LOT-ABC-123" }),
					lot({ id: "b2", batch_number: "LOT-XYZ-789" }),
				],
			},
			isLoading: false,
		});
		await renderSheet();
		expect(screen.getByText("LOT-ABC-123")).toBeInTheDocument();
		expect(screen.getByText("LOT-XYZ-789")).toBeInTheDocument();
	});

	test("queries batches for this item", async () => {
		await renderSheet();
		expect(mockBatchesQuery).toHaveBeenCalledWith("i1");
	});

	test("hides lots not carried on this vehicle", async () => {
		mockBatchesQuery.mockReturnValue({
			data: {
				batches: [
					lot({ id: "b1", batch_number: "LOT-ON-TRUCK" }),
					lot({
						id: "b2",
						batch_number: "LOT-ELSEWHERE",
						vehicles: [
							{ vehicle_id: "v9", vehicle_name: "Truck 99", qty_on_hand: 3 },
						],
					}),
				],
			},
			isLoading: false,
		});
		await renderSheet();
		expect(screen.getByText("LOT-ON-TRUCK")).toBeInTheDocument();
		expect(screen.queryByText("LOT-ELSEWHERE")).not.toBeInTheDocument();
	});

	test("empty list explains itself", async () => {
		mockBatchesQuery.mockReturnValue({ data: { batches: [] }, isLoading: false });
		await renderSheet();
		expect(screen.getByText(/no lots on this vehicle/i)).toBeInTheDocument();
	});

	test("shows a loading state while fetching", async () => {
		mockBatchesQuery.mockReturnValue({ data: undefined, isLoading: true });
		await renderSheet();
		expect(screen.getByText(/loading lots/i)).toBeInTheDocument();
	});

	test("surfaces an error instead of a misleading empty state when the query fails", async () => {
		mockBatchesQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		await renderSheet();
		expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load lots/i);
		expect(screen.queryByText(/no lots on this vehicle/i)).not.toBeInTheDocument();
	});
});

describe("LotSheet drill-in / back", () => {
	test("tapping a lot drills into its detail", async () => {
		await renderSheet();
		await userEvent.click(screen.getByRole("button", { name: /LOT-ABC-123/ }));
		expect(screen.getByText("On this vehicle")).toBeInTheDocument();
		expect(screen.getByText("In warehouse")).toBeInTheDocument();
		expect(screen.getByText("Received (total)")).toBeInTheDocument();
	});

	test("drilled detail offers a way back to the list", async () => {
		mockBatchesQuery.mockReturnValue({
			data: {
				batches: [
					lot({ id: "b1", batch_number: "LOT-ABC-123" }),
					lot({ id: "b2", batch_number: "LOT-XYZ-789" }),
				],
			},
			isLoading: false,
		});
		await renderSheet();
		await userEvent.click(screen.getByRole("button", { name: /LOT-ABC-123/ }));
		await userEvent.click(screen.getByRole("button", { name: /back to lots/i }));
		expect(screen.getByText("LOT-XYZ-789")).toBeInTheDocument();
	});
});

describe("LotSheet recall warning", () => {
	test("flags a recalled lot in the list and warns in its detail", async () => {
		mockBatchesQuery.mockReturnValue({
			data: {
				batches: [
					lot({
						batch_number: "LOT-RECALLED",
						recalled_at: "2026-06-01T00:00:00.000Z",
					}),
				],
			},
			isLoading: false,
		});
		await renderSheet();
		await userEvent.click(screen.getByRole("button", { name: /LOT-RECALLED/ }));
		const alert = screen.getByRole("alert");
		expect(alert).toHaveTextContent(/recalled/i);
		expect(alert).toHaveTextContent(/do not install/i);
	});

	test("does not warn for a lot that isn't recalled", async () => {
		await renderSheet();
		await userEvent.click(screen.getByRole("button", { name: /LOT-ABC-123/ }));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
