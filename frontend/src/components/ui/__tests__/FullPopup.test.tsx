import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FullPopup from "../FullPopup";

const content = <div>popup body</div>;

describe("FullPopup (U5 / decision 4)", () => {
	it("calls onClose on Escape while open", () => {
		const onClose = vi.fn();
		render(<FullPopup content={content} isModalOpen onClose={onClose} />);
		expect(screen.getByText("popup body")).toBeInTheDocument();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("ignores other keys", () => {
		const onClose = vi.fn();
		render(<FullPopup content={content} isModalOpen onClose={onClose} />);
		fireEvent.keyDown(document, { key: "Enter" });
		fireEvent.keyDown(document, { key: "a" });
		expect(onClose).not.toHaveBeenCalled();
	});

	it("does not listen while closed, and stops listening after closing/unmount", () => {
		const onClose = vi.fn();
		const { rerender, unmount } = render(
			<FullPopup content={content} isModalOpen={false} onClose={onClose} />,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();

		rerender(<FullPopup content={content} isModalOpen onClose={onClose} />);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		rerender(<FullPopup content={content} isModalOpen={false} onClose={onClose} />);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		rerender(<FullPopup content={content} isModalOpen onClose={onClose} />);
		unmount();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("keeps no-off-click-close: clicking the backdrop does not call onClose", () => {
		const onClose = vi.fn();
		const { container } = render(<FullPopup content={content} isModalOpen onClose={onClose} />);
		// Portal renders into document.body; the backdrop is the fixed inset-0 bg-black layer.
		const backdrop = document.body.querySelector(".bg-black") ?? container;
		fireEvent.mouseDown(backdrop);
		fireEvent.click(backdrop);
		expect(onClose).not.toHaveBeenCalled();
	});
});
