import { useState, useEffect, useMemo, useCallback } from "react";
import { type CreateInvoiceInput, type CreateInvoiceLineItemInput } from "../../types/invoices";
import { type LineItemType, type BaseLineItem } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useAllJobsQuery } from "../../hooks/useJobs";
import { useCreateInvoiceMutation } from "../../hooks/useInvoices";
import Dropdown from "../ui/Dropdown";
import DatePicker from "../ui/DatePicker";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";
import { X, Briefcase } from "lucide-react";

type Step = 1 | 2 | 3;

interface CreateInvoiceProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	defaultClientId?: string;
}

const STEPS = [
	{ id: 1 as Step, label: "Details" },
	{ id: 2 as Step, label: "Line Items" },
	{ id: 3 as Step, label: "Finalize" },
];

const PAYMENT_TERM_OPTIONS = [
	{ label: "— None —", value: "" },
	{ label: "Due on Receipt", value: "0" },
	{ label: "Net 7", value: "7" },
	{ label: "Net 15", value: "15" },
	{ label: "Net 30", value: "30" },
	{ label: "Net 45", value: "45" },
	{ label: "Net 60", value: "60" },
	{ label: "Net 90", value: "90" },
];

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

const CreateInvoice = ({ isModalOpen, setIsModalOpen, defaultClientId }: CreateInvoiceProps) => {
	const [clientId, setClientId] = useState(defaultClientId ?? "");
	const [memo, setMemo] = useState("");
	const [internalNotes, setInternalNotes] = useState("");
	const [issueDate, setIssueDate] = useState<Date | null>(() => new Date());
	const [paymentTermsDays, setPaymentTermsDays] = useState<string>("");
	const [dueDate, setDueDate] = useState<Date | null>(null);
	const [linkedJobIds, setLinkedJobIds] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isDirty, setIsDirty] = useState(false);

	const { data: clients } = useAllClientsQuery();
	const { data: allJobs = [] } = useAllJobsQuery();
	const { mutateAsync: insertInvoice } = useCreateInvoiceMutation();

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
	} = useLineItems({ minItems: 0, mode: "create" });

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

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({ totalSteps: 3 as Step, initialStep: 1 as Step });

	const markDirty = useCallback(() => setIsDirty(true), []);

	const clientJobs = useMemo(() => {
		if (!clientId) return [];
		return allJobs.filter((j) => j.client_id === clientId && j.status !== "Cancelled");
	}, [allJobs, clientId]);

	// Auto-compute due date when payment terms or issue date changes
	useEffect(() => {
		if (paymentTermsDays === "") return;
		const days = parseInt(paymentTermsDays, 10);
		if (!isNaN(days) && issueDate) {
			const base = new Date(issueDate);
			base.setDate(base.getDate() + days);
			setDueDate(base);
		}
	}, [paymentTermsDays, issueDate]);

	const resetForm = useCallback(() => {
		resetWizard();
		setClientId(defaultClientId ?? "");
		setMemo("");
		setInternalNotes("");
		setIssueDate(new Date());
		setPaymentTermsDays("");
		setDueDate(null);
		setLinkedJobIds([]);
		resetLineItems();
		resetFinancials();
		setIsDirty(false);
	}, [resetWizard, resetLineItems, resetFinancials, defaultClientId]);

	useEffect(() => {
		if (!isModalOpen) {
			resetForm();
			setIsLoading(false);
		}
	}, [isModalOpen, resetForm]);

	const validateStep1 = useCallback((): boolean => !!clientId.trim(), [clientId]);

	const validateStep2 = useCallback((): boolean => {
		const meaningful = activeLineItems.filter((item) => {
			const hasText =
				item.name.trim() !== "" || (item.description?.trim() ?? "") !== "";
			const hasNumbers = Number(item.unit_price) > 0;
			const hasType = (item.item_type?.trim?.() ?? "") !== "";
			return hasText || hasNumbers || hasType;
		});
		if (meaningful.length === 0) return true;
		return meaningful.every(
			(item) =>
				item.name.trim() &&
				Number(item.quantity) > 0 &&
				Number(item.unit_price) >= 0
		);
	}, [activeLineItems]);

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

	const toggleLinkedJob = (jobId: string) => {
		setLinkedJobIds((prev) =>
			prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
		);
		markDirty();
	};

	const dirtyAddLineItem = useCallback(() => {
		addLineItem();
		markDirty();
	}, [addLineItem, markDirty]);

	const dirtyRemoveLineItem = useCallback(
		(id: string) => {
			removeLineItem(id);
			markDirty();
		},
		[removeLineItem, markDirty]
	);

	const dirtyUpdateLineItem = useCallback(
		(id: string, field: keyof BaseLineItem, value: string | number) => {
			updateLineItem(id, field, value);
			markDirty();
		},
		[updateLineItem, markDirty]
	);

	const invokeCreate = async () => {
		if (isLoading) return;
		if (!clientId.trim()) return;

		const preparedLineItems: CreateInvoiceLineItemInput[] = activeLineItems
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

		const safeSubtotal = isNaN(subtotal) ? 0 : subtotal;
		const safeTaxRate = isNaN(taxRate) ? 0 : taxRate;
		const safeTaxAmount = isNaN(taxAmount) ? 0 : taxAmount;
		const safeDiscountValue = isNaN(discountValue ?? 0) ? 0 : (discountValue ?? 0);
		const safeDiscountAmount = isNaN(discountAmount ?? 0) ? 0 : (discountAmount ?? 0);
		const safeTotal = isNaN(total) ? 0 : total;

		const newInvoice: CreateInvoiceInput = {
			client_id: clientId.trim(),
			memo: memo.trim() || undefined,
			internal_notes: internalNotes.trim() || undefined,
			issue_date: issueDate ? issueDate.toISOString().split("T")[0] : undefined,
			payment_terms_days: paymentTermsDays
				? parseInt(paymentTermsDays, 10)
				: undefined,
			due_date: dueDate ? dueDate.toISOString().split("T")[0] : undefined,
			job_ids: linkedJobIds.length > 0 ? linkedJobIds : undefined,
			subtotal: safeSubtotal,
			tax_rate: safeTaxRate / 100,
			tax_amount: safeTaxAmount,
			discount_type: discountType,
			discount_value: safeDiscountValue,
			discount_amount: safeDiscountAmount,
			total: safeTotal,
			line_items: preparedLineItems.length ? preparedLineItems : undefined,
		};

		setIsLoading(true);
		try {
			await insertInvoice(newInvoice);
			setIsModalOpen(false);
			resetForm();
		} catch (error) {
			console.error("Failed to create invoice:", error);
		} finally {
			setIsLoading(false);
		}
	};

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

	const paymentTermsEntries = useMemo(
		() => (
			<>
				{PAYMENT_TERM_OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</>
		),
		[]
	);

	const stepContent = useMemo(() => {
		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						{/* Client + Issue Date — inline, equal halves */}
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
									onChange={(v) => {
										setClientId(v);
										setLinkedJobIds([]);
										markDirty();
									}}
									placeholder="Select client"
									disabled={
										isLoading ||
										!!defaultClientId
									}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Issue Date
								</label>
								<DatePicker
									value={issueDate}
									onChange={(d) => {
										setIssueDate(d);
										markDirty();
									}}
									disabled={isLoading}
									align="right"
									mode="create"
								/>
							</div>
						</div>

						{/* Memo */}
						<div className="min-w-0">
							<label className={LABEL}>
								Memo / Subject
							</label>
							<input
								type="text"
								placeholder="e.g. April Service Invoice"
								value={memo}
								onChange={(e) => {
									setMemo(e.target.value);
									markDirty();
								}}
								className={INPUT}
								disabled={isLoading}
							/>
						</div>

						{/* Payment Terms + Due Date — inline, tightly coupled */}
						<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className={LABEL}>
									Payment Terms
								</label>
								<Dropdown
									entries={
										paymentTermsEntries
									}
									value={paymentTermsDays}
									onChange={(v) => {
										setPaymentTermsDays(
											v
										);
										markDirty();
									}}
									placeholder="— None —"
									disabled={isLoading}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Due Date{" "}
									<span className="text-zinc-500 normal-case font-normal">
										(auto or override)
									</span>
								</label>
								<DatePicker
									value={dueDate}
									onChange={(d) => {
										setDueDate(d);
										// If user manually picks a date, clear terms
										setPaymentTermsDays(
											""
										);
										markDirty();
									}}
									disabled={isLoading}
									align="right"
								/>
							</div>
						</div>

						{/* Internal Notes */}
						<div className="min-w-0">
							<label className={LABEL}>
								Internal Notes{" "}
								<span className="text-zinc-500 normal-case font-normal">
									(not shown to client)
								</span>
							</label>
							<textarea
								placeholder="Internal notes for your team..."
								value={internalNotes}
								onChange={(e) => {
									setInternalNotes(
										e.target.value
									);
									markDirty();
								}}
								className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
								disabled={isLoading}
							/>
						</div>

						{/* Linked Jobs  */}
						{clientJobs.length > 0 && (
							<div className="min-w-0">
								<label className={LABEL}>
									Link Jobs{" "}
									<span className="text-zinc-500 normal-case font-normal">
										(optional, for
										traceability)
									</span>
								</label>
								<div className="space-y-1.5 mt-1">
									{clientJobs.map((job) => {
										const isLinked =
											linkedJobIds.includes(
												job.id
											);
										return (
											<button
												key={
													job.id
												}
												type="button"
												onClick={() =>
													toggleLinkedJob(
														job.id
													)
												}
												disabled={
													isLoading
												}
												className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors text-sm ${
													isLinked
														? "border-blue-500 bg-blue-500/10 text-white"
														: "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
												}`}
											>
												<span className="flex items-center gap-2 min-w-0">
													<Briefcase
														size={
															13
														}
														className={
															isLinked
																? "text-blue-400 flex-shrink-0"
																: "text-zinc-500 flex-shrink-0"
														}
													/>
													<span className="truncate font-medium">
														{
															job.job_number
														}{" "}
														·{" "}
														{
															job.name
														}
													</span>
												</span>
												{isLinked && (
													<X
														size={
															13
														}
														className="text-blue-400 flex-shrink-0 ml-2"
													/>
												)}
											</button>
										);
									})}
								</div>
								{linkedJobIds.length > 0 && (
									<p className="text-xs text-zinc-500 mt-1.5">
										{
											linkedJobIds.length
										}{" "}
										job
										{linkedJobIds.length !==
										1
											? "s"
											: ""}{" "}
										linked for
										traceability
									</p>
								)}
							</div>
						)}
					</div>
				);

			case 2:
				return (
					<div className="min-w-0 flex flex-col">
						<LineItemsSection
							lineItems={activeLineItems}
							isLoading={isLoading}
							onAdd={dirtyAddLineItem}
							onRemove={dirtyRemoveLineItem}
							onUpdate={dirtyUpdateLineItem}
							subtotal={subtotal}
							required={false}
							minItems={0}
							dirtyFields={dirtyLineItemFields}
							onUndo={undoLineItemField}
							onClear={clearLineItemField}
						/>
					</div>
				);

			case 3: {
				const issueDateLabel = issueDate
					? issueDate.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: "Today";
				const dueDateLabel = dueDate
					? dueDate.toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: null;

				return (
					<div className="space-y-3 lg:space-y-5 xl:space-y-6 min-w-0">
						<div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 text-sm space-y-1.5">
							<div className="flex justify-between items-center">
								<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
									Client
								</span>
								<span className="text-white font-medium">
									{clients?.find(
										(c) =>
											c.id ===
											clientId
									)?.name ?? "—"}
								</span>
							</div>
							{memo && (
								<div className="flex justify-between items-center">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Memo
									</span>
									<span className="text-white truncate max-w-[60%] text-right">
										{memo}
									</span>
								</div>
							)}
							<div className="flex justify-between items-center">
								<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
									Issue Date
								</span>
								<span className="text-white">
									{issueDateLabel}
								</span>
							</div>
							{paymentTermsDays && (
								<div className="flex justify-between items-center">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Payment Terms
									</span>
									<span className="text-white">
										{paymentTermsDays ===
										"0"
											? "Due on Receipt"
											: `Net ${paymentTermsDays}`}
									</span>
								</div>
							)}
							{dueDateLabel && (
								<div className="flex justify-between items-center">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Due Date
									</span>
									<span className="text-white">
										{dueDateLabel}
									</span>
								</div>
							)}
							{linkedJobIds.length > 0 && (
								<div className="flex justify-between items-start">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Linked Jobs
									</span>
									<span className="text-blue-400 text-right">
										{
											linkedJobIds.length
										}{" "}
										job
										{linkedJobIds.length !==
										1
											? "s"
											: ""}
									</span>
								</div>
							)}
						</div>

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
							onTaxRateChange={(v) => {
								setTaxRate(v);
								markDirty();
							}}
							onDiscountTypeChange={(v) => {
								setDiscountType(v);
								markDirty();
							}}
							onDiscountValueChange={(v) => {
								setDiscountValue(v);
								markDirty();
							}}
							totalLabel="Invoice Total"
							isTaxDirty={isTaxDirty}
							isDiscountDirty={isDiscountDirty}
							onTaxUndo={undoTax}
							onDiscountUndo={undoDiscount}
						/>
					</div>
				);
			}

			default:
				return null;
		}
	}, [
		currentStep,
		clientId,
		memo,
		internalNotes,
		issueDate,
		paymentTermsDays,
		dueDate,
		linkedJobIds,
		clientJobs,
		isLoading,
		clientDropdownEntries,
		paymentTermsEntries,
		activeLineItems,
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
		clients,
		defaultClientId,
	]);

	return (
		<FormWizardContainer<Step>
			title="Create Invoice"
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
			submitLabel="Create Invoice"
			isSourceSearchOpen={false}
			sourceMode="existing"
			onSourceModeChange={() => {}}
			draftCount={0}
			onStartFromExisting={() => {}}
			hideStartFromExisting={true}
			fullHeightContent={false}
			onCloseSourceSearch={() => {}}
			canSaveDraft={false}
			isSavingDraft={false}
		>
			{stepContent}
		</FormWizardContainer>
	);
};

export default CreateInvoice;
