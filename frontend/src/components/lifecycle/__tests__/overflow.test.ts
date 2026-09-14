import { describe, it, expect, vi } from "vitest";
import { PRIMARY_SLOTS, splitActions } from "../overflow";
import type { LifecycleAction } from "../types";

const action = (over: Partial<LifecycleAction> = {}): LifecycleAction => ({
	id: "approve",
	label: "Approve",
	intent: "primary",
	disabled: false,
	onSelect: vi.fn(),
	...over,
});

/**
 * These are the placement rules LifecycleBar used to hold in its own body. They
 * moved here when the bar lost its overflow menu to the header's single kebab,
 * so this is where they are guarded now — the rules did not change, only their
 * address.
 */
describe("splitActions", () => {
	it("puts destructive actions in the overflow whatever their position", () => {
		const kill = action({ id: "void", label: "Void", intent: "destructive" });
		const { inline, overflow } = splitActions("normal", [
			kill,
			action({ id: "send", label: "Email to Client" }),
		]);

		expect(inline).not.toContain(kill);
		expect(overflow).toContain(kill);
	});

	it("shows at most PRIMARY_SLOTS actions inline", () => {
		const actions = ["a", "b", "c", "d", "e"].map((id) => action({ id, label: id }));
		const { inline, overflow } = splitActions("normal", actions);

		expect(inline).toHaveLength(PRIMARY_SLOTS);
		expect(overflow).toHaveLength(actions.length - PRIMARY_SLOTS);
	});

	// Muscle memory: a button must not move as a document progresses.
	it("keeps a disabled action in its slot on the normal stage", () => {
		const revise = action({ id: "revise", label: "Create Revision" });
		const { inline, overflow } = splitActions("normal", [
			action({ id: "issue", disabled: true }),
			action({ id: "send", disabled: true }),
			action({ id: "approve", disabled: true }),
			revise,
		]);

		expect(inline.map((a) => a.id)).toEqual(["issue", "send", "approve"]);
		expect(overflow).toContain(revise);
	});

	// A document that has stopped progressing has no muscle memory to protect,
	// and the literal rule buried the one live action those stages exist for.
	it.each(["terminal", "dispute"] as const)(
		"promotes enabled actions on the %s stage",
		(stage) => {
			const revise = action({ id: "revise", label: "Create Revision" });
			const { inline } = splitActions(stage, [
				action({ id: "issue", disabled: true }),
				action({ id: "send", disabled: true }),
				action({ id: "approve", disabled: true }),
				revise,
			]);

			expect(inline[0]).toBe(revise);
		}
	);

	// DW-12: Rule 1 held destructive actions back on every stage, so a disputed
	// quote whose only live action is Repeal showed two dead inline buttons and
	// hid its one exit in the kebab.
	it("keeps an enabled destructive action inline on the dispute stage", () => {
		const repeal = action({ id: "Repeal", label: "Repeal", intent: "destructive" });
		const { inline } = splitActions("dispute", [
			action({ id: "ReviseAndResend", disabled: true }),
			action({ id: "IssueAdjustment", disabled: true }),
			repeal,
		]);

		expect(inline).toContain(repeal);
	});

	it("still holds a destructive action back on the normal stage", () => {
		const kill = action({ id: "void", intent: "destructive" });
		const { inline, overflow } = splitActions("normal", [
			kill,
			action({ id: "send", label: "Email to Client" }),
		]);

		expect(inline).not.toContain(kill);
		expect(overflow).toContain(kill);
	});

	it("returns inline and overflow as an exact partition", () => {
		const actions = [
			action({ id: "a" }),
			action({ id: "b", intent: "destructive" }),
			action({ id: "c" }),
			action({ id: "d" }),
			action({ id: "e" }),
		];
		const { inline, overflow } = splitActions("normal", actions);

		expect([...inline, ...overflow]).toHaveLength(actions.length);
		expect(new Set([...inline, ...overflow]).size).toBe(actions.length);
	});
});
