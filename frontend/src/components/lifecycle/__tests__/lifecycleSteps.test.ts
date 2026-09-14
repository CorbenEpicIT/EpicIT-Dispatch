import { describe, it, expect } from "vitest";
import {
	QUOTE_STEPS,
	INVOICE_STEPS,
	QUOTE_OFF_RAMPS,
	INVOICE_OFF_RAMPS,
	isOffRamp,
} from "../lifecycleSteps";

describe("lifecycle steps", () => {
	it("omits Viewed from the quote path", () => {
		// Viewed is never produced — no client portal, no open-tracking
		// callback — so a step for it would never light.
		expect(QUOTE_STEPS).not.toContain("Viewed");
		expect(QUOTE_STEPS).toEqual(["Draft", "Issued", "Sent", "Approved"]);
	});

	it("walks the invoice path through payment", () => {
		expect(INVOICE_STEPS).toEqual(["Draft", "Issued", "Sent", "PartiallyPaid", "Paid"]);
	});

	it("treats every non-path quote status as an off-ramp", () => {
		expect(QUOTE_OFF_RAMPS).toEqual([
			"Viewed",
			"Disputed",
			"Rejected",
			"Cancelled",
			"Revised",
			"Expired",
		]);
	});

	it("treats Viewed, Disputed and Void as the invoice off-ramps", () => {
		expect(INVOICE_OFF_RAMPS).toEqual(["Viewed", "Disputed", "Void"]);
	});

	/**
	 * Off-ramp means "not on the main path", NOT "has no exits". Expired has
	 * ["Revised"] and Rejected gains it, so a transitions-derived definition
	 * would put both back on the path and lose the terminal stage that carries
	 * their reason and their escape.
	 */
	it("keeps Rejected and Expired off-ramps despite having exits", () => {
		expect(isOffRamp("quote", "Rejected")).toBe(true);
		expect(isOffRamp("quote", "Expired")).toBe(true);
		expect(isOffRamp("quote", "Sent")).toBe(false);
		expect(isOffRamp("invoice", "PartiallyPaid")).toBe(false);
	});
});
