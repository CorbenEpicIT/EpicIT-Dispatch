import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import QRLabel from "../QRLabel";

vi.mock("qrcode", () => ({
	default: { toString: vi.fn() },
}));

beforeEach(() => {
	vi.clearAllMocks();
	(QRCode.toString as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("<svg></svg>");
});

describe("QRLabel — kind-based QR payload prefixing", () => {
	// Must match resolveInventoryCode's scheme (backend/src/controllers/
	// inventoryController.ts): item codes unprefixed, SN: for serials, LOT:
	// for batches. Only the encoded payload gets prefixed — `code` itself
	// (displayed text, and the value stored on the LabelQueueItem) stays bare.
	it("encodes an item code with no prefix", async () => {
		render(<QRLabel code="ABC123" kind="item" primaryLabel="Widget" widthIn={2} heightIn={1} />);
		await waitFor(() =>
			expect(QRCode.toString).toHaveBeenCalledWith("ABC123", expect.objectContaining({ type: "svg" })),
		);
	});

	it("prefixes a serial code with SN:", async () => {
		render(<QRLabel code="SU-7K2M9QWX" kind="serial" primaryLabel="Widget" widthIn={2} heightIn={1} />);
		await waitFor(() =>
			expect(QRCode.toString).toHaveBeenCalledWith(
				"SN:SU-7K2M9QWX",
				expect.objectContaining({ type: "svg" }),
			),
		);
	});

	it("prefixes a batch code with LOT:", async () => {
		render(<QRLabel code="LOT-2607-03" kind="batch" primaryLabel="Widget" widthIn={2} heightIn={1} />);
		await waitFor(() =>
			expect(QRCode.toString).toHaveBeenCalledWith(
				"LOT:LOT-2607-03",
				expect.objectContaining({ type: "svg" }),
			),
		);
	});

	it("still displays the bare code as text, not the prefixed payload", async () => {
		const { findByText } = render(
			<QRLabel code="SU-7K2M9QWX" kind="serial" primaryLabel="Widget" widthIn={2} heightIn={1} />,
		);
		expect(await findByText("SU-7K2M9QWX")).toBeInTheDocument();
	});
});
