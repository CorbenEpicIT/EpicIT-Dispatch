/**
 * Centralized status transition rules.
 *
 * Only user-initiated transitions go through this guard.
 * Internal system updates (payment sync, PDF generation) bypass it.
 *
 * If `from === to` the call is a no-op and always allowed.
 */

const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
	Draft:     ["Issued", "Cancelled"],
	Issued:    ["Sent", "Approved", "Rejected", "Revised", "Expired", "Cancelled"],
	Sent:      ["Viewed", "Expired", "Cancelled"],
	Viewed:    ["Approved", "Rejected", "Expired", "Cancelled"],
	Approved:  ["Revised"],
	Rejected:  [],
	Revised:   [],
	Expired:   ["Revised"],
	Cancelled: [],
};

const INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
	Draft:        ["Issued", "Void"],
	Issued:       ["Sent", "Void"],
	Sent:         ["Viewed", "Disputed", "Void"],
	Viewed:       ["Disputed", "Void"],
	PartiallyPaid:["Disputed", "Void"],
	Paid:         [],
	Disputed:     ["Sent", "Void"],
	Void:         [],
};

export class InvalidTransitionError extends Error {
	status = 422;
	constructor(from: string, to: string) {
		super(`Invalid status transition: ${from} → ${to}`);
		this.name = "InvalidTransitionError";
	}
}

export function assertValidQuoteTransition(from: string, to: string): void {
	if (from === to) return;
	const allowed = QUOTE_TRANSITIONS[from];
	if (!allowed) {
		throw new InvalidTransitionError(from, to);
	}
	if (!allowed.includes(to)) {
		throw new InvalidTransitionError(from, to);
	}
}

export function assertValidInvoiceTransition(from: string, to: string): void {
	if (from === to) return;
	const allowed = INVOICE_TRANSITIONS[from];
	if (!allowed) {
		throw new InvalidTransitionError(from, to);
	}
	if (!allowed.includes(to)) {
		throw new InvalidTransitionError(from, to);
	}
}
