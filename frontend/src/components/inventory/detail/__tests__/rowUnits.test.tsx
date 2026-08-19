import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import StockMovementList from "../StockMovementList";
import UsageReport from "../UsageReport";
import type { ItemUsageRow, StockMovement, UnitBasis } from "../../../../types/inventory";

// `stock_movement.unit` is stamped at write time, so a ledger can span a unit
// change. Every row therefore renders its OWN unit (review P2-3 / F11), and a
// per-job total the server withheld (mixed units) is said to be withheld rather
// than rendered blank (F7).

const getInventoryMovements = vi.fn();
const getItemUsage = vi.fn();
vi.mock("../../../../api/inventory", () => ({
	getInventoryMovements: (...a: unknown[]) => getInventoryMovements(...a),
	getItemUsage: (...a: unknown[]) => getItemUsage(...a),
}));

const SINGLE_EACH: UnitBasis = { units: ["each"], unit: "each", mixed: false };
const SINGLE_BOX: UnitBasis = { units: ["box"], unit: "box", mixed: false };
const MIXED: UnitBasis = { units: ["box", "each"], unit: null, mixed: true };

function mv(id: string, qty: number, unit: string): StockMovement {
	return {
		id,
		qty,
		unit,
		from_location_type: "warehouse",
		from_vehicle: null,
		to_location_type: "consumed",
		to_vehicle: null,
		reason: "parts_used",
		note: null,
		actor_type: "system",
		actor_id: null,
		visit_id: null,
		created_at: "2026-01-01T00:00:00.000Z",
	};
}

function usage(jobId: string, qtyConsumed: number | null, unitBasis: UnitBasis): ItemUsageRow {
	return {
		jobId,
		jobNumber: `J${jobId}`,
		jobName: `Job ${jobId}`,
		clientId: "c1",
		clientName: "Client",
		qtyConsumed,
		unitBasis,
		lastConsumedAt: "2026-01-01T00:00:00.000Z",
	};
}

function wrap(ui: React.ReactElement) {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<MemoryRouter>{ui}</MemoryRouter>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("StockMovementList — per-row unit", () => {
	it("renders each movement in its own stamped unit, agreeing with its quantity", async () => {
		getInventoryMovements.mockResolvedValue({
			movements: [mv("a", 2, "box"), mv("b", 1, "box"), mv("c", 3.5, "ft"), mv("d", 4, "each")],
			nextCursor: null,
		});
		wrap(<StockMovementList itemId="item-1" />);

		expect(await screen.findByText("2 boxes")).toBeInTheDocument();
		expect(screen.getByText("1 box")).toBeInTheDocument();
		expect(screen.getByText("3.5 ft")).toBeInTheDocument();
		expect(screen.getByText("4 units")).toBeInTheDocument();
	});
});

describe("UsageReport — unit basis", () => {
	it("suffixes a real total with its unit and names a withheld one as mixed", async () => {
		getItemUsage.mockResolvedValue({
			usage: [usage("1", 4, SINGLE_EACH), usage("2", null, MIXED)],
			unitBasis: MIXED,
			hasMore: false,
		});
		wrap(<UsageReport itemId="item-1" />);

		await waitFor(() => expect(screen.getAllByText(/Job \d/)).toHaveLength(2));
		expect(screen.getByText("units")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("Mixed units (boxes, units)")).toBeInTheDocument();
	});

	it("shows the column-level note when single-unit rows don't share a unit", async () => {
		getItemUsage.mockResolvedValue({
			usage: [usage("1", 4, SINGLE_EACH), usage("2", 2, SINGLE_BOX)],
			unitBasis: MIXED,
			hasMore: false,
		});
		wrap(<UsageReport itemId="item-1" />);

		await waitFor(() => expect(screen.getAllByText(/Job \d/)).toHaveLength(2));
		expect(screen.getByText(/spans 2 units \(boxes, units\), so the Used column can't be totalled/)).toBeInTheDocument();
	});

	it("shows no mixed-unit note when every row shares one unit", async () => {
		getItemUsage.mockResolvedValue({
			usage: [usage("1", 4, SINGLE_EACH), usage("2", 2, SINGLE_EACH)],
			unitBasis: SINGLE_EACH,
			hasMore: false,
		});
		wrap(<UsageReport itemId="item-1" />);

		await waitFor(() => expect(screen.getAllByText(/Job \d/)).toHaveLength(2));
		expect(screen.queryByText(/can't be totalled/)).not.toBeInTheDocument();
	});
});
