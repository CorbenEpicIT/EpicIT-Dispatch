import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../../../test/testUtils";
import SerialCaptureList from "../SerialCaptureList";

const mockMutateAsync = vi.fn();

vi.mock("../../../../hooks/useTracking", () => ({
	useResolveCodeMutation: () => ({
		mutateAsync: mockMutateAsync,
		isPending: false,
	}),
}));

// Camera scanning depends on getUserMedia/BarcodeDetector, neither available in
// jsdom — these tests only exercise paste/HID/manual entry, so the modal is
// stubbed out entirely.
vi.mock("../../BarcodeScanner", () => ({
	BarcodeScanner: () => null,
}));

function Harness({ initialValue = [] }: { initialValue?: string[] }) {
	const [value, setValue] = useState<string[]>(initialValue);
	return (
		<SerialCaptureList itemId="item-1" targetCount={3} value={value} onChange={setValue} />
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	// Default: nothing resolves — matches the common case of a brand-new serial.
	mockMutateAsync.mockRejectedValue(new Error("No match found"));
});

describe("count indicator", () => {
	it("shows short count in muted styling below target", () => {
		render(<Harness initialValue={["A"]} />);
		const label = screen.getByText("1 / 3 serials");
		expect(label).toBeInTheDocument();
		expect(label.className).toContain("text-text-muted");
	});

	it("shows exact count in success styling when count matches target", () => {
		render(<Harness initialValue={["A", "B", "C"]} />);
		const label = screen.getByText("3 / 3 serials");
		expect(label.className).toContain("text-success-text");
	});

	it("shows over count in error styling above target", () => {
		render(<Harness initialValue={["A", "B", "C", "D"]} />);
		const label = screen.getByText("4 / 3 serials");
		expect(label.className).toContain("text-error-text");
	});
});

describe("HID wedge burst", () => {
	it("commits the current input value on Enter and clears the input", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");

		await userEvent.type(input, "SN-001{Enter}");

		expect(screen.getByText("SN-001")).toBeInTheDocument();
		expect(input).toHaveValue("");
	});

	it("supports a rapid burst of multiple scans", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");

		await userEvent.type(input, "SN-001{Enter}");
		await userEvent.type(input, "SN-002{Enter}");
		await userEvent.type(input, "SN-003{Enter}");

		expect(screen.getByText("SN-001")).toBeInTheDocument();
		expect(screen.getByText("SN-002")).toBeInTheDocument();
		expect(screen.getByText("SN-003")).toBeInTheDocument();
	});
});

describe("bulk paste", () => {
	async function pasteText(input: HTMLElement, text: string) {
		const dataTransfer = {
			getData: () => text,
		};
		await userEvent.click(input);
		// fireEvent-style paste via userEvent's paste helper isn't delimiter-aware,
		// so dispatch the clipboard event directly to control the pasted text.
		const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
		Object.assign(pasteEvent, { clipboardData: dataTransfer });
		act(() => {
			input.dispatchEvent(pasteEvent);
		});
		// Let each new row's debounced "already exists" check settle so its
		// state update lands inside act() instead of leaking into the next test.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 450));
		});
	}

	it("splits on newlines", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");
		await pasteText(input, "SN-100\nSN-101\nSN-102");

		expect(screen.getByText("SN-100")).toBeInTheDocument();
		expect(screen.getByText("SN-101")).toBeInTheDocument();
		expect(screen.getByText("SN-102")).toBeInTheDocument();
	});

	it("splits on commas", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");
		await pasteText(input, "SN-200,SN-201,SN-202");

		expect(screen.getByText("SN-200")).toBeInTheDocument();
		expect(screen.getByText("SN-201")).toBeInTheDocument();
		expect(screen.getByText("SN-202")).toBeInTheDocument();
	});

	it("splits on tabs", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");
		await pasteText(input, "SN-300\tSN-301\tSN-302");

		expect(screen.getByText("SN-300")).toBeInTheDocument();
		expect(screen.getByText("SN-301")).toBeInTheDocument();
		expect(screen.getByText("SN-302")).toBeInTheDocument();
	});

	it("splits on a mix of all three delimiters", async () => {
		render(<Harness />);
		const input = screen.getByLabelText("Add serial number");
		await pasteText(input, "SN-A,SN-B\nSN-C\tSN-D");

		expect(screen.getByText("SN-A")).toBeInTheDocument();
		expect(screen.getByText("SN-B")).toBeInTheDocument();
		expect(screen.getByText("SN-C")).toBeInTheDocument();
		expect(screen.getByText("SN-D")).toBeInTheDocument();
	});
});

describe("duplicate detection", () => {
	it("flags entries that duplicate another entry in the list", async () => {
		render(<Harness initialValue={["SN-DUP", "SN-DUP"]} />);

		const duplicateLabels = await screen.findAllByText("Duplicate in this list");
		expect(duplicateLabels).toHaveLength(2);
	});

	it("does not flag unique entries as duplicates", () => {
		render(<Harness initialValue={["SN-UNIQUE"]} />);
		expect(screen.queryByText("Duplicate in this list")).not.toBeInTheDocument();
	});
});

describe("already-exists conflict", () => {
	it("flags a serial that resolves to a different item", async () => {
		mockMutateAsync.mockResolvedValue({
			type: "serial",
			code: "SN-EXIST",
			serialUnitId: "su1",
			status: "in_warehouse",
			item: { id: "other-item", name: "Other Widget" },
		});

		render(<Harness initialValue={["SN-EXIST"]} />);

		await waitFor(() => {
			expect(screen.getByText("Already registered to Other Widget")).toBeInTheDocument();
		});
	});

	it("uses a more specific message when the conflict is this same item", async () => {
		mockMutateAsync.mockResolvedValue({
			type: "serial",
			code: "SN-SAME",
			serialUnitId: "su2",
			status: "in_warehouse",
			item: { id: "item-1", name: "This Widget" },
		});

		render(<Harness initialValue={["SN-SAME"]} />);

		await waitFor(() => {
			expect(screen.getByText("Already registered to this item")).toBeInTheDocument();
		});
	});
});

describe("remove entry", () => {
	it("removes the row when its remove button is clicked", async () => {
		render(<Harness initialValue={["SN-REMOVE"]} />);
		expect(screen.getByText("SN-REMOVE")).toBeInTheDocument();

		await userEvent.click(screen.getByLabelText("Remove serial SN-REMOVE"));

		expect(screen.queryByText("SN-REMOVE")).not.toBeInTheDocument();
	});
});
