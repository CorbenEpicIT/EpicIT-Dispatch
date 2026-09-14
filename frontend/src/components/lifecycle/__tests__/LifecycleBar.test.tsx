import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LifecycleBar from "../LifecycleBar";
import { splitActions } from "../overflow";
import type { LifecycleAction } from "../types";

const action = (over: Partial<LifecycleAction> = {}): LifecycleAction => ({
	id: "approve",
	label: "Approve",
	intent: "primary",
	disabled: false,
	onSelect: vi.fn(),
	...over,
});

describe("LifecycleBar", () => {
	it("shows the path with the current step marked", () => {
		render(
			<LifecycleBar
				kind="quote"
				stage="normal"
				currentStatus="Sent"
				actions={[action()]}
			/>
		);

		expect(screen.getByText("Draft")).toBeTruthy();
		expect(screen.getByText("Approved")).toBeTruthy();
		expect(screen.getByLabelText("Current status: Sent")).toBeTruthy();
	});

	/**
	 * The subject here is the disabled-with-reason contract, not placement, so
	 * the fixture is deliberately NOT destructive: a destructive action lives
	 * in the closed popover by rule (see the test below), which would make this
	 * assertion unsatisfiable at the same time as that one.
	 */
	it("renders a disabled action with its reason as the title", () => {
		render(
			<LifecycleBar
				kind="quote"
				stage="normal"
				currentStatus="Approved"
				actions={[
					action({
						id: "reject",
						label: "Reject",
						intent: "neutral",
						disabled: true,
						disabledReason:
							"A job already exists for this quote.",
					}),
				]}
			/>
		);

		const button = screen.getByRole("button", { name: "Reject" });
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(button.getAttribute("title")).toBe("A job already exists for this quote.");
	});

	/**
	 * A document-killing button must never be one stray click from the
	 * pointer, and a disabled action keeps its slot so positions do not shift
	 * as state changes.
	 */
	it("keeps destructive actions out of the primary row", () => {
		const withdraw = action({
			id: "withdraw",
			label: "Withdraw",
			intent: "destructive",
		});
		const actions = [action({ id: "approve", label: "Approve" }), withdraw];

		render(
			<LifecycleBar
				kind="quote"
				stage="normal"
				currentStatus="Sent"
				actions={actions}
			/>
		);

		expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
		// The bar has no menu of its own any more — two unlabeled overflow
		// buttons an inch apart was the defect. Withdraw is not dropped, it is
		// handed to the header kebab's Lifecycle group, and splitActions is
		// where that placement is asserted (see overflow.test.ts).
		expect(splitActions("normal", actions).overflow).toContain(withdraw);
	});

	/**
	 * Found in the browser on a Rejected quote: the bar showed Issue / Email /
	 * Approve, all three dead, while Create Revision — the only live action and
	 * the whole reason the terminal stage exists — sat behind "More actions".
	 * The normal stage's keep-your-slot rule is about muscle memory as a
	 * document progresses; a document that has stopped progressing has none to
	 * protect, and burying its escape is the overflow-menu defect this bar
	 * exists to end.
	 */
	it("promotes the live action into view on a terminal stage", () => {
		render(
			<LifecycleBar
				kind="quote"
				stage="terminal"
				currentStatus="Rejected"
				actions={[
					action({
						id: "issue",
						label: "Mark as Issued",
						disabled: true,
					}),
					action({
						id: "send",
						label: "Email to Client",
						disabled: true,
					}),
					action({
						id: "approve",
						label: "Mark as Approved",
						disabled: true,
					}),
					action({
						id: "revise",
						label: "Create Revision",
						intent: "neutral",
					}),
				]}
				detail={<span>Rejected</span>}
			/>
		);

		expect(screen.getByRole("button", { name: "Create Revision" })).toBeTruthy();
	});

	// The normal stage keeps the strict positional rule, so a button does not
	// move under the pointer as the document advances.
	it("keeps a disabled action in its slot on the normal stage", () => {
		render(
			<LifecycleBar
				kind="quote"
				stage="normal"
				currentStatus="Draft"
				actions={[
					action({
						id: "issue",
						label: "Mark as Issued",
						disabled: true,
					}),
					action({
						id: "send",
						label: "Email to Client",
						disabled: true,
					}),
					action({
						id: "approve",
						label: "Mark as Approved",
						disabled: true,
					}),
					action({
						id: "revise",
						label: "Create Revision",
						intent: "neutral",
					}),
				]}
			/>
		);

		expect(screen.queryByRole("button", { name: "Create Revision" })).toBeNull();
		expect(screen.getByRole("button", { name: "Mark as Issued" })).toBeTruthy();
	});

	it("replaces the stepper with the detail slot on a dispute stage", () => {
		render(
			<LifecycleBar
				kind="invoice"
				stage="dispute"
				currentStatus="Disputed"
				actions={[action({ id: "adjust", label: "Issue Adjustment" })]}
				detail={<span>labor double-quoted</span>}
			/>
		);

		expect(screen.getByText("labor double-quoted")).toBeTruthy();
		expect(screen.queryByText("Draft")).toBeNull();
	});
});
