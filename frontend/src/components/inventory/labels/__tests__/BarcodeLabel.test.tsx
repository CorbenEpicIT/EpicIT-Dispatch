import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import JsBarcode from "jsbarcode";
import BarcodeLabel from "../BarcodeLabel";

vi.mock("jsbarcode", () => ({
	default: vi.fn(),
}));

const jsBarcodeMock = JsBarcode as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("BarcodeLabel — payload prefixing + symbology selection", () => {
	// Payload scheme must match resolveInventoryCode (backend): item codes
	// unprefixed, SN: for serials, LOT: for batches. `code` itself stays bare
	// for the human-readable text.
	it("encodes an item code with no prefix", async () => {
		render(<BarcodeLabel code="ITM-A7F3" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />);
		await waitFor(() =>
			expect(jsBarcodeMock).toHaveBeenCalledWith(expect.anything(), "ITM-A7F3", expect.any(Object)),
		);
	});

	it("uses CODE128 for an alphanumeric item code", async () => {
		render(<BarcodeLabel code="ITM-A7F3" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />);
		await waitFor(() =>
			expect(jsBarcodeMock).toHaveBeenCalledWith(
				expect.anything(),
				"ITM-A7F3",
				expect.objectContaining({ format: "CODE128" }),
			),
		);
	});

	it("uses UPC for a 12-digit code", async () => {
		render(<BarcodeLabel code="036000291452" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />);
		await waitFor(() =>
			expect(jsBarcodeMock).toHaveBeenCalledWith(
				expect.anything(),
				"036000291452",
				expect.objectContaining({ format: "UPC" }),
			),
		);
	});

	it("uses EAN13 for a 13-digit code", async () => {
		render(<BarcodeLabel code="4006381333931" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />);
		await waitFor(() =>
			expect(jsBarcodeMock).toHaveBeenCalledWith(
				expect.anything(),
				"4006381333931",
				expect.objectContaining({ format: "EAN13" }),
			),
		);
	});

	it("falls back to CODE128 when JsBarcode throws on invalid UPC/EAN checksum", async () => {
		// First call (UPC) throws, retry (CODE128) succeeds.
		jsBarcodeMock.mockImplementationOnce(() => {
			throw new Error("Invalid checksum");
		});
		render(<BarcodeLabel code="000000000000" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />);
		await waitFor(() => expect(jsBarcodeMock).toHaveBeenCalledTimes(2));
		expect(jsBarcodeMock).toHaveBeenLastCalledWith(
			expect.anything(),
			"000000000000",
			expect.objectContaining({ format: "CODE128" }),
		);
	});

	it("displays the bare code as text", async () => {
		const { findByText } = render(
			<BarcodeLabel code="ITM-A7F3" kind="item" primaryLabel="Widget" widthIn={2.625} heightIn={1} />,
		);
		expect(await findByText("ITM-A7F3")).toBeInTheDocument();
	});
});
