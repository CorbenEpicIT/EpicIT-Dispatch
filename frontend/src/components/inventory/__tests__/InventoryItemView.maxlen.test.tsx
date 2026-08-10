import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "../../../test/testUtils";
import InventoryItemView from "../InventoryItemView";
import { formatter } from "../../../util/util";
import type { InventoryItem } from "../../../types/inventory";

// Fields at their validation cap (backend/prisma/seed.ts maxlen fixture). jsdom can't
// measure overflow, so these assert behavior (pill exists, title has full value), not pixels.

// trimEnd: getByTitle normalizes whitespace on the DOM side but not our expected string.
const pad = (text: string, len: number, filler = "X") =>
	(text + filler.repeat(len)).slice(0, len).trimEnd();

// Fillers carry exactly one leading space and none trailing — RTL's whitespace
// normalizer would break a getByTitle match on double spaces.
const MAX_NAME = pad(
	"MAXLEN Universal Variable-Speed Inverter Heat Pump Air Handler Kit",
	255,
	" Lorem ipsum dolor sit amet",
);
const MAX_SKU = pad("STRESS-MAXLEN-SKU-", 100);
const MAX_LOCATION = pad(
	"Warehouse — Building 3, Mezzanine 2, Aisle 14, Rack D, Shelf 7, Bin 22-B",
	255,
	" Overflow Tote",
);
const MAX_TAG = pad("MAXLEN TAG — Warranty Claim Documentation Required", 100, " before return");
const INT32_MAX = 2147483647;

function maxLenItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: "item-maxlen",
		name: MAX_NAME,
		description: pad("MAXLEN description", 5000, " filler prose"),
		location: MAX_LOCATION,
		quantity: 0,
		unit_price: 99999999.99,
		cost: 99999999.99,
		sku: MAX_SKU,
		barcode: pad("STRESSMAXLENBARCODE", 200, "0"),
		is_active: true,
		low_stock_threshold: INT32_MAX,
		image_urls: [],
		alt_ids: Array.from({ length: 12 }, (_, i) => pad(`STRESS-ALT-ID-${i + 1}-`, 100)),
		alert_emails_enabled: true,
		alert_email: `${pad("stress-mailbox", 64, "x")}@${pad("stress-domain", 63, "x")}.example`,
		category: pad("Stress Test Category", 100, " grouping axis"),
		unit: "cylinder",
		is_serialized: true,
		is_batch_tracked: true,
		created_at: "2026-08-01T12:00:00.000Z",
		updated_at: "2026-08-01T12:00:00.000Z",
		stock_status: "out_of_stock",
		tags: Array.from({ length: 6 }, (_, i) => ({
			id: `tag-${i}`,
			label: i < 2 ? MAX_TAG : `Tag ${i}`,
			organization_id: "org-1",
			created_at: "2026-08-01T12:00:00.000Z",
			updated_at: "2026-08-01T12:00:00.000Z",
		})),
		...overrides,
	};
}

// TagChipRow observes its own size to decide how many chips fit; the no-op
// ResizeObserver that makes that safe in jsdom lives in src/test/setup.ts.
describe("InventoryItemView — maxlen field values", () => {
	describe("list view", () => {
		it("keeps the price pill rendered alongside a capped SKU and location", () => {
			// Guards against a long SKU/location pushing PRICE out of the clipped row.
			render(<InventoryItemView item={maxLenItem()} viewMode="list" />);

			expect(screen.getByText("PRICE")).toBeInTheDocument();
			expect(screen.getByText(/99999999\.99/)).toBeInTheDocument();
		});

		it("truncates SKU and location but keeps their full values reachable", () => {
			render(<InventoryItemView item={maxLenItem()} viewMode="list" />);

			expect(screen.getByTitle(MAX_SKU)).toBeInTheDocument();
			expect(screen.getByTitle(MAX_LOCATION)).toBeInTheDocument();
		});

		it("renders every tag chip and clips the block rather than dropping tags", () => {
			// jsdom reports offsetTop as 0, so it can't exercise the +N count (see TagChipRow) —
			// this only checks no tag is dropped and the block stays clipped.
			render(<InventoryItemView item={maxLenItem()} viewMode="list" />);

			for (const label of ["Tag 2", "Tag 3", "Tag 4", "Tag 5"]) {
				expect(screen.getByText(label)).toBeInTheDocument();
			}
			const chipBlock = screen.getByText("Tag 5").parentElement;
			expect(chipBlock?.className).toContain("overflow-hidden");
			expect(chipBlock?.className).toContain("flex-wrap");
			// Full label still renders even at the 100-char cap.
			expect(screen.getAllByTitle(MAX_TAG).length).toBeGreaterThan(0);
		});

		it("clamps the name to two lines instead of one truncated line", () => {
			render(<InventoryItemView item={maxLenItem()} viewMode="list" />);

			const name = screen.getByTitle(MAX_NAME);
			expect(name.className).toContain("line-clamp-2");
			expect(name.className).not.toContain("truncate");
		});
	});

	describe("card view", () => {
		it("renders the capped SKU in a break-words, clamped cell", () => {
			// Guards against a space-free SKU expanding the grid track past the card edge.
			render(<InventoryItemView item={maxLenItem()} viewMode="card" />);

			const sku = screen.getByTitle(MAX_SKU);
			expect(sku.className).toContain("break-words");
			expect(sku.className).toContain("line-clamp-2");
		});

		it("renders the alert threshold compactly with the exact figure in a title", () => {
			render(<InventoryItemView item={maxLenItem()} viewMode="card" />);

			expect(screen.getByText(`Alert: ${formatter.format(INT32_MAX)}`)).toBeInTheDocument();
			expect(screen.getByTitle(`Alert threshold: ${INT32_MAX}`)).toBeInTheDocument();
		});
	});
});
