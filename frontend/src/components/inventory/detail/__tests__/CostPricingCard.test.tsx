import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CostPricingCard from "../CostPricingCard";
import type { InventoryItem } from "../../../../types/inventory";

// Decimal columns can arrive as strings; the card used to compare `price !== 0`
// on the raw value, so a "0" price divided through to "-Infinity% margin"
// (08-frontend-inventory F13).
const item = (over: Record<string, unknown>) =>
	({ id: "i1", name: "Widget", quantity: 3, cost: null, unit_price: null, ...over }) as InventoryItem;

describe("CostPricingCard", () => {
	it("treats a string zero price as zero — margin n/a, never -Infinity", () => {
		render(<CostPricingCard item={item({ cost: "5.00", unit_price: "0" })} />);
		expect(screen.getByText("Margin n/a")).toBeInTheDocument();
		expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
	});

	it("computes margin and quantity-scaled figures from string decimals", () => {
		render(<CostPricingCard item={item({ cost: "5.00", unit_price: "10.00", quantity: "3" })} />);
		expect(screen.getByText("50.0% margin")).toBeInTheDocument();
		// 3 × $5 at cost, 3 × $10 retail, 3 × $5 potential margin
		expect(screen.getAllByText("$15.00")).toHaveLength(2);
		expect(screen.getByText("$30.00")).toBeInTheDocument();
		expect(screen.getByText("3 warehouse × cost")).toBeInTheDocument();
	});
});
