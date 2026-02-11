import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ZodError } from "zod";
import {
	CreateRecurringPlanSchema,
	type CreateRecurringPlanInput,
	type RecurringFrequency,
	type Weekday,
} from "../../types/recurringPlans";
import { type LineItemType, PriorityValues, type Priority } from "../../types/common";

import { useAllClientsQuery } from "../../hooks/useClients";
import { useCreateRecurringPlanMutation } from "../../hooks/useRecurringPlans";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";

import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import TimeConstraints, { type TimeConstraintsState } from "../ui/forms/TimeConstraints";
import { BillingConfiguration } from "../ui/forms/BillingConfiguration";
import { ScheduleConfiguration } from "../ui/forms/ScheduleConfiguration";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Schedule" },
	{ id: 3 as Step, label: "Constraints" },
	{ id: 4 as Step, label: "Line Items" },
	{ id: 5 as Step, label: "Finalize" },
];

interface CreateRecurringPlanProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v} className="text-black">
				{v}
			</option>
		))}
	</>
);

const CreateRecurringPlan = ({ isModalOpen, setIsModalOpen }: CreateRecurringPlanProps) => {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState("");
	const [priority, setPriority] = useState<Priority>("Medium");
	const [geoData, setGeoData] = useState<GeocodeResult>();

	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();
	const createMutation = useCreateRecurringPlanMutation();

	const [scheduleState, setScheduleState] = useState<{
		startDate: Date;
		endDate: Date | null;
		generationWindow: number;
		minAdvance: number;
		frequency: RecurringFrequency;
		interval: number;
		selectedWeekdays: Weekday[];
		monthDay: number | "";
		month: number | "";
	}>({
		startDate: new Date(),
		endDate: null,
		generationWindow: 30,
		minAdvance: 1,
		frequency: "daily",
		interval: 1,
		selectedWeekdays: [],
		monthDay: "",
		month: "",
	});

	const [timeConstraintsState, setTimeConstraintsState] =
		useState<TimeConstraintsState | null>(null);

	const [billingMode, setBillingMode] = useState<"per_visit" | "subscription" | "none">(
		"per_visit"
	);
	const [invoiceTiming, setInvoiceTiming] = useState<
		"on_completion" | "on_schedule_date" | "manual"
	>("on_completion");
	const [autoInvoice, setAutoInvoice] = useState<boolean>(false);
	const [timezone] = useState<string>("America/Chicago");

	const {
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		subtotal,
		resetLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
	} = useLineItems({
		minItems: 0,
		mode: "create",
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
		reset: resetFinancials,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	} = useFinancialCalculations(subtotal);

	const validateStep1 = useCallback((): boolean => {
		return !!(
			name.trim() &&
			clientId.trim() &&
			description.trim() &&
			geoData?.address &&
			priority
		);
	}, [name, clientId, description, geoData, priority]);

	const validateStep2 = useCallback((): boolean => {
		if (!scheduleState) return false;

		// Frequency-specific validation
		if (
			scheduleState.frequency === "weekly" &&
			scheduleState.selectedWeekdays.length === 0
		)
			return false;
		if (scheduleState.frequency === "monthly" && scheduleState.monthDay === "")
			return false;
		if (
			scheduleState.frequency === "yearly" &&
			(scheduleState.month === "" || scheduleState.monthDay === "")
		)
			return false;

		return scheduleState.generationWindow > 0 && scheduleState.minAdvance >= 0;
	}, [scheduleState]);

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

	const isStepValid = useCallback(
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

	const canGoNext = isStepValid(currentStep);

	const canGoToStep = useCallback(
		(step: Step): boolean => {
			if (step === currentStep) return true;
			if (visitedSteps.has(step)) return true;
			if (step === currentStep + 1 && isStepValid(currentStep)) return true;
			return false;
		},
		[currentStep, visitedSteps, isStepValid]
	);

	const resetForm = useCallback(() => {
		resetWizard();
		setName("");
		setDescription("");
		setClientId("");
		setPriority("Medium");
		setGeoData(undefined);
		setScheduleState({
			startDate: new Date(),
			endDate: null,
			generationWindow: 30,
			minAdvance: 1,
			frequency: "daily",
			interval: 1,
			selectedWeekdays: [],
			monthDay: "",
			month: "",
		});
		setTimeConstraintsState(null);
		setBillingMode("per_visit");
		setInvoiceTiming("on_completion");
		setAutoInvoice(false);
		resetLineItems();
		resetFinancials();
		setErrors(null);
	}, [resetWizard, resetLineItems, resetFinancials]);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
	};

	const toggleWeekday = useCallback((weekday: Weekday) => {
		setScheduleState((prev) => {
			const newWeekdays = prev.selectedWeekdays.includes(weekday)
				? prev.selectedWeekdays.filter((d) => d !== weekday)
				: [...prev.selectedWeekdays, weekday];
			return { ...prev, selectedWeekdays: newWeekdays };
		});
	}, []);

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

	const invokeCreate = async () => {
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
			frequency: scheduleState.frequency,
			interval: Number(scheduleState.interval),
			by_weekday:
				scheduleState.selectedWeekdays.length > 0
					? scheduleState.selectedWeekdays
					: undefined,
			by_month_day:
				scheduleState.monthDay !== ""
					? Number(scheduleState.monthDay)
					: undefined,
			by_month:
				scheduleState.month !== ""
					? Number(scheduleState.month)
					: undefined,
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

		const newRecurringPlan: CreateRecurringPlanInput = {
			name: name.trim(),
			client_id: clientId.trim(),
			address: geoData?.address || "",
			coords: geoData?.coords,
			description: description.trim(),
			priority: priority,
			starts_at: scheduleState.startDate.toISOString(),
			ends_at: scheduleState.endDate
				? scheduleState.endDate.toISOString()
				: undefined,
			timezone: timezone,
			generation_window_days: Number(scheduleState.generationWindow),
			min_advance_days: Number(scheduleState.minAdvance),
			billing_mode: billingMode,
			invoice_timing: invoiceTiming,
			auto_invoice: autoInvoice,
			rule: preparedRule,
			line_items: preparedLineItems,
		};

		const parseResult = CreateRecurringPlanSchema.safeParse(newRecurringPlan);

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
		setIsLoading(true);

		try {
			const result = await createMutation.mutateAsync(newRecurringPlan);

			const recurringPlanId = result?.id || result;
			setIsModalOpen(false);
			resetForm();
			navigate(`/dispatch/recurring-plans/${recurringPlanId}`);
		} catch (error) {
			console.error("Failed to create recurring plan:", error);
		} finally {
			setIsLoading(false);
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
							<input
								type="text"
								placeholder="Plan Name"
								value={name}
								onChange={(e) =>
									setName(e.target.value)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
								disabled={isLoading}
							/>
							<ErrorDisplay path="name" />
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block mb-1 text-sm text-zinc-300">
									Client *
								</label>
								<Dropdown
									entries={
										clientDropdownEntries
									}
									value={clientId}
									onChange={(newValue) =>
										setClientId(
											newValue
										)
									}
									placeholder="Select client"
									disabled={isLoading}
									error={errors?.issues.some(
										(e) =>
											e
												.path[0] ===
											"client_id"
									)}
								/>
								<ErrorDisplay path="client_id" />
							</div>

							<div>
								<label className="block mb-1 text-sm text-zinc-300">
									Priority
								</label>
								<Dropdown
									entries={PRIORITY_ENTRIES}
									value={priority}
									onChange={(newValue) =>
										setPriority(
											newValue as Priority
										)
									}
									defaultValue="Medium"
									disabled={isLoading}
									error={errors?.issues.some(
										(e) =>
											e
												.path[0] ===
											"priority"
									)}
								/>
								<ErrorDisplay path="priority" />
							</div>
						</div>

						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Description *
							</label>
							<textarea
								placeholder="Plan Description"
								value={description}
								onChange={(e) =>
									setDescription(
										e.target.value
									)
								}
								className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors"
								disabled={isLoading}
							/>
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
						mode="create"
						startDate={scheduleState.startDate}
						endDate={scheduleState.endDate}
						generationWindow={scheduleState.generationWindow}
						minAdvance={scheduleState.minAdvance}
						frequency={scheduleState.frequency}
						interval={scheduleState.interval}
						selectedWeekdays={scheduleState.selectedWeekdays}
						monthDay={scheduleState.monthDay}
						month={scheduleState.month}
						onStartDateChange={(date) =>
							setScheduleState((prev) => ({
								...prev,
								startDate: date || new Date(),
							}))
						}
						onEndDateChange={(date) =>
							setScheduleState((prev) => ({
								...prev,
								endDate: date,
							}))
						}
						onGenerationWindowChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								generationWindow: val,
							}))
						}
						onMinAdvanceChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								minAdvance: val,
							}))
						}
						onFrequencyChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								frequency: val,
							}))
						}
						onIntervalChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								interval: val,
							}))
						}
						onToggleWeekday={toggleWeekday}
						onMonthDayChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								monthDay: val,
							}))
						}
						onMonthChange={(val) =>
							setScheduleState((prev) => ({
								...prev,
								month: val,
							}))
						}
						isLoading={isLoading}
						errors={errors}
					/>
				);

			case 3:
				return (
					<div className="space-y-3 pt-2">
						<TimeConstraints
							mode="create"
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
							mode="create"
							billingMode={billingMode}
							invoiceTiming={invoiceTiming}
							autoInvoice={autoInvoice}
							onBillingModeChange={setBillingMode}
							onInvoiceTimingChange={setInvoiceTiming}
							onAutoInvoiceChange={setAutoInvoice}
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
		name,
		clientId,
		priority,
		description,
		geoData,
		isLoading,
		clientDropdownEntries,
		errors,
		scheduleState,
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
		billingMode,
		invoiceTiming,
		autoInvoice,
	]);

	return (
		<FormWizardContainer<Step>
			title="Create Recurring Plan"
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
			onSubmit={invokeCreate}
			canGoNext={canGoNext}
			submitLabel="Create Recurring Plan"
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateRecurringPlan;
