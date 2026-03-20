import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { type CreateInvoiceInput, type CreateInvoiceLineItemInput } from "../../types/invoices";
import { type LineItemType, type BaseLineItem } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import { useAllJobsQuery } from "../../hooks/useJobs";
import { useCreateInvoiceMutation, useInvoicesByClientIdQuery } from "../../hooks/useInvoices";
import Dropdown from "../ui/Dropdown";
import DatePicker from "../ui/DatePicker";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import LineItemsSection from "../ui/forms/LineItemsSection";
import FinancialSummary from "../ui/forms/FinancialSummary";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import { useLineItems } from "../../hooks/forms/useLineItems";
import { useFinancialCalculations } from "../../hooks/forms/useFinancialCalculations";
import { X, Briefcase, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

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

// ── Billing history derived types ─────────────────────────────────────────
interface JobBillingInfo {
	totalInvoiced: number;
	invoiceCount: number;
	invoiceNumbers: string[];
}
interface VisitBillingInfo {
	totalInvoiced: number;
	invoiceNumbers: string[];
}

const CreateInvoice = ({ isModalOpen, setIsModalOpen, defaultClientId }: CreateInvoiceProps) => {
	// ── Core form state ───────────────────────────────────────────────────
	const [clientId, setClientId] = useState(defaultClientId ?? "");
	const [memo, setMemo] = useState("");
	const [internalNotes, setInternalNotes] = useState("");
	const [issueDate, setIssueDate] = useState<Date | null>(() => new Date());
	const [paymentTermsDays, setPaymentTermsDays] = useState<string>("");
	const [dueDate, setDueDate] = useState<Date | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isDirty, setIsDirty] = useState(false);
	// Tracks whether a source picker or other inner input was recently focused,
	// so the next row click doesn't accidentally toggle selection.
	const billingInputFocusedRef = useRef(false);

	// ── Job / visit picker state ──────────────────────────────────────────
	const [linkedJobIds, setLinkedJobIds] = useState<Set<string>>(new Set());
	const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
	const [visitBillings, setVisitBillings] = useState<Map<string, number>>(new Map());
	const [importedSources, setImportedSources] = useState<Set<string>>(new Set());

	// ── Queries ───────────────────────────────────────────────────────────
	const { data: clients } = useAllClientsQuery();
	const { data: allJobs = [] } = useAllJobsQuery();
	const { data: clientInvoices = [] } = useInvoicesByClientIdQuery(clientId);
	const { mutateAsync: insertInvoice } = useCreateInvoiceMutation();

	// ── Hooks ─────────────────────────────────────────────────────────────
	const {
		activeLineItems,
		addLineItem,
		removeLineItem,
		updateLineItem,
		subtotal,
		resetLineItems,
		seedLineItems,
		setLineItems,
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

	// ── Derived: jobs for this client ─────────────────────────────────────
	const clientJobs = useMemo(() => {
		if (!clientId) return [];
		return allJobs.filter((j) => j.client_id === clientId && j.status !== "Cancelled");
	}, [allJobs, clientId]);

	// ── Derived: billing history maps from non-void invoices ──────────────
	const { jobBillingMap, visitBillingMap } = useMemo(() => {
		const jMap = new Map<string, JobBillingInfo>();
		const vMap = new Map<string, VisitBillingInfo>();

		for (const inv of clientInvoices) {
			if (inv.status === "Void") continue;

			for (const ij of inv.jobs ?? []) {
				if (ij.billed_amount === null || ij.billed_amount === undefined)
					continue;
				const existing = jMap.get(ij.job_id);
				if (existing) {
					existing.totalInvoiced += Number(ij.billed_amount);
					existing.invoiceCount += 1;
					existing.invoiceNumbers.push(inv.invoice_number);
				} else {
					jMap.set(ij.job_id, {
						totalInvoiced: Number(ij.billed_amount),
						invoiceCount: 1,
						invoiceNumbers: [inv.invoice_number],
					});
				}
			}

			for (const iv of inv.visits ?? []) {
				const existing = vMap.get(iv.visit_id);
				if (existing) {
					existing.totalInvoiced += Number(iv.billed_amount);
					existing.invoiceNumbers.push(inv.invoice_number);
				} else {
					vMap.set(iv.visit_id, {
						totalInvoiced: Number(iv.billed_amount),
						invoiceNumbers: [inv.invoice_number],
					});
				}
			}
		}

		return { jobBillingMap: jMap, visitBillingMap: vMap };
	}, [clientInvoices]);

	// ── Derived: which jobs/visits have importable line items ─────────────
	const importSources = useMemo(() => {
		const sources: { id: string; label: string; items: unknown[] }[] = [];

		for (const jobId of linkedJobIds) {
			const job = clientJobs.find((j) => j.id === jobId);
			if (!job) continue;
			const items = (job as any).line_items ?? [];
			if (items.length > 0 && !importedSources.has(jobId)) {
				sources.push({ id: jobId, label: `${job.job_number}`, items });
			}
		}

		for (const [visitId] of visitBillings) {
			const job = clientJobs.find((j) =>
				((j as any).visits ?? []).some((v: any) => v.id === visitId)
			);
			if (!job) continue;
			const visit = ((job as any).visits ?? []).find(
				(v: any) => v.id === visitId
			);
			if (!visit) continue;
			const items = visit.line_items ?? [];
			if (items.length > 0 && !importedSources.has(visitId)) {
				sources.push({
					id: visitId,
					label: `Visit ${new Date(visit.scheduled_start_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
					items,
				});
			}
		}

		return sources;
	}, [linkedJobIds, visitBillings, clientJobs, importedSources]);

	// ── Auto due date ──────────────────────────────────────────────────────
	useEffect(() => {
		if (paymentTermsDays === "") return;
		const days = parseInt(paymentTermsDays, 10);
		if (!isNaN(days) && issueDate) {
			const base = new Date(issueDate);
			base.setDate(base.getDate() + days);
			setDueDate(base);
		}
	}, [paymentTermsDays, issueDate]);

	// ── Reset ──────────────────────────────────────────────────────────────
	const resetForm = useCallback(() => {
		resetWizard();
		setClientId(defaultClientId ?? "");
		setMemo("");
		setInternalNotes("");
		setIssueDate(new Date());
		setPaymentTermsDays("");
		setDueDate(null);
		setLinkedJobIds(new Set());
		setExpandedJobs(new Set());
		setVisitBillings(new Map());
		setImportedSources(new Set());
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

	// ── Job picker handlers ───────────────────────────────────────────────
	const toggleJobExpanded = useCallback((jobId: string) => {
		setExpandedJobs((prev) => {
			const next = new Set(prev);
			if (next.has(jobId)) next.delete(jobId);
			else next.add(jobId);
			return next;
		});
	}, []);

	const toggleJobLinked = useCallback(
		(jobId: string) => {
			const job = clientJobs.find((j) => j.id === jobId);
			if (!job) return;

			setLinkedJobIds((prev) => {
				const next = new Set(prev);
				if (next.has(jobId)) {
					next.delete(jobId);
					setVisitBillings((vPrev) => {
						const vNext = new Map(vPrev);
						for (const visit of (job as any).visits ?? []) {
							vNext.delete(visit.id);
						}
						return vNext;
					});
					setExpandedJobs((ePrev) => {
						const eNext = new Set(ePrev);
						eNext.delete(jobId);
						return eNext;
					});
				} else {
					next.add(jobId);
					setExpandedJobs((ePrev) => new Set([...ePrev, jobId]));

					setVisitBillings((vPrev) => {
						const vNext = new Map(vPrev);
						for (const visit of (job as any).visits ?? []) {
							if (
								visit.status === "Completed" &&
								!visitBillingMap.has(visit.id)
							) {
								vNext.set(
									visit.id,
									Number(visit.total ?? 0)
								);
							}
						}
						return vNext;
					});
				}
				return next;
			});
			markDirty();
		},
		[clientJobs, visitBillingMap, markDirty]
	);

	const toggleVisitSelected = useCallback(
		(visitId: string, visitTotal: number) => {
			if (billingInputFocusedRef.current) {
				billingInputFocusedRef.current = false;
				return;
			}
			setVisitBillings((prev) => {
				const next = new Map(prev);
				if (next.has(visitId)) {
					next.delete(visitId);
				} else {
					next.set(visitId, visitTotal);
					const parentJob = clientJobs.find((j) =>
						((j as any).visits ?? []).some(
							(v: any) => v.id === visitId
						)
					);
					if (parentJob) {
						setLinkedJobIds((jPrev) => {
							if (jPrev.has(parentJob.id)) return jPrev;
							return new Set([...jPrev, parentJob.id]);
						});
					}
				}
				return next;
			});
			markDirty();
		},
		[clientJobs, markDirty]
	);

	// ── Import line items ─────────────────────────────────────────────────
	const handleImportLineItems = useCallback(() => {
		const allSeeds: any[] = [];
		const newImportedIds: string[] = [];

		for (const jobId of linkedJobIds) {
			const job = clientJobs.find((j) => j.id === jobId);
			if (!job) continue;

			if (!importedSources.has(jobId) && (job as any).line_items?.length) {
				for (const item of (job as any).line_items) {
					allSeeds.push({
						name: item.name ?? "",
						description: item.description ?? "",
						quantity: Number(item.quantity ?? 1),
						unit_price: Number(item.unit_price ?? 0),
						item_type: item.item_type ?? "",
						source_job_id: jobId,
						source_visit_id: null,
					});
				}
				newImportedIds.push(jobId);
			}

			const jobVisits: any[] = (job as any).visits ?? [];
			for (const visit of jobVisits) {
				if (!visitBillings.has(visit.id)) continue;
				if (importedSources.has(visit.id)) continue;
				if (!visit.line_items?.length) continue;
				for (const item of visit.line_items) {
					allSeeds.push({
						name: item.name ?? "",
						description: item.description ?? "",
						quantity: Number(item.quantity ?? 1),
						unit_price: Number(item.unit_price ?? 0),
						item_type: item.item_type ?? "",
						source_job_id: jobId,
						source_visit_id: visit.id,
					});
				}
				newImportedIds.push(visit.id);
			}
		}

		if (allSeeds.length > 0) {
			const existingSeeds = activeLineItems
				.filter((li) => li.name.trim() !== "" || li.unit_price > 0)
				.map((li) => ({
					name: li.name,
					description: li.description ?? "",
					quantity: Number(li.quantity),
					unit_price: Number(li.unit_price),
					item_type: li.item_type ?? "",
					source_job_id: (li as any).source_job_id ?? null,
					source_visit_id: (li as any).source_visit_id ?? null,
				}));
			seedLineItems([...existingSeeds, ...allSeeds]);
		}

		if (newImportedIds.length > 0) {
			setImportedSources((prev) => new Set<string>([...prev, ...newImportedIds]));
		}
	}, [
		visitBillings,
		linkedJobIds,
		clientJobs,
		importedSources,
		activeLineItems,
		seedLineItems,
	]);

	// ── Validation ────────────────────────────────────────────────────────
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

	// ── Dirty wrappers ────────────────────────────────────────────────────
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

	const updateLineItemSource = useCallback(
		(id: string, sourceJobId: string | null, sourceVisitId: string | null) => {
			setLineItems((prev) =>
				prev.map((li) =>
					li.id === id
						? {
								...li,
								source_job_id: sourceJobId,
								source_visit_id: sourceVisitId,
							}
						: li
				)
			);
			markDirty();
		},
		[setLineItems, markDirty]
	);

	// ── Submit ────────────────────────────────────────────────────────────
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
				source_job_id: (item as any).source_job_id ?? undefined,
				source_visit_id: (item as any).source_visit_id ?? undefined,
			}));

		const safeSubtotal = isNaN(subtotal) ? 0 : subtotal;
		const safeTaxRate = isNaN(taxRate) ? 0 : taxRate;
		const safeTaxAmount = isNaN(taxAmount) ? 0 : taxAmount;
		const safeDiscountValue = isNaN(discountValue ?? 0) ? 0 : (discountValue ?? 0);
		const safeDiscountAmount = isNaN(discountAmount ?? 0) ? 0 : (discountAmount ?? 0);
		const safeTotal = isNaN(total) ? 0 : total;

		const visitBilledAmounts = new Map<string, number>();
		for (const [visitId] of visitBillings) {
			const total = preparedLineItems
				.filter((li) => (li as any).source_visit_id === visitId)
				.reduce((sum, li) => sum + (li.total ?? 0), 0);
			visitBilledAmounts.set(visitId, total);
		}

		const preparedVisitBillings = Array.from(visitBillings.keys()).map((visit_id) => ({
			visit_id,
			billed_amount: visitBilledAmounts.get(visit_id) ?? 0,
		}));

		const preparedJobBillings = Array.from(linkedJobIds).map((job_id) => {
			const jobOnlyTotal = preparedLineItems
				.filter(
					(li) =>
						(li as any).source_job_id === job_id &&
						!(li as any).source_visit_id
				)
				.reduce((sum, li) => sum + (li.total ?? 0), 0);
			return { job_id, billed_amount: jobOnlyTotal };
		});

		const newInvoice: CreateInvoiceInput = {
			client_id: clientId.trim(),
			memo: memo.trim() || undefined,
			internal_notes: internalNotes.trim() || undefined,
			issue_date: issueDate ? issueDate.toISOString().split("T")[0] : undefined,
			payment_terms_days: paymentTermsDays
				? parseInt(paymentTermsDays, 10)
				: undefined,
			due_date: dueDate ? dueDate.toISOString().split("T")[0] : undefined,
			job_billings:
				preparedJobBillings.length > 0 ? preparedJobBillings : undefined,
			visit_billings:
				preparedVisitBillings.length > 0
					? preparedVisitBillings
					: undefined,
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

	// ── Dropdown entries ──────────────────────────────────────────────────
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

	// ── Visit status helpers ───────────────────────────────────────────────
	const getVisitStatusClass = (status: string) => {
		switch (status) {
			case "Completed":
				return "bg-green-500/10 text-green-400";
			case "InProgress":
			case "Driving":
			case "OnSite":
				return "bg-blue-500/10 text-blue-400";
			case "Paused":
			case "Delayed":
				return "bg-amber-500/10 text-amber-400";
			default:
				return "bg-zinc-700 text-zinc-400";
		}
	};

	const formatVisitDate = (dateStr: string | Date) => {
		return new Date(dateStr).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const formatCurrency = (n: number) =>
		n.toLocaleString("en-US", { style: "currency", currency: "USD" });

	const formatInvoiceNums = (nums: string[], max = 2) => {
		if (nums.length <= max) return nums.join(", ");
		return `${nums.slice(0, max).join(", ")} +${nums.length - max} more`;
	};

	// ── Step content ──────────────────────────────────────────────────────
	const stepContent = useMemo(() => {
		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						{/* Client + Issue Date */}
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
										setLinkedJobIds(
											new Set()
										);
										setExpandedJobs(
											new Set()
										);
										setVisitBillings(
											new Map()
										);
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

						{/* Payment Terms + Due Date */}
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

						{/* ── Job / Visit Picker ─────────────────────────── */}
						{clientJobs.length > 0 && (
							<div className="min-w-0">
								<label className={LABEL}>
									Link Jobs &amp; Visits{" "}
									<span className="text-zinc-500 normal-case font-normal">
										(optional)
									</span>
								</label>

								<div className="space-y-1.5 mt-1">
									{clientJobs.map((job) => {
										const isJobLinked =
											linkedJobIds.has(
												job.id
											);
										const isExpanded =
											expandedJobs.has(
												job.id
											);
										const jobHistory =
											jobBillingMap.get(
												job.id
											);
										const visits: any[] =
											(job as any)
												.visits ??
											[];
										const linkedVisitCount =
											visits.filter(
												(
													v: any
												) =>
													visitBillings.has(
														v.id
													)
											).length;
										const hasAnyLink =
											isJobLinked ||
											linkedVisitCount >
												0;

										return (
											<div
												key={
													job.id
												}
												className="min-w-0"
											>
												{/* ── Job Row ── */}
												<div
													className={`flex items-center gap-0 rounded-md border transition-colors ${
														isJobLinked
															? "border-blue-500 bg-blue-500/10"
															: "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
													}`}
												>
													{/* Checkbox area */}
													<button
														type="button"
														onClick={() =>
															toggleJobLinked(
																job.id
															)
														}
														disabled={
															isLoading
														}
														className="flex items-start gap-2 flex-1 min-w-0 px-3 py-2 text-left"
													>
														<div
															className={`w-3.5 h-3.5 rounded border flex-shrink-0 self-center flex items-center justify-center transition-colors ${
																isJobLinked
																	? "border-blue-500 bg-blue-500"
																	: linkedVisitCount >
																		  0
																		? "border-blue-400 bg-transparent"
																		: "border-zinc-600 bg-transparent"
															}`}
														>
															{isJobLinked && (
																<svg
																	width="8"
																	height="6"
																	viewBox="0 0 8 6"
																	fill="none"
																>
																	<path
																		d="M1 3L3 5L7 1"
																		stroke="white"
																		strokeWidth="1.5"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																	/>
																</svg>
															)}
															{!isJobLinked &&
																linkedVisitCount >
																	0 && (
																	<div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
																)}
														</div>
														<Briefcase
															size={
																13
															}
															className={
																hasAnyLink
																	? "text-blue-400 flex-shrink-0 self-center"
																	: "text-zinc-500 flex-shrink-0 self-center"
															}
														/>
														<div className="flex-1 min-w-0">
															<span className="block truncate text-sm font-medium text-white">
																{
																	job.job_number
																}{" "}
																·{" "}
																{
																	job.name
																}
															</span>
															{jobHistory && (
																<div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-400/90">
																	<AlertTriangle
																		size={
																			9
																		}
																		className="flex-shrink-0"
																	/>
																	<span className="truncate">
																		Previously
																		billed{" "}
																		{formatCurrency(
																			jobHistory.totalInvoiced
																		)}{" "}
																		·{" "}
																		{formatInvoiceNums(
																			jobHistory.invoiceNumbers
																		)}
																	</span>
																</div>
															)}
														</div>
														<span
															className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 self-center ${
																job.status ===
																"Completed"
																	? "bg-green-500/10 text-green-400"
																	: job.status ===
																		  "InProgress"
																		? "bg-blue-500/10 text-blue-400"
																		: "bg-zinc-700 text-zinc-400"
															}`}
														>
															{
																job.status
															}
														</span>
													</button>

													{/* Visit count pill */}
													{!isExpanded &&
														linkedVisitCount >
															0 && (
															<span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 bg-blue-500/20 text-blue-400 border border-blue-500/30 self-center mr-1">
																{
																	linkedVisitCount
																}{" "}
																visit
																{linkedVisitCount !==
																1
																	? "s"
																	: ""}{" "}
																linked
															</span>
														)}

													{/* Chevron toggle */}
													{visits.length >
														0 && (
														<button
															type="button"
															onClick={() =>
																toggleJobExpanded(
																	job.id
																)
															}
															disabled={
																isLoading
															}
															className={`px-3 py-2 transition-colors flex-shrink-0 border-l-2 ${
																hasAnyLink
																	? isExpanded
																		? "border-blue-500 text-blue-400 hover:text-white bg-blue-500/5"
																		: "border-blue-500/50 text-blue-400 hover:text-white"
																	: "border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-400"
															}`}
															title={
																isExpanded
																	? "Collapse visits"
																	: "Expand visits"
															}
														>
															{isExpanded ? (
																<ChevronDown
																	size={
																		14
																	}
																/>
															) : (
																<ChevronRight
																	size={
																		14
																	}
																/>
															)}
														</button>
													)}
												</div>

												{/* ── Visit Sub-rows ── */}
												{isExpanded && (
													<div className="ml-4 mt-1 space-y-1">
														{visits.length ===
														0 ? (
															<p className="text-xs text-zinc-500 px-3 py-2">
																No
																visits
															</p>
														) : (
															visits.map(
																(
																	visit: any
																) => {
																	const isVisitSelected =
																		visitBillings.has(
																			visit.id
																		);
																	const visitHistory =
																		visitBillingMap.get(
																			visit.id
																		);

																	return (
																		<div
																			key={
																				visit.id
																			}
																			className="min-w-0"
																		>
																			<button
																				type="button"
																				onClick={() =>
																					toggleVisitSelected(
																						visit.id,
																						Number(
																							visit.total ??
																								0
																						)
																					)
																				}
																				disabled={
																					isLoading
																				}
																				className={`w-full flex items-center gap-2 px-3 py-1.5 rounded border transition-colors text-sm text-left ${
																					isVisitSelected
																						? "border-blue-500/50 bg-blue-500/5"
																						: "border-zinc-700/50 bg-zinc-800/50 hover:border-zinc-600"
																				}`}
																			>
																				{/* Checkbox */}
																				<div
																					className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
																						isVisitSelected
																							? "border-blue-500 bg-blue-500"
																							: "border-zinc-600 bg-transparent"
																					}`}
																				>
																					{isVisitSelected && (
																						<svg
																							width="8"
																							height="6"
																							viewBox="0 0 8 6"
																							fill="none"
																						>
																							<path
																								d="M1 3L3 5L7 1"
																								stroke="white"
																								strokeWidth="1.5"
																								strokeLinecap="round"
																								strokeLinejoin="round"
																							/>
																						</svg>
																					)}
																				</div>

																				{/*
																				 * Layout: [date] [billing — fills gap, truncates] [status badge]
																				 * date:    flex-shrink-0 — never compresses
																				 * billing: flex-1 min-w-0 truncate — fills available space, truncates when tight
																				 * status:  flex-shrink-0 — always visible, pinned right
																				 */}
																				<span className="flex-shrink-0 text-sm text-zinc-300">
																					{formatVisitDate(
																						visit.scheduled_start_at
																					)}
																				</span>
																				{visitHistory && (
																					<span className="flex-1 min-w-0 truncate text-[10px] text-amber-400/90">
																						Previously
																						billed{" "}
																						{formatCurrency(
																							visitHistory.totalInvoiced
																						)}{" "}
																						·{" "}
																						{formatInvoiceNums(
																							visitHistory.invoiceNumbers
																						)}
																					</span>
																				)}
																				{!visitHistory && (
																					<span className="flex-1" />
																				)}
																				<span
																					className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getVisitStatusClass(visit.status)}`}
																				>
																					{
																						visit.status
																					}
																				</span>
																			</button>
																		</div>
																	);
																}
															)
														)}
													</div>
												)}
											</div>
										);
									})}
								</div>

								{/* Summary line */}
								{(linkedJobIds.size > 0 ||
									visitBillings.size > 0) && (
									<div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
										{linkedJobIds.size >
											0 && (
											<span>
												{
													linkedJobIds.size
												}{" "}
												job
												{linkedJobIds.size !==
												1
													? "s"
													: ""}{" "}
												linked
											</span>
										)}
										{visitBillings.size >
											0 && (
											<>
												<span className="text-zinc-700">
													·
												</span>
												<span>
													{
														visitBillings.size
													}{" "}
													visit
													{visitBillings.size !==
													1
														? "s"
														: ""}{" "}
													selected
												</span>
											</>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				);

			case 2: {
				const sourceJobsForStep2 = clientJobs
					.filter((job) => linkedJobIds.has(job.id))
					.map((job) => ({
						id: job.id,
						job_number: job.job_number,
						name: job.name,
						visits: ((job as any).visits ?? [])
							.filter((v: any) => visitBillings.has(v.id))
							.map((v: any) => ({
								id: v.id,
								scheduled_start_at:
									v.scheduled_start_at,
								status: v.status,
							})),
					}));

				const importableCount = Array.from(visitBillings.keys())
					.filter((visitId) => !importedSources.has(visitId))
					.reduce((n, visitId) => {
						for (const job of clientJobs) {
							const visit = (
								(job as any).visits ?? []
							).find((v: any) => v.id === visitId);
							if (visit)
								return (
									n +
									(visit.line_items?.length ??
										0)
								);
						}
						return n;
					}, 0);

				const jobImportableCount = Array.from(linkedJobIds)
					.filter((jobId) => !importedSources.has(jobId))
					.reduce((n, jobId) => {
						const job = clientJobs.find((j) => j.id === jobId);
						return n + ((job as any).line_items?.length ?? 0);
					}, 0);

				const totalImportable = importableCount + jobImportableCount;

				return (
					<div className="min-w-0 flex flex-col">
						<LineItemsSection
							lineItems={activeLineItems}
							isLoading={isLoading}
							onAdd={dirtyAddLineItem}
							onRemove={dirtyRemoveLineItem}
							onUpdate={dirtyUpdateLineItem}
							onUpdateSource={updateLineItemSource}
							subtotal={subtotal}
							required={false}
							minItems={0}
							dirtyFields={dirtyLineItemFields}
							onUndo={undoLineItemField}
							onClear={clearLineItemField}
							sourceJobs={sourceJobsForStep2}
							onImport={
								totalImportable > 0
									? handleImportLineItems
									: undefined
							}
							importLabel={
								importableCount > 0
									? `Import ${importableCount} visit item${importableCount !== 1 ? "s" : ""}`
									: undefined
							}
						/>
					</div>
				);
			}

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
							{linkedJobIds.size > 0 && (
								<div className="flex justify-between items-start">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Linked Jobs
									</span>
									<span className="text-blue-400 text-right">
										{linkedJobIds.size}{" "}
										job
										{linkedJobIds.size !==
										1
											? "s"
											: ""}
									</span>
								</div>
							)}
							{visitBillings.size > 0 && (
								<div className="flex justify-between items-start">
									<span className="text-zinc-400 text-xs uppercase tracking-wide font-semibold">
										Linked Visits
									</span>
									<span className="text-blue-400 text-right">
										{visitBillings.size}{" "}
										visit
										{visitBillings.size !==
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
		expandedJobs,
		visitBillings,
		clientJobs,
		jobBillingMap,
		visitBillingMap,
		isLoading,
		clientDropdownEntries,
		paymentTermsEntries,
		toggleJobLinked,
		toggleJobExpanded,
		toggleVisitSelected,
		updateLineItemSource,
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
		importSources,
		handleImportLineItems,
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
