import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SerialRedirectPage from "./SerialRedirectPage";
import type { SerialHistoryResponse } from "../../types/tracking";

const mockSerialHistoryQuery = vi.fn();
vi.mock("../../hooks/useTracking", () => ({
	useSerialHistoryQuery: (...args: unknown[]) => mockSerialHistoryQuery(...args),
}));

function historyFixture(): SerialHistoryResponse {
	return {
		serial: {
			id: "s1",
			code: "SER-0001",
			serial_number: "SN-ABC-123",
			status: "in_warehouse",
			item: { id: "item-99", name: "Capacitor 45/5" },
			current_vehicle: null,
			batch: null,
			received_at: "2026-05-01T10:00:00.000Z",
			consumed_at: null,
			client: null,
			consumed_visit: null,
			note: null,
		},
		timeline: [],
	};
}

// Stands in for the item detail page so the assertion is on the URL the
// redirect produced, not on that page's markup.
function LocationProbe() {
	const location = useLocation();
	return <div data-testid="landed">{location.pathname + location.search}</div>;
}

function renderAt(serialId: string) {
	return render(
		<MemoryRouter initialEntries={[`/dispatch/inventory/serials/${serialId}`]}>
			<Routes>
				<Route
					path="/dispatch/inventory/serials/:serialId"
					element={<SerialRedirectPage />}
				/>
				<Route path="/dispatch/inventory/items/:itemId" element={<LocationProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("SerialRedirectPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("redirects a resolved unit to its item page with the tracking tab and serial param", () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: historyFixture(),
			isLoading: false,
			isError: false,
		});

		renderAt("s1");

		expect(screen.getByTestId("landed")).toHaveTextContent(
			"/dispatch/inventory/items/item-99?tab=tracking&serial=s1",
		);
	});

	test("passes the serial id from the route to the history query", () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: historyFixture(),
			isLoading: false,
			isError: false,
		});

		renderAt("s1");

		expect(mockSerialHistoryQuery).toHaveBeenCalledWith("s1");
	});

	test("shows a skeleton instead of redirecting while the unit is still loading", () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
		});

		renderAt("s1");

		// Nothing to redirect to yet — the item id lives on the unit.
		expect(screen.queryByTestId("landed")).not.toBeInTheDocument();
	});

	test("reports a missing unit instead of bouncing to an unrelated item page", () => {
		mockSerialHistoryQuery.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		});

		renderAt("nope");

		expect(screen.getByText("Serial unit not found")).toBeInTheDocument();
		expect(screen.queryByTestId("landed")).not.toBeInTheDocument();
	});
});
