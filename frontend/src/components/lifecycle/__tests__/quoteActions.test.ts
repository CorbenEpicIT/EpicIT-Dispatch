import { describe, it, expect } from "vitest";
import { quoteActions } from "../quoteActions";
import type { QuoteStatus } from "../../../types/quotes";

const noop = () => {};
const handlers = {
	issue: noop,
	send: noop,
	approve: noop,
	convert: noop,
	dispute: noop,
	reject: noop,
	withdraw: noop,
	revise: noop,
};

const ctx = (over: Record<string, unknown> = {}) => ({
	status: "Sent" as QuoteStatus,
	hasJob: false,
	hasOpenDispute: false,
	disputeStateUnknown: false,
	// The server produces these now (disputeList.open_refusal / .sold_refusal);
	// the builder only threads them into the right action.
	openRefusal: null as string | null,
	soldRefusal: null as string | null,
	canEdit: true,
	canCreateJob: true,
	canOpenDispute: true,
	handlers,
	...over,
});

const byId = (actions: ReturnType<typeof quoteActions>, id: string) =>
	actions.find((a) => a.id === id);

describe("quoteActions", () => {
	it("offers approve, reject, dispute and withdraw on a sent quote", () => {
		const actions = quoteActions(ctx());
		for (const id of ["approve", "reject", "dispute", "withdraw"]) {
			expect(byId(actions, id)?.disabled).toBe(false);
		}
	});

	/**
	 * The defect this closes: a rejected quote could be neither revised,
	 * disputed nor cancelled, so "the client said no" was a dead end and the
	 * dispatcher had to hand-build a new quote with no lineage.
	 */
	it("offers a revision on a rejected quote", () => {
		expect(byId(quoteActions(ctx({ status: "Rejected" })), "revise")?.disabled).toBe(
			false
		);
	});

	it("offers a revision on an expired quote", () => {
		expect(byId(quoteActions(ctx({ status: "Expired" })), "revise")?.disabled).toBe(
			false
		);
	});

	it("closes revision on a cancelled quote with a reason", () => {
		const revise = byId(quoteActions(ctx({ status: "Cancelled" })), "revise");
		expect(revise?.disabled).toBe(true);
		expect(revise?.disabledReason).toBeTruthy();
	});

	/**
	 * A disputed quote has its own revision door — the dispute outcome, which
	 * also closes the dispute row. The standalone one would strand it.
	 */
	it("sends a disputed quote's revision back to the dispute", () => {
		const actions = quoteActions(ctx({ status: "Disputed", hasOpenDispute: true }));
		expect(byId(actions, "revise")?.disabledReason).toMatch(/dispute/i);
	});

	/** revisePending is checked ahead of the status gates so an in-flight
	 *  revise reads as in flight rather than as not allowed. */
	it("closes revision while one is already in flight", () => {
		const revise = byId(
			quoteActions(ctx({ status: "Rejected", revisePending: true })),
			"revise"
		);
		expect(revise?.disabled).toBe(true);
		expect(revise?.disabledReason).toMatch(/creating a revision/i);
	});

	/**
	 * DW-04: the sold-work sentence is the server's `sold_refusal`. The builder
	 * threads it verbatim onto Convert (and onto Reject / Withdraw) — it never
	 * re-derives it, which is how the page's third copy came to omit the sibling
	 * case and bill sold work twice.
	 */
	it("carries the server's sold_refusal onto conversion", () => {
		const sold =
			"Another quote on this request was already sold as a job — the work is spoken for. Repeal this quote, or correct that job's invoice.";
		const convert = byId(
			quoteActions(ctx({ status: "Approved", soldRefusal: sold })),
			"convert"
		);
		expect(convert?.disabled).toBe(true);
		expect(convert?.disabledReason).toBe(sold);
	});

	it("closes Reject and Withdraw with the same sold_refusal", () => {
		const sold = "A job was created from this quote — the quote is no longer the live document.";
		// Sent, so the Rejected/Cancelled transitions are legal and it is the
		// sold_refusal (not a transition message) that closes the two.
		const actions = quoteActions(ctx({ status: "Sent", soldRefusal: sold }));
		expect(byId(actions, "reject")?.disabledReason).toBe(sold);
		expect(byId(actions, "withdraw")?.disabledReason).toBe(sold);
	});

	/**
	 * The rule that stranded Q-0007: its request was converted straight to a
	 * job with no quote in the path, so nothing this quote offers was sold and
	 * both exits must stay open.
	 */
	it("leaves conversion and revision open when nothing was sold", () => {
		const actions = quoteActions(ctx({ status: "Approved", soldRefusal: null }));
		expect(byId(actions, "convert")?.disabled).toBe(false);
		expect(byId(actions, "revise")?.disabled).toBe(false);
	});

	it("never omits an unavailable action", () => {
		const open = quoteActions(ctx({ status: "Sent" })).map((a) => a.id);
		const dead = quoteActions(ctx({ status: "Cancelled" })).map((a) => a.id);
		expect(dead).toEqual(open);
	});

	it("disables dispute-related and destructive actions when dispute state is unknown", () => {
		const actions = quoteActions(ctx({ disputeStateUnknown: true }));
		for (const id of ["dispute", "withdraw", "reject", "convert"]) {
			expect(byId(actions, id)?.disabled).toBe(true);
			expect(byId(actions, id)?.disabledReason).toMatch(/reload/i);
		}
	});

	it("disables writes without the edit permission", () => {
		expect(
			byId(quoteActions(ctx({ canEdit: false })), "approve")?.disabledReason
		).toMatch(/permission/i);
	});

	// canTransitionQuote calls a self-transition legal, which left Issue live as
	// a no-op write on a quote that was already issued. Issued is reachable only
	// from Draft, and issuing twice would re-date the document.
	it("closes issue once the quote has left Draft", () => {
		const action = byId(quoteActions(ctx({ status: "Issued" })), "issue");
		expect(action?.disabled).toBe(true);
		expect(action?.disabledReason).toMatch(/already been issued/i);
		expect(byId(quoteActions(ctx({ status: "Draft" })), "issue")?.disabled).toBe(
			false
		);
	});

	it("marks intents so the bar can place them", () => {
		const actions = quoteActions(ctx());
		expect(byId(actions, "withdraw")?.intent).toBe("destructive");
		expect(byId(actions, "reject")?.intent).toBe("destructive");
		expect(byId(actions, "dispute")?.intent).toBe("warning");
	});

	it("returns actions in a stable order regardless of status", () => {
		const a = quoteActions(ctx({ status: "Sent" })).map((x) => x.id);
		const b = quoteActions(ctx({ status: "Rejected" })).map((x) => x.id);
		expect(a).toEqual(b);
	});

	it("offers a dispute when the server allows one (open_refusal null)", () => {
		const actions = quoteActions(ctx({ status: "Issued", openRefusal: null }));
		expect(byId(actions, "dispute")?.disabled).toBe(false);
	});

	/**
	 * DW-17: the "can't be disputed" sentence is the open door's own
	 * (disputeList.open_refusal), so the button and the 422 body can no longer
	 * drift ("cannot" vs "can't"). The builder shows it verbatim.
	 */
	it("shows the server's open_refusal verbatim on Open Dispute", () => {
		const refusal =
			"A Draft quote can't be disputed. Disputes may be opened from: Issued, Sent, Viewed, Approved.";
		const actions = quoteActions(ctx({ status: "Draft", openRefusal: refusal }));
		expect(byId(actions, "dispute")?.disabled).toBe(true);
		expect(byId(actions, "dispute")?.disabledReason).toBe(refusal);
	});
});

describe("quoteActions permission gates", () => {
	it("offers Open Dispute to a caller with open_disputes but no edit rights", () => {
		expect(byId(quoteActions(ctx({ canEdit: false })), "dispute")?.disabled).toBe(
			false
		);
	});

	it("closes Open Dispute without open_disputes, even with edit rights", () => {
		const action = byId(quoteActions(ctx({ canOpenDispute: false })), "dispute");
		expect(action?.disabled).toBe(true);
		expect(action?.disabledReason).toMatch(/permission/i);
	});

	// The other actions keep reading edit_quotes: they are document edits.
	it("leaves the non-dispute actions on edit_quotes", () => {
		const actions = quoteActions(ctx({ canEdit: false }));
		for (const id of ["send", "approve", "reject", "withdraw"]) {
			expect(byId(actions, id)?.disabled).toBe(true);
		}
	});
});
