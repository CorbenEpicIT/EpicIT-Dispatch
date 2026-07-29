import { useState } from "react";
import type { ZodError } from "zod";
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Trash2, X } from "lucide-react";
import FullPopup from "../ui/FullPopup";
import {
	CreateSequenceSchema,
	DelayUnitValues,
	DelayUnitLabels,
	EmailTemplateCategoryValues,
	EmailTemplateCategoryLabels,
	FollowupTriggerTypeValues,
	FollowupTriggerTypeLabels,
	FollowupStepConditionValues,
	FollowupStepConditionLabels,
	type FollowupSequence,
	type FollowupTriggerType,
	type FollowupStepCondition,
	type EmailTemplateCategory,
	type DelayUnit,
	type CreateSequenceInput,
	type FollowupStep,
} from "../../types/followups";
import { LABEL, INPUT, TEXTAREA, Toggle } from "./shared";

interface StepDraft {
	key: string;
	category: EmailTemplateCategory;
	delay_amount: number;
	delay_unit: DelayUnit;
	condition: FollowupStepCondition;
}

let stepKeyCounter = 0;
const nextStepKey = () => `step-${++stepKeyCounter}-${Date.now()}`;

function stepFromInput(input: FollowupStep): StepDraft {
	return {
		key: nextStepKey(),
		category: input.category,
		delay_amount: input.delay_amount,
		delay_unit: input.delay_unit,
		condition: input.condition,
	};
}

interface SequenceFormModalProps {
	isModalOpen: boolean;
	onClose: () => void;
	mode: "create" | "edit";
	initial?: FollowupSequence;
	isPending: boolean;
	onSubmit: (data: CreateSequenceInput) => Promise<void>;
}

export default function SequenceFormModal({
	isModalOpen,
	onClose,
	mode,
	initial,
	isPending,
	onSubmit,
}: SequenceFormModalProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [triggerType, setTriggerType] = useState<FollowupTriggerType>(
		initial?.trigger_type ?? "manual"
	);
	const [stopOnOpen, setStopOnOpen] = useState(initial?.stop_on_open ?? true);
	const [isActive, setIsActive] = useState(initial?.is_active ?? true);
	const [steps, setSteps] = useState<StepDraft[]>(
		() => initial?.steps.map(stepFromInput) ?? []
	);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const isReminder = triggerType === "visit_scheduled";

	const addStep = () => {
		setSteps((prev) => [
			...prev,
			{
				key: nextStepKey(),
				category: "followup",
				delay_amount: prev.length === 0 ? 0 : 1,
				delay_unit: "days",
				condition: isReminder ? "always" : "if_previous_not_opened",
			},
		]);
	};

	const removeStep = (key: string) => {
		setSteps((prev) => prev.filter((s) => s.key !== key));
	};

	const moveStep = (index: number, direction: -1 | 1) => {
		setSteps((prev) => {
			const next = [...prev];
			const target = index + direction;
			if (target < 0 || target >= next.length) return prev;
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
	};

	const updateStep = (key: string, patch: Partial<StepDraft>) => {
		setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	};

	const stepIssue = (index: number, field: string) =>
		errors?.issues.find(
			(e) => e.path[0] === "steps" && e.path[1] === index && e.path[2] === field
		);

	const topLevelIssues = (field: string) => errors?.issues.filter((e) => e.path[0] === field) ?? [];
	const stepsListIssue = errors?.issues.find((e) => e.path.length === 1 && e.path[0] === "steps");

	const handleSubmit = async () => {
		const data: CreateSequenceInput = {
			name: name.trim(),
			description: description.trim() || null,
			trigger_type: triggerType,
			stop_on_open: stopOnOpen,
			is_active: isActive,
			steps: steps.map((s, i) => ({
				category: s.category,
				step_order: i + 1,
				delay_amount: s.delay_amount,
				delay_unit: s.delay_unit,
				condition: s.condition,
			})),
		};

		const parsed = CreateSequenceSchema.safeParse(data);
		if (!parsed.success) {
			setErrors(parsed.error);
			return;
		}

		setErrors(null);
		setSubmitError(null);
		try {
			await onSubmit(data);
		} catch (e) {
			setSubmitError(e instanceof Error ? e.message : "Failed to save sequence.");
		}
	};

	const content = (
		<div className="flex flex-col">
			<div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
				<h2 className="text-lg sm:text-xl font-bold text-text-primary whitespace-nowrap">
					{mode === "create" ? "New Sequence" : "Edit Sequence"}
				</h2>
				<button
					onClick={onClose}
					className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface rounded transition-colors"
					disabled={isPending}
				>
					<X size={18} />
				</button>
			</div>

			<div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-4 space-y-4 overflow-y-auto">
				<div>
					<label className={LABEL}>Name *</label>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={INPUT}
						placeholder="e.g. Quote follow-up (3 step)"
						disabled={isPending}
					/>
					{topLevelIssues("name").map((err) => (
						<p className="mt-1 text-xs text-error-text" key={err.message}>
							{err.message}
						</p>
					))}
				</div>

				<div>
					<label className={LABEL}>Description</label>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className={TEXTAREA}
						rows={2}
						placeholder="Optional note describing this sequence"
						disabled={isPending}
					/>
				</div>

				<div>
					<label className={LABEL}>Trigger</label>
					<select
						value={triggerType}
						onChange={(e) => setTriggerType(e.target.value as FollowupTriggerType)}
						className={INPUT}
						disabled={isPending}
					>
						{FollowupTriggerTypeValues.map((t) => (
							<option key={t} value={t}>
								{FollowupTriggerTypeLabels[t]}
							</option>
						))}
					</select>
				</div>

				{isReminder && (
					<div className="flex items-start gap-2 rounded-md border border-primary-border bg-primary-bg-subtle px-3 py-2.5">
						<Info size={14} className="mt-0.5 flex-shrink-0 text-primary-text" />
						<p className="text-xs text-primary-text">
							Reminder sequences send <span className="font-medium">before</span> the
							visit. They typically want <span className="font-medium">Stop on open</span>{" "}
							turned off and steps set to the <span className="font-medium">Always</span>{" "}
							condition, so every reminder goes out regardless of whether the last one was
							opened.
						</p>
					</div>
				)}

				<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
					<Toggle
						checked={stopOnOpen}
						onChange={() => setStopOnOpen((v) => !v)}
						label="Stop on open"
						description="Halt the sequence once a recipient opens an email"
					/>
					<Toggle checked={isActive} onChange={() => setIsActive((v) => !v)} label="Active" />
				</div>

				{/* Steps builder */}
				<div>
					<div className="mb-1.5 flex items-center justify-between">
						<label className={LABEL}>Steps *</label>
						<button
							type="button"
							onClick={addStep}
							disabled={isPending}
							className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised"
						>
							<Plus size={12} />
							Add Step
						</button>
					</div>

					{stepsListIssue && (
						<p className="mb-2 text-xs text-error-text">{stepsListIssue.message}</p>
					)}

					{steps.length === 0 ? (
						<p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
							No steps yet. Add a step to send an email as part of this sequence.
						</p>
					) : (
						<div className="space-y-2">
							{steps.map((step, index) => {
								const categoryErr = stepIssue(index, "category");
								const delayErr = stepIssue(index, "delay_amount");
								return (
									<div
										key={step.key}
										className="rounded-md border border-border-subtle bg-surface p-2.5"
									>
										<div className="mb-2 flex items-center justify-between">
											<span className="text-xs font-semibold text-text-tertiary">
												Step {index + 1}
											</span>
											<div className="flex items-center gap-1">
												<button
													type="button"
													title="Move up"
													onClick={() => moveStep(index, -1)}
													disabled={index === 0 || isPending}
													className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
												>
													<ArrowUp size={12} />
												</button>
												<button
													type="button"
													title="Move down"
													onClick={() => moveStep(index, 1)}
													disabled={index === steps.length - 1 || isPending}
													className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
												>
													<ArrowDown size={12} />
												</button>
												<button
													type="button"
													title="Remove step"
													onClick={() => removeStep(step.key)}
													disabled={isPending}
													className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-error-bg hover:text-error-text"
												>
													<Trash2 size={12} />
												</button>
											</div>
										</div>

										<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_100px_170px]">
											<div>
												<select
													value={step.category}
													onChange={(e) =>
														updateStep(step.key, {
															category: e.target
																.value as EmailTemplateCategory,
														})
													}
													className={INPUT}
													disabled={isPending}
													title="Postmark template alias sent for this step"
												>
													{EmailTemplateCategoryValues.map((c) => (
														<option key={c} value={c}>
															{EmailTemplateCategoryLabels[c]}
														</option>
													))}
												</select>
												{categoryErr && (
													<p className="mt-1 text-xs text-error-text">
														{categoryErr.message}
													</p>
												)}
											</div>
											<div>
												<input
													type="number"
													min={0}
													value={step.delay_amount}
													onChange={(e) =>
														updateStep(step.key, {
															delay_amount: Number(e.target.value),
														})
													}
													className={INPUT}
													disabled={isPending}
												/>
												{delayErr && (
													<p className="mt-1 text-xs text-error-text">
														{delayErr.message}
													</p>
												)}
											</div>
											<div>
												<select
													value={step.delay_unit}
													onChange={(e) =>
														updateStep(step.key, {
															delay_unit: e.target.value as DelayUnit,
														})
													}
													className={INPUT}
													disabled={isPending}
												>
													{DelayUnitValues.map((u) => (
														<option key={u} value={u}>
															{DelayUnitLabels[u]}
														</option>
													))}
												</select>
											</div>
											<div>
												<select
													value={step.condition}
													onChange={(e) =>
														updateStep(step.key, {
															condition: e.target
																.value as FollowupStepCondition,
														})
													}
													className={INPUT}
													disabled={isPending}
												>
													{FollowupStepConditionValues.map((c) => (
														<option key={c} value={c}>
															{FollowupStepConditionLabels[c]}
														</option>
													))}
												</select>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-base flex-shrink-0">
				{submitError ? <p className="text-xs text-error-text">{submitError}</p> : <span />}
				<div className="flex items-center gap-2">
					<button
						onClick={onClose}
						disabled={isPending}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-transparent text-sm font-medium text-text-tertiary hover:text-text-primary hover:bg-surface hover:border-border-strong transition-colors whitespace-nowrap"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={isPending}
						className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-confirm hover:bg-confirm-hover text-sm font-semibold text-on-primary transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isPending && <Loader2 size={12} className="animate-spin" />}
						{mode === "create" ? "Create Sequence" : "Save Changes"}
					</button>
				</div>
			</div>
		</div>
	);

	return <FullPopup content={content} isModalOpen={isModalOpen} onClose={onClose} size="lg" />;
}
