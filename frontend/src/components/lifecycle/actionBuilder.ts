import type { LifecycleAction } from "./types";

/** Shown wherever a grant the action needs is missing. */
export const NO_PERMISSION = "You don't have permission to perform this action";

/**
 * The disabled-`LifecycleAction` factory shared by quoteActions and
 * invoiceActions, which each carried a byte-identical copy of it. A null
 * `reason` means the action is live.
 */
export function buildAction(
	id: string,
	label: string,
	intent: LifecycleAction["intent"],
	reason: string | null,
	onSelect: () => void
): LifecycleAction {
	return {
		id,
		label,
		intent,
		disabled: reason != null,
		disabledReason: reason ?? undefined,
		onSelect,
	};
}

/**
 * "…couldn't be loaded" — the same sentence on both detail pages, the noun
 * aside. Shown when the dispute list failed to load, so the page cannot know
 * whether an action is safe.
 */
export function unknownDisputeReason(kind: "quote" | "invoice"): string {
	return `This ${kind}'s dispute status couldn't be loaded. Reload the page and try again.`;
}

/**
 * Why "Open Dispute" is shut for this document, or null. Both lifecycle
 * builders ran the same ladder: permission, then (invoice only) a dead
 * document, then an unloaded dispute state, then a dispute already open, then
 * the server's own open-door refusal (DW-17's `open_refusal`).
 */
export function openDisputeReason(ctx: {
	kind: "quote" | "invoice";
	canOpenDispute: boolean;
	/** Invoice only: a Void document. Quotes never reach this state. */
	isDead?: boolean;
	disputeStateUnknown: boolean;
	hasOpenDispute: boolean;
	openRefusal: string | null;
}): string | null {
	if (!ctx.canOpenDispute) return NO_PERMISSION;
	if (ctx.isDead) return `A void ${ctx.kind} can't be disputed.`;
	if (ctx.disputeStateUnknown) return unknownDisputeReason(ctx.kind);
	if (ctx.hasOpenDispute) return `This ${ctx.kind} already has an open dispute.`;
	return ctx.openRefusal;
}
