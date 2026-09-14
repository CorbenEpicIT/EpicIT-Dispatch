/**
 * One offered lifecycle action.
 *
 * Deliberately the same shape as OutcomeOption in
 * components/disputes/outcomes.ts: unavailable actions are returned disabled
 * with their reason rather than omitted, so a dispatcher who cannot do
 * something learns why. Ruling P11 established that for dispute outcomes; this
 * is the same contract for every action on the page.
 */
export interface LifecycleAction {
	id: string;
	label: string;
	/** warning = dispute-adjacent; destructive = kills the document. */
	intent: "primary" | "neutral" | "warning" | "destructive";
	disabled: boolean;
	disabledReason?: string;
	onSelect: () => void;
}

export type LifecycleStage = "normal" | "dispute" | "terminal";

export type LifecycleKind = "quote" | "invoice";
