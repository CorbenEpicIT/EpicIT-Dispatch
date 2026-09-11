import { canTransitionQuote, QUOTE_TRANSITIONS } from "../../lib/quoteTransitions";
import type { QuoteStatus } from "../../types/quotes";
import type { LifecycleAction } from "./types";
import {
	buildAction as build,
	NO_PERMISSION,
	openDisputeReason,
	unknownDisputeReason,
} from "./actionBuilder";
import { OUTCOME_LABELS } from "../disputes/outcomes";

/**
 * The statuses a quote may be revised from, taken off the same `→ Revised`
 * edges the server's REVISABLE_STATUSES reads: every quote status whose
 * transition row allows Revised, minus the editable Draft/Sent/Viewed
 * (superseding a live document would burn a quote number) and Disputed (its
 * own door — resolve as Revise & Resend). Derived so the two sides drift only
 * if the shared transition table does.
 */
const NOT_REVISABLE_DESPITE_EDGE: readonly QuoteStatus[] = [
	"Draft",
	"Sent",
	"Viewed",
	"Disputed",
];
const REVISABLE: readonly QuoteStatus[] = (
	Object.keys(QUOTE_TRANSITIONS) as QuoteStatus[]
).filter(
	(s) =>
		QUOTE_TRANSITIONS[s].includes("Revised") &&
		!NOT_REVISABLE_DESPITE_EDGE.includes(s)
);
/**
 * Mirrors QUOTE_NOT_CONVERTIBLE in backend/src/controllers/jobsController.ts.
 * insertJob applies no transition guard — it writes the quote to Approved
 * whatever it was — so the server's own list is the rule; this copy is what the
 * page shows before the round trip. Narrowing it to an allowlist would silently
 * drop Draft, which converts today.
 */
const QUOTE_TERMINAL: readonly QuoteStatus[] = ["Rejected", "Revised", "Expired", "Cancelled"];

export interface QuoteActionContext {
	status: QuoteStatus;
	hasJob: boolean;
	hasOpenDispute: boolean;
	disputeStateUnknown: boolean;
	/** disputeList.open_refusal — why Open Dispute is shut, or null. Produced by
	 *  the open door itself (DW-17), so the button and the 422 body match. */
	openRefusal: string | null;
	/** disputeList.sold_refusal — why this quote can no longer be sold as-is
	 *  (a job off it or a sibling), or null. Produced by soldJobReason on the
	 *  server, the same function insertJob refuses conversion with. */
	soldRefusal: string | null;
	canEdit: boolean;
	canCreateJob: boolean;
	/** Holds open_disputes. Not the same grant as canEdit: recording that a
	 *  client disagrees is not a document edit. */
	canOpenDispute: boolean;
	/** A revision request is in flight; see reviseReason. */
	revisePending?: boolean;
	handlers: Record<
		| "issue"
		| "send"
		| "approve"
		| "convert"
		| "dispute"
		| "reject"
		| "withdraw"
		| "revise",
		() => void
	>;
}

function reviseReason(ctx: QuoteActionContext): string | null {
	if (!ctx.canEdit) return NO_PERMISSION;
	// Checked ahead of the status gates so an in-flight revise reads as in
	// flight rather than as not allowed.
	if (ctx.revisePending) return "Creating a revision…";
	if (ctx.status === "Disputed" || ctx.hasOpenDispute) {
		return `This quote is under dispute — resolve the dispute and choose ${OUTCOME_LABELS.ReviseAndResend} instead.`;
	}
	if (!REVISABLE.includes(ctx.status)) {
		return `A ${ctx.status.toLowerCase()} quote can't be revised. Revisions come from ${REVISABLE.map(
			(s) => s.toLowerCase()
		).join(", ")} quotes.`;
	}
	return null;
}

function convertReason(ctx: QuoteActionContext): string | null {
	if (ctx.hasJob) return null; // the label already says a job exists
	if (!ctx.canCreateJob) return NO_PERMISSION;
	if (ctx.status === "Disputed") {
		return "This quote is under dispute — resolve the dispute before converting it to a job.";
	}
	if (ctx.disputeStateUnknown) return unknownDisputeReason("quote");
	if (ctx.soldRefusal) return ctx.soldRefusal;
	if (QUOTE_TERMINAL.includes(ctx.status)) {
		return `A ${ctx.status.toLowerCase()} quote can't be converted to a job.`;
	}
	return null;
}

function disputeReason(ctx: QuoteActionContext): string | null {
	return openDisputeReason({
		kind: "quote",
		canOpenDispute: ctx.canOpenDispute,
		disputeStateUnknown: ctx.disputeStateUnknown,
		hasOpenDispute: ctx.hasOpenDispute,
		openRefusal: ctx.openRefusal,
	});
}

/**
 * The quote's offered actions, in a fixed order.
 *
 * Order is stable across every status and every action is always present —
 * closed ones arrive disabled with their reason. A dispatcher who sees why an
 * action is shut learns the rule; one who sees a shorter list learns nothing,
 * and one whose buttons move as state changes loses their muscle memory.
 */
export function quoteActions(ctx: QuoteActionContext): LifecycleAction[] {
	const transition = (to: QuoteStatus): string | null => {
		if (!ctx.canEdit) return NO_PERMISSION;
		if (ctx.disputeStateUnknown) return unknownDisputeReason("quote");
		if (ctx.hasOpenDispute) {
			return "This quote has an open dispute — resolve it first.";
		}
		if (!canTransitionQuote(ctx.status, to)) {
			return `A ${ctx.status.toLowerCase()} quote can't be marked ${to.toLowerCase()}.`;
		}
		return null;
	};

	return [
		// Two delivery doors, deliberately labelled as a pair: the business
		// either has the system email the document, or issues it and delivers
		// the PDF itself. QUOTE_TRANSITIONS allows Sent straight out of Draft,
		// so neither is a step before the other. "Mark as Issued" said nothing
		// about who delivers, which is the whole distinction.
		build(
			"issue",
			"Issue Without Sending",
			"neutral",
			// Not transition("Issued"): canTransitionQuote treats a
			// self-transition as legal, so on an already-issued quote this
			// stayed live as a no-op write. Issued is only reachable from
			// Draft, and issuing twice would re-date the document. Matches the
			// same gate in invoiceActions.
			!ctx.canEdit
				? NO_PERMISSION
				: ctx.status !== "Draft"
					? "This quote has already been issued."
					: transition("Issued"),
			ctx.handlers.issue
		),
		build("send", "Email to Client", "primary", transition("Sent"), ctx.handlers.send),
		build(
			"approve",
			"Mark as Approved",
			"primary",
			transition("Approved"),
			ctx.handlers.approve
		),
		build(
			"convert",
			ctx.hasJob ? "Job Already Created" : "Convert to Job",
			"neutral",
			convertReason(ctx),
			ctx.handlers.convert
		),
		build(
			"dispute",
			"Open Dispute",
			"warning",
			disputeReason(ctx),
			ctx.handlers.dispute
		),
		// primary, not neutral: revise only reaches the visible row on a
		// terminal stage (on the normal stage issue/send/approve hold the
		// slots and this sits in the popover), and there it IS the recommended
		// action. Left neutral, an enabled Create Revision read quieter than a
		// disabled Email to Client beside it — the live action looking less
		// clickable than a dead one.
		build(
			"revise",
			"Create Revision",
			"primary",
			reviseReason(ctx),
			ctx.handlers.revise
		),
		build(
			"reject",
			"Reject",
			"destructive",
			transition("Rejected") ?? ctx.soldRefusal,
			ctx.handlers.reject
		),
		build(
			"withdraw",
			"Withdraw",
			"destructive",
			transition("Cancelled") ?? ctx.soldRefusal,
			ctx.handlers.withdraw
		),
	];
}
