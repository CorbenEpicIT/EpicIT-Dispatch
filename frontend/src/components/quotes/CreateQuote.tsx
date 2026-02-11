import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ZodError } from "zod";
import {
	CreateQuoteSchema,
	type CreateQuoteInput,
	type CreateQuoteLineItemInput,
} from "../../types/quotes";
import { useAllClientsQuery } from "../../hooks/useClients";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import DatePicker from "../ui/DatePicker";
import { type Priority, PriorityValues } from "../../types/common";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";

type Step = 1 | 2 | 3;

interface CreateQuoteProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createQuote: (input: CreateQuoteInput) => Promise<string>;
}

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Line Items" },
	{ id: 3 as Step, label: "Finalize" },
];

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v} className="text-black">
				{v.charAt(0).toUpperCase() + v.slice(1)}
			</option>
		))}
	</>
);

const CreateQuote = ({ isModalOpen, setIsModalOpen, createQuote }: CreateQuoteProps) => {
	const navigate = useNavigate();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState("");
	const [priority, setPriority] = useState<Priority>("Medium");
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [validUntilDate, setValidUntilDate] = useState<Date | null>(null);
	const [expiresAtDate, setExpiresAtDate] = useState<Date | null>(null);

	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();

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
		minItems: 1,
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
			title.trim() &&
			clientId.trim() &&
			description.trim() &&
			geoData?.address
		);
	}, [title, clientId, description, geoData]);

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
			if (targetStep === currentStep) return true;
			if (visitedSteps.has(targetStep)) return true;
			if (targetStep === currentStep + 1 && validateStep(currentStep))
				return true;
			return false;
		},
		[currentStep, visitedSteps, validateStep]
	);

	const resetForm = useCallback(() => {
		resetWizard();
		setTitle("");
		setDescription("");
		setClientId("");
		setPriority("Medium");
		setGeoData(undefined);
		setValidUntilDate(null);
		setExpiresAtDate(null);
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
		setGeoData({
			address: result.address,
			coords: result.coords,
		});
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
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

		const preparedLineItems: CreateQuoteLineItemInput[] = activeLineItems.map(
			(item, index) => ({
				name: item.name,
				description: item.description || undefined,
				quantity: Number(item.quantity),
				unit_price: Number(item.unit_price),
				total: item.total,
				item_type: item.item_type || undefined,
				sort_order: index,
			})
		);

		const newQuote: CreateQuoteInput = {
			title: title.trim(),
			client_id: clientId.trim(),
			address: geoData?.address || "",
			coords: geoData?.coords,
			description: description.trim(),
			priority: priority as Priority,
			subtotal,
			tax_rate: taxRate / 100,
			tax_amount: taxAmount,
			discount_type: discountType,
			discount_value: discountValue,
			discount_amount: discountAmount,
			total,
			valid_until: validUntilDate ? validUntilDate.toISOString() : undefined,
			expires_at: expiresAtDate ? expiresAtDate.toISOString() : undefined,
			line_items: preparedLineItems,
		};

		const parseResult = CreateQuoteSchema.safeParse(newQuote);

		if (!parseResult.success) {
			setErrors(parseResult.error);
			console.error("Validation errors:", parseResult.error);
			const errorPaths = parseResult.error.issues.map((i) => i.path[0]);
			if (
				errorPaths.some((p) =>
					[
						"title",
						"client_id",
						"description",
						"address",
						"coords",
						"priority",
					].includes(String(p))
				)
			) {
				goToStep(1 as Step);
			} else if (errorPaths.includes("line_items")) {
				goToStep(2 as Step);
			}
			return;
		}

		setErrors(null);
		setIsLoading(true);

		try {
			const quoteId = await createQuote(newQuote);
			setIsModalOpen(false);
			resetForm();
			navigate(`/dispatch/quotes/${quoteId}`);
		} catch (error) {
			console.error("Failed to create quote:", error);
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
								Title *
							</label>
							<input
								type="text"
								placeholder="Quote Title"
								value={title}
								onChange={(e) =>
									setTitle(e.target.value)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors"
								disabled={isLoading}
							/>
							<ErrorDisplay path="title" />
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
									defaultValue="medium"
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
								placeholder="Quote Description"
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
					<div className="space-y-3">
						<ErrorDisplay path="line_items" />
						<LineItemsSection
							lineItems={activeLineItems}
							isLoading={isLoading}
							onAdd={addLineItem}
							onRemove={removeLineItem}
							onUpdate={updateLineItem}
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
									mode="create"
									value={validUntilDate}
									onChange={setValidUntilDate}
									align="right"
									position="above"
								/>
							</div>

							<div>
								<p className="mb-1 text-sm text-zinc-300">
									Expires At (Optional)
								</p>
								<DatePicker
									mode="create"
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
		title,
		clientId,
		priority,
		description,
		isLoading,
		clientDropdownEntries,
		geoData,
		errors,
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
		validUntilDate,
		expiresAtDate,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	]);

	return (
		<FormWizardContainer<Step>
			title="Create Quote"
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
			submitLabel="Create Quote"
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateQuote;
