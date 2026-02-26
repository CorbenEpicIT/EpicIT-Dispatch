import { useState, useEffect, useMemo, useCallback } from "react";
import type { ZodError } from "zod";
import {
	CreateJobSchema,
	type CreateJobInput,
	type CreateJobLineItemInput,
	JobStatusColors,
} from "../../types/jobs";
import { type LineItemType, type Priority, PriorityValues } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useAllJobsQuery } from "../../hooks/useJobs";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
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

type Step = 1 | 2 | 3;

interface CreateJobProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createJob: (input: CreateJobInput) => Promise<string>;
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

const CreateJob = ({ isModalOpen, setIsModalOpen, createJob }: CreateJobProps) => {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [clientId, setClientId] = useState("");
	const [priority, setPriority] = useState<Priority>("Medium");
	const [geoData, setGeoData] = useState<GeocodeResult>();

	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	const [showTemplateSearch, setShowTemplateSearch] = useState(false);

	const { data: clients } = useAllClientsQuery();
	const { data: allJobs = [] } = useAllJobsQuery();

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
		setOriginals: setFinancialOriginals,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	} = useFinancialCalculations(subtotal);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({ totalSteps: 3 as Step, initialStep: 1 as Step });

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
					return true;
				default:
					return true;
			}
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
		setName("");
		setDescription("");
		setClientId("");
		setPriority("Medium");
		setGeoData(undefined);
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
		(jobId: string) => {
			const source = allJobs.find((j) => j.id === jobId);
			if (!source) return;

			// Pre-fill basics
			setName(source.name);
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
		[allJobs, seedLineItems, resetLineItems, setFinancialOriginals, goToStep]
	);

	const templateResults = useMemo((): TemplateSearchResult[] => {
		return allJobs
			.filter((j) => j.status !== "Cancelled")
			.map((j) => ({
				id: j.id,
				title: j.name,
				subtitle: j.job_number,
				detail: j.description
					? j.description.slice(0, 80) +
						(j.description.length > 80 ? "…" : "")
					: undefined,
				badge: j.status,
				badgeColor: JobStatusColors[
					j.status as keyof typeof JobStatusColors
				],
				value:
					j.estimated_total != null
						? `$${Number(j.estimated_total).toFixed(2)}`
						: undefined,
				createdAt: new Date(j.created_at).toISOString(),
				clientId: j.client_id,
				clientName: j.client?.name,
			}));
	}, [allJobs]);

	const templateClients = useMemo((): TemplateSearchClient[] => {
		if (!clients) return [];
		return clients.map((c) => ({ id: c.id, name: c.name }));
	}, [clients]);

	// ── Client dropdown ────────────────────────────────────────────────────
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

	// ── Submit ─────────────────────────────────────────────────────────────
	const invokeCreate = async () => {
		if (isLoading) return;

		const preparedLineItems: CreateJobLineItemInput[] = activeLineItems
			.filter((li) => li.name.trim() !== "" && li.quantity > 0)
			.map((item) => ({
				name: item.name,
				description: item.description || undefined,
				quantity: Number(item.quantity),
				unit_price: Number(item.unit_price),
				total: item.total,
				item_type: (item.item_type || undefined) as
					| LineItemType
					| undefined,
			}));

		const newJob: CreateJobInput = {
			name: name.trim(),
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
			estimated_total: total,
			line_items: preparedLineItems.length ? preparedLineItems : undefined,
		};

		const parseResult = CreateJobSchema.safeParse(newJob);

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
			} else if (errorPaths.includes("line_items")) {
				goToStep(2 as Step);
			}
			return;
		}

		setErrors(null);
		setIsLoading(true);

		try {
			await createJob(newJob);
			setIsModalOpen(false);
			resetForm();
		} catch (error) {
			console.error("Failed to create job:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		if (!errors) return null;
		const fieldErrors = errors.issues.filter((err) => err.path[0] === path);
		if (fieldErrors.length === 0) return null;
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
							<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Job Name *
							</label>
							<input
								type="text"
								placeholder="Job Name"
								value={name}
								onChange={(e) =>
									setName(e.target.value)
								}
								className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 xl:py-2.5 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0"
								disabled={isLoading}
							/>
							<ErrorDisplay path="name" />
						</div>

						<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
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

							<div className="min-w-0">
								<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
									Priority *
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

						<div className="min-w-0">
							<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Description *
							</label>
							<textarea
								placeholder="Job Description"
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
							<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Address *
							</label>
							<div className="relative">
								<AddressForm
									mode={
										geoData
											? "edit"
											: "create"
									}
									originalValue={
										geoData?.address ||
										""
									}
									originalCoords={
										geoData?.coords
									}
									dropdownPosition="above"
									handleChange={
										handleChangeAddress
									}
									handleClear={
										handleClearAddress
									}
								/>
							</div>
							<ErrorDisplay path="address" />
							<ErrorDisplay path="coords" />
						</div>
					</div>
				);

			case 2:
				return (
					<div className="min-w-0 flex flex-col">
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

			case 3:
				return (
					<div className="space-y-3 lg:space-y-5 xl:space-y-6 min-w-0">
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
		name,
		clientId,
		priority,
		description,
		geoData,
		isLoading,
		clientDropdownEntries,
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
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	]);

	return (
		<FormWizardContainer<Step>
			title="Create Job"
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
			submitLabel="Create Job"
			onStartFromExisting={() => setShowTemplateSearch((v) => !v)}
			hideStartFromExisting={showTemplateSearch}
			fullHeightContent={showTemplateSearch}
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateJob;
