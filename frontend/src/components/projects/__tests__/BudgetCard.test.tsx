import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BudgetCard from "../BudgetCard";

describe("BudgetCard — null budget", () => {
	it("says the budget is unset instead of treating it as $0 over budget", () => {
		const { container } = render(<BudgetCard budget={null} estimated={250} actual={400} />);

		expect(screen.getByText("No budget set")).toBeInTheDocument();
		expect(screen.getByText("no budget to compare")).toBeInTheDocument();
		expect(screen.queryByText(/-\$400\.00/)).not.toBeInTheDocument();
		expect(screen.queryByText("Spend against budget")).not.toBeInTheDocument();
		expect(container.querySelector(".bg-error")).toBeNull();
		expect(container.querySelector(".text-error-text")).toBeNull();
	});

	it("still flags a real over-budget project", () => {
		const { container } = render(<BudgetCard budget={100} estimated={50} actual={150} />);

		expect(screen.getByText("$100.00")).toBeInTheDocument();
		expect(screen.getByText(/-\$50\.00/)).toBeInTheDocument();
		expect(screen.getByText("Spend against budget")).toBeInTheDocument();
		expect(container.querySelector(".bg-error")).not.toBeNull();
	});

	it("treats an explicit $0 budget as a budget, not as unset", () => {
		render(<BudgetCard budget={0} estimated={0} actual={0} />);

		expect(screen.queryByText("No budget set")).not.toBeInTheDocument();
		expect(screen.getByText("Spend against budget")).toBeInTheDocument();
	});
});
