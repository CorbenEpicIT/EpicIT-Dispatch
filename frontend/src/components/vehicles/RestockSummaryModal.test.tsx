import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import RestockSummaryModal, { type RestockSummaryLine } from "./RestockSummaryModal";

const needsAttentionLine: RestockSummaryLine = {
	label: "Refrigerant Jug",
	requested: 5,
	moved: 4,
	message: "Only 4 of 5 available in the warehouse.",
	serialCodes: undefined,
	lotCodes: ["LOT-1"],
};

describe("RestockSummaryModal", () => {
	test("renders needing-attention lines with their message and codes", () => {
		render(<RestockSummaryModal lines={[needsAttentionLine]} onAcknowledge={vi.fn()} />);

		expect(screen.getByText("Refrigerant Jug")).toBeInTheDocument();
		expect(screen.getByText("Only 4 of 5 available in the warehouse.")).toBeInTheDocument();
		expect(screen.getByText("Lot LOT-1")).toBeInTheDocument();
		expect(screen.getByText(/1 short/)).toBeInTheDocument();
	});

	test("does not render a row for a clean line — caller is expected to filter those out", () => {
		// The modal renders exactly what it's given; filtering clean lines
		// (shortfall === 0 && reason_code === "ok") is each call site's job.
		render(<RestockSummaryModal lines={[]} onAcknowledge={vi.fn()} />);

		expect(screen.queryByText("Refrigerant Jug")).not.toBeInTheDocument();
	});

	test("acknowledge button calls onAcknowledge", async () => {
		const onAcknowledge = vi.fn();
		render(<RestockSummaryModal lines={[needsAttentionLine]} onAcknowledge={onAcknowledge} />);

		await userEvent.click(screen.getByText("Got it"));
		expect(onAcknowledge).toHaveBeenCalledTimes(1);
	});

	test("clicking the overlay dismisses without side effects (calls onAcknowledge once)", async () => {
		const onAcknowledge = vi.fn();
		const { container } = render(<RestockSummaryModal lines={[needsAttentionLine]} onAcknowledge={onAcknowledge} />);

		// Outermost overlay div is the fixed inset-0 backdrop.
		const overlay = container.firstElementChild as HTMLElement;
		await userEvent.click(overlay);
		expect(onAcknowledge).toHaveBeenCalledTimes(1);
	});

	test("clicking inside the modal card does not dismiss", async () => {
		const onAcknowledge = vi.fn();
		render(<RestockSummaryModal lines={[needsAttentionLine]} onAcknowledge={onAcknowledge} />);

		await userEvent.click(screen.getByText("Refrigerant Jug"));
		expect(onAcknowledge).not.toHaveBeenCalled();
	});
});
