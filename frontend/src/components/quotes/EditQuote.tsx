import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import {
	UpdateQuoteSchema,
	type Quote,
	type UpdateQuoteInput,
	type UpdateQuoteLineItemInput,
} from "../../types/quotes";
import { type EditableLineItem, type Priority, PriorityValues } from "../../types/common";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import DatePicker from "../ui/DatePicker";
import { UndoButton, UndoButtonTop } from "../ui/forms/UndoButton";
import {
	useUpdateQuoteMutation,
	useAddLineItemMutation,
	useUpdateLineItemMutation,
	useDeleteLineItemMutation,
} from "../../hooks/useQuotes";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";
import { useDirtyTracking } from "../../hooks/forms/useDirtyTracking";

type Step = 1 | 2 | 3;

interface EditQuoteProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	quote: Quote;
}

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Line Items" },
	{ id: 3 as Step, label: "Finalize" },
];

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v}>
				{v.charAt(0).toUpperCase() + v.slice(1)}
			</option>
		))}
	</>
);

const EditQuote = ({ isModalOpen, setIsModalOpen, quote }: EditQuoteProps) => {
	const updateQuote = useUpdateQuoteMutation();
	const addLineItem = useAddLineItemMutation();
	const updateLineItem = useUpdateLineItemMutation();
	const deleteLineItem = useDeleteLineItemMutation();

	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	type FormFields = {
		title: string;
		description: string;
		priority: Priority;
	};

	const { fields, updateField, undoField, setOriginals, isDirty, getValue } =
		useDirtyTracking<FormFields>({
			title: "",
			description: "",
			priority: "Medium",
		});

	// Shared hooks
	const {
		lineItems,
		activeLineItems,
		addLineItem: addLineItemToState,
		removeLineItem: removeLineItemFromState,
		updateLineItem: updateLineItemInState,
		subtotal,
		setLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
	} = useLineItems({
		minItems: 1,
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
		initialTaxRate: quote.tax_rate ? Number(quote.tax_rate) * 100 : 0,
		initialDiscountType: quote.discount_type || "amount",
		initialDiscountValue: quote.discount_value ? Number(quote.discount_value) : 0,
	});

	const [validUntilDate, setValidUntilDate] = useState<Date | null>(null);
	const [expiresAtDate, setExpiresAtDate] = useState<Date | null>(null);

	const validateStep1 = useCallback((): boolean => {
		return !!(
			getValue("title").trim() &&
			getValue("description").trim() &&
			geoData?.address
		);
	}, [getValue, geoData]);

	const validateStep2 = useCallback((): boolean => {
		return activeLineItems.every(
			(item) => item.name.trim() && item.quantity > 0 && item.unit_price >= 0
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
					return true;
				default:
					return true;
			}
		},
		[validateStep1, validateStep2]
	);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({
		totalSteps: 3 as Step,
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

	useEffect(() => {
		if (isModalOpen && quote) {
			resetWizard();

			// Set originals for dirty tracking
			const initialOriginals: FormFields = {
				title: quote.title ?? "",
				description: quote.description ?? "",
				priority: quote.priority,
			};

			setOriginals(initialOriginals);

			// Initialize line items
			const initialLineItems: EditableLineItem[] =
				quote.line_items?.map((item) => ({
					id: crypto.randomUUID(),
					entity_line_item_id: item.id,
					name: item.name,
					description: item.description || "",
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					item_type: item.item_type || "",
					total: Number(item.total),
					isNew: false,
					isDeleted: false,
				})) || [];

			setLineItems(initialLineItems);

			const vud = quote.valid_until ? new Date(quote.valid_until) : null;
			const exd = quote.expires_at ? new Date(quote.expires_at) : null;
			setValidUntilDate(vud);
			setExpiresAtDate(exd);

			if (quote.address) {
				setGeoData({
					address: quote.address,
					coords: quote.coords || undefined,
				} as GeocodeResult);
			} else {
				setGeoData(undefined);
			}

			setErrors(null);
		}
	}, [isModalOpen, quote, resetWizard, setLineItems, setOriginals]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({
			address: result.address,
			coords: result.coords,
		});
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
	};

	const invokeUpdate = async () => {
		if (isLoading) return;

		const updates: UpdateQuoteInput = {
			title: getValue("title") !== quote.title ? getValue("title") : undefined,
			description:
				getValue("description") !== quote.description
					? getValue("description")
					: undefined,
			address: geoData?.address !== quote.address ? geoData?.address : undefined,
			coords: geoData?.coords !== quote.coords ? geoData?.coords : undefined,
			priority: getValue("priority") as Priority,
			subtotal,
			tax_rate: taxRate / 100,
			tax_amount: taxAmount,
			discount_type: discountType,
			discount_value: discountValue,
			discount_amount: discountAmount,
			total,
			valid_until: validUntilDate ? validUntilDate.toISOString() : null,
			expires_at: expiresAtDate ? expiresAtDate.toISOString() : null,
		};

		const parseResult = UpdateQuoteSchema.safeParse(updates);
		if (!parseResult.success) {
			setErrors(parseResult.error);
			console.error("Validation errors:", parseResult.error);
			return;
		}

		setIsLoading(true);

		try {
			await updateQuote.mutateAsync({
				id: quote.id,
				data: updates,
			});

			// Process line item changes
			for (const item of lineItems) {
				const editableItem = item as EditableLineItem;

				if (editableItem.isDeleted && editableItem.entity_line_item_id) {
					await deleteLineItem.mutateAsync({
						quoteId: quote.id,
						lineItemId: editableItem.entity_line_item_id,
					});
				} else if (editableItem.isNew) {
					await addLineItem.mutateAsync({
						quoteId: quote.id,
						data: {
							name: item.name,
							description: item.description || undefined,
							quantity: Number(item.quantity),
							unit_price: Number(item.unit_price),
							total: item.total,
							item_type: item.item_type || undefined,
						},
					});
				} else if (editableItem.entity_line_item_id) {
					const updateData: UpdateQuoteLineItemInput = {
						name: item.name,
						description: item.description || undefined,
						quantity: Number(item.quantity),
						unit_price: Number(item.unit_price),
						total: item.total,
						item_type: item.item_type || undefined,
					};

					await updateLineItem.mutateAsync({
						quoteId: quote.id,
						lineItemId: editableItem.entity_line_item_id,
						data: updateData,
					});
				}
			}

			setIsLoading(false);
			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to update quote:", error);
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
						{/* Title */}
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Title *
							</label>
							<div className="relative">
								<input
									type="text"
									placeholder="Quote Title"
									value={getValue("title")}
									onChange={(e) =>
										updateField(
											"title",
											e.target
												.value
										)
									}
									className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
									disabled={isLoading}
								/>
								<UndoButton
									show={isDirty("title")}
									onUndo={() =>
										undoField("title")
									}
									disabled={isLoading}
								/>
							</div>
							<ErrorDisplay path="title" />
						</div>

						{/* Client and Priority Row */}
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block mb-1 text-sm text-zinc-300">
									Client
								</label>
								<div className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-800/50 text-zinc-400">
									{quote.client?.name ||
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

						{/* Description */}
						<div>
							<label className="block mb-1 text-sm text-zinc-300">
								Description *
							</label>
							<div className="relative">
								<textarea
									placeholder="Quote Description"
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

						{/* Address */}
						<div className="relative z-10">
							<label className="block mb-1 text-sm text-zinc-300">
								Address *
							</label>
							<AddressForm
								mode="edit"
								originalValue={quote.address || ""}
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
					<div className="space-y-3">
						<ErrorDisplay path="line_items" />
						<LineItemsSection
							lineItems={activeLineItems}
							isLoading={isLoading}
							onAdd={addLineItemToState}
							onRemove={removeLineItemFromState}
							onUpdate={updateLineItemInState}
							subtotal={subtotal}
							required
							minItems={1}
							dirtyFields={dirtyLineItemFields}
							onUndo={undoLineItemField}
							onClear={clearLineItemField}
						/>
					</div>
				);

			case 3:
				return (
					<div className="space-y-3">
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
							totalLabel="Total"
							isTaxDirty={isTaxDirty}
							isDiscountDirty={isDiscountDirty}
							onTaxUndo={undoTax}
							onDiscountUndo={undoDiscount}
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<p className="mb-1 text-sm text-zinc-300">
									Valid Until (Optional)
								</p>
								<DatePicker
									mode="edit"
									originalValue={
										quote.valid_until
											? new Date(
													quote.valid_until
												)
											: null
									}
									value={validUntilDate}
									onChange={setValidUntilDate}
									align="left"
									position="above"
								/>
							</div>

							<div>
								<p className="mb-1 text-sm text-zinc-300">
									Expires At (Optional)
								</p>
								<DatePicker
									mode="edit"
									originalValue={
										quote.expires_at
											? new Date(
													quote.expires_at
												)
											: null
									}
									value={expiresAtDate}
									onChange={setExpiresAtDate}
									align="right"
									position="above"
								/>
							</div>
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
		errors,
		quote,
		geoData,
		activeLineItems,
		addLineItemToState,
		removeLineItemFromState,
		updateLineItemInState,
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
		validUntilDate,
		expiresAtDate,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	]);

	return (
		<FormWizardContainer<Step>
			title="Edit Quote"
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

export default EditQuote;
