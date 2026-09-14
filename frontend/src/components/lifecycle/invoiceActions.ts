import type { InvoiceStatus } from "../../types/invoices";
import type { LifecycleAction } from "./types";
import {
	buildAction as build,
	NO_PERMISSION,
	openDisputeReason,
	unknownDisputeReason,
} from "./actionBuilder";

export interface InvoiceActionContext {
	status: InvoiceStatus;
	amountPaid: number;
	hasOpenDispute: boolean;
	disputeStateUnknown: boolean;
	/** disputeList.open_refusal — why Open Dispute is shut, or null. Produced by
	 *  the open door itself (DW-17), so the button and the 422 body match. */
	openRefusal: string | null;
	/** disputeList.void_refusal — why the kebab's Void is shut (a payment is
	 *  applied, or a live adjustment names this invoice), or null. Produced by
	 *  the same functions updateInvoice refuses the kebab Void with, so this
	 *  also carries the D1 adjustment rule the frontend never knew. */
	voidRefusal: string | null;
	canEdit: boolean;
	/** Holds open_disputes. Not the same grant as canEdit: recording that a
	 *  client disagrees is not a document edit. */
	canOpenDispute: boolean;
	/** Holds refund_invoices — cash out, which covers both the refund and
	 *  the void. */
	canRefund: boolean;
	handlers: Record<
		"send" | "issue" | "recordPayment" | "refund" | "dispute" | "void",
		() => void
	>;
}

function voidReason(ctx: InvoiceActionContext): string | null {
	// Voiding needs both grants: the server gates the route on edit_invoices
	// and the void itself on refund_invoices.
	if (!ctx.canEdit || !ctx.canRefund) return NO_PERMISSION;
	if (ctx.status === "Void") return "This invoice is already void.";
	if (ctx.disputeStateUnknown) return unknownDisputeReason("invoice");
	// The server refuses any status change under an open dispute, and voiding
	// would leave the dispute with no exit. Repeal closes both at once.
	if (ctx.hasOpenDispute) {
		return "This invoice has an open dispute — resolve it and choose Repeal instead.";
	}
	// Money and the adjustment chain, from the server: matches the kebab Void.
	return ctx.voidRefusal;
}

export function invoiceActions(ctx: InvoiceActionContext): LifecycleAction[] {
	const dead = ctx.status === "Void";

	return [
		// The two delivery doors, side by side. A business either has the system
		// email the invoice, or issues it and delivers the PDF itself — so both
		// are offered from Draft rather than one being a step before the other.
		build(
			"send",
			"Email to Client",
			"primary",
			!ctx.canEdit
				? NO_PERMISSION
				: dead
					? "A void invoice can't be sent."
					: !["Draft", "Issued"].includes(ctx.status)
						? "This invoice has already been sent."
						: null,
			ctx.handlers.send
		),
		build(
			"issue",
			"Issue Without Sending",
			"neutral",
			!ctx.canEdit
				? NO_PERMISSION
				: dead
					? "A void invoice can't be issued."
					: ctx.status !== "Draft"
						? "This invoice has already been issued."
						: null,
			ctx.handlers.issue
		),
		build(
			"recordPayment",
			"Record Payment",
			"primary",
			!ctx.canEdit
				? NO_PERMISSION
				: dead
					? "A void invoice can't take a payment."
					: ctx.status === "Paid"
						? "This invoice is paid in full."
						: !["Sent", "Viewed", "PartiallyPaid", "Disputed"].includes(
									ctx.status
							  )
							? "Send the invoice before recording a payment."
							: null,
			ctx.handlers.recordPayment
		),
		build(
			"dispute",
			"Open Dispute",
			"warning",
			openDisputeReason({
				kind: "invoice",
				canOpenDispute: ctx.canOpenDispute,
				isDead: dead,
				disputeStateUnknown: ctx.disputeStateUnknown,
				hasOpenDispute: ctx.hasOpenDispute,
				openRefusal: ctx.openRefusal,
			}),
			ctx.handlers.dispute
		),
		build(
			"refund",
			"Record Refund",
			"neutral",
			!ctx.canRefund
				? NO_PERMISSION
				: dead
					? "A void invoice can't be refunded."
					: ctx.disputeStateUnknown
						? unknownDisputeReason("invoice")
						: !(ctx.amountPaid > 0)
							? "Nothing has been paid on this invoice yet."
							: null,
			ctx.handlers.refund
		),
		build("void", "Void Invoice", "destructive", voidReason(ctx), ctx.handlers.void),
	];
}
