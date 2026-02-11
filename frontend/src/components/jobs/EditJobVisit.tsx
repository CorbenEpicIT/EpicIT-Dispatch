import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import TimeConstraints, { type TimeConstraintsState } from "../ui/forms/TimeConstraints";
import DatePicker from "../ui/DatePicker";
import { UndoButton, UndoButtonTop } from "../ui/forms/UndoButton";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useDirtyTracking } from "../../hooks/forms/useDirtyTracking";
import { createStepRouter } from "../../hooks/forms/useZodStepRouting";
import {
	useUpdateJobVisitMutation,
	useAssignTechniciansToVisitMutation,
} from "../../hooks/useJobs";
import { useAllTechniciansQuery } from "../../hooks/useTechnicians";

import {
	CreateJobVisitSchema,
	type CreateJobVisitInput,
	type JobVisit,
	type UpdateJobVisitInput,
} from "../../types/jobs";
import type { LineItemType, EditableLineItem } from "../../types/common";

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

interface EditJobVisitProps {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
	visit: JobVisit;
	jobId: string;
}

const formatTimeString = (date: Date | null): string | null => {
	if (!date) return null;
	return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

const parseHHMMToDate = (hhmm: string | null | undefined, baseDate: Date): Date | null => {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	const d = new Date(baseDate);
	d.setHours(h, m, 0, 0);
	return d;
};

export default function EditJobVisit({ isModalOpen, setIsModalOpen, visit }: EditJobVisitProps) {
	const updateVisit = useUpdateJobVisitMutation();
	const assignTechs = useAssignTechniciansToVisitMutation();
	const { data: technicians } = useAllTechniciansQuery();

	const isLoading = updateVisit.isPending || assignTechs.isPending;

	type FormFields = {
		name: string;
		description: string;
		startDate: Date;
	};

	const { fields, updateField, undoField, setOriginals, isDirty, getValue } =
		useDirtyTracking<FormFields>({
			name: "",
			description: "",
			startDate: new Date(),
		});

	const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
	const [errors, setErrors] = useState<ZodError | null>(null);

	const [timeConstraintsState, setTimeConstraintsState] =
		useState<TimeConstraintsState | null>(null);

	// Shared hooks
	const lineItems = useLineItems({
		minItems: 1,
		mode: "edit",
	});

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({
		totalSteps: 4 as Step,
		initialStep: 1 as Step,
	});

	const validateStep1 = useCallback((): boolean => {
		return !!(getValue("name").trim() && getValue("startDate"));
	}, [getValue]);

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
		const namedItems = lineItems.activeLineItems.filter((li) => li.name.trim() !== "");
		if (namedItems.length === 0) return true;
		return namedItems.every(
			(li) => Number(li.quantity) > 0 && Number(li.unit_price) >= 0
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

	const canGoNext = useMemo(() => validateStep(currentStep), [validateStep, currentStep]);

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

	// Destructure lineItems methods to avoid dependency issues
	const { setLineItems } = lineItems;

	useEffect(() => {
		if (isModalOpen && visit) {
			resetWizard();

			const visitStart = new Date(visit.scheduled_start_at);
			const base = new Date(visitStart);
			const fallbackStart = new Date(base);
			fallbackStart.setHours(9, 0, 0, 0);
			const fallbackEnd = new Date(base);
			fallbackEnd.setHours(17, 0, 0, 0);

			// Set originals for dirty tracking
			const initialOriginals: FormFields = {
				name: visit.name ?? "",
				description: visit.description ?? "",
				startDate: new Date(visit.scheduled_start_at),
			};

			setOriginals(initialOriginals);

			const initialLineItems: EditableLineItem[] =
				visit.line_items?.map((item) => ({
					id: crypto.randomUUID(),
					entity_line_item_id: item.id,
					name: item.name,
					description: item.description || "",
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					item_type: (item.item_type || "") as LineItemType | "",
					total: Number(item.total),
					isNew: false,
					isDeleted: false,
				})) || [];

			setLineItems(initialLineItems);

			setTimeConstraintsState({
				arrivalConstraint: visit.arrival_constraint || "anytime",
				finishConstraint: visit.finish_constraint || "when_done",
				arrivalTime:
					parseHHMMToDate(visit.arrival_time, base) ?? fallbackStart,
				arrivalWindowStart:
					parseHHMMToDate(visit.arrival_window_start, base) ??
					fallbackStart,
				arrivalWindowEnd:
					parseHHMMToDate(visit.arrival_window_end, base) ??
					fallbackEnd,
				finishTime: parseHHMMToDate(visit.finish_time, base) ?? fallbackEnd,
			});

			setSelectedTechIds(visit.visit_techs.map((vt) => vt.tech_id));
			setErrors(null);
		}
	}, [isModalOpen, visit, resetWizard, setOriginals, setLineItems]);

	const handleTechSelection = useCallback((techId: string) => {
		setSelectedTechIds((prev) =>
			prev.includes(techId)
				? prev.filter((id) => id !== techId)
				: [...prev, techId]
		);
	}, []);

	const handleNext = useCallback(() => {
		if (canGoNext) {
			goNext();
		}
	}, [canGoNext, goNext]);

	const handleGoToStep = useCallback(
		(step: Step) => {
			if (canGoToStep(step)) {
				goToStep(step);
			}
		},
		[canGoToStep, goToStep]
	);

	const buildScheduledDates = useCallback(() => {
		let combinedStartDate = new Date(getValue("startDate"));
		let combinedEndDate = new Date(getValue("startDate"));

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

		return { combinedStartDate, combinedEndDate };
	}, [getValue, timeConstraintsState]);

	const invokeSave = useCallback(async () => {
		if (isLoading) return;

		const { combinedStartDate, combinedEndDate } = buildScheduledDates();

		const preparedLineItems = lineItems.activeLineItems
			.filter((li) => li.name.trim() !== "")
			.map((item, index) => ({
				name: item.name.trim(),
				description: item.description || undefined,
				quantity: Number(item.quantity),
				unit_price: Number(item.unit_price),
				item_type: (item.item_type || undefined) as
					| LineItemType
					| undefined,
				sort_order: index,
				total: item.total,
			}));

		const candidate: CreateJobVisitInput = {
			job_id: visit.job_id,
			name: getValue("name").trim(),
			description: getValue("description").trim() || undefined,
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
			status: visit.status,
			tech_ids: selectedTechIds,
			line_items: preparedLineItems.length ? preparedLineItems : undefined,
		};

		const parsed = CreateJobVisitSchema.safeParse(candidate);
		if (!parsed.success) {
			setErrors(parsed.error);
			console.error("Validation errors:", parsed.error);
			const errorStep = routeErrorToStep(parsed.error);
			if (errorStep) goToStep(errorStep);
			return;
		}

		setErrors(null);

		const updates: UpdateJobVisitInput = {
			name:
				getValue("name").trim() !== (visit.name || "")
					? getValue("name").trim()
					: undefined,
			description:
				getValue("description").trim() !== (visit.description || "")
					? getValue("description").trim()
					: undefined,
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
			line_items: preparedLineItems,
		};

		try {
			await updateVisit.mutateAsync({ id: visit.id, data: updates });

			const originalTechIds = [
				...visit.visit_techs.map((vt) => vt.tech_id),
			].sort();
			const nextTechIds = [...selectedTechIds].sort();
			if (JSON.stringify(originalTechIds) !== JSON.stringify(nextTechIds)) {
				await assignTechs.mutateAsync({
					visitId: visit.id,
					techIds: selectedTechIds,
				});
			}

			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to update visit:", error);
		}
	}, [
		isLoading,
		buildScheduledDates,
		lineItems.activeLineItems,
		getValue,
		timeConstraintsState,
		visit,
		selectedTechIds,
		updateVisit,
		assignTechs,
		setIsModalOpen,
		goToStep,
	]);

	const ErrorDisplay = useCallback(
		({ path }: { path: string }) => {
			if (!errors) return null;
			const fieldErrors = errors.issues.filter((err) => err.path[0] === path);
			if (fieldErrors.length === 0) return null;
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
		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-3">
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Visit Name *
							</label>
							<div className="relative">
								<input
									type="text"
									value={getValue("name")}
									onChange={(e) =>
										updateField(
											"name",
											e.target
												.value
										)
									}
									disabled={isLoading}
									className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
								/>
								<UndoButton
									show={isDirty("name")}
									onUndo={() =>
										undoField("name")
									}
									disabled={isLoading}
								/>
							</div>
							<ErrorDisplay path="name" />
						</div>

						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Description (Optional)
							</label>
							<div className="relative">
								<textarea
									value={getValue(
										"description"
									)}
									onChange={(e) =>
										updateField(
											"description",
											e.target
												.value
										)
									}
									disabled={isLoading}
									className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors pr-10"
								/>
								<UndoButtonTop
									show={isDirty(
										"description"
									)}
									onUndo={() =>
										undoField(
											"description"
										)
									}
									disabled={isLoading}
								/>
							</div>
							<ErrorDisplay path="description" />
						</div>

						<div className="relative z-10">
							<label className="block mb-1 text-sm text-zinc-300">
								Visit Date *
							</label>
							<DatePicker
								mode="edit"
								originalValue={
									fields.startDate
										.originalValue
								}
								value={getValue("startDate")}
								position="above"
								required={true}
								disabled={isLoading}
								onChange={(d) =>
									updateField(
										"startDate",
										d ||
											fields
												.startDate
												.originalValue
									)
								}
							/>
						</div>
					</div>
				);

			case 2:
				return (
					<div className="space-y-3 pt-2">
						<TimeConstraints
							mode="edit"
							initialArrivalConstraint={
								timeConstraintsState?.arrivalConstraint
							}
							initialFinishConstraint={
								timeConstraintsState?.finishConstraint
							}
							initialArrivalTime={
								timeConstraintsState?.arrivalTime ||
								null
							}
							initialArrivalWindowStart={
								timeConstraintsState?.arrivalWindowStart ||
								null
							}
							initialArrivalWindowEnd={
								timeConstraintsState?.arrivalWindowEnd ||
								null
							}
							initialFinishTime={
								timeConstraintsState?.finishTime ||
								null
							}
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
						<p className="text-xs text-zinc-500">
							Only line items with a name are saved.
							Changes in unnamed rows are ignored.
						</p>
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
		currentStep,
		getValue,
		updateField,
		undoField,
		isDirty,
		isLoading,
		fields,
		timeConstraintsState,
		lineItems,
		technicians,
		selectedTechIds,
		handleTechSelection,
		ErrorDisplay,
	]);

	return (
		<FormWizardContainer
			title="Edit Job Visit"
			steps={STEPS}
			currentStep={currentStep}
			visitedSteps={visitedSteps}
			isLoading={isLoading}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			canGoToStep={canGoToStep}
			onStepClick={handleGoToStep}
			onNext={handleNext}
			onBack={goBack}
			onSubmit={invokeSave}
			canGoNext={canGoNext}
			submitLabel="Save Changes"
			isEditMode={true}
		>
			{stepContent}
		</FormWizardContainer>
	);
}
