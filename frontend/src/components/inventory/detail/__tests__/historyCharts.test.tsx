import { cloneElement, type ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsumptionTrendChart from "../ConsumptionTrendChart";
import StockLevelChart from "../StockLevelChart";
import CostPriceTrendChart from "../CostPriceTrendChart";

// jsdom measures every element as 0x0, so ResponsiveContainer would render an
// empty SVG and the assertions below would pass vacuously. Fixed dimensions are
// the only thing stubbed; the charts themselves render for real. (Bar/Area
// animation is off in the components, without which recharts never emits mark
// paths on the first frame.)
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
const priceHistoryQuery = vi.fn();

vi.mock("../../../../hooks/useInventory", () => ({
	useItemConsumptionTrendQuery: (...args: unknown[]) => consumptionQuery(...args),
	useItemValueHistoryQuery: (...args: unknown[]) => valueHistoryQuery(...args),
	useItemPriceHistoryQuery: (...args: unknown[]) => priceHistoryQuery(...args),
}));

const consumption = (qtys: number[]) => ({
	data: {
		points: qtys.map((qtyConsumed, i) => ({
			periodStart: `2026-0${i + 1}-01T00:00:00.000Z`,
			qtyConsumed,
		})),
	},
	isLoading: false,
});

const valueHistory = (quantities: number[]) => ({
	data: {
		points: quantities.map((quantity, i) => ({
			date: `2026-0${i + 1}-01T00:00:00.000Z`,
			quantity,
			value: null,
		})),
		costUsed: null,
		costBasis: null,
		truncated: false,
		windowStart: null,
		hasNegative: false,
	},
	isLoading: false,
});

// Two dates, and every series ending within a dollar of the others — the exact
// shape that made the old per-line labels draw on top of each other.
const priceHistory = () => ({
	data: {
		cost: {
			points: [
				{ at: "2026-06-01T00:00:00.000Z", value: 20 },
				{ at: "2026-07-01T00:00:00.000Z", value: 20.2 },
			],
		},
		price: {
			points: [
				{ at: "2026-06-01T00:00:00.000Z", value: 20.4 },
				{ at: "2026-07-01T00:00:00.000Z", value: 20.6 },
			],
		},
		wac: [
			{ at: "2026-06-01T00:00:00.000Z", value: 20.1 },
			{ at: "2026-07-01T00:00:00.000Z", value: 20.3 },
		],
		charged: {
			points: [
				{ periodStart: "2026-06-01T00:00:00.000Z", avgUnitPrice: 20.5 },
				{ periodStart: "2026-07-01T00:00:00.000Z", avgUnitPrice: 20.7 },
			],
		},
		receipts: [],
		costCoverage: { receipts: 2, withCost: 2, wacBasisReceipts: 2 },
		coverageStart: "2026-06-01T00:00:00.000Z",
		chargedTruncated: false,
		chargedWindowStart: null,
	},
	isLoading: false,
});

/** Label rows in the right-margin column, by vertical position. */
const labelYs = (container: HTMLElement): number[] =>
	Array.from(container.querySelectorAll("text"))
		.filter((t) => /cost|price|margin/i.test(t.textContent ?? ""))
		.map((t) => Number(t.getAttribute("y")))
		.filter((y) => Number.isFinite(y))
		.sort((a, b) => a - b);

beforeEach(() => {
	consumptionQuery.mockReset();
	valueHistoryQuery.mockReset();
	priceHistoryQuery.mockReset();
});

describe("ConsumptionTrendChart", () => {
	it("charts a genuine zero and says so — a real zero is not missing history", () => {
		consumptionQuery.mockReturnValue(consumption([0, 0, 0]));
		const { container } = render(
			<ConsumptionTrendChart itemId="i1" unit="each" bucket="month" />,
		);

		expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(3);
		expect(screen.getByText(/No consumption recorded in this range/)).toBeInTheDocument();
		expect(screen.queryByText("Not enough history yet")).not.toBeInTheDocument();
	});

	it("claims 'not enough history' only when there aren't enough periods to plot", () => {
		consumptionQuery.mockReturnValue(consumption([4]));
		render(<ConsumptionTrendChart itemId="i1" unit="each" bucket="month" />);

		expect(screen.getByText("Not enough history yet")).toBeInTheDocument();
	});

	it("states what the series counts when there is consumption", () => {
		consumptionQuery.mockReturnValue(consumption([2, 5]));
		render(<ConsumptionTrendChart itemId="i1" unit="each" bucket="week" />);

		expect(screen.getByText(/Parts used and direct consumption only/)).toBeInTheDocument();
	});

	it("keeps mechanics behind the Info toggle", async () => {
		consumptionQuery.mockReturnValue(consumption([2, 5]));
		render(<ConsumptionTrendChart itemId="i1" unit="each" bucket="week" />);

		const trigger = screen.getByRole("button", { name: "How this chart is measured" });
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText(/zero-filled/)).not.toBeInTheDocument();

		await userEvent.click(trigger);

		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText(/zero-filled/)).toBeInTheDocument();
	});
});

describe("StockLevelChart", () => {
	it("draws on-hand as steps, never as a spline that invents levels", () => {
		valueHistoryQuery.mockReturnValue(valueHistory([10, 4, 12]));
		const { container } = render(
			<StockLevelChart itemId="i1" unit="each" lowStockThreshold={5} />,
		);

		const d = container.querySelector(".recharts-area-area")?.getAttribute("d") ?? "";
		expect(d).not.toBe("");
		// Cubic segments are what a monotone curve emits; a step path is L-only.
		expect(d).not.toMatch(/C/);
		expect(d).toMatch(/L/);
	});

	it("keeps one visible caveat and hides the rest", async () => {
		valueHistoryQuery.mockReturnValue(valueHistory([10, 4]));
		render(<StockLevelChart itemId="i1" unit="each" lowStockThreshold={5} />);

		expect(screen.getByText(/Warehouse stock only/)).toBeInTheDocument();
		expect(screen.queryByText(/Drawn as steps/)).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "How this chart is measured" }));

		expect(screen.getByText(/Drawn as steps/)).toBeInTheDocument();
	});
});

describe("CostPriceTrendChart", () => {
	it("keeps series labels apart even when all four lines end within a dollar", () => {
		priceHistoryQuery.mockReturnValue(priceHistory());
		const { container } = render(
			<CostPriceTrendChart itemId="i1" bucket="month" />,
		);

		const ys = labelYs(container);
		expect(ys.length).toBeGreaterThanOrEqual(4);
		for (let i = 1; i < ys.length; i++) {
			expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(13);
		}
	});

	it("names each series exactly once — in the plot, not also in a legend", () => {
		priceHistoryQuery.mockReturnValue(priceHistory());
		render(<CostPriceTrendChart itemId="i1" bucket="month" />);

		for (const label of ["Set cost", "Paid cost (avg)", "List price", "Charged price"]) {
			expect(screen.getAllByText(label).length).toBe(1);
		}
	});
});
