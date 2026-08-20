import { describe, expect, it } from "vitest";
import { getAnchoredPopupPos } from "./scheduleBoardUtils";

const VIEWPORT = { width: 1200, height: 800 };

describe("getAnchoredPopupPos", () => {
	it("places the popup to the right of the anchor when there is room", () => {
		const pos = getAnchoredPopupPos(
			{ left: 200, right: 340, top: 300 },
			{ popupH: 240, viewport: VIEWPORT },
		);
		expect(pos).toEqual({ top: 300, left: 344 });
	});

	it("flips to the left of the anchor when the right side would overflow", () => {
		const pos = getAnchoredPopupPos(
			{ left: 1000, right: 1140, top: 300 },
			{ popupH: 240, viewport: VIEWPORT },
		);
		expect(pos.left).toBe(1000 - 224 - 4);
	});

	it("clamps a bottom-edge anchor so the popup stays on screen", () => {
		const pos = getAnchoredPopupPos(
			{ left: 200, right: 340, top: 790 },
			{ popupH: 240, viewport: VIEWPORT },
		);
		expect(pos.top).toBe(VIEWPORT.height - 240 - 8);
	});

	it("never positions the popup off the top or left edge", () => {
		const pos = getAnchoredPopupPos(
			{ left: 2, right: 6, top: -50 },
			{ popupH: 240, viewport: { width: 200, height: 800 } },
		);
		expect(pos.top).toBe(8);
		expect(pos.left).toBe(8);
	});
});
