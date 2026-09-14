import type { QuoteStatus } from "../../types/quotes";
import type { InvoiceStatus } from "../../types/invoices";
import type { LifecycleKind } from "./types";

/**
 * The happy path, in order. Viewed is absent on purpose: nothing produces it
 * (no client portal, no email open-tracking callback), so a step for it would
 * sit permanently unlit and misrepresent the process. Sent is the real
 * pre-decision state.
 */
export const QUOTE_STEPS = ["Draft", "Issued", "Sent", "Approved"] as const;

export const INVOICE_STEPS = ["Draft", "Issued", "Sent", "PartiallyPaid", "Paid"] as const;

/**
 * Statuses off the main path. Defined this way rather than by an empty
 * transition list because Expired and Rejected both have exits — a
 * transitions-derived definition would drop them back onto the path and lose
 * the stage that shows their reason and their Create Revision escape.
 */
export const QUOTE_OFF_RAMPS: readonly QuoteStatus[] = [
	"Viewed",
	"Disputed",
	"Rejected",
	"Cancelled",
	"Revised",
	"Expired",
];

export const INVOICE_OFF_RAMPS: readonly InvoiceStatus[] = ["Viewed", "Disputed", "Void"];

export function isOffRamp(kind: LifecycleKind, status: string): boolean {
	const ramps: readonly string[] = kind === "quote" ? QUOTE_OFF_RAMPS : INVOICE_OFF_RAMPS;
	return ramps.includes(status);
}
