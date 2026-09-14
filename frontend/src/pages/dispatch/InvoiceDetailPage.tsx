import { useParams, useNavigate } from "react-router-dom";
import { useState, useCallback, useMemo } from "react";
import {
	Edit2,
	Calendar,
	DollarSign,
	FileText,
	Trash2,
	Send,
	CheckCircle,
	CheckCircle2,
	AlertTriangle,
	AlertCircle,
	ChevronRight,
	Plus,
	Clock,
	Repeat,
	Briefcase,
	Download,
	Loader2,
	Mail,
	RefreshCw,
	RotateCcw,
	X,
} from "lucide-react";
import {
	useInvoiceByIdQuery,
	useUpdateInvoiceMutation,
	useDeleteInvoiceMutation,
	useCreateInvoicePaymentMutation,
	useDeleteInvoicePaymentMutation,
	useRecordRefundMutation,
} from "../../hooks/useInvoices";
import { useDisputesQuery } from "../../hooks/useDisputes";
import DisputeModal from "../../components/disputes/DisputeModal";
import type { AttributionTarget } from "../../components/disputes/adjustmentDraft";
import DisputeStage, { disputeActions } from "../../components/lifecycle/DisputeStage";
import type { Dispute, DisputeResolution } from "../../types/disputes";
import { downloadInvoicePdf, sendInvoice } from "../../api/invoices";
import SendDocumentModal from "../../components/ui/SendDocumentModal";
import FullPopup from "../../components/ui/FullPopup";
import ReasonField from "../../components/ui/ReasonField";
import LifecycleBar from "../../components/lifecycle/LifecycleBar";
import TerminalDetail from "../../components/lifecycle/TerminalDetail";
import { invoiceActions } from "../../components/lifecycle/invoiceActions";
import { splitActions } from "../../components/lifecycle/overflow";
import type { LifecycleStage } from "../../components/lifecycle/types";
import DocumentDetailHeader, {
	type DocumentMenuGroup,
} from "../../components/documents/DocumentDetailHeader";
import DocumentTabs, { type DocumentTabDef } from "../../components/documents/DocumentTabs";
import DocumentStatRow from "../../components/documents/DocumentStatRow";
import DocumentLineage, { HEADER_PILL } from "../../components/documents/DocumentLineage";
import { useDocumentTab } from "../../components/documents/useDocumentTab";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import InvoiceNoteManager from "../../components/invoices/InvoiceNoteManager";
import EditInvoice from "../../components/invoices/EditInvoice";
import {
	InvoiceStatusColors,
	InvoiceStatusLabels,
	PaymentMethodLabels,
	type InvoiceStatus,
	type PaymentMethod,
	type Invoice,
	type InvoiceLineItem,
	isOverdue,
	isEditable,
	isDeletable,
	getPaymentProgress,
	type CreateInvoicePaymentInput,
	type RecordRefundInput,
} from "../../types/invoices";
import { daysUntil, errorMessage, formatCurrency, formatDate } from "../../util/util";
import { usePermission } from "../../hooks/usePermission";
import { formatRatePercentLabel } from "../../lib/formatTax";
import type { TaxSnapshotRate } from "../../types/tax";
import { 
	useQBStatusQuery, 
	useQBInvoiceSyncMutation, 
	useQBInvoiceEmailMutation
} from "../../hooks/useQuickbooks";
import ChangeHistory from "../../components/activity/ChangeHistory";
import LifecycleRecord from "../../components/lifecycle/LifecycleRecord";
import DocumentActivityPanel from "../../components/documents/DocumentActivityPanel";

// The same two tabs as QUOTE_TABS, in the same order. Payments briefly had a
// third of its own and could not fill it — one ~190px card alone on the page —
// so it went back to the Overview rail, where its weight is what balances the
// rail against the Details + Line Items column.
// Line items stay in Overview: they are what a dispatcher opens the document to
// read. Activity absorbs the notes, dispute record and change history that used
// to sit three scrolls below the money.
const INVOICE_TABS: readonly DocumentTabDef<"overview" | "activity">[] = [
	{ id: "overview", label: "Overview" },
	{ id: "activity", label: "Activity" },
];

// ── Local helpers ─────────────────────────────────────────────────────────────

const formatDateTime =(val: string | Date | null | undefined): string => {
	if (!val) return "─";
	return new Date(val).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

/** Line items on an invoice may carry source attribution fields. */
interface InvoiceLineItemWithSource extends InvoiceLineItem {
	source_job_id?: string | null;
	source_visit_id?: string | null;
}

/** Collapsed per-rate tax entry used in the totals section. */
interface CollapsedRate {
	id: string;
	name: string;
	rate: number;
	amountCents: number;
}

/** Strongly-typed shape for a job group used when rendering the linked section. */
interface LinkedJobGroup {
	jobId: string;
	jobNumber: string;
	jobName: string;
	/** Present when the job is directly linked (invoice.jobs). Absent when only referenced via a visit. */
	billedAmount: number | null;
	isDirectlyLinked: boolean;
	visits: Array<{
		visitId: string;
		scheduledStartAt: string | Date;
		billedAmount: number;
		jobId: string;
	}>;
}

/** Build the grouped job+visit structure from an invoice. No any, no casts. */
function buildLinkedJobGroups(invoice: Invoice): LinkedJobGroup[] {
	const groupMap = new Map<string, LinkedJobGroup>();

	for (const ij of invoice.jobs ?? []) {
		if (!groupMap.has(ij.job_id)) {
			groupMap.set(ij.job_id, {
				jobId: ij.job_id,
				jobNumber: ij.job.job_number,
				jobName: ij.job.name,
				billedAmount:
					ij.billed_amount != null ? Number(ij.billed_amount) : null,
				isDirectlyLinked: true,
				visits: [],
			});
		}
	}

	for (const iv of invoice.visits ?? []) {
		const parentId = iv.visit.job.id;
		if (!groupMap.has(parentId)) {
			groupMap.set(parentId, {
				jobId: parentId,
				jobNumber: iv.visit.job.job_number,
				jobName: iv.visit.job.name,
				billedAmount: null,
				isDirectlyLinked: false,
				visits: [],
			});
		}
		groupMap.get(parentId)!.visits.push({
			visitId: iv.visit_id,
			scheduledStartAt: iv.visit.scheduled_start_at,
			billedAmount: Number(iv.billed_amount ?? 0),
			jobId: parentId,
		});
	}

	return Array.from(groupMap.values());
}

// ── Component ─────────────────────────────────────────────────────────────────

const NO_DISPUTES: Dispute[] = [];

export default function InvoiceDetailPage() {
	const { invoiceId: invoiceIdParam, id: idParam } = useParams<{
		invoiceId?: string;
		id?: string;
	}>();
	const invoiceId = invoiceIdParam ?? idParam;
	const navigate = useNavigate();

	const { data: invoice, isLoading } = useInvoiceByIdQuery(invoiceId!);
	const { mutateAsync: updateInvoice, isPending: isUpdatingInvoice } =
		useUpdateInvoiceMutation();
	const { mutateAsync: deleteInvoice, isPending: isDeleting } = useDeleteInvoiceMutation();
	const { mutateAsync: recordPayment, isPending: isRecordingPayment } =
		useCreateInvoicePaymentMutation();
	const { mutateAsync: deletePayment } = useDeleteInvoicePaymentMutation();
	const { mutateAsync: recordRefund, isPending: isRecordingRefund } =
		useRecordRefundMutation();

	// isError matters here: a failed fetch defaults `disputes` to [], which is
	// indistinguishable from "no dispute" — and the dispute banner, the Open
	// Dispute entry and the refund affordance all key off openDispute. Unknown
	// is not the same as absent, so the money actions close until we know.
	const { data: disputeList, isError: disputeStateUnknown } = useDisputesQuery(
		"invoice",
		invoiceId ?? "",
	);
	const disputes = disputeList?.disputes ?? NO_DISPUTES;
	const openDispute = disputes.find((d) => d.status === "Open") ?? null;
	// Every dispute, not just the open one: a resolved record is still the
	// explanation for what happened to these lines. Built once as a Set rather
	// than an includes() per row over a per-dispute array.
	const contestedIds = useMemo(
		() =>
			new Set(
				(disputes ?? []).flatMap(
					(d) => d.contested_line_item_ids?.map((c) => c.id) ?? [],
				),
			),
		[disputes],
	);

	const [activeTab, setActiveTab] = useDocumentTab(INVOICE_TABS);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	// Refused status/delete/payment-delete writes used to end in console.error
	// and read as dead buttons; this is the quote page's `actionError`, rendered
	// under the lifecycle bar (DW-29).
	const [actionError, setActionError] = useState<string | null>(null);
	// The record-payment modal's own refusal line, the shape handleVoid uses:
	// the modal stays open so the dispatcher can read it and retry (DW-14).
	const [paymentError, setPaymentError] = useState<string | null>(null);
	const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isPdfLoading, setIsPdfLoading] = useState(false);
	const [isSendModalOpen, setIsSendModalOpen] = useState(false);
	const [paymentForm, setPaymentForm] = useState<CreateInvoicePaymentInput>({
		amount: 0,
		method: undefined,
		note: "",
	});
	const [disputeModalMode, setDisputeModalMode] = useState<"open" | "resolve" | null>(
		null,
	);
	// The outcome picked in the lifecycle bar, handed to the resolve modal so it
	// opens on that choice instead of asking again.
	const [resolveOutcome, setResolveOutcome] = useState<DisputeResolution | undefined>(
		undefined,
	);
	const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
	const [refundForm, setRefundForm] = useState<RecordRefundInput>({
		amount: 0,
		reason: "",
		method: undefined,
	});
	const [refundError, setRefundError] = useState<string | null>(null);
	const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
	const [voidReason, setVoidReason] = useState("");
	const [voidError, setVoidError] = useState<string | null>(null);

	//permissions
	const EDIT_INVOICE = usePermission("edit_invoices");
	const DELETE_INVOICE = usePermission("delete_invoices");
	const REFUND_INVOICE = usePermission("refund_invoices");
	const OPEN_DISPUTE = usePermission("open_disputes");

	const { data: qbStatus } = useQBStatusQuery();
	const { mutate: syncToQB, isPending: isSyncingQB } = useQBInvoiceSyncMutation();

	const sendEmailMutation = useQBInvoiceEmailMutation();
	const primaryEmail = invoice?.client?.contacts?.find(c => c.is_primary)?.contact?.email;

	// The click-outside listener and the menu-open state moved into
	// DocumentDetailHeader, which owns the page's one kebab. Disarming the
	// two-step delete on close arrives back here through onMenuClose.

	// ── Handlers ──────────────────────────────────────────────────────────────

	const handleDelete = async () => {
		if (!DELETE_INVOICE) return;
		if (!invoiceId || !invoice) return;
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		setActionError(null);
		try {
			await deleteInvoice({ id: invoiceId, clientId: invoice.client_id });
			navigate("/dispatch/invoices");
		} catch (error) {
			setActionError(errorMessage(error, "Couldn't delete this invoice."));
		}
	};

	const handleStatusTransition = async (newStatus: InvoiceStatus) => {
		if (!EDIT_INVOICE) return;
		if (!invoiceId) return;
		setActionError(null);
		try {
			await updateInvoice({ id: invoiceId, updates: { status: newStatus } });
		} catch (error) {
			// New refusals reach here now — the open-dispute lock, the pre-email
			// transition guard. The server's sentence is the point.
			setActionError(errorMessage(error, "Couldn't update this invoice."));
		}
	};

	const openVoidModal = () => {
		if (!EDIT_INVOICE) return;
		setVoidReason("");
		setVoidError(null);
		setIsVoidModalOpen(true);
	};

	const closeVoidModal = () => {
		setVoidReason("");
		setVoidError(null);
		setIsVoidModalOpen(false);
	};

	const handleVoid = async () => {
		if (!EDIT_INVOICE || !invoiceId) return;
		if (!voidReason.trim()) {
			setVoidError("A reason is required to void an invoice.");
			return;
		}
		setVoidError(null);
		try {
			await updateInvoice({
				id: invoiceId,
				updates: { status: "Void", void_reason: voidReason.trim() },
			});
			closeVoidModal();
		} catch (error) {
			// The server owns the money rule — a partially-paid or adjusted
			// invoice is refused here — so its sentence (on the response
			// envelope, not AxiosError.message) is what the dispatcher reads.
			setVoidError(errorMessage(error, "Failed to void this invoice."));
		}
	};

	const resetPaymentForm = useCallback(() => {
		setPaymentForm({ amount: 0, method: undefined, note: "" });
	}, []);

	const openPaymentModal = useCallback(() => {
		if (!EDIT_INVOICE) return;
		resetPaymentForm();
		setPaymentError(null);
		setIsPaymentModalOpen(true);
	}, [resetPaymentForm]);

	const closePaymentModal = useCallback(() => {
		resetPaymentForm();
		setPaymentError(null);
		setIsPaymentModalOpen(false);
	}, [resetPaymentForm]);

	const handleRecordPayment = async () => {
		if (!invoiceId || !paymentForm.amount) return;
		setPaymentError(null);
		try {
			await recordPayment({ invoiceId, data: paymentForm });
			closePaymentModal();
		} catch (error) {
			// Kept open on failure: the server owns the ceiling and the
			// status rule, and a swallowed 4xx here left the day's cash short
			// with nothing on screen (DW-14).
			setPaymentError(errorMessage(error, "Couldn't record this payment."));
		}
	};

	const openRefundModal = () => {
		// A refund is cash out — refund_invoices, the same grant the bar's
		// Refund action and the /refund route gate on. It used to check
		// edit_invoices, so the bar could offer a refund the modal then
		// swallowed (DW-13).
		if (!REFUND_INVOICE) return;
		setRefundForm({ amount: 0, reason: "", method: undefined });
		setRefundError(null);
		setIsRefundModalOpen(true);
	};

	const closeRefundModal = () => {
		setRefundForm({ amount: 0, reason: "", method: undefined });
		setRefundError(null);
		setIsRefundModalOpen(false);
	};

	/**
	 * Recording a refund does not move money — the card or bank action happens
	 * with the payment provider. The ceiling is enforced server-side, so the
	 * 422 message (which names the refundable amount) is surfaced verbatim.
	 */
	const handleRecordRefund = async () => {
		if (!invoiceId) return;
		if (!refundForm.amount || refundForm.reason.trim() === "") return;
		setRefundError(null);
		try {
			await recordRefund({
				invoiceId,
				data: { ...refundForm, reason: refundForm.reason.trim() },
			});
			closeRefundModal();
		} catch (error) {
			setRefundError(errorMessage(error, "Failed to record refund."));
		}
	};

	const handleDeletePayment = async (paymentId: string) => {
		if (!invoiceId) return;
		if (!confirm("Remove this payment? This will recalculate the invoice balance."))
			return;
		setActionError(null);
		try {
			await deletePayment({ invoiceId, paymentId });
		} catch (error) {
			// Deleting a payment now needs refund_invoices; a 403 here read as
			// a dead button.
			setActionError(errorMessage(error, "Couldn't remove this payment."));
		}
	};

	const handleSendConfirm = async (email: string) => {
		await sendInvoice(invoiceId!, email);
	};

	const handleDownloadPdf = async () => {
		setIsPdfLoading(true);
		try {
			await downloadInvoicePdf(invoiceId!, invoice!.invoice_number);
		} catch (error) {
			console.error("Failed to download PDF:", error);
		} finally {
			setIsPdfLoading(false);
		}
	};

	// Map group name -> individual rates array for line item tax badge + totals section
	// Must be above early returns ─ useMemo must not be called conditionally
	const groupRatesMap = useMemo(() => {
		const map = new Map<string, TaxSnapshotRate[]>();
		for (const group of invoice?.tax_snapshot?.groups ?? []) {
			if ((group.rates ?? []).length > 0) map.set(group.name, group.rates);
		}
		return map;
	}, [invoice?.tax_snapshot]);

	// Per-rate totals from snapshot; deduplicate by rate ID, sum amounts, drop group names.
	const collapsedTaxRates = useMemo((): CollapsedRate[] => {
		if (!invoice?.tax_snapshot) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const group of invoice.tax_snapshot.groups ?? []) {
			for (const rate of group.rates ?? []) {
				const cents = Math.round(rate.rate * (group.taxable_amount_cents ?? 0));
				const entry = rateMap.get(rate.id);
				if (entry) {
					entry.amountCents += cents;
				} else {
					rateMap.set(rate.id, { id: rate.id, name: rate.name, rate: rate.rate, amountCents: cents });
				}
			}
		}
		return [...rateMap.values()];
	}, [invoice?.tax_snapshot]);

	// Fallback: derive per-rate totals from line items when no snapshot exists.
	const lineItemCollapsedRates = useMemo((): CollapsedRate[] => {
		if (collapsedTaxRates.length > 0) return [];
		const rateMap = new Map<string, CollapsedRate>();
		for (const item of (invoice?.line_items ?? []) as InvoiceLineItemWithSource[]) {
			if (!item.taxable || item.tax_amount == null || !item.tax_group?.rates?.length) continue;
			const itemTaxCents = Math.round(Number(item.tax_amount) * 100);
			if (itemTaxCents === 0) continue;
			const combinedRate = item.tax_group.rates.reduce((s, r) => s + r.tax_rate.rate, 0);
			if (combinedRate === 0) continue;
			for (const r of item.tax_group.rates) {
				const share = Math.round(itemTaxCents * (r.tax_rate.rate / combinedRate));
				const existing = rateMap.get(r.tax_rate.id);
				if (existing) {
					existing.amountCents += share;
				} else {
					rateMap.set(r.tax_rate.id, {
						id: r.tax_rate.id,
						name: r.tax_rate.name,
						rate: r.tax_rate.rate,
						amountCents: share,
					});
				}
			}
		}
		return [...rateMap.values()];
	}, [collapsedTaxRates, invoice?.line_items]);

	// ── Guards ────────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Loading invoice...</div>
			</div>
		);
	}

	if (!invoice) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Invoice not found</div>
			</div>
		);
	}

	// ── Derived values ────────────────────────────────────────────────────────

	const overdue = isOverdue(invoice);
	const editable = isEditable(invoice.status);
	const deletable = isDeletable(invoice.status);
	const paymentProgress = getPaymentProgress(invoice);

	const lineItems = (invoice.line_items ?? []) as InvoiceLineItemWithSource[];
	const payments = invoice.payments ?? [];
	const total = Number(invoice.total ?? 0);
	const amountPaid = Number(invoice.amount_paid ?? 0);
	const balanceDue = Number(invoice.balance_due ?? 0);

	const linkedJobGroups = buildLinkedJobGroups(invoice);

	// The jobs and visits this invoice bills — where an Issue Adjustment credit
	// can land. The resolve modal shows a picker over these when there is more
	// than one; the server attributes silently for one, refuses for none (D4).
	const adjustmentTargets: AttributionTarget[] = [
		...(invoice.jobs ?? []).map((ij) => ({
			kind: "job" as const,
			id: ij.job_id,
			label: `${ij.job.job_number} · ${ij.job.name}`,
		})),
		...(invoice.visits ?? []).map((iv) => ({
			kind: "visit" as const,
			id: iv.visit_id,
			jobId: iv.visit.job.id,
			label: `Visit ${formatDate(iv.visit.scheduled_start_at)} · ${iv.visit.job.job_number}`,
		})),
	];

	// A refund is bounded by what was actually paid; the exact ceiling is
	// re-checked server-side under a row lock.
	const refundAmountValid =
		refundForm.amount > 0 && refundForm.amount <= amountPaid;

	// ── QuickBooks sync state (shared by header badge + toolbar action + menu) ──
	const qbConnected = !!qbStatus?.connected;
	const qbInThisRealm =
		qbConnected && !!invoice.account_id && invoice.account_id === qbStatus?.realmId;
	const qbSynced = qbInThisRealm && invoice.qb_sync_status === "synced";
	const qbFailed = qbInThisRealm && invoice.qb_sync_status === "failed";
	const qbHasRemote = qbInThisRealm && !!invoice.qb_invoice_id;

	const qbActionLabel = qbFailed
		? "Retry sync"
		: qbHasRemote
			? "Update in QuickBooks"
			: "Sync to QuickBooks";
	const qbActionTitle = qbHasRemote
		? `Sync your latest changes to QuickBooks invoice #${invoice.qb_invoice_id}`
		: "Create this invoice in QuickBooks Online (one-way sync — nothing is pulled back)";
	// Not on a Void invoice: a dispute void deliberately leaves qb_sync_status
	// "not_synced", and pushInvoice now refuses a Void — so a live Sync button
	// next to the Void badge could only push a dead document (DW-09).
	const qbShowAction = qbConnected && !qbSynced && invoice.status !== "Void";
	const qbCanSendVia = qbConnected && (qbSynced || qbHasRemote);

	const qbBadge = qbSynced
		? {
				cls: "bg-success-bg text-success-bright-text border-success-border",
				Icon: CheckCircle2,
				text: "In QuickBooks",
				title: `Synced to QuickBooks invoice #${invoice.qb_invoice_id}`,
			}
		: qbFailed
			? {
					cls: "bg-error/20 text-error-text border-error/30",
					Icon: AlertCircle,
					text: "Sync failed",
					title: "QuickBooks sync failed — use Retry sync",
				}
			: qbHasRemote
				? {
						cls: "bg-warning-bg text-warning-text border-warning-border",
						Icon: Clock,
						text: "Changes pending",
						title: `Edited since last sync — sync to update QuickBooks #${invoice.qb_invoice_id}`,
					}
				: {
						cls: "bg-neutral/20 text-text-tertiary border-border-strong/30",
						Icon: Clock,
						text: "Not in QuickBooks",
						title: "This invoice has not been pushed to QuickBooks yet",
					};
	const QbBadgeIcon = qbBadge.Icon;

	// Built once. The lifecycle bar swaps in the dispute outcomes while a
	// dispute is open, but the Payments card reads its Record / Refund buttons
	// off this list in every state, so the card and the bar can no longer
	// disagree about the same money act (DW-13, DW-14).
	const invoiceBarActions = invoiceActions({
		status: invoice.status,
		amountPaid,
		hasOpenDispute: Boolean(openDispute),
		disputeStateUnknown,
		openRefusal: disputeList?.open_refusal ?? null,
		voidRefusal: disputeList?.void_refusal ?? null,
		canEdit: EDIT_INVOICE,
		canOpenDispute: OPEN_DISPUTE,
		canRefund: REFUND_INVOICE,
		handlers: {
			send: () => setIsSendModalOpen(true),
			issue: () => handleStatusTransition("Issued"),
			recordPayment: openPaymentModal,
			refund: openRefundModal,
			dispute: () => setDisputeModalMode("open"),
			void: openVoidModal,
		},
	});
	const recordPaymentAction = invoiceBarActions.find((a) => a.id === "recordPayment");
	const refundAction = invoiceBarActions.find((a) => a.id === "refund");

	// While a dispute is open its exits ARE the lifecycle bar's actions — the
	// normal invoice actions are all gated off anyway, and the exits used to be
	// invisible until the resolve modal was already open. Record Payment rides
	// along: a payment against the undisputed portion is an endorsed path (D7),
	// and it lands in the overflow.
	const disputeBarActions = openDispute
		? [
				...disputeActions(
					"invoice",
					openDispute.outcomes ?? [],
					(outcome) => {
						setResolveOutcome(outcome);
						setDisputeModalMode("resolve");
					},
				),
				...(recordPaymentAction ? [recordPaymentAction] : []),
			]
		: null;

	// The dispute list failed to load while the invoice is still Disputed:
	// "normal" lights nothing in the stepper (indexOf("Disputed") === -1) and
	// "terminal" would claim a live dispute is finished. Same branch the quote
	// page takes (DW-45).
	const disputeUnknownWhileDisputed =
		disputeStateUnknown && invoice.status === "Disputed";

	// One stage value for the whole page: the bar renders it, splitActions keys
	// the slot rule off it, and the kebab's Lifecycle group is the other half of
	// that same split.
	const lifecycleStage: LifecycleStage =
		openDispute || disputeUnknownWhileDisputed
			? "dispute"
			: invoice.status === "Void"
				? "terminal"
				: "normal";

	const lifecycleActionList = disputeBarActions ?? invoiceBarActions;

	// The bar renders the inline share; this is the remainder, and it is the
	// only reason the kebab carries a Lifecycle group at all.
	const { overflow: lifecycleOverflow } = splitActions(lifecycleStage, lifecycleActionList);

	// isEditable and isDeletable are both "Draft only", so the copy says that
	// rather than naming the current status — and the delete reason stops
	// telling an already-void invoice to void itself.
	const editBlockedReason = !EDIT_INVOICE
		? "You don't have permission to perform this action"
		: !editable
			? "Only a draft invoice can be edited. Issue an adjustment to correct a finalized one."
			: undefined;
	const deleteBlockedReason = deletable
		? undefined
		: invoice.status === "Void"
			? "Only a draft invoice can be deleted."
			: "Only a draft invoice can be deleted. Void this one instead to cancel it.";

	// One button, two labeled groups: lifecycle above, utility below. Spec 3.4's
	// distinction is now carried by the grouping rather than by a second kebab
	// an inch from the first, which is what made it unknowable which held what.
	const menuGroups: DocumentMenuGroup[] = [
		{
			id: "lifecycle",
			label: "Lifecycle",
			items: lifecycleOverflow.map((a) => ({
				id: a.id,
				label: a.label,
				// `primary` describes a button's fill, which a menu row has
				// none of; warning and destructive still colour their text.
				intent: a.intent === "primary" ? ("neutral" as const) : a.intent,
				disabled: a.disabled,
				disabledReason: a.disabledReason,
				onSelect: a.onSelect,
			})),
		},
		{
			id: "document",
			label: "Document",
			items: [
				{
					id: "edit",
					label: "Edit Invoice",
					icon: <Edit2 size={16} />,
					// Disabled with its reason rather than omitted: a
					// dispatcher who sees why an action is closed learns the
					// rule, one who sees a shorter menu learns nothing.
					disabled: editBlockedReason != null,
					disabledReason: editBlockedReason,
					onSelect: () => setIsEditModalOpen(true),
				},
				{
					id: "pdf",
					label: isPdfLoading ? "Generating..." : "Download PDF",
					icon: isPdfLoading ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<Download size={16} />
					),
					disabled: isPdfLoading,
					onSelect: handleDownloadPdf,
				},
				// Absent, not disabled: without a QuickBooks connection this
				// is not a closed door on this invoice, it is a door the org
				// has not installed.
				...(qbCanSendVia
					? [
							{
								id: "qb-email",
								label: "Send via QuickBooks",
								icon: sendEmailMutation.isPending ? (
									<Loader2
										size={16}
										className="animate-spin"
									/>
								) : (
									<Mail size={16} />
								),
								disabled:
									sendEmailMutation.isPending ||
									!primaryEmail,
								disabledReason: !primaryEmail
									? "No primary contact email on file for this client."
									: undefined,
								onSelect: () =>
									sendEmailMutation.mutate({
										invoiceId: invoice.id,
										sendTo: primaryEmail ?? "",
									}),
							},
						]
					: []),
				...(DELETE_INVOICE
					? [
							{
								id: "delete",
								label: isDeleting
									? "Deleting..."
									: deleteConfirm
										? "Click Again to Confirm"
										: "Delete Invoice",
								icon: <Trash2 size={16} />,
								intent: "destructive" as const,
								disabled: isDeleting || !deletable,
								disabledReason: deleteBlockedReason,
								// The first click only arms the second, so
								// the menu has to survive it.
								keepOpen: !deleteConfirm,
								onSelect: handleDelete,
							},
						]
					: []),
			],
		},
	];

	// Derived readings, not recorded fields — the Details card keeps the record.
	// This strip is also where the standalone Payment Progress band went: a bar
	// restating paid-of-total was the same three numbers the Line Items totals
	// already carry, given a whole row of the page to say them again.
	const lineItemCount = lineItems.length;
	const ageDays = -daysUntil(invoice.issue_date ?? invoice.created_at);
	const paidPct = Math.round(Math.min(1, paymentProgress) * 100);
	const statTiles = [
		{
			label: "Invoice Total",
			icon: <DollarSign size={13} />,
			value: formatCurrency(total),
			hint: `${lineItemCount} ${lineItemCount === 1 ? "line item" : "line items"}`,
		},
		{
			label: "Paid",
			icon: <CheckCircle size={13} />,
			value: formatCurrency(amountPaid),
			hint: (
				<>
					<span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface">
						<span
							className="block h-1.5 rounded-full bg-success transition-all duration-200 ease-out"
							style={{ width: `${paidPct}%` }}
						/>
					</span>
					<span className="mt-1 block">{paidPct}% of total</span>
				</>
			),
		},
		{
			label: "Balance Due",
			icon: <DollarSign size={13} />,
			value: formatCurrency(balanceDue),
			// State, not the due date: the date is a recorded field and the
			// Details card owns it.
			hint: balanceDue <= 0 ? "Settled" : overdue ? "Past due" : "Outstanding",
			tone: overdue && balanceDue > 0 ? ("error" as const) : undefined,
		},
		{
			label: "Age",
			icon: <Clock size={13} />,
			value: `${ageDays} ${ageDays === 1 ? "day" : "days"}`,
			hint: invoice.issue_date != null ? "since issued" : "since created",
		},
	];

	// Overview's blocks, built once and only PLACED by `overviewLayout` below, so
	// neither layout branch gets its own copy of a card to drift out of sync.
	const detailsCard = (
		<Card title="Invoice Details">
			{/* Date/terms ─ inline flex wrap, each field sizes to content */}
			<div className="flex flex-wrap gap-x-6 gap-y-3 mb-6">
				<div className="min-w-0">
					<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
						Created
					</p>
					<p className="text-text-primary text-sm flex items-center gap-1.5 whitespace-nowrap">
						<Calendar
							size={13}
							className="text-text-muted flex-shrink-0"
						/>
						{formatDate(
							invoice.created_at
						)}
					</p>
				</div>
				{invoice.status !== "Draft" &&
					invoice.issue_date != null && (
						<div className="min-w-0">
							<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
								Issue Date
							</p>
							<p className="text-text-primary text-sm flex items-center gap-1.5 whitespace-nowrap">
								<Calendar
									size={
										13
									}
									className="text-text-muted flex-shrink-0"
								/>
								{formatDate(
									invoice.issue_date
								)}
							</p>
						</div>
					)}
				{invoice.due_date != null && (
					<div className="min-w-0">
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
							Due Date
						</p>
						<p
							className={`text-sm flex items-center gap-1.5 whitespace-nowrap ${
								overdue
									? "text-error-text"
									: "text-text-primary"
							}`}
						>
							<Clock
								size={13}
								className={
									overdue
										? "text-error flex-shrink-0"
										: "text-text-muted flex-shrink-0"
								}
							/>
							{formatDate(
								invoice.due_date
							)}
							{overdue && (
								<span className="text-error-text font-medium ml-1">
									Overdue
								</span>
							)}
						</p>
					</div>
				)}
				{invoice.payment_terms_days != null && (
					<div className="min-w-0">
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
							Payment Terms
						</p>
						<p className="text-text-primary text-sm whitespace-nowrap">
							{invoice.payment_terms_days ===
							0
								? "Due on Receipt"
								: `Net ${invoice.payment_terms_days}`}
						</p>
					</div>
				)}
				{invoice.sent_at != null && (
					<div className="min-w-0">
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
							Sent
						</p>
						<p className="text-text-primary text-sm flex items-center gap-1.5 whitespace-nowrap">
							<Send
								size={13}
								className="text-text-muted flex-shrink-0"
							/>
							{formatDateTime(
								invoice.sent_at
							)}
						</p>
					</div>
				)}
				{invoice.paid_at != null && (
					<div className="min-w-0">
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
							Paid
						</p>
						<p className="text-text-primary text-sm flex items-center gap-1.5 whitespace-nowrap">
							<CheckCircle
								size={13}
								className="text-success flex-shrink-0"
							/>
							{formatDateTime(
								invoice.paid_at
							)}
						</p>
					</div>
				)}
				{invoice.void_reason != null && (
					<div className="w-full">
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-1">
							Void Reason
						</p>
						<p className="text-text-secondary text-sm italic break-words">
							{
								invoice.void_reason
							}
						</p>
					</div>
				)}
			</div>

			{invoice.internal_notes != null && (
				<div className="pt-4 border-t border-border-subtle">
					<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-2">
						Internal Notes
					</p>
					<p className="text-text-secondary text-sm break-words whitespace-pre-wrap">
						{invoice.internal_notes}
					</p>
				</div>
			)}
		</Card>
	);

	const lineItemsCard = (
		<Card title="Line Items">
			{lineItems.length === 0 ? (
				<div className="text-center py-8">
					<FileText
						size={40}
						className="mx-auto text-text-faint mb-3"
					/>
					<p className="text-text-tertiary text-sm">
						No line items
					</p>
				</div>
			) : (
				<div>
					{/* Header row */}
					<div className="grid grid-cols-12 gap-2 pb-2 border-b border-border text-xs uppercase tracking-wide font-semibold text-text-tertiary">
						<div className="col-span-5 min-w-0">
							Item / Description
						</div>
						<div className="col-span-2 min-w-0 text-center">
							Type
						</div>
						<div className="col-span-1 min-w-0 text-right">
							Qty
						</div>
						<div className="col-span-2 min-w-0 text-right">
							Unit Price
						</div>
						<div className="col-span-2 min-w-0 text-right">
							Amount
						</div>
					</div>
					{/* Data rows ─ items-start keeps numeric cols top-aligned when description wraps */}
					{lineItems.map((item, index) => {
						const sourceVisitId =
							item.source_visit_id;
						const sourceJobId =
							item.source_job_id;
						let sourceLabel:
							| string
							| null = null;
						let isVisitSource = false;

						if (sourceVisitId != null) {
							const iv = (
								invoice.visits ??
								[]
							).find(
								(v) =>
									v.visit_id ===
									sourceVisitId
							);
							if (iv != null) {
								sourceLabel = `${iv.visit.job.job_number} · Visit ${formatDate(iv.visit.scheduled_start_at)}`;
								isVisitSource = true;
							}
						} else if (
							sourceJobId != null
						) {
							const ij = (
								invoice.jobs ??
								[]
							).find(
								(j) =>
									j.job_id ===
									sourceJobId
							);
							if (ij != null) {
								sourceLabel = `${ij.job.job_number} · ${ij.job.name}`;
							}
						}

						const isContested =
							item.id != null &&
							contestedIds.has(
								item.id
							);

						return (
							<div
								key={
									item.id ??
									index
								}
								className={`border-b border-border-subtle hover:bg-surface/30 transition-colors${isContested ? " border-l-2 border-l-warning-border" : ""}`}
							>
								{/* Primary row ─ name + all numeric columns */}
								<div className="grid grid-cols-12 gap-2 pt-3 pb-1 items-center">
									<div className="col-span-5 min-w-0 text-sm">
										<p className="text-text-primary font-medium break-words">
											{
												item.name
											}
										</p>
										{isContested && (
											<span className="mt-0.5 inline-block text-xs font-medium text-warning-text">
												Contested
											</span>
										)}
									</div>
									<div className="col-span-2 min-w-0 flex justify-center">
										{item.item_type !=
											null && (
											<span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded text-xs font-medium bg-surface-raised text-text-secondary border border-border-strong">
												{
													item.item_type
												}
											</span>
										)}
									</div>
									<div className="col-span-1 min-w-0 text-right text-sm text-text-primary tabular-nums" title={String(item.quantity)}>
										{Number(
											item.quantity
										).toLocaleString(
											"en-US",
											{
												minimumFractionDigits: 0,
												maximumFractionDigits: 2,
											}
										)}
									</div>
									<div className="col-span-2 min-w-0 text-right text-sm text-text-primary tabular-nums">
										{formatCurrency(
											Number(
												item.unit_price
											)
										)}
									</div>
									<div className="col-span-2 min-w-0 text-right text-sm text-text-primary font-semibold tabular-nums">
										{formatCurrency(
											Number(
												item.total
											)
										)}
									</div>
								</div>
								{/* Sub-row ─ only renders when secondary content exists */}
								{((item.description != null && item.description !== "") ||
									sourceLabel != null ||
									item.tax_group?.name ||
									item.taxable === false) && (
									<div className="space-y-1 pb-2.5 min-w-0">
										{item.description != null && item.description !== "" && (
											<p className="text-xs text-text-tertiary leading-relaxed break-words">
												{item.description}
											</p>
										)}
										{(sourceLabel != null || item.tax_group?.name || item.taxable === false) && (
											<div className="flex flex-wrap items-center gap-1.5">
												{sourceLabel != null && (
													<span
														className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap leading-none ${
															isVisitSource
																? "bg-primary/10 text-primary-text border-primary/20"
																: "bg-surface-raised/60 text-text-tertiary border-border-strong/50"
														}`}
													>
														{isVisitSource ? (
															<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
																<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
																<circle cx="12" cy="10" r="3" />
															</svg>
														) : (
															<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
																<rect x="2" y="7" width="20" height="14" rx="2" />
																<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
															</svg>
														)}
														<span className="truncate">{sourceLabel}</span>
													</span>
												)}
												{item.tax_group?.name ? (
													<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-raised/60 border border-border-strong/50 text-[10px] font-medium text-text-muted whitespace-nowrap leading-none">
														{item.tax_group.name}
														{groupRatesMap.has(item.tax_group.name)
															? ` · ${groupRatesMap.get(item.tax_group.name)!
																.map(r => `${r.name} ${formatRatePercentLabel(r.rate)}`)
																.join(" + ")}`
															: ""}
													</span>
												) : (
													<span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-raised/40 border border-border-strong/30 text-[10px] text-text-faint whitespace-nowrap leading-none">
														No Tax
													</span>
												)}
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}

					{/* Totals */}
					<div className="mt-4 space-y-2 pt-2">
						{invoice.subtotal !=
							null && (
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">
									Subtotal
								</span>
								<span className="text-text-primary tabular-nums">
									{formatCurrency(
										Number(
											invoice.subtotal
										)
									)}
								</span>
							</div>
						)}
						{(() => {
							const rates = collapsedTaxRates.length > 0 ? collapsedTaxRates : lineItemCollapsedRates;
							const totalTaxCents = rates.reduce((s, r) => s + r.amountCents, 0);
							if (rates.length > 0) {
								return (
									<>
										{rates.map((rate) => (
											<div key={rate.id} className="flex justify-between text-sm">
												<span className="text-text-tertiary">
													{rate.name} ({formatRatePercentLabel(rate.rate)})
												</span>
												<span className="text-text-primary tabular-nums">
													{formatCurrency(rate.amountCents / 100)}
												</span>
											</div>
										))}
										{rates.length > 1 && (
											<div className="flex justify-between text-sm">
												<span className="text-text-tertiary font-medium">
													Total Tax
												</span>
												<span className="text-text-primary tabular-nums font-medium">
													{formatCurrency(totalTaxCents / 100)}
												</span>
											</div>
										)}
									</>
								);
							}
							if (invoice.tax_rate != null && Number(invoice.tax_rate) > 0) {
								return (
									<div className="flex justify-between text-sm">
										<span className="text-text-tertiary">
											Tax ({formatRatePercentLabel(Number(invoice.tax_rate))})
										</span>
										<span className="text-text-primary tabular-nums">
											{formatCurrency(Number(invoice.tax_amount ?? 0))}
										</span>
									</div>
								);
							}
							return null;
						})()}
						{invoice.discount_amount !=
							null &&
							Number(
								invoice.discount_amount
							) > 0 && (
								<div className="flex justify-between text-sm">
									<span className="text-text-tertiary">
										Discount
									</span>
									<span className="text-success-text tabular-nums">
										{"-"}{" "}
										{formatCurrency(
											Number(
												invoice.discount_amount
											)
										)}
									</span>
								</div>
							)}
						<div className="flex justify-between pt-2 border-t border-border">
							<span className="text-text-primary font-semibold">
								Total
							</span>
							<span className="text-text-primary font-bold text-lg tabular-nums">
								{formatCurrency(
									total
								)}
							</span>
						</div>
						{amountPaid > 0 && (
							<>
								<div className="flex justify-between text-sm">
									<span className="text-text-tertiary">
										Amount
										Paid
									</span>
									<span className="text-success-text tabular-nums">
										{"-"}{" "}
										{formatCurrency(
											amountPaid
										)}
									</span>
								</div>
								<div className="flex justify-between pt-2 border-t border-border">
									<span className="text-text-primary font-semibold">
										Balance
										Due
									</span>
									<span
										className={`font-bold text-lg tabular-nums ${
											balanceDue >
											0
												? overdue
													? "text-error-text"
													: "text-warning-text"
												: "text-success-text"
										}`}
									>
										{formatCurrency(
											balanceDue
										)}
									</span>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</Card>
	);

	const clientCard = (
		<ClientDetailsCard
			client_id={invoice.client_id}
			client={invoice.client}
		/>
	);

	// Record and Refund stay on this card's header, where spec §8 put them
	// deliberately. Both read the lifecycle bar's own action object now — the
	// same `disabled`/`disabledReason` the bar shows — so the card can't offer
	// a money act the bar refuses, or refuse one the bar offers (DW-13, DW-14).
	const paymentsCard = (
		<Card
			title="Payments"
			headerAction={
				recordPaymentAction || refundAction ? (
					<div className="flex items-center gap-2">
						{recordPaymentAction && (
							<button
								title={recordPaymentAction.disabledReason}
								disabled={recordPaymentAction.disabled}
								onClick={recordPaymentAction.onSelect}
								className="flex items-center gap-1.5 px-3 py-1.5 bg-payment hover:bg-payment-hover text-white rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								<Plus size={13} />
								Record
							</button>
						)}
						{refundAction && (
							<button
								title={
									refundAction.disabledReason ??
									"Record a refund against this invoice"
								}
								disabled={refundAction.disabled}
								onClick={refundAction.onSelect}
								className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:enabled:bg-surface-raised border border-border text-text-secondary rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								<RotateCcw size={13} />
								Refund
							</button>
						)}
					</div>
				) : undefined
			}
		>
			{payments.length === 0 ? (
				<div className="text-center py-6">
					<DollarSign
						size={32}
						className="mx-auto text-text-faint mb-2"
					/>
					<p className="text-text-muted text-sm">
						No payments recorded
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{payments.map((payment) => (
						<div
							key={payment.id}
							className="flex items-start justify-between gap-3 p-3 bg-surface/50 rounded-lg border border-border/50 group"
						>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span
										className={`font-semibold text-sm tabular-nums ${
											Number(
												payment.amount
											) < 0
												? "text-error-text"
												: "text-text-primary"
										}`}
									>
										{formatCurrency(
											Number(
												payment.amount
											)
										)}
									</span>
									{Number(
										payment.amount
									) < 0 && (
										<span className="text-xs px-1.5 py-0.5 bg-error/15 text-error-text rounded border border-error/30">
											Refund
										</span>
									)}
									{payment.method !=
										null && (
										<span className="text-xs px-1.5 py-0.5 bg-surface-raised text-text-secondary rounded border border-border-strong">
											{PaymentMethodLabels[
												payment
													.method
											] ??
												payment.method}
										</span>
									)}
								</div>
								<p className="text-text-muted text-xs mt-0.5">
									{formatDate(
										payment.paid_at
									)}
									{payment.recorded_by_dispatcher !=
										null && (
										<>
											{" "}
											·{" "}
											{
												payment
													.recorded_by_dispatcher
													.name
											}
										</>
									)}
									{payment.recorded_by_tech !=
										null && (
										<>
											{" "}
											·{" "}
											{
												payment
													.recorded_by_tech
													.name
											}{" "}
											(tech)
										</>
									)}
								</p>
								{payment.note !=
									null &&
									payment.note !==
										"" && (
										<p className="text-text-tertiary text-xs mt-1 italic break-words">
											{
												payment.note
											}
										</p>
									)}
							</div>
							<button
								onClick={() =>
									handleDeletePayment(
										payment.id
									)
								}
								className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error-text transition-all"
								title="Remove payment"
							>
								<Trash2
									size={
										13
									}
								/>
							</button>
						</div>
					))}
				</div>
			)}
		</Card>
	);

	const recurringPlanLink = (
		<>
			{invoice.recurring_plan != null && (
				<button
					onClick={() =>
						navigate(
							`/dispatch/recurring-plans/${invoice.recurring_plan!.id}`
						)
					}
					className="w-full p-3 bg-base hover:bg-surface rounded-lg border border-border/60 hover:border-primary/40 transition-all text-left group flex items-center gap-2"
				>
					<div className="flex-1 min-w-0">
						<p className="text-text-muted text-[10px] uppercase tracking-wide font-semibold mb-1.5">
							Recurring Plan
						</p>
						<div className="flex items-center gap-2 min-w-0">
							<Repeat
								size={13}
								className="text-primary-text flex-shrink-0"
							/>
							<span className="text-text-primary text-sm font-medium group-hover:text-primary-text transition-colors truncate">
								{
									invoice
										.recurring_plan
										.name
								}
							</span>
						</div>
					</div>
					<ChevronRight
						size={13}
						className="text-text-muted group-hover:text-primary-text transition-colors flex-shrink-0"
					/>
				</button>
			)}
		</>
	);

	const linkedJobsBand = (
		<>
			{linkedJobGroups.length > 0 && (
				<Card title="Linked Jobs &amp; Visits">
					<div className="flex flex-col gap-3">
						{linkedJobGroups.map((group) => (
							<div
								key={group.jobId}
								className="flex flex-wrap items-start gap-2"
							>
								{/* Job chip */}
								{group.isDirectlyLinked ? (
									<button
										onClick={() =>
											navigate(
												`/dispatch/jobs/${group.jobId}`
											)
										}
										className="inline-flex items-center gap-2 px-3 py-2 bg-surface/60 hover:bg-surface border border-border-strong/50 hover:border-text-tertiary rounded-lg transition-all text-left group flex-shrink-0"
									>
										<Briefcase
											size={13}
											className="text-text-tertiary flex-shrink-0 group-hover:text-primary-text transition-colors"
										/>
										<div className="flex flex-col justify-center min-h-[38px]">
											<p className="text-text-primary text-sm font-medium group-hover:text-primary-text transition-colors leading-tight whitespace-nowrap">
												{
													group.jobNumber
												}{" "}
												·{" "}
												{
													group.jobName
												}
											</p>
											{group.billedAmount !=
												null &&
												group.billedAmount >
													0 && (
													<p className="text-text-muted text-xs leading-tight mt-0.5 whitespace-nowrap">
														Billed{" "}
														{formatCurrency(
															group.billedAmount
														)}
													</p>
												)}
										</div>
										<ChevronRight
											size={13}
											className="text-text-muted group-hover:text-primary-text transition-colors flex-shrink-0"
										/>
									</button>
								) : (
									<span className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[54px] bg-surface/30 border border-border/40 rounded-lg text-text-tertiary text-sm flex-shrink-0">
										<Briefcase
											size={13}
											className="text-text-faint flex-shrink-0"
										/>
										{group.jobNumber} ·{" "}
										{group.jobName}
									</span>
								)}

								{/* Visit chips */}
								{group.visits.map((v) => (
									<button
										key={v.visitId}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${v.jobId}/visits/${v.visitId}`
											)
										}
										className="inline-flex items-center gap-2 px-3 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 rounded-lg transition-all text-left group flex-shrink-0"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											className="text-primary/60 flex-shrink-0 group-hover:text-primary-text transition-colors"
										>
											<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
											<circle
												cx="12"
												cy="10"
												r="3"
											/>
										</svg>
										<div className="flex flex-col justify-center min-h-[38px]">
											<p className="text-text-primary text-sm font-medium group-hover:text-primary-text transition-colors leading-tight whitespace-nowrap">
												Visit{" "}
												{formatDate(
													v.scheduledStartAt
												)}
											</p>
											{v.billedAmount >
												0 && (
												<p className="text-text-muted text-xs leading-tight mt-0.5 whitespace-nowrap">
													Billed{" "}
													{formatCurrency(
														v.billedAmount
													)}
												</p>
											)}
										</div>
										<ChevronRight
											size={13}
											className="text-primary/40 group-hover:text-primary-text transition-colors flex-shrink-0"
										/>
									</button>
								))}
							</div>
						))}
					</div>
				</Card>
			)}
		</>
	);

	// Two layouts, chosen by whether the main column has enough to stand beside
	// the client card — the same judgement the reference page's `overviewLayout`
	// makes, and for the same reason: an underfilled column is not fixed by
	// making it wider.
	//
	// The Details card is one wrap of recorded fields, ~150px, and on a fresh
	// draft it can come down to a single Created. Line Items is what carries the
	// main column past the client card, so when there are none the row has no
	// main column worth having: Details takes the full width its wrap can fill,
	// and the rail pairs against the line-items/linked-jobs stack below.
	//
	// The threshold survived Payments moving back into the rail. It was written
	// against a ~407px rail (client card alone) beside a 652px main column, and
	// the payments card closes most of that 245px gap rather than overrunning
	// it — so what tips this to "split" is still an empty main column, not a
	// heavy rail.
	const detailFieldCount = [
		invoice.created_at,
		invoice.status !== "Draft" ? invoice.issue_date : null,
		invoice.due_date,
		invoice.payment_terms_days,
		invoice.sent_at,
		invoice.paid_at,
		invoice.void_reason,
		invoice.internal_notes,
	].filter((v) => v != null).length;
	const overviewLayout: "rail" | "split" =
		lineItems.length === 0 && detailFieldCount <= 3 ? "split" : "rail";

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="text-text-primary pb-4 md:pb-6">
			{/* Header, lifecycle and the tab strip are one unit: a tight stack
			    closed by the strip's bottom border, rather than cards floating
			    at the same weight as the body below them. */}
			<div className="space-y-4">
				<DocumentDetailHeader
					title={invoice.invoice_number}
					badges={
						<>
							<DocumentLineage
								kind="invoice"
								lineage={invoice.lineage}
							/>
							{/* HEADER_PILL, not this badge's old smaller
							    geometry: the version pills beside it and the
							    status pill opposite it are both on the status
							    pill's line, and three heights in one row read
							    as an accident. */}
							{overdue && (
								<span
									className={`${HEADER_PILL} bg-error/20 text-error-text border-error/30`}
								>
									<AlertTriangle size={13} />
									Overdue
								</span>
							)}
							{qbConnected && (
								<span
									className={`${HEADER_PILL} ${qbBadge.cls}`}
									title={qbBadge.title}
								>
									<QbBadgeIcon size={13} />
									{qbBadge.text}
								</span>
							)}
						</>
					}
					meta={
						<>
							<span>
								{invoice.status === "Draft"
									? `Created ${formatDate(invoice.created_at)}`
									: `Issued ${formatDate(invoice.issue_date ?? invoice.created_at)}`}
								{invoice.due_date &&
									` · Due ${formatDate(invoice.due_date)}`}
							</span>
							{/* Its own line rather than crowding the title
							    row, where a two-line memo pushed the badges
							    onto a third. */}
							{invoice.memo && (
								<span
									className="mt-0.5 block text-text-secondary line-clamp-2 break-words"
									title={invoice.memo}
								>
									{invoice.memo}
								</span>
							)}
						</>
					}
					statusPill={
						/* The page's single status word. The bar no longer
						   repeats it, and the terminal stage carries the void
						   reason instead of the word "Void". */
						<span
							className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${
								InvoiceStatusColors[invoice.status]
							}`}
						>
							{InvoiceStatusLabels[invoice.status]}
						</span>
					}
					inlineActions={
						/* Earns a permanent slot rather than a menu row: it is
						   the one action whose *state* the header already
						   reports, in the badge beside it. */
						qbShowAction ? (
							<button
								onClick={() => syncToQB(invoiceId!)}
								disabled={isSyncingQB}
								title={qbActionTitle}
								className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-quickbooks hover:enabled:bg-quickbooks-hover text-white transition-colors duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
							>
								<RefreshCw
									size={14}
									className={
										isSyncingQB
											? "animate-spin"
											: undefined
									}
								/>
								{isSyncingQB ? "Syncing…" : qbActionLabel}
							</button>
						) : undefined
					}
					menuGroups={menuGroups}
					menuLabel="Invoice actions"
					onMenuClose={() => setDeleteConfirm(false)}
				/>

				<LifecycleBar
					kind="invoice"
					stage={lifecycleStage}
					currentStatus={invoice.status}
					actions={lifecycleActionList}
					detail={
						openDispute ? (
							<DisputeStage
								kind="invoice"
								dispute={openDispute}
								lineItems={lineItems}
							/>
						) : disputeUnknownWhileDisputed ? (
							<p className="text-sm text-warning-text">
								This invoice's dispute couldn't be loaded, so its
								status and exits aren't shown. Reload the page.
							</p>
						) : (
							<TerminalDetail
								reason={invoice.void_reason}
								at={invoice.voided_at}
								noReasonLabel="No reason recorded."
							/>
						)
					}
				/>

				{actionError && (
					<p className="text-sm text-error-text" role="alert">
						{actionError}
					</p>
				)}

				{/* Directly under the bar on BOTH pages. This used to sit
				    above the bar here and below it on the quote page, the kind
				    of drift criterion 9 exists to stop. */}
				{disputeStateUnknown && (
					<div className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
						<AlertTriangle size={16} className="flex-shrink-0" />
						<span>
							This invoice's dispute status couldn't be loaded,
							so dispute and refund actions are unavailable.
							Reload the page to try again.
						</span>
					</div>
				)}

				<DocumentTabs
					tabs={INVOICE_TABS}
					activeTab={activeTab}
					onSelect={setActiveTab}
					label="Invoice sections"
				/>
			</div>

			{activeTab === "overview" && (
				<div
					role="tabpanel"
					id="tabpanel-overview"
					aria-labelledby="tab-overview"
					className="mt-6 space-y-4"
				>
					<h2 className="sr-only">Overview</h2>
					<DocumentStatRow tiles={statTiles} />

					{overviewLayout === "rail" ? (
						<>
							{/* Details and Line Items share the main
							    column. Details is a single wrap of
							    fields — ~150px against a ~380px client
							    card — so on its own it left a dead
							    quarter of the page; the line items
							    under it carry the column past the
							    rail. */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
								<div className="lg:col-span-2 space-y-4">
									{detailsCard}
									{lineItemsCard}
								</div>
								<div className="lg:col-span-1 space-y-4">
									{clientCard}
									{recurringPlanLink}
									{paymentsCard}
								</div>
							</div>
							{linkedJobsBand}
						</>
					) : (
						<>
							{/* Nothing substantial for a main column to
							    hold, so Details takes the full width its
							    wrap can fill and the client card pairs
							    against the linked-jobs band. */}
							{detailsCard}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
								<div className="lg:col-span-2 space-y-4">
									{lineItemsCard}
									{linkedJobsBand}
								</div>
								<div className="lg:col-span-1 space-y-4">
									{clientCard}
									{recurringPlanLink}
									{paymentsCard}
								</div>
							</div>
						</>
					)}
				</div>
			)}

			{activeTab === "activity" && (
				<DocumentActivityPanel
					notes={<InvoiceNoteManager invoiceId={invoiceId!} />}
					lifecycle={<LifecycleRecord disputes={disputes} />}
					history={
						<ChangeHistory
							scope={{ kind: "entity", type: "invoice", id: invoiceId ?? "" }}
						/>
					}
				/>
			)}

			{/* Record Payment Modal */}
			{isPaymentModalOpen && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
					<div className="bg-base border border-border-subtle rounded-xl w-full max-w-md shadow-2xl">
						<div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
							<div className="flex flex-col">
								<h3 className="text-text-primary font-semibold text-base">
									Record Payment
								</h3>
								<span className="text-xs text-text-muted mt-0.5">
									Balance due:{" "}
									<span
										className={`font-semibold ${
											overdue
												? "text-error-text"
												: "text-warning-text"
										}`}
									>
										{formatCurrency(
											balanceDue
										)}
									</span>
								</span>
							</div>
							<button
								onClick={closePaymentModal}
								className="text-text-muted hover:text-text-primary transition-colors"
							>
								<X size={16} />
							</button>
						</div>

						<div className="px-5 py-5 space-y-3">
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-xs text-text-tertiary">
										Amount{" "}
										<span className="text-error-text">
											*
										</span>
									</label>
									<button
										type="button"
										onClick={() =>
											setPaymentForm(
												(
													f
												) => ({
													...f,
													amount: balanceDue,
												})
											)
										}
										className="text-xs text-primary-text hover:text-primary-text transition-colors"
									>
										Full
									</button>
								</div>
								<input
									placeholder="$0.00"
									type="number"
									min="0.01"
									step="0.01"
									value={
										paymentForm.amount ||
										""
									}
									onChange={(e) =>
										setPaymentForm(
											(f) => ({
												...f,
												amount:
													parseFloat(
														e
															.target
															.value
													) ||
													0,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Payment Method
								</label>
								<select
									value={
										paymentForm.method ??
										""
									}
									onChange={(e) => {
										const raw =
											e.target
												.value;
										const typed =
											raw ===
												"cash" ||
											raw ===
												"check" ||
											raw ===
												"card" ||
											raw ===
												"bank_transfer" ||
											raw ===
												"other"
												? (raw as PaymentMethod)
												: undefined;
										setPaymentForm(
											(f) => ({
												...f,
												method: typed,
											})
										);
									}}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								>
									<option value="">
										─ Select method ─
									</option>
									<option value="cash">
										Cash
									</option>
									<option value="check">
										Check
									</option>
									<option value="card">
										Card
									</option>
									<option value="bank_transfer">
										Bank Transfer
									</option>
									<option value="other">
										Other
									</option>
								</select>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Note
								</label>
								<input
									type="text"
									placeholder="e.g. Check #1234"
									value={
										paymentForm.note ??
										""
									}
									onChange={(e) =>
										setPaymentForm(
											(f) => ({
												...f,
												note: e
													.target
													.value,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							{paymentError != null && (
								<div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-md">
									<AlertTriangle
										size={14}
										className="text-error-text flex-shrink-0 mt-0.5"
									/>
									<p className="text-sm text-error-text">
										{paymentError}
									</p>
								</div>
							)}
						</div>

						<div className="flex gap-2 px-5 pb-5 pt-2">
							<button
								onClick={closePaymentModal}
								className="flex-1 px-4 py-2 bg-surface hover:bg-surface-raised border border-border rounded-md text-sm transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleRecordPayment}
								disabled={
									!paymentForm.amount ||
									isRecordingPayment
								}
								className="flex-1 px-4 py-2 bg-payment hover:bg-payment-hover text-white rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{isRecordingPayment
									? "Recording..."
									: "Record"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Record Refund Modal ─ recording only; the money moves elsewhere.
			    Built on FullPopup like DisputeModal and QuoteReasonModal rather
			    than a hand-rolled fixed overlay: FullPopup portals to body,
			    closes on Escape, and uses the app's z-[4000]/z-[5000] layers,
			    which a local z-50 loses to. */}
			<FullPopup
				isModalOpen={isRefundModalOpen}
				onClose={closeRefundModal}
				size="md"
				content={
					<div className="flex flex-col">
						<div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
							<div className="flex flex-col">
								<h3 className="text-text-primary font-semibold text-base">
									Record a refund
								</h3>
								<span className="text-xs text-text-muted mt-0.5">
									Up to{" "}
									<span className="font-semibold text-text-secondary">
										{formatCurrency(
											amountPaid
										)}
									</span>{" "}
									can be refunded
								</span>
							</div>
							<button
								onClick={closeRefundModal}
								className="text-text-muted hover:text-text-primary transition-colors"
							>
								<X size={16} />
							</button>
						</div>

						<div className="px-5 py-5 space-y-3">
							<div>
								<div className="flex items-center justify-between mb-1">
									<label className="text-xs text-text-tertiary">
										Amount{" "}
										<span className="text-error-text">
											*
										</span>
									</label>
									<button
										type="button"
										onClick={() =>
											setRefundForm(
												(
													f
												) => ({
													...f,
													amount: amountPaid,
												})
											)
										}
										className="text-xs text-primary-text hover:text-primary-text transition-colors"
									>
										Full
									</button>
								</div>
								<input
									placeholder="$0.00"
									type="number"
									min="0.01"
									step="0.01"
									max={amountPaid}
									value={
										refundForm.amount ||
										""
									}
									onChange={(e) =>
										setRefundForm(
											(f) => ({
												...f,
												amount:
													parseFloat(
														e
															.target
															.value
													) ||
													0,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								/>
								<p className="text-xs text-text-muted mt-1.5">
									This records the refund.
									Returning the money is done
									through your payment
									provider.
								</p>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Reason{" "}
									<span className="text-error-text">
										*
									</span>
								</label>
								<textarea
									rows={3}
									placeholder="Why is this being refunded?"
									value={refundForm.reason}
									onChange={(e) =>
										setRefundForm(
											(f) => ({
												...f,
												reason: e
													.target
													.value,
											})
										)
									}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-text-tertiary mb-1">
									Method
								</label>
								<select
									value={
										refundForm.method ??
										""
									}
									onChange={(e) => {
										const raw =
											e.target
												.value;
										const typed =
											raw ===
												"cash" ||
											raw ===
												"check" ||
											raw ===
												"card" ||
											raw ===
												"bank_transfer" ||
											raw ===
												"other"
												? (raw as PaymentMethod)
												: undefined;
										setRefundForm(
											(f) => ({
												...f,
												method: typed,
											})
										);
									}}
									className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
								>
									<option value="">
										─ Select method ─
									</option>
									<option value="cash">
										Cash
									</option>
									<option value="check">
										Check
									</option>
									<option value="card">
										Card
									</option>
									<option value="bank_transfer">
										Bank Transfer
									</option>
									<option value="other">
										Other
									</option>
								</select>
							</div>

							{refundError != null && (
								<div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-md">
									<AlertTriangle
										size={14}
										className="text-error-text flex-shrink-0 mt-0.5"
									/>
									<p className="text-sm text-error-text">
										{refundError}
									</p>
								</div>
							)}
						</div>

						<div className="flex gap-2 px-5 pb-5 pt-2">
							<button
								onClick={closeRefundModal}
								className="flex-1 px-4 py-2 bg-surface hover:bg-surface-raised border border-border rounded-md text-sm transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleRecordRefund}
								disabled={
									!refundAmountValid ||
									refundForm.reason.trim() ===
										"" ||
									isRecordingRefund
								}
								className="flex-1 px-4 py-2 bg-error hover:bg-error-strong text-on-primary rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{isRecordingRefund
									? "Recording..."
									: "Record Refund"}
							</button>
						</div>
					</div>
				}
			/>

			{/* Void Invoice Modal ─ the reason is required by the server and is
			    stamped on the invoice. On FullPopup for the same reason the
			    refund modal is, and it replaced a window.prompt() whose
			    refusal went to console.error and nowhere the dispatcher could
			    see it, so a blocked void looked like nothing happening. */}
			<FullPopup
				isModalOpen={isVoidModalOpen}
				onClose={closeVoidModal}
				size="md"
				content={
					<div className="flex flex-col">
						<div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
							<div className="flex flex-col">
								<h3 className="text-text-primary font-semibold text-base">
									Void this invoice
								</h3>
								<span className="text-xs text-text-muted mt-0.5">
									{invoice.invoice_number} stays on
									record, marked void with this
									reason.
								</span>
							</div>
							<button
								onClick={closeVoidModal}
								className="text-text-muted hover:text-text-primary transition-colors"
							>
								<X size={16} />
							</button>
						</div>

						<div className="px-5 py-5 space-y-3">
							<ReasonField
								value={voidReason}
								onChange={setVoidReason}
								placeholder="Why is this invoice being voided?"
								rows={3}
							/>

							{voidError != null && (
								<div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-md">
									<AlertTriangle
										size={14}
										className="text-error-text flex-shrink-0 mt-0.5"
									/>
									<p className="text-sm text-error-text">
										{voidError}
									</p>
								</div>
							)}
						</div>

						<div className="flex gap-2 px-5 pb-5 pt-2">
							<button
								onClick={closeVoidModal}
								className="flex-1 px-4 py-2 bg-surface hover:bg-surface-raised border border-border rounded-md text-sm transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleVoid}
								disabled={isUpdatingInvoice}
								className="flex-1 px-4 py-2 bg-error hover:bg-error-strong text-on-primary rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{isUpdatingInvoice
									? "Voiding..."
									: "Void Invoice"}
							</button>
						</div>
					</div>
				}
			/>

			{/* Edit Invoice Modal */}
			{editable && isEditModalOpen && (
				<EditInvoice
					isModalOpen={isEditModalOpen}
					setIsModalOpen={setIsEditModalOpen}
					invoice={invoice}
				/>
			)}

			<SendDocumentModal
				isOpen={isSendModalOpen}
				onClose={() => setIsSendModalOpen(false)}
				onSend={handleSendConfirm}
				docType="invoice"
				docNumber={invoice.invoice_number}
				clientName={invoice.client?.name ?? ""}
				contactEmail={invoice.client?.contacts?.[0]?.contact?.email}
				contactName={invoice.client?.contacts?.[0]?.contact?.name}
			/>

			{/* Always mounted so FullPopup's close fade can play — matching
			    every other FullPopup consumer in the app. */}
			<DisputeModal
				isOpen={disputeModalMode === "open"}
				kind="invoice"
				documentId={invoice.id}
				documentNumber={invoice.invoice_number}
				lineItems={lineItems}
				mode="open"
				onClose={() => setDisputeModalMode(null)}
			/>
			{/* Resolve is a separate mount, not a mode flip on the one above: a
			    DisputeModal stays mounted while closed so FullPopup can fade out,
			    and swapping `mode` mid-fade would repaint the body of a modal the
			    dispatcher is still watching close. */}
			<DisputeModal
				isOpen={disputeModalMode === "resolve"}
				kind="invoice"
				documentId={invoice.id}
				documentNumber={invoice.invoice_number}
				lineItems={lineItems}
				mode="resolve"
				dispute={openDispute}
				initialResolution={resolveOutcome}
				attributionTargets={adjustmentTargets}
				onClose={() => {
					setDisputeModalMode(null);
					setResolveOutcome(undefined);
				}}
			/>
		</div>
	);
}

