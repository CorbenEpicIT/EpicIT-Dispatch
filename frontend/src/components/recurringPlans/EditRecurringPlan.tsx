import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import {
	UpdateRecurringPlanSchema,
	type UpdateRecurringPlanInput,
	type RecurringFrequency,
	type Weekday,
	type RecurringPlan,
	type ArrivalConstraint,
	type FinishConstraint,
} from "../../types/recurringPlans";
import {
	type LineItemType,
	type EditableLineItem,
	PriorityValues,
	type Priority,
} from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useUpdateRecurringPlanMutation } from "../../hooks/useRecurringPlans";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";

import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import TimeConstraints, { type TimeConstraintsState } from "../ui/forms/TimeConstraints";
import { BillingConfiguration } from "../ui/forms/BillingConfiguration";
import { ScheduleConfiguration } from "../ui/forms/ScheduleConfiguration";
import { UndoButton, UndoButtonTop } from "../ui/forms/UndoButton";

import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";
import { useDirtyTracking } from "../../hooks/forms/useDirtyTracking";

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Schedule" },
	{ id: 3 as Step, label: "Constraints" },
	{ id: 4 as Step, label: "Line Items" },
	{ id: 5 as Step, label: "Finalize" },
];

interface EditRecurringPlanProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	plan: RecurringPlan;
}

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v}>
				{v.charAt(0).toUpperCase() + v.slice(1)}
			</option>
		))}
	</>
);

const parseHHMMToDate = (hhmm: string | null | undefined): Date | null => {
	if (!hhmm) return null;
	const [h, m] = hhmm.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return null;
	const d = new Date();
	d.setHours(h, m, 0, 0);
	return d;
};

const toNumberOrEmpty = (val: number | null | undefined): number | "" => {
	if (val === null || val === undefined) return "";
	return val;
};

const EditRecurringPlan = ({ isModalOpen, setIsModalOpen, plan }: EditRecurringPlanProps) => {
	const updateMutation = useUpdateRecurringPlanMutation();
	const { data: clients } = useAllClientsQuery();

	const isLoading = updateMutation.isPending;

	type FormFields = {
		name: string;
		description: string;
		priority: Priority;
		startDate: Date;
		endDate: Date | null;
		generationWindow: number;
		minAdvance: number;
		frequency: RecurringFrequency;
		interval: number;
		selectedWeekdays: Weekday[];
		monthDay: number | "";
		month: number | "";
		billingMode: "per_visit" | "subscription" | "none";
		invoiceTiming: "on_completion" | "on_schedule_date" | "manual";
		autoInvoice: boolean;
	};

	const { fields, updateField, undoField, setOriginals, isDirty, getValue } =
		useDirtyTracking<FormFields>({
			name: "",
			description: "",
			priority: "Medium",
			startDate: new Date(),
			endDate: null,
			generationWindow: 30,
			minAdvance: 1,
			frequency: "daily",
			interval: 1,
			selectedWeekdays: [],
			monthDay: "",
			month: "",
			billingMode: "per_visit",
			invoiceTiming: "on_completion",
			autoInvoice: false,
		});

	const [clientId, setClientId] = useState("");
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [timezone] = useState<string>("America/Chicago");

	const [timeConstraintsState, setTimeConstraintsState] =
		useState<TimeConstraintsState | null>(null);

	// Shared hooks
	const {
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		subtotal,
		setLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
	} = useLineItems({
		minItems: 0,
		mode: "edit",
	});

	const {
		taxRate,
		setTaxRate,
		taxAmount,
		discountType,
		setDiscountType,
		discountValue,
		setDiscountValue,
		discountAmount,
		total,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	} = useFinancialCalculations(subtotal, {
		initialTaxRate: 0,
		initialDiscountType: "amount",
		initialDiscountValue: 0,
	});

	const validateStep1 = useCallback((): boolean => {
		return !!(
			getValue("name").trim() &&
			clientId.trim() &&
			getValue("description").trim() &&
			geoData?.address &&
			getValue("priority")
		);
	}, [getValue, clientId, geoData]);

	const validateStep2 = useCallback((): boolean => {
		const frequency = getValue("frequency");
		const selectedWeekdays = getValue("selectedWeekdays");
		const monthDay = getValue("monthDay");
		const month = getValue("month");
		const generationWindow = getValue("generationWindow");
		const minAdvance = getValue("minAdvance");

		// Frequency-specific validation
		if (frequency === "weekly" && selectedWeekdays.length === 0) return false;
		if (frequency === "monthly" && monthDay === "") return false;
		if (frequency === "yearly" && (month === "" || monthDay === "")) return false;

		return generationWindow > 0 && minAdvance >= 0;
	}, [getValue]);

	const validateStep3 = useCallback((): boolean => {
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

	const validateStep4 = useCallback((): boolean => {
		const meaningfulItems = activeLineItems.filter((item) => {
			const hasAnyText =
				item.name.trim() !== "" || (item.description?.trim() ?? "") !== "";
			const hasAnyNumbers = Number(item.unit_price) > 0;
			const hasType = (item.item_type?.trim?.() ?? "") !== "";
			return hasAnyText || hasAnyNumbers || hasType;
		});

		if (meaningfulItems.length === 0) return true;

		return meaningfulItems.every(
			(item) =>
				item.name.trim() &&
				Number(item.quantity) > 0 &&
				Number(item.unit_price) >= 0
		);
	}, [activeLineItems]);

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
					return validateStep4();
				case 5:
					return true;
				default:
					return true;
			}
		},
		[validateStep1, validateStep2, validateStep3, validateStep4]
	);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({
		totalSteps: 5 as Step,
		initialStep: 1 as Step,
	});

	const canGoNext = validateStep(currentStep);

	const canGoToStep = useCallback(
		(targetStep: Step): boolean => {
			if (targetStep <= currentStep) return true;

			for (let step = 1; step < targetStep; step++) {
				if (!validateStep(step as Step)) {
					return false;
				}
			}
			return true;
		},
		[currentStep, validateStep]
	);
	// Type-safe wrappers for ScheduleConfiguration (string -> keyof FormFields)
	const isDirtyString = useCallback(
		(field: string): boolean => {
			return isDirty(field as keyof FormFields);
		},
		[isDirty]
	);

	const undoFieldString = useCallback(
		(field: string): void => {
			undoField(field as keyof FormFields);
		},
		[undoField]
	);

	// Initialize form data when modal opens
	useEffect(() => {
		if (isModalOpen && plan) {
			resetWizard();

			const ruleData =
				plan.rules && plan.rules.length > 0
					? plan.rules[0]
					: {
							frequency: "daily" as RecurringFrequency,
							interval: 1,
							by_weekday: [],
							by_month_day: null,
							by_month: null,
						};

			const initialOriginals: FormFields = {
				name: plan.name ?? "",
				description: plan.description ?? "",
				priority: plan.priority as Priority,
				startDate: new Date(plan.starts_at),
				endDate: plan.ends_at ? new Date(plan.ends_at) : null,
				generationWindow: plan.generation_window_days || 30,
				minAdvance: plan.min_advance_days || 1,
				frequency: (ruleData.frequency as RecurringFrequency) || "daily",
				interval: ruleData.interval || 1,
				selectedWeekdays:
					(ruleData.by_weekday?.map(
						(wd) => wd.weekday
					) as Weekday[]) || [],
				monthDay: toNumberOrEmpty(ruleData.by_month_day),
				month: toNumberOrEmpty(ruleData.by_month),
				billingMode: plan.billing_mode,
				invoiceTiming: plan.invoice_timing,
				autoInvoice: plan.auto_invoice || false,
			};

			setOriginals(initialOriginals);
			setClientId(plan.client_id);

			if (plan.address) {
				setGeoData({
					address: plan.address,
					coords: plan.coords || undefined,
				} as GeocodeResult);
			} else {
				setGeoData(undefined);
			}

			const initialLineItems: EditableLineItem[] =
				plan.line_items?.map((item) => ({
					id: crypto.randomUUID(),
					entity_line_item_id: item.id,
					name: item.name,
					description: item.description || "",
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					item_type: (item.item_type || "") as LineItemType | "",
					total: Number(item.quantity) * Number(item.unit_price),
					isNew: false,
					isDeleted: false,
				})) || [];

			setLineItems(initialLineItems);

			if (plan.rules && plan.rules.length > 0) {
				const rule = plan.rules[0];
				setTimeConstraintsState({
					arrivalConstraint: (rule.arrival_constraint ||
						"anytime") as ArrivalConstraint,
					finishConstraint: (rule.finish_constraint ||
						"when_done") as FinishConstraint,
					arrivalTime: parseHHMMToDate(rule.arrival_time),
					arrivalWindowStart: parseHHMMToDate(
						rule.arrival_window_start
					),
					arrivalWindowEnd: parseHHMMToDate(rule.arrival_window_end),
					finishTime: parseHHMMToDate(rule.finish_time),
				});
			} else {
				setTimeConstraintsState({
					arrivalConstraint: "anytime",
					finishConstraint: "when_done",
					arrivalTime: null,
					arrivalWindowStart: null,
					arrivalWindowEnd: null,
					finishTime: null,
				});
			}

			setErrors(null);
		}
	}, [isModalOpen, plan, resetWizard, setLineItems, setOriginals]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
	};

	const toggleWeekday = useCallback(
		(weekday: Weekday) => {
			const current = getValue("selectedWeekdays");
			const newWeekdays = current.includes(weekday)
				? current.filter((d) => d !== weekday)
				: [...current, weekday];
			updateField("selectedWeekdays", newWeekdays);
		},
		[getValue, updateField]
	);

	const formatTimeString = (date: Date | null): string | null => {
		if (!date) return null;
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	const clientDropdownEntries = useMemo(() => {
		if (clients && clients.length) {
			return clients.map((c) => (
				<option value={c.id} key={c.id}>
					{c.name}
				</option>
			));
		}
		return (
			<option disabled value="">
				No clients found
			</option>
		);
	}, [clients]);

	const invokeUpdate = async () => {
		if (isLoading) return;

		const validLineItems = activeLineItems.filter(
			(item) => item.name.trim() !== "" && item.quantity > 0
		);

		const preparedLineItems = validLineItems.map((item, index) => ({
			name: item.name,
			description: item.description || undefined,
			quantity: Number(item.quantity),
			unit_price: Number(item.unit_price),
			item_type: (item.item_type || undefined) as LineItemType | undefined,
			sort_order: index,
		}));

		const preparedRule = {
			frequency: getValue("frequency"),
			interval: Number(getValue("interval")),
			by_weekday:
				getValue("selectedWeekdays").length > 0
					? getValue("selectedWeekdays")
					: undefined,
			by_month_day:
				getValue("monthDay") !== ""
					? Number(getValue("monthDay"))
					: undefined,
			by_month: getValue("month") !== "" ? Number(getValue("month")) : undefined,
			arrival_constraint: timeConstraintsState?.arrivalConstraint || "anytime",
			finish_constraint: timeConstraintsState?.finishConstraint || "when_done",
			arrival_time:
				timeConstraintsState?.arrivalConstraint === "at"
					? formatTimeString(timeConstraintsState?.arrivalTime)
					: null,
			arrival_window_start:
				timeConstraintsState?.arrivalConstraint === "between"
					? formatTimeString(timeConstraintsState?.arrivalWindowStart)
					: null,
			arrival_window_end:
				timeConstraintsState?.arrivalConstraint === "between" ||
				timeConstraintsState?.arrivalConstraint === "by"
					? formatTimeString(timeConstraintsState?.arrivalWindowEnd)
					: null,
			finish_time:
				timeConstraintsState?.finishConstraint === "at" ||
				timeConstraintsState?.finishConstraint === "by"
					? formatTimeString(timeConstraintsState?.finishTime)
					: null,
		};

		const updatedRecurringPlan: UpdateRecurringPlanInput = {
			name: getValue("name").trim(),
			address: geoData?.address || "",
			coords: geoData?.coords,
			description: getValue("description").trim(),
			priority: getValue("priority"),
			starts_at: getValue("startDate").toISOString(),
			ends_at: getValue("endDate")
				? getValue("endDate")!.toISOString()
				: undefined,
			timezone: timezone,
			generation_window_days: Number(getValue("generationWindow")),
			min_advance_days: Number(getValue("minAdvance")),
			billing_mode: getValue("billingMode"),
			invoice_timing: getValue("invoiceTiming"),
			auto_invoice: getValue("autoInvoice"),
			rule: preparedRule,
			line_items: preparedLineItems,
		};

		const parseResult = UpdateRecurringPlanSchema.safeParse(updatedRecurringPlan);

		if (!parseResult.success) {
			setErrors(parseResult.error);
			console.error("Validation errors:", parseResult.error);

			const errorPaths = parseResult.error.issues.map((i) => i.path[0]);
			if (
				errorPaths.some((p) =>
					[
						"name",
						"client_id",
						"description",
						"address",
						"coords",
						"priority",
					].includes(String(p))
				)
			) {
				goToStep(1 as Step);
			} else if (
				errorPaths.some((p) =>
					[
						"starts_at",
						"ends_at",
						"generation_window_days",
						"min_advance_days",
					].includes(String(p))
				) ||
				errorPaths.includes("rule")
			) {
				goToStep(2 as Step);
			} else if (
				errorPaths.some((p) =>
					[
						"arrival_constraint",
						"finish_constraint",
						"arrival_time",
						"arrival_window_start",
						"arrival_window_end",
						"finish_time",
					].includes(String(p))
				)
			) {
				goToStep(3 as Step);
			} else if (errorPaths.includes("line_items")) {
				goToStep(4 as Step);
			} else if (
				errorPaths.some((p) =>
					["billing_mode", "invoice_timing", "auto_invoice"].includes(
						String(p)
					)
				)
			) {
				goToStep(5 as Step);
			}
			return;
		}

		setErrors(null);

		try {
			await updateMutation.mutateAsync({
				jobId: plan.job_container?.id || plan.id,
				updates: updatedRecurringPlan,
			});

			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to update recurring plan:", error);
		}
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
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
	};

	const stepContent = useMemo(() => {
		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-3">
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Plan Name *
							</label>
							<div className="relative">
								<input
									type="text"
									placeholder="Plan Name"
									value={getValue("name")}
									onChange={(e) =>
										updateField(
											"name",
											e.target
												.value
										)
									}
									className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
									disabled={isLoading}
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

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block mb-1 text-sm text-zinc-300">
									Client
								</label>
								<div className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-800/50 text-zinc-400">
									{plan.client?.name ||
										clients?.find(
											(c) =>
												c.id ===
												clientId
										)?.name ||
										"Unknown Client"}
								</div>
								<p className="text-xs text-zinc-500 mt-1">
									Client assignment cannot be
									changed
								</p>
							</div>

							<div>
								<label className="block mb-1 text-sm text-zinc-300">
									Priority
								</label>
								<div className="relative">
									<Dropdown
										entries={
											PRIORITY_ENTRIES
										}
										value={getValue(
											"priority"
										)}
										onChange={(
											newValue
										) =>
											updateField(
												"priority",
												newValue as Priority
											)
										}
										disabled={isLoading}
										error={errors?.issues.some(
											(e) =>
												e
													.path[0] ===
												"priority"
										)}
									/>
									<UndoButton
										show={isDirty(
											"priority"
										)}
										onUndo={() =>
											undoField(
												"priority"
											)
										}
										position="right-9"
										disabled={isLoading}
									/>
								</div>
								<ErrorDisplay path="priority" />
							</div>
						</div>

						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Description *
							</label>
							<div className="relative">
								<textarea
									placeholder="Plan Description"
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
									className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors pr-10"
									disabled={isLoading}
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
								Address *
							</label>
							<AddressForm
								mode={geoData ? "edit" : "create"}
								originalValue={
									geoData?.address || ""
								}
								originalCoords={geoData?.coords}
								dropdownPosition="above"
								handleChange={handleChangeAddress}
								handleClear={handleClearAddress}
							/>
							<ErrorDisplay path="address" />
							<ErrorDisplay path="coords" />
						</div>
					</div>
				);

			case 2:
				return (
					<ScheduleConfiguration
						mode="edit"
						startDate={getValue("startDate")}
						endDate={getValue("endDate")}
						generationWindow={getValue("generationWindow")}
						minAdvance={getValue("minAdvance")}
						frequency={getValue("frequency")}
						interval={getValue("interval")}
						selectedWeekdays={getValue("selectedWeekdays")}
						monthDay={getValue("monthDay")}
						month={getValue("month")}
						originalStartDate={fields.startDate.originalValue}
						originalEndDate={fields.endDate.originalValue}
						onStartDateChange={(date) =>
							updateField("startDate", date || new Date())
						}
						onEndDateChange={(date) =>
							updateField("endDate", date)
						}
						onGenerationWindowChange={(val) =>
							updateField("generationWindow", val)
						}
						onMinAdvanceChange={(val) =>
							updateField("minAdvance", val)
						}
						onFrequencyChange={(val) =>
							updateField("frequency", val)
						}
						onIntervalChange={(val) =>
							updateField("interval", val)
						}
						onToggleWeekday={toggleWeekday}
						onMonthDayChange={(val) =>
							updateField("monthDay", val)
						}
						onMonthChange={(val) => updateField("month", val)}
						isDirty={isDirtyString}
						onUndo={undoFieldString}
						isLoading={isLoading}
						errors={errors}
					/>
				);

			case 3:
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
					</div>
				);

			case 4:
				return (
					<div className="space-y-3">
						<ErrorDisplay path="line_items" />
						<LineItemsSection
							lineItems={activeLineItems}
							isLoading={isLoading}
							onAdd={addLineItem}
							onRemove={removeLineItem}
							onUpdate={updateLineItem}
							subtotal={subtotal}
							required={false}
							minItems={0}
							dirtyFields={dirtyLineItemFields}
							onUndo={undoLineItemField}
							onClear={clearLineItemField}
						/>
					</div>
				);

			case 5:
				return (
					<div className="space-y-3 mt-2">
						<FinancialSummary
							subtotal={subtotal}
							taxRate={taxRate}
							taxAmount={taxAmount}
							discountType={discountType}
							discountValue={discountValue}
							discountAmount={discountAmount}
							total={total}
							isLoading={isLoading}
							onTaxRateChange={setTaxRate}
							onDiscountTypeChange={setDiscountType}
							onDiscountValueChange={setDiscountValue}
							totalLabel="Estimated Total"
							isTaxDirty={isTaxDirty}
							isDiscountDirty={isDiscountDirty}
							onTaxUndo={undoTax}
							onDiscountUndo={undoDiscount}
						/>

						<BillingConfiguration
							mode="edit"
							billingMode={getValue("billingMode")}
							invoiceTiming={getValue("invoiceTiming")}
							autoInvoice={getValue("autoInvoice")}
							onBillingModeChange={(val) =>
								updateField("billingMode", val)
							}
							onInvoiceTimingChange={(val) =>
								updateField("invoiceTiming", val)
							}
							onAutoInvoiceChange={(val) =>
								updateField("autoInvoice", val)
							}
							isDirty={isDirty}
							onUndo={undoField}
							isLoading={isLoading}
							errors={errors}
						/>
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
		isDirtyString,
		undoFieldString,
		isLoading,
		errors,
		plan,
		clients,
		clientId,
		geoData,
		fields,
		toggleWeekday,
		timeConstraintsState,
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		subtotal,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
		taxRate,
		taxAmount,
		discountType,
		discountValue,
		discountAmount,
		total,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	]);

	return (
		<FormWizardContainer<Step>
			title="Edit Recurring Plan"
			steps={STEPS}
			currentStep={currentStep}
			visitedSteps={visitedSteps}
			isLoading={isLoading}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			canGoToStep={canGoToStep}
			onStepClick={goToStep}
			onNext={goNext}
			onBack={goBack}
			onSubmit={invokeUpdate}
			canGoNext={canGoNext}
			submitLabel="Save Changes"
			isEditMode={true}
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default EditRecurringPlan;
