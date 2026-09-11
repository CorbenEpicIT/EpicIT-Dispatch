import type { LifecycleAction, LifecycleStage } from "./types";

/** How many actions the bar shows before the rest spill into the kebab. */
export const PRIMARY_SLOTS = 3;

export interface SplitActions {
	/** Rendered as buttons in the bar. */
	inline: LifecycleAction[];
	/** Rendered in the header kebab's Lifecycle group. */
	overflow: LifecycleAction[];
}

/**
 * Where each lifecycle action goes. Pure, and the ONLY place the two placement
 * rules live — the bar and the header kebab both call it with the same
 * arguments, so neither can develop its own idea of what it owns. It used to
 * live inside LifecycleBar's body, which is why the bar carried an overflow
 * menu of its own an inch below the header's.
 *
 * Rule 1, stage-aware. On the normal stage a destructive action is ALWAYS in
 * the overflow, so a document-killing button is never one stray click from the
 * pointer (spec 3.1). On a terminal or dispute stage it isn't held back:
 * there the destructive action is either already disabled (nothing to
 * mis-click) or it IS the stage's exit — a disputed quote's only live action
 * is Repeal, and Rule 1 taken literally left it as two dead inline buttons
 * beside an unlabelled kebab (DW-12).
 *
 * Rule 2, stage-aware. On the normal stage a disabled action keeps its slot
 * rather than yielding it to a lower-priority one: a button must not move as a
 * document progresses, or the dispatcher's muscle memory works against them.
 *
 * On a terminal or dispute stage that rule inverts. The document has stopped
 * progressing, so there is no muscle memory left to protect — and taken
 * literally it buried the one thing those stages exist to offer. A rejected
 * quote showed Issue / Email / Approve, all three dead, with Create Revision
 * hidden behind the menu, which is exactly the "workflow lives in the overflow"
 * defect this bar was built to end. Live actions take the visible slots; the
 * fixed order still decides within each group.
 */
export function splitActions(stage: LifecycleStage, actions: LifecycleAction[]): SplitActions {
	const candidates =
		stage === "normal"
			? actions.filter((a) => a.intent !== "destructive")
			: actions;
	const ordered =
		stage === "normal"
			? candidates
			: [
					...candidates.filter((a) => !a.disabled),
					...candidates.filter((a) => a.disabled),
				];
	const inline = ordered.slice(0, PRIMARY_SLOTS);
	// Identity comparison, not id: inline holds the very objects filter/slice
	// took out of actions, so this is the exact complement.
	return { inline, overflow: actions.filter((a) => !inline.includes(a)) };
}
