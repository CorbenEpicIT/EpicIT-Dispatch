import { INVOICE_STEPS, QUOTE_STEPS } from "./lifecycleSteps";
import { splitActions } from "./overflow";
import type { LifecycleAction, LifecycleKind, LifecycleStage } from "./types";

const INTENT_CLASSES: Record<LifecycleAction["intent"], string> = {
	primary: "bg-primary-hover hover:enabled:bg-primary text-on-primary",
	neutral: "bg-surface hover:enabled:bg-surface-raised border border-border text-text-secondary",
	warning: "bg-surface hover:enabled:bg-surface-raised border border-warning-border text-warning-text",
	destructive:
		"bg-surface hover:enabled:bg-surface-raised border border-border text-error-text",
};

interface LifecycleBarProps {
	kind: LifecycleKind;
	stage: LifecycleStage;
	currentStatus: string;
	/**
	 * The full action list. The bar renders only the inline share of it; the
	 * rest belongs to the page header's kebab, which calls the same
	 * splitActions() to learn what that share is.
	 */
	actions: LifecycleAction[];
	/** Dispute and terminal stages render their own content here, in place of the stepper. */
	detail?: React.ReactNode;
}

function ActionButton({ action }: { action: LifecycleAction }) {
	return (
		<button
			onClick={action.onSelect}
			disabled={action.disabled}
			title={action.disabledReason}
			className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed ${INTENT_CLASSES[action.intent]}`}
		>
			{action.label}
		</button>
	);
}

/**
 * The one surface carrying a document's lifecycle. Present in every state so
 * that opening a dispute and resolving one occupy the same real estate — entry
 * used to be a row in the overflow menu while the exit was a banner, which is
 * why neither read as part of a workflow.
 *
 * It deliberately has NO menu of its own. It used to, and the result was two
 * unlabeled icon buttons an inch apart — the bar's and the header's — with
 * different payloads and no way to tell which held what. Spec 3.4's split
 * (lifecycle here, utility in the kebab) now survives as two labeled groups
 * inside the header's single menu; see DocumentDetailHeader.
 *
 * Purely presentational: every gating decision arrives already made, in the
 * actions array, from quoteActions.ts or invoiceActions.ts.
 */
export default function LifecycleBar({
	kind,
	stage,
	currentStatus,
	actions,
	detail,
}: LifecycleBarProps) {
	const { inline } = splitActions(stage, actions);

	const steps = kind === "quote" ? QUOTE_STEPS : INVOICE_STEPS;
	const currentIndex = steps.indexOf(currentStatus as never);

	const toneClass =
		stage === "dispute"
			? "border-warning-border bg-warning-bg"
			: "border-border-subtle bg-surface/50";

	return (
		<div
			className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 ${toneClass}`}
		>
			<div className="min-w-0 flex-1">
				{stage === "normal" ? (
					<ol className="flex flex-wrap items-center gap-1 text-sm">
						{steps.map((step, index) => {
							const isCurrent = step === currentStatus;
							const isDone =
								currentIndex >= 0 &&
								index < currentIndex;
							return (
								<li
									key={step}
									aria-label={
										isCurrent
											? `Current status: ${step}`
											: undefined
									}
									aria-current={
										isCurrent
											? "step"
											: undefined
									}
									className="flex items-center gap-1"
								>
									<span
										className={
											isCurrent
												? "font-semibold text-text-primary"
												: isDone
													? "text-text-tertiary"
													: "text-text-muted"
										}
									>
										{step}
									</span>
									{index <
										steps.length -
											1 && (
										<span
											aria-hidden="true"
											className="text-text-muted"
										>
											&mdash;
										</span>
									)}
								</li>
							);
						})}
					</ol>
				) : (
					detail
				)}
			</div>

			<div className="flex flex-shrink-0 items-center gap-2">
				{inline.map((action) => (
					<ActionButton key={action.id} action={action} />
				))}
			</div>
		</div>
	);
}
