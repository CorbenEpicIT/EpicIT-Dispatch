import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ZodError } from "zod";
import {
	CreateQuoteSchema,
	type CreateQuoteInput,
	type CreateQuoteLineItemInput,
} from "../../types/quotes";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useAllQuotesQuery } from "../../hooks/useQuotes";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import DatePicker from "../ui/DatePicker";
import { type Priority, PriorityValues } from "../../types/common";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import {
	TemplateSearch,
	type TemplateSearchResult,
	type TemplateSearchClient,
} from "../ui/forms/TemplateSearch";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";
import { QuoteStatusColors } from "../../types/quotes";

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

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

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

	const [showTemplateSearch, setShowTemplateSearch] = useState(false);

	const { data: clients } = useAllClientsQuery();
	const { data: allQuotes = [] } = useAllQuotesQuery();

	const {
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		seedLineItems,
		subtotal,
		resetLineItems,
		dirtyLineItemFields,
		undoLineItemField,
		clearLineItemField,
	} = useLineItems({ minItems: 1, mode: "create" });

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
		setOriginals: setFinancialOriginals,
	} = useFinancialCalculations(subtotal);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({ totalSteps: 3 as Step, initialStep: 1 as Step });

	const validateStep1 = useCallback(
		() => !!(title.trim() && clientId.trim() && description.trim() && geoData?.address),
		[title, clientId, description, geoData]
	);

	const validateStep2 = useCallback(
		() =>
			activeLineItems.every(
				(item) =>
					item.name.trim() &&
					item.quantity > 0 &&
					item.unit_price >= 0
			),
		[activeLineItems]
	);

	const validateStep = useCallback(
		(step: Step): boolean => {
			if (step === 1) return validateStep1();
			if (step === 2) return validateStep2();
			return true;
		},
		[validateStep1, validateStep2]
	);

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
		setShowTemplateSearch(false);
	}, [resetWizard, resetLineItems, resetFinancials]);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	const handleChangeAddress = (result: GeocodeResult) =>
		setGeoData({ address: result.address, coords: result.coords });
	const handleClearAddress = () => setGeoData(undefined);

	const handleSelectTemplate = useCallback(
		(quoteId: string) => {
			const source = allQuotes.find((q) => q.id === quoteId);
			if (!source) return;

			// Pre-fill basics
			setTitle(source.title);
			setDescription(source.description);
			setPriority(source.priority as Priority);
			if (source.address && source.coords) {
				setGeoData({ address: source.address, coords: source.coords });
			} else if (source.address) {
				setGeoData({ address: source.address, coords: { lat: 0, lon: 0 } });
			}

			// Pre-fill line items
			if (source.line_items?.length) {
				seedLineItems(
					source.line_items.map((li) => ({
						name: li.name,
						description: li.description ?? "",
						quantity: Number(li.quantity),
						unit_price: Number(li.unit_price),
						item_type: li.item_type ?? "",
					}))
				);
			} else {
				resetLineItems();
			}

			// Pre-fill financials
			setFinancialOriginals(
				(source.tax_rate ?? 0) * 100,
				source.discount_type ?? "amount",
				source.discount_value ?? 0
			);

			setShowTemplateSearch(false);
			goToStep(1 as Step);
		},
		[allQuotes, seedLineItems, resetLineItems, setFinancialOriginals, goToStep]
	);

	const templateResults = useMemo((): TemplateSearchResult[] => {
		return allQuotes
			.filter((q) => q.is_active)
			.map((q) => ({
				id: q.id,
				title: q.title,
				subtitle: q.quote_number,
				detail: q.description
					? q.description.slice(0, 80) +
						(q.description.length > 80 ? "…" : "")
					: undefined,
				badge: q.status,
				badgeColor: QuoteStatusColors[
					q.status as keyof typeof QuoteStatusColors
				],
				value:
					q.total != null
						? `$${Number(q.total).toFixed(2)}`
						: undefined,
				createdAt: new Date(q.created_at).toISOString(),
				clientId: q.client_id,
				clientName: q.client?.name,
			}));
	}, [allQuotes]);

	const templateClients = useMemo((): TemplateSearchClient[] => {
		if (!clients) return [];
		return clients.map((c) => ({ id: c.id, name: c.name }));
	}, [clients]);

	const clientDropdownEntries = useMemo(() => {
		if (clients?.length) {
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
		if (!fieldErrors.length) return null;
		return (
			<div className="mt-0.5">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-xs leading-tight">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const stepContent = useMemo(() => {
		if (showTemplateSearch) {
			return (
				<TemplateSearch
					results={templateResults}
					clients={templateClients}
					onSelect={handleSelectTemplate}
					onClose={() => setShowTemplateSearch(false)}
				/>
			);
		}

		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						<div className="min-w-0">
							<label className={LABEL}>Title *</label>
							<input
								type="text"
								placeholder="Quote Title"
								value={title}
								onChange={(e) =>
									setTitle(e.target.value)
								}
								className={INPUT}
								disabled={isLoading}
							/>
							<ErrorDisplay path="title" />
						</div>

						<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className={LABEL}>
									Client *
								</label>
								<Dropdown
									entries={
										clientDropdownEntries
									}
									value={clientId}
									onChange={setClientId}
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
							<div className="min-w-0">
								<label className={LABEL}>
									Priority
								</label>
								<Dropdown
									entries={PRIORITY_ENTRIES}
									value={priority}
									onChange={(v) =>
										setPriority(
											v as Priority
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

						<div className="min-w-0">
							<label className={LABEL}>
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
								className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 xl:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
								disabled={isLoading}
							/>
							<ErrorDisplay path="description" />
						</div>

						<div
							className="relative min-w-0"
							style={{ zIndex: 50 }}
						>
							<label className={LABEL}>Address *</label>
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
					<div className="space-y-2 min-w-0 pt-2">
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
					<div className="space-y-3 min-w-0 pt-2">
						<FinancialSummary
							subtotal={subtotal}
							taxRate={taxRate}
							taxAmount={taxAmount}
							discountType={discountType}
							discountValue={discountValue}
							discountAmount={discountAmount}
							total={total}
							isLoading={isLoading}
							mode="create"
							onTaxRateChange={setTaxRate}
							onDiscountTypeChange={setDiscountType}
							onDiscountValueChange={setDiscountValue}
							totalLabel="Total"
						/>
						<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className={LABEL}>
									Valid Until (Optional)
								</label>
								<DatePicker
									mode="create"
									value={validUntilDate}
									onChange={setValidUntilDate}
									align="right"
									position="above"
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Expires At (Optional)
								</label>
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
		showTemplateSearch,
		templateResults,
		templateClients,
		handleSelectTemplate,
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
			onStartFromExisting={() => setShowTemplateSearch((v) => !v)}
			hideStartFromExisting={showTemplateSearch}
			fullHeightContent={showTemplateSearch}
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateQuote;
