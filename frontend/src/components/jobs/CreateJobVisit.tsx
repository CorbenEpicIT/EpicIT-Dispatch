import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import { CreateJobVisitSchema, type CreateJobVisitInput, type JobVisit } from "../../types/jobs";
import { type LineItemType } from "../../types/common";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";
import DatePicker from "../ui/DatePicker";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import LineItemsSection from "../ui/forms/LineItemsSection";
import { useLineItems } from "../../hooks/forms/useLineItems";
import TimeConstraints, { type TimeConstraintsState } from "../ui/forms/TimeConstraints";
import { createStepRouter } from "../../hooks/forms/useZodStepRouting";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
	{ id: 1 as Step, label: "Details" },
	{ id: 2 as Step, label: "Constraints" },
	{ id: 3 as Step, label: "Line Items" },
	{ id: 4 as Step, label: "Technicians" },
];

const routeErrorToStep = createStepRouter<Step>({
	1: ["name", "description"],
	2: [
		"arrival_constraint",
		"finish_constraint",
		"arrival_time",
		"arrival_window_start",
		"arrival_window_end",
		"finish_time",
	],
	3: ["line_items"],
	4: ["tech_ids"],
});

interface CreateJobVisitProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	jobId: string;
	createVisit: (input: CreateJobVisitInput) => Promise<JobVisit>;
	preselectedTechId?: string;
	onSuccess?: (visit: JobVisit) => void;
}

const CreateJobVisit = ({
	isModalOpen,
	setIsModalOpen,
	jobId,
	createVisit,
	preselectedTechId,
	onSuccess,
}: CreateJobVisitProps) => {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [startDate, setStartDate] = useState<Date>(new Date());
	const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	const { data: technicians } = useAllTechniciansQuery();

	const [timeConstraintsState, setTimeConstraintsState] =
		useState<TimeConstraintsState | null>(null);

	const lineItems = useLineItems({ minItems: 1, mode: "create" });
	const wizard = useStepWizard<Step>({
		totalSteps: 4 as Step,
		initialStep: 1 as Step,
	});

	const validateStep1 = useCallback((): boolean => {
		return !!(name.trim() && startDate);
	}, [name, startDate]);

	const validateStep2 = useCallback((): boolean => {
		if (!timeConstraintsState) return true;

		const arrivalOk =
			timeConstraintsState.arrivalConstraint === "anytime" ||
			(timeConstraintsState.arrivalConstraint === "at" &&
				!!timeConstraintsState.arrivalTime) ||
			(timeConstraintsState.arrivalConstraint === "between" &&
				!!timeConstraintsState.arrivalWindowStart &&
				!!timeConstraintsState.arrivalWindowEnd) ||
			(timeConstraintsState.arrivalConstraint === "by" &&
				!!timeConstraintsState.arrivalWindowEnd);

		const finishOk =
			timeConstraintsState.finishConstraint === "when_done" ||
			((timeConstraintsState.finishConstraint === "at" ||
				timeConstraintsState.finishConstraint === "by") &&
				!!timeConstraintsState.finishTime);

		const windowOrderOk =
			timeConstraintsState.arrivalConstraint !== "between" ||
			!timeConstraintsState.arrivalWindowStart ||
			!timeConstraintsState.arrivalWindowEnd ||
			timeConstraintsState.arrivalWindowEnd.getTime() >
				timeConstraintsState.arrivalWindowStart.getTime();

		return arrivalOk && finishOk && windowOrderOk;
	}, [timeConstraintsState]);

	const validateStep3 = useCallback((): boolean => {
		const meaningfulItems = lineItems.activeLineItems.filter((item) => {
			const hasAnyText = item.name.trim() || item.description?.trim();
			const hasAnyNumbers = item.unit_price > 0;
			const hasType = item.item_type?.trim();
			return hasAnyText || hasAnyNumbers || hasType;
		});
		if (meaningfulItems.length === 0) return true;
		return meaningfulItems.every(
			(item) => item.name.trim() && item.quantity > 0 && item.unit_price >= 0
		);
	}, [lineItems.activeLineItems]);

	const validateStep = useCallback(
		(step: Step): boolean => {
			switch (step) {
				case 1:
					return validateStep1();
				case 2:
					return validateStep2();
				case 3:
					return validateStep3();
				case 4:
					return true;
				default:
					return true;
			}
		},
		[validateStep1, validateStep2, validateStep3]
	);

	const canGoNext = useMemo(
		() => validateStep(wizard.currentStep),
		[validateStep, wizard.currentStep]
	);

	const canGoToStep = useCallback(
		(targetStep: Step): boolean => {
			if (targetStep === 1) return true;
			for (let step = 1; step < targetStep; step++) {
				if (!validateStep(step as Step)) return false;
			}
			return true;
		},
		[validateStep]
	);

	const formatTimeString = useCallback((date: Date | null): string | null => {
		if (!date) return null;
		return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
	}, []);

	const handleTechSelection = useCallback((techId: string) => {
		setSelectedTechIds((prev) =>
			prev.includes(techId)
				? prev.filter((id) => id !== techId)
				: [...prev, techId]
		);
	}, []);

	useEffect(() => {
		if (!isModalOpen) {
			setName("");
			setDescription("");
			setStartDate(new Date());
			setSelectedTechIds([]);
			setTimeConstraintsState(null);
			setErrors(null);
			wizard.reset();
			lineItems.resetLineItems();
			setIsLoading(false);
		}
	}, [isModalOpen]);

	useEffect(() => {
		if (isModalOpen && preselectedTechId) {
			setSelectedTechIds([preselectedTechId]);
		}
	}, [isModalOpen, preselectedTechId]);

	const handleNext = useCallback(() => {
		if (canGoNext) {
			wizard.goNext();
		}
	}, [canGoNext, wizard]);

	const handleGoToStep = useCallback(
		(step: Step) => {
			if (canGoToStep(step)) {
				wizard.goToStep(step);
			}
		},
		[canGoToStep, wizard]
	);

	const invokeCreate = useCallback(async () => {
		if (isLoading) return;

		let combinedStartDate = new Date(startDate);
		let combinedEndDate = new Date(startDate);

		if (
			timeConstraintsState?.arrivalConstraint === "at" &&
			timeConstraintsState.arrivalTime
		) {
			combinedStartDate.setHours(
				timeConstraintsState.arrivalTime.getHours(),
				timeConstraintsState.arrivalTime.getMinutes(),
				0,
				0
			);
		} else if (
			timeConstraintsState?.arrivalConstraint === "between" &&
			timeConstraintsState.arrivalWindowStart
		) {
			combinedStartDate.setHours(
				timeConstraintsState.arrivalWindowStart.getHours(),
				timeConstraintsState.arrivalWindowStart.getMinutes(),
				0,
				0
			);
		} else if (
			timeConstraintsState?.arrivalConstraint === "by" &&
			timeConstraintsState.arrivalWindowEnd
		) {
			const deadlineMinutes =
				timeConstraintsState.arrivalWindowEnd.getHours() * 60 +
				timeConstraintsState.arrivalWindowEnd.getMinutes();
			const startMinutes = Math.max(0, deadlineMinutes - 240);
			combinedStartDate.setHours(
				Math.floor(startMinutes / 60),
				startMinutes % 60,
				0,
				0
			);
		} else {
			combinedStartDate.setHours(9, 0, 0, 0);
		}

		if (
			(timeConstraintsState?.finishConstraint === "at" ||
				timeConstraintsState?.finishConstraint === "by") &&
			timeConstraintsState.finishTime
		) {
			combinedEndDate.setHours(
				timeConstraintsState.finishTime.getHours(),
				timeConstraintsState.finishTime.getMinutes(),
				0,
				0
			);
		} else {
			combinedEndDate = new Date(
				combinedStartDate.getTime() + 2 * 60 * 60 * 1000
			);
		}

		const preparedLineItems = lineItems.activeLineItems
			.filter((li) => li.name.trim())
			.map((item, index) => ({
				name: item.name.trim(),
				description: item.description?.trim() || undefined,
				quantity: Number(item.quantity) || 1,
				unit_price: Number(item.unit_price) || 0,
				item_type: (item.item_type || undefined) as
					| LineItemType
					| undefined,
				sort_order: index,
			}));

		const newVisit: CreateJobVisitInput = {
			job_id: jobId,
			name: name.trim(),
			description: description.trim() || undefined,
			scheduled_start_at: combinedStartDate.toISOString(),
			scheduled_end_at: combinedEndDate.toISOString(),
			arrival_constraint: timeConstraintsState?.arrivalConstraint || "anytime",
			finish_constraint: timeConstraintsState?.finishConstraint || "when_done",
			arrival_time:
				timeConstraintsState?.arrivalConstraint === "at"
					? formatTimeString(timeConstraintsState.arrivalTime)
					: null,
			arrival_window_start:
				timeConstraintsState?.arrivalConstraint === "between"
					? formatTimeString(timeConstraintsState.arrivalWindowStart)
					: null,
			arrival_window_end:
				timeConstraintsState?.arrivalConstraint === "between" ||
				timeConstraintsState?.arrivalConstraint === "by"
					? formatTimeString(timeConstraintsState.arrivalWindowEnd)
					: null,
			finish_time:
				timeConstraintsState?.finishConstraint === "at" ||
				timeConstraintsState?.finishConstraint === "by"
					? formatTimeString(timeConstraintsState.finishTime)
					: null,
			status: "Scheduled",
			tech_ids: selectedTechIds,
			line_items: preparedLineItems.length ? preparedLineItems : undefined,
		};

		const parseResult = CreateJobVisitSchema.safeParse(newVisit);
		if (!parseResult.success) {
			setErrors(parseResult.error);
			const errorStep = routeErrorToStep(parseResult.error);
			if (errorStep) wizard.goToStep(errorStep);
			return;
		}

		setErrors(null);
		setIsLoading(true);

		try {
			const created = await createVisit(newVisit);
			onSuccess?.(created) ?? setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to create visit:", error);
		} finally {
			setIsLoading(false);
		}
	}, [
		isLoading,
		startDate,
		timeConstraintsState,
		lineItems.activeLineItems,
		name,
		description,
		jobId,
		selectedTechIds,
		formatTimeString,
		createVisit,
		onSuccess,
		setIsModalOpen,
		wizard,
	]);

	const ErrorDisplay = useCallback(
		({ path }: { path: string }) => {
			if (!errors) return null;
			const fieldErrors = errors.issues.filter((err) => err.path[0] === path);
			if (!fieldErrors.length) return null;
			return (
				<div className="mt-1 space-y-1">
					{fieldErrors.map((err, idx) => (
						<p key={idx} className="text-red-300 text-sm">
							{err.message}
						</p>
					))}
				</div>
			);
		},
		[errors]
	);

	const stepContent = useMemo(() => {
		switch (wizard.currentStep) {
			case 1:
				return (
					<div className="space-y-3">
						{preselectedTechId && (
							<div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-md">
								<p className="text-sm text-blue-300">
									Creating visit with
									pre-selected technician
								</p>
							</div>
						)}
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Visit Name *
							</label>
							<input
								type="text"
								placeholder="e.g., Initial Assessment, Follow-up Visit"
								value={name}
								onChange={(e) =>
									setName(e.target.value)
								}
								disabled={isLoading}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
							/>
							<ErrorDisplay path="name" />
						</div>
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Description (Optional)
							</label>
							<textarea
								placeholder="Describe what will be done during this visit..."
								value={description}
								onChange={(e) =>
									setDescription(
										e.target.value
									)
								}
								disabled={isLoading}
								className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors"
							/>
							<ErrorDisplay path="description" />
						</div>
						<div className="relative z-10">
							<label className="block mb-1 text-sm text-zinc-300">
								Visit Date *
							</label>
							<DatePicker
								value={startDate}
								onChange={(d) =>
									setStartDate(
										d || new Date()
									)
								}
								position="above"
							/>
						</div>
					</div>
				);

			case 2:
				return (
					<div className="space-y-3 pt-2">
						<TimeConstraints
							mode="create"
							onStateChange={setTimeConstraintsState}
							isLoading={isLoading}
						/>
						<ErrorDisplay path="arrival_constraint" />
						<ErrorDisplay path="arrival_time" />
						<ErrorDisplay path="arrival_window_start" />
						<ErrorDisplay path="arrival_window_end" />
						<ErrorDisplay path="finish_constraint" />
						<ErrorDisplay path="finish_time" />
					</div>
				);

			case 3:
				return (
					<div className="space-y-3">
						<ErrorDisplay path="line_items" />
						<LineItemsSection
							lineItems={lineItems.activeLineItems}
							isLoading={isLoading}
							onAdd={lineItems.addLineItem}
							onRemove={lineItems.removeLineItem}
							onUpdate={lineItems.updateLineItem}
							subtotal={lineItems.subtotal}
							required={false}
							minItems={0}
							dirtyFields={lineItems.dirtyLineItemFields}
							onUndo={lineItems.undoLineItemField}
							onClear={lineItems.clearLineItemField}
						/>
					</div>
				);

			case 4:
				return (
					<div className="space-y-3">
						<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
							<h3 className="text-lg font-semibold mb-4">
								Assign Technicians
							</h3>
							<div className="border border-zinc-700 rounded-md p-3 max-h-56 overflow-y-auto bg-zinc-900">
								{technicians?.length ? (
									<div className="space-y-2">
										{technicians.map(
											(tech) => (
												<label
													key={
														tech.id
													}
													className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800 p-2 rounded transition-colors"
												>
													<input
														type="checkbox"
														checked={selectedTechIds.includes(
															tech.id
														)}
														onChange={() =>
															handleTechSelection(
																tech.id
															)
														}
														disabled={
															isLoading
														}
														className="w-4 h-4 accent-blue-600"
													/>
													<span className="text-white text-sm flex-1">
														{
															tech.name
														}{" "}
														-{" "}
														{
															tech.title
														}
													</span>
													<span
														className={`text-xs px-2 py-0.5 rounded ${
															tech.status ===
															"Available"
																? "bg-green-500/20 text-green-400"
																: tech.status ===
																	  "Busy"
																	? "bg-red-500/20 text-red-400"
																	: "bg-zinc-500/20 text-zinc-400"
														}`}
													>
														{
															tech.status
														}
													</span>
												</label>
											)
										)}
									</div>
								) : (
									<p className="text-zinc-400 text-sm">
										No technicians
										available
									</p>
								)}
							</div>
							{selectedTechIds.length > 0 && (
								<p className="text-sm text-zinc-400 mt-2">
									{selectedTechIds.length}{" "}
									technician
									{selectedTechIds.length > 1
										? "s"
										: ""}{" "}
									selected
								</p>
							)}
						</div>
					</div>
				);

			default:
				return null;
		}
	}, [
		wizard.currentStep,
		preselectedTechId,
		name,
		description,
		startDate,
		isLoading,
		timeConstraintsState,
		lineItems,
		technicians,
		selectedTechIds,
		handleTechSelection,
		ErrorDisplay,
	]);

	return (
		<FormWizardContainer
			title="Create Job Visit"
			steps={STEPS}
			currentStep={wizard.currentStep}
			visitedSteps={wizard.visitedSteps}
			isLoading={isLoading}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			canGoToStep={canGoToStep}
			onStepClick={handleGoToStep}
			onNext={handleNext}
			onBack={wizard.goBack}
			onSubmit={invokeCreate}
			canGoNext={canGoNext}
			submitLabel="Create Visit"
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateJobVisit;
