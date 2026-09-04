import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceiptCaptureCard from "../ReceiptCaptureCard";
import type { FieldPurchase } from "../../../../types/fieldPurchases";

vi.mock("../../../../hooks/useFieldPurchases", () => ({
	useUploadReceipt: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useRetryOcr: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../ui/useToast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
// Pulls the camera in; not what this file is about.
vi.mock("../ReceiptScanner", () => ({ default: () => null }));

const withPhoto = {
	id: "fp-1",
	receipt_image_url: "https://bucket/r.jpg",
	has_geo: false,
	captured_at: null,
	ocr_status: "skipped",
	ocr_line_count: null,
} as unknown as FieldPurchase;

const opener = () => screen.getByRole("button", { name: /open the receipt photo full screen/i });

describe("the receipt thumbnail", () => {
	it("is a button that names what it opens", () => {
		render(<ReceiptCaptureCard purchase={withPhoto} editable />);
		expect(opener()).toBeInTheDocument();
	});

	it("has a 44px target", () => {
		render(<ReceiptCaptureCard purchase={withPhoto} editable />);
		expect(opener()).toHaveClass("min-h-11");
	});

	it("opens the lightbox", async () => {
		render(<ReceiptCaptureCard purchase={withPhoto} editable />);
		expect(screen.queryByRole("dialog")).toBeNull();
		await userEvent.click(opener());
		expect(screen.getByRole("dialog", { name: /receipt photo/i })).toBeInTheDocument();
	});

	it("closes it again", async () => {
		render(<ReceiptCaptureCard purchase={withPhoto} editable />);
		await userEvent.click(opener());
		await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("offers nothing to open before there is a photo", () => {
		render(
			<ReceiptCaptureCard
				purchase={
					{ ...withPhoto, receipt_image_url: null } as FieldPurchase
				}
				editable
			/>
		);
		expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
	});
});

// A retake is a new document; the dispatch viewer resets the same way on a url
// change, and without it a corrected photo is served at the old angle.
describe("rotation across a replaced photo", () => {
	it("starts the new photo upright", async () => {
		const { rerender } = render(<ReceiptCaptureCard purchase={withPhoto} editable />);

		await userEvent.click(opener());
		await userEvent.click(screen.getByRole("button", { name: /rotate/i }));
		expect(
			screen.getByRole("img", { name: /receipt photo/i }).style.transform
		).toContain("rotate(90deg)");
		await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

		rerender(
			<ReceiptCaptureCard
				purchase={
					{
						...withPhoto,
						receipt_image_url: "https://bucket/r2.jpg",
					} as FieldPurchase
				}
				editable
			/>
		);
		await userEvent.click(opener());
		expect(
			screen.getByRole("img", { name: /receipt photo/i }).style.transform
		).toContain("rotate(0deg)");
	});
});
