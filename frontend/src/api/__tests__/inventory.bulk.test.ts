import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { importInventory, downloadInventoryTemplate, exportLowStockInventory } from "../inventory";
import { api } from "../axiosClient";

vi.mock("../axiosClient", () => ({
	api: {
		post: vi.fn(),
		get: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
	},
}));

const mockApi = api as unknown as Record<"post" | "get" | "patch" | "delete", MockInstance>;

// Capture the real createElement before spying so the mock can call it without recursing
const originalCreateElement = document.createElement.bind(document);
const mockObjectURL = "blob:mock-url";
const clickSpy = vi.fn();
const createElementSpy = vi.spyOn(document, "createElement");

beforeEach(() => {
	vi.clearAllMocks();
	URL.createObjectURL = vi.fn().mockReturnValue(mockObjectURL);
	URL.revokeObjectURL = vi.fn();
	createElementSpy.mockImplementation((tag: string) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const el = originalCreateElement(tag as any);
		if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
		return el;
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// importInventory
// ─────────────────────────────────────────────────────────────────────────────
describe("importInventory", () => {
	it("POSTs to /inventory/import with multipart/form-data", async () => {
		mockApi.post.mockResolvedValue({
			data: { success: true, data: { imported: 3, skipped: [] }, error: null },
		});

		const file = new File(["content"], "items.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		await importInventory(file);

		expect(mockApi.post).toHaveBeenCalledWith(
			"/inventory/import",
			expect.any(FormData),
			expect.objectContaining({ headers: { "Content-Type": "multipart/form-data" } }),
		);
	});

	it("attaches the file to FormData under the key 'file'", async () => {
		let captured: FormData | undefined;
		mockApi.post.mockImplementation((_url, data) => {
			captured = data as FormData;
			return Promise.resolve({
				data: { success: true, data: { imported: 1, skipped: [] }, error: null },
			});
		});

		const file = new File(["content"], "items.csv", { type: "text/csv" });
		await importInventory(file);

		expect(captured?.get("file")).toBe(file);
	});

	it("returns the imported count and skipped rows from the response", async () => {
		const payload = { imported: 5, skipped: [{ row: 3, reason: "Missing location" }] };
		mockApi.post.mockResolvedValue({ data: { success: true, data: payload, error: null } });

		const result = await importInventory(new File([], "x.xlsx"));
		expect(result).toEqual(payload);
	});

	it("throws when the server responds with success: false", async () => {
		mockApi.post.mockResolvedValue({
			data: { success: false, data: null, error: { message: "Invalid file format" } },
		});

		await expect(importInventory(new File([], "x.csv"))).rejects.toThrow("Invalid file format");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// downloadInventoryTemplate
// ─────────────────────────────────────────────────────────────────────────────
describe("downloadInventoryTemplate", () => {
	it("GETs /inventory/template with responseType blob", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		await downloadInventoryTemplate();
		expect(mockApi.get).toHaveBeenCalledWith("/inventory/template", { responseType: "blob" });
	});

	it("triggers a browser download by clicking an <a> element", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		await downloadInventoryTemplate();
		expect(clickSpy).toHaveBeenCalled();
	});

	it("uses the filename inventory-import-template.xlsx", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });

		let capturedA: HTMLAnchorElement | undefined;
		createElementSpy.mockImplementation((tag: string) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const el = originalCreateElement(tag as any);
			if (tag === "a") {
				(el as HTMLAnchorElement).click = clickSpy;
				capturedA = el as HTMLAnchorElement;
			}
			return el;
		});

		await downloadInventoryTemplate();
		expect(capturedA?.download).toBe("inventory-import-template.xlsx");
	});

	it("revokes the object URL after the click", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		await downloadInventoryTemplate();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockObjectURL);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// exportLowStockInventory
// ─────────────────────────────────────────────────────────────────────────────
describe("exportLowStockInventory", () => {
	it("GETs /inventory/export/low-stock with responseType blob", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		await exportLowStockInventory();
		expect(mockApi.get).toHaveBeenCalledWith("/inventory/export/low-stock", {
			responseType: "blob",
		});
	});

	it("triggers a browser download", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		await exportLowStockInventory();
		expect(clickSpy).toHaveBeenCalled();
	});

	it("includes the current year in the filename", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		let capturedA: HTMLAnchorElement | undefined;
		createElementSpy.mockImplementation((tag: string) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const el = originalCreateElement(tag as any);
			if (tag === "a") { (el as HTMLAnchorElement).click = clickSpy; capturedA = el as HTMLAnchorElement; }
			return el;
		});

		await exportLowStockInventory();
		expect(capturedA?.download).toContain(new Date().getFullYear().toString());
	});

	it("uses the pattern low-stock-report <Month> <D> <YYYY>.xlsx", async () => {
		mockApi.get.mockResolvedValue({ data: new Blob(["data"]) });
		let capturedA: HTMLAnchorElement | undefined;
		createElementSpy.mockImplementation((tag: string) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const el = originalCreateElement(tag as any);
			if (tag === "a") { (el as HTMLAnchorElement).click = clickSpy; capturedA = el as HTMLAnchorElement; }
			return el;
		});

		await exportLowStockInventory();
		expect(capturedA?.download).toMatch(/^low-stock-report [A-Z][a-z]+ \d{1,2} \d{4}\.xlsx$/);
	});
});
