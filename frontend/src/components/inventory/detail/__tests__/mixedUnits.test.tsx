import { cloneElement, type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConsumptionTrendChart from "../ConsumptionTrendChart";
import StockLevelChart from "../StockLevelChart";
import ReorderHealthCard from "../ReorderHealthCard";
import ReorderHealthMini from "../ReorderHealthMini";
import type { UnitBasis } from "../../../../types/inventory";

// What this file is about, and the ONE thing it must never let pass:
//
// `stock_movement.unit` is stamped when the movement is written, so a ledger that
// spans a unit change is detectable. It is still not summable — `3 each + 2 box`
// has no value and nothing converts between them — so every server aggregate over
// such a series comes back `null` rather than a total, and these surfaces have to
// render that absence AS an absence. A withheld rate printed as `0.00 / day` is
// indistinguishable from a genuinely idle item, and it is exactly the confident
// fake number the stamped column exists to make impossible.
//
// The other half is that the flag must come from the STAMPED units and nothing
// else. Two cases below deliberately set the component's `unit` prop (the item's
// CURRENT unit) to disagree with the basis, because reading the item's unit is the
// original bug in miniature: it is what silently reinterpreted years of history
// before the column existed.

vi.mock("recharts", async () => {
	const actual = await vi.importActual<typeof import("recharts")>("recharts");
	return {
		...actual,
		ResponsiveContainer: ({
			children,
		}: {
			children: ReactElement<{ width?: number; height?: number }>;
		}) => cloneElement(children, { width: 800, height: 300 }),
	};
});

const consumptionQuery = vi.fn();
const valueHistoryQuery = vi.fn();
const forecastQuery = vi.fn();

vi.mock("../../../../hooks/useInventory", () => ({
	useItemConsumptionTrendQuery: (...args: unknown[]) => consumptionQuery(...args),
	useItemValueHistoryQuery: (...args: unknown[]) => valueHistoryQuery(...args),
	useItemForecastQuery: (...args: unknown[]) => forecastQuery(...args),
}));

const SINGLE: UnitBasis = { units: ["each"], unit: "each", mixed: false };
const MIXED: UnitBasis = { units: ["box", "each"], unit: null, mixed: true };

/** Consumption trend as the server returns it for a clean, single-unit window. */
const consumption = (qtys: (number | null)[], unitBasis: UnitBasis) => ({
	data: {
		bucket: "month" as const,
		unitBasis,
		points: qtys.map((qtyConsumed, i) => ({
			periodStart: `2026-0${i + 1}-01T00:00:00.000Z`,
			qtyConsumed,
		})),
	},
	isLoading: false,
});

const valueHistory = (quantities: number[], unitBasis: UnitBasis) => ({
	data: {
		unitBasis,
		points: quantities.map((quantity, i) => ({
			date: `2026-0${i + 1}-01T00:00:00.000Z`,
			quantity,
			value: null,
		})),
		costUsed: null,
		costBasis: null,
		truncated: false,
		openingQuantity: 0,
		windowStart: null,
		hasNegative: false,
	},
	isLoading: false,
});

/**
 * A forecast row. Defaults describe a healthy single-unit item, so a case only
 * states the field it is actually about — and a mixed case states the withheld
 * NULLS explicitly, because that is the server contract being asserted.
 */
const forecast = (over: Record<string, unknown> = {}) => ({
	data: {
		forecast: {
			itemId: "i1",
			itemName: "Widget",
			sku: null,
			category: null,
			unit: "each",
			currentQuantity: 40,
			warehouseQuantity: 40,
			vehicleQuantity: 0,
			qtyConsumed: 180,
			avgDailyUsage: 2,
			consumptionBasis: SINGLE,
			observedDays: 90,
			daysOfStock: 20,
			projectedStockoutDate: "2026-08-25T00:00:00.000Z",
			lowStockThreshold: 10,
			belowReorderPoint: false,
			severity: "warning",
			...over,
		},
		reason: null,
	},
	isLoading: false,
});

/** The shape the server actually sends on a break: rate, runway and total all gone. */
const MIXED_FORECAST = {
	qtyConsumed: null,
	avgDailyUsage: null,
	consumptionBasis: MIXED,
	daysOfStock: null,
	projectedStockoutDate: null,
};

const renderCard = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** Any rendered text that reads as a per-day rate — the number that must not appear. */
const ratesOnScreen = () => screen.queryAllByText(/\d+(\.\d+)?\s*(\/|per )\s*day/i);

beforeEach(() => {
	consumptionQuery.mockReset();
	valueHistoryQuery.mockReset();
	forecastQuery.mockReset();
});

describe("ConsumptionTrendChart — unit basis", () => {
	it("charts and totals a series whose movements all share one unit", () => {
		consumptionQuery.mockReturnValue(consumption([2, 5, 3], SINGLE));
		const { container } = render(
			<ConsumptionTrendChart itemId="i1" unit="each" bucket="month" />,
		);

		expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(3);
		expect(screen.getByText(/Parts used and direct consumption only/)).toBeInTheDocument();
		expect(screen.queryByText(/mixed units/i)).not.toBeInTheDocument();
	});

	it("plots nothing and names the reason when the series spans a unit change", () => {
		consumptionQuery.mockReturnValue(consumption([null, null, null], MIXED));
		const { container } = render(
			<ConsumptionTrendChart itemId="i1" unit="each" bucket="month" />,
		);

		expect(screen.getByText(/Totals unavailable — mixed units/i)).toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(0);
		// The zero-fill trap: buckets still arrive, so without the break branch this
		// card would claim "no consumption in this range" over a busy item.
		expect(screen.queryByText(/No consumption recorded in this range/)).toBeNull();
	});

	it("flags on the STAMPED units even when the item's current unit is one of them", () => {
		// Item reads `each` today; the ledger holds both. Trusting the item would
		// produce a clean-looking chart over two denominations.
		consumptionQuery.mockReturnValue(consumption([null, null], MIXED));
		render(<ConsumptionTrendChart itemId="i1" unit="each" bucket="month" />);

		expect(screen.getByText(/Totals unavailable — mixed units/i)).toBeInTheDocument();
	});

	it("does NOT flag when the item's unit changed but the ledger is still one unit", () => {
		// Unit edited to `box` after the last movement: nothing spans a change, so
		// the totals are real. A flag keyed off `item.unit !== basis.unit` would fire
		// here and withhold numbers that are perfectly good.
		consumptionQuery.mockReturnValue(consumption([2, 5], SINGLE));
		const { container } = render(
			<ConsumptionTrendChart itemId="i1" unit="box" bucket="month" />,
		);

		expect(screen.queryByText(/mixed units/i)).not.toBeInTheDocument();
		expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(2);
	});
});

describe("StockLevelChart — unit basis", () => {
	it("plots the running balance when the whole ledger is one unit", () => {
		valueHistoryQuery.mockReturnValue(valueHistory([10, 8, 6], SINGLE));
		// null: the reorder-point line is beside the point here, and a number
		// would put a second thing on the chart these cases aren't about.
		render(<StockLevelChart itemId="i1" unit="each" lowStockThreshold={null} />);

		expect(screen.queryByText(/mixed units/i)).not.toBeInTheDocument();
		expect(screen.queryByText("No history yet")).not.toBeInTheDocument();
	});

	it("explains the break instead of claiming there is no history", () => {
		valueHistoryQuery.mockReturnValue(valueHistory([], MIXED));
		// null: the reorder-point line is beside the point here, and a number
		// would put a second thing on the chart these cases aren't about.
		render(<StockLevelChart itemId="i1" unit="each" lowStockThreshold={null} />);

		expect(screen.getByText(/Totals unavailable — mixed units/i)).toBeInTheDocument();
		// The empty `points` array is a CONSEQUENCE of the break, not evidence of a
		// blank ledger, and saying "No history yet" about a full one is the specific
		// silent wrongness this task exists to end.
		expect(screen.queryByText("No history yet")).not.toBeInTheDocument();
	});
});

describe("ReorderHealthCard — withheld rate", () => {
	it("shows the measured rate and runway on a single-unit ledger", () => {
		forecastQuery.mockReturnValue(forecast());
		renderCard(<ReorderHealthCard itemId="i1" />);

		expect(screen.getByText("2.00 / day")).toBeInTheDocument();
		expect(screen.getByText("20 days")).toBeInTheDocument();
		expect(screen.getByText("180 units")).toBeInTheDocument();
	});

	it("renders a withheld rate as a placeholder, never as a number", () => {
		forecastQuery.mockReturnValue(forecast(MIXED_FORECAST));
		renderCard(<ReorderHealthCard itemId="i1" />);

		expect(ratesOnScreen()).toHaveLength(0);
		expect(screen.queryByText("0.00 / day")).toBeNull();
		// Every rate-derived figure withheld together — a card showing a rate beside
		// a blank runway would have the two disagreeing about the same ledger.
		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
		// Lowercase display words, the same ones a quantity is rendered with
		// ("180 units"), not the picker's title-case labels — one unit must not
		// read two different ways on one card.
		expect(screen.getAllByText(/Mixed units \(boxes, units\)/).length).toBeGreaterThan(0);
	});

	it("keeps the stock position, which never touched the ledger", () => {
		forecastQuery.mockReturnValue(
			forecast({ ...MIXED_FORECAST, belowReorderPoint: true, severity: "critical" }),
		);
		renderCard(<ReorderHealthCard itemId="i1" />);

		// On-hand and the reorder-point comparison come from cached quantity columns
		// in the item's current unit, so a unit break says nothing about them.
		expect(screen.getByText(/Warehouse 40 units · reorder point 10/)).toBeInTheDocument();
		expect(screen.getByText("below")).toBeInTheDocument();
		expect(screen.getByText("Reorder now")).toBeInTheDocument();
	});

	it("does not blame the absence on missing consumption", () => {
		forecastQuery.mockReturnValue(forecast(MIXED_FORECAST));
		renderCard(<ReorderHealthCard itemId="i1" />);

		// 180 units WERE consumed. "No consumption in the last 90 days" would send a
		// dispatcher looking for usage that is already recorded.
		expect(screen.queryByText(/No consumption in the last 90 days/)).toBeNull();
	});
});

describe("ReorderHealthMini — withheld rate", () => {
	it("states the rate when there is one", () => {
		forecastQuery.mockReturnValue(forecast());
		render(<ReorderHealthMini itemId="i1" onViewHistory={() => {}} />);

		expect(screen.getByText(/~2\.00 units\/day over 90d/)).toBeInTheDocument();
	});

	it("says mixed units rather than printing a zero rate", () => {
		forecastQuery.mockReturnValue(forecast(MIXED_FORECAST));
		render(<ReorderHealthMini itemId="i1" onViewHistory={() => {}} />);

		expect(ratesOnScreen()).toHaveLength(0);
		expect(screen.getByText(/Mixed units \(boxes, units\) — no daily rate/)).toBeInTheDocument();
		// "No runway yet" claims nothing was consumed. The runway is withheld, which
		// is a different fact and leads somewhere different.
		expect(screen.getByText("Runway unavailable")).toBeInTheDocument();
		expect(screen.queryByText("No runway yet")).toBeNull();
	});
});
