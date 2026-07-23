import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import SerialSheet from "./SerialSheet";
import type { SerialHistoryResponse } from "../../../types/tracking";

const mockSerialHistoryQuery = vi.fn();
const mockSerialsQuery = vi.fn();
vi.mock("../../../hooks/useTracking", () => ({
	useSerialHistoryQuery: (...args: unknown[]) => mockSerialHistoryQuery(...args),
	useSerialsQuery: (...args: unknown[]) => mockSerialsQuery(...args),
}));

function historyFixture(
	overrides: Partial<SerialHistoryResponse["serial"]> = {}
): SerialHistoryResponse {
	return {
		serial: {
			id: "s1",
			code: "SER-0001",
			serial_number: "SN-ABC-123",
			status: "on_vehicle",
			item: { id: "i1", name: "Capacitor 45/5" },
			current_vehicle: { id: "v1", name: "Truck 12" },
			batch: null,
			received_at: "2026-05-01T10:00:00.000Z",
			consumed_at: null,
			client: null,
			consumed_visit: null,
			note: null,
			...overrides,
		},
		timeline: [
			{
				id: "m1",
				reason: "restock",
				from_location_type: "warehouse",
				from_vehicle: null,
				to_location_type: "vehicle",
				to_vehicle: { id: "v1", name: "Truck 12" },
				note: null,
				actor_type: "user",
				created_at: "2026-05-02T12:00:00.000Z",
				visit: null,
			},
		],
	};
}

// The Drawer panel transitions in on a 10ms timer — advance past it.
async function renderSheet(props: Partial<React.ComponentProps<typeof SerialSheet>> = {}) {
	const result = render(
		<SerialSheet
			target={{ mode: "serial", serialId: "s1" }}
			onClose={() => {}}
			vehicleId="v1"
			onReportLost={() => {}}
			{...props}
		/>
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
	return result;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockSerialHistoryQuery.mockReturnValue({
		data: historyFixture(),
		isLoading: false,
		isError: false,
	});
	mockSerialsQuery.mockReturnValue({
		data: { serials: [], nextCursor: null },
		isLoading: false,
	});
});

describe("SerialSheet detail mode", () => {
	test("renders serial number, status, item name and received date", async () => {
		await renderSheet();
		expect(screen.getByText("SN-ABC-123")).toBeInTheDocument();
		expect(screen.getByText("On Vehicle")).toBeInTheDocument();
		expect(screen.getByText("Capacitor 45/5")).toBeInTheDocument();
		expect(screen.getByText(/Received/)).toBeInTheDocument();
	});

	test("renders the history timeline", async () => {
		await renderSheet();
		expect(screen.getByText("Truck 12")).toBeInTheDocument();
		expect(screen.getByText(/Restock/i)).toBeInTheDocument();
	});

	test("shows the note when present and offers no way to edit it", async () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: historyFixture({ note: "Scuffed casing on arrival" }),
			isLoading: false,
			isError: false,
		});
		await renderSheet();
		expect(screen.getByText("Scuffed casing on arrival")).toBeInTheDocument();
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	test("renders nothing about a note when there isn't one", async () => {
		await renderSheet();
		expect(screen.queryByText(/^Note$/)).not.toBeInTheDocument();
	});

	test("shows Report Lost for an on_vehicle unit on this vehicle", async () => {
		await renderSheet();
		expect(screen.getByRole("button", { name: /report lost/i })).toBeInTheDocument();
	});

	test("fires onReportLost with the unit and its item", async () => {
		const onReportLost = vi.fn();
		await renderSheet({ onReportLost });
		await userEvent.click(screen.getByRole("button", { name: /report lost/i }));
		expect(onReportLost).toHaveBeenCalledWith({
			serialUnitId: "s1",
			inventoryItemId: "i1",
		});
	});

	test("hides Report Lost when the unit is on another vehicle", async () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: historyFixture({ current_vehicle: { id: "v9", name: "Truck 99" } }),
			isLoading: false,
			isError: false,
		});
		await renderSheet();
		expect(
			screen.queryByRole("button", { name: /report lost/i })
		).not.toBeInTheDocument();
	});

	test.each(["in_warehouse", "consumed", "lost", "returned"] as const)(
		"hides Report Lost when status is %s",
		async (status) => {
			mockSerialHistoryQuery.mockReturnValue({
				data: historyFixture({ status, current_vehicle: null }),
				isLoading: false,
				isError: false,
			});
			await renderSheet();
			expect(
				screen.queryByRole("button", { name: /report lost/i })
			).not.toBeInTheDocument();
		}
	);

	test("keeps the sheet open and shows an error inside it when history fails", async () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		});
		const onClose = vi.fn();
		await renderSheet({ onClose });
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load/i);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("renders nothing when target is null", () => {
		render(
			<SerialSheet
				target={null}
				onClose={() => {}}
				vehicleId="v1"
				onReportLost={() => {}}
			/>
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});

describe("SerialSheet list mode", () => {
	const units = [
		{
			id: "s1",
			organization_id: "o1",
			inventory_item_id: "i1",
			serial_number: "SN-ABC-123",
			code: "SER-0001",
			status: "on_vehicle" as const,
			current_vehicle_id: "v1",
			consumed_at: null,
			consumed_visit_id: null,
			consumed_line_item_id: null,
			client_id: null,
			batch_id: null,
			received_at: "2026-05-01T10:00:00.000Z",
			note: null,
			created_at: "2026-05-01T10:00:00.000Z",
			updated_at: "2026-05-01T10:00:00.000Z",
		},
		{
			id: "s2",
			organization_id: "o1",
			inventory_item_id: "i1",
			serial_number: "SN-XYZ-789",
			code: "SER-0002",
			status: "on_vehicle" as const,
			current_vehicle_id: "v1",
			consumed_at: null,
			consumed_visit_id: null,
			consumed_line_item_id: null,
			client_id: null,
			batch_id: null,
			received_at: "2026-05-03T10:00:00.000Z",
			note: null,
			created_at: "2026-05-03T10:00:00.000Z",
			updated_at: "2026-05-03T10:00:00.000Z",
		},
	];

	test("lists the units on this vehicle for the item", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: units, nextCursor: null }, isLoading: false });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		expect(screen.getByText("SN-ABC-123")).toBeInTheDocument();
		expect(screen.getByText("SN-XYZ-789")).toBeInTheDocument();
	});

	test("scopes the query to this vehicle's on_vehicle units", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: units, nextCursor: null }, isLoading: false });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		expect(mockSerialsQuery).toHaveBeenCalledWith("i1", { status: "on_vehicle", vehicleId: "v1" });
	});

	test("tapping a unit drills into its detail", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: units, nextCursor: null }, isLoading: false });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		await userEvent.click(screen.getByRole("button", { name: /SN-XYZ-789/ }));
		expect(mockSerialHistoryQuery).toHaveBeenCalledWith("s2");
		expect(screen.getByRole("button", { name: /report lost/i })).toBeInTheDocument();
	});

	test("drilled detail offers a way back to the list", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: units, nextCursor: null }, isLoading: false });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		await userEvent.click(screen.getByRole("button", { name: /SN-ABC-123/ }));
		await userEvent.click(screen.getByRole("button", { name: /back to units/i }));
		expect(screen.getByText("SN-XYZ-789")).toBeInTheDocument();
	});

	test("empty list explains itself", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: [], nextCursor: null }, isLoading: false });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		expect(screen.getByText(/no units on this vehicle/i)).toBeInTheDocument();
	});

	test("surfaces an error instead of a misleading empty state when the query fails", async () => {
		mockSerialsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		await renderSheet({ target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" } });
		expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load units/i);
		expect(screen.queryByText(/no units on this vehicle/i)).not.toBeInTheDocument();
	});

	test("reopening in list mode after a drill starts back at the list", async () => {
		mockSerialsQuery.mockReturnValue({ data: { serials: units, nextCursor: null }, isLoading: false });
		const { rerender } = await renderSheet({
			target: { mode: "item", itemId: "i1", itemName: "Capacitor 45/5" },
		});
		await userEvent.click(screen.getByRole("button", { name: /SN-ABC-123/ }));
		expect(screen.getByRole("button", { name: /report lost/i })).toBeInTheDocument();

		rerender(
			<SerialSheet target={null} onClose={() => {}} vehicleId="v1" onReportLost={() => {}} />,
		);
		rerender(
			<SerialSheet
				target={{ mode: "item", itemId: "i1", itemName: "Capacitor 45/5" }}
				onClose={() => {}}
				vehicleId="v1"
				onReportLost={() => {}}
			/>,
		);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});
		expect(screen.getByText("SN-XYZ-789")).toBeInTheDocument();
	});
});
