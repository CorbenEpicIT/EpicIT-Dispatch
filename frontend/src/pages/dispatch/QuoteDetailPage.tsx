import { useParams, useNavigate } from "react-router-dom";
import {
	Calendar,
	DollarSign,
	MapPin,
	Edit2,
	Briefcase,
	Trash2,
	Link2Off,
	Download,
	Loader2,
	AlertTriangle,
	Clock,
} from "lucide-react";
import {
	useQuoteByIdQuery,
	useUpdateQuoteMutation,
	useDeleteQuoteMutation,
	useSendQuoteMutation,
	useReviseQuoteMutation,
} from "../../hooks/useQuotes";
import { useCreateJobMutation } from "../../hooks/useJobs";
import { useDisputesQuery } from "../../hooks/useDisputes";
import { QuoteStatusColors, isQuoteEditable } from "../../types/quotes";
import type { QuoteStatus } from "../../types/quotes";
import LifecycleBar from "../../components/lifecycle/LifecycleBar";
import TerminalDetail from "../../components/lifecycle/TerminalDetail";
import { quoteActions } from "../../components/lifecycle/quoteActions";
import { splitActions } from "../../components/lifecycle/overflow";
import { isOffRamp } from "../../components/lifecycle/lifecycleSteps";
import type { LifecycleStage } from "../../components/lifecycle/types";
import DocumentDetailHeader, {
	type DocumentMenuGroup,
} from "../../components/documents/DocumentDetailHeader";
import DocumentTabs, { type DocumentTabDef } from "../../components/documents/DocumentTabs";
import DocumentStatRow from "../../components/documents/DocumentStatRow";
import DocumentLineage from "../../components/documents/DocumentLineage";
import { useDocumentTab } from "../../components/documents/useDocumentTab";
import Card from "../../components/ui/Card";
import ClientDetailsCard from "../../components/clients/ClientDetailsCard";
import EditQuote from "../../components/quotes/EditQuote";
import ConvertToJob from "../../components/quotes/ConvertToJob";
import NoteManager from "../../components/quotes/QuoteNoteManager";
import QuoteReasonModal from "../../components/quotes/QuoteReasonModal";
import DisputeModal from "../../components/disputes/DisputeModal";
import DisputeStage, { disputeActions } from "../../components/lifecycle/DisputeStage";
import type { Dispute, DisputeResolution } from "../../types/disputes";
import { useState, useMemo } from "react";
import { daysUntil, errorMessage, formatCurrency, formatDate } from "../../util/util";
import { downloadQuotePdf } from "../../api/quotes";
import FinancialSummary from "../../components/pagesections/FinancialSummary";
import SendDocumentModal from "../../components/ui/SendDocumentModal";
import { usePermission } from "../../hooks/usePermission";
import ChangeHistory from "../../components/activity/ChangeHistory";
import LifecycleRecord from "../../components/lifecycle/LifecycleRecord";
import DocumentActivityPanel from "../../components/documents/DocumentActivityPanel";


// Two tabs: line items are what a dispatcher opens a quote to read, so they
// stay in Overview. Activity absorbs the three stacked bands (notes, dispute
// record, change history) that used to sit three scrolls below the money. The
// invoice page carries this same pair — its payments live in the Overview
// rail, not in a tab of their own.
const QUOTE_TABS: readonly DocumentTabDef<"overview" | "activity">[] = [
	{ id: "overview", label: "Overview" },
	{ id: "activity", label: "Activity" },
];

// What the terminal stage says when no reason was recorded. Copy lives here
// rather than in TerminalDetail because only the page knows which end state it
// is explaining, and "no reason recorded" would be a lie for the two that have
// an implicit one.
const NO_REASON_COPY: Record<string, string> = {
	Expired: "Passed its valid-until date with no decision recorded.",
	Revised: "Superseded by a newer version of this quote.",
};

const NO_DISPUTES: Dispute[] = [];

export default function QuoteDetailPage() {
	const { quoteId } = useParams<{ quoteId: string }>();
	const navigate = useNavigate();
	const { data: quote, isLoading } = useQuoteByIdQuery(quoteId!);
	const { mutateAsync: updateQuote } = useUpdateQuoteMutation();
	const { mutateAsync: sendQuote } = useSendQuoteMutation();
	const { mutateAsync: createJob } = useCreateJobMutation();
	const { mutateAsync: reviseQuoteMutation, isPending: revisePending } =
		useReviseQuoteMutation();
	const deleteQuote = useDeleteQuoteMutation();

	const [activeTab, setActiveTab] = useDocumentTab(QUOTE_TABS);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isConvertToJobModalOpen, setIsConvertToJobModalOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [isPdfLoading, setIsPdfLoading] = useState(false);
	const [isSendModalOpen, setIsSendModalOpen] = useState(false);
	const [disputeModalMode, setDisputeModalMode] = useState<"open" | "resolve" | null>(
		null,
	);
	// The outcome picked in the lifecycle bar, handed to the resolve modal so it
	// opens on that choice instead of asking again.
	const [resolveOutcome, setResolveOutcome] = useState<DisputeResolution | undefined>(
		undefined,
	);
	const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	// permissions
	const EDIT_QUOTE = usePermission("edit_quotes");
	const DELETE_QUOTE = usePermission("delete_quotes");
	const CREATE_JOB = usePermission("create_jobs");
	const OPEN_DISPUTE = usePermission("open_disputes");
	//const SEND_QUOTE = usePermission(""); No dedicated send quote permission, will consider how to handle this later

	const { data: disputeList, isError: disputeStateUnknown } = useDisputesQuery(
		"quote",
		quoteId ?? "",
	);
	const disputes = disputeList?.disputes ?? NO_DISPUTES;
	// A failed fetch defaults `disputes` to [], which is indistinguishable from
	// "no dispute" — and every gate below keys off openDispute. Unknown is not
	// the same as absent, so the irreversible paths close until we know.
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

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Loading quote details...</div>
			</div>
		);
	}

	if (!quote) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-text-primary text-lg">Quote not found</div>
			</div>
		);
	}

	const getStatusColor = (status: string) =>
		QuoteStatusColors[status as QuoteStatus] ||
		"bg-neutral/20 text-text-tertiary border-border-strong/30";

	// The expiry sweep runs periodically, so the stored status can lag reality
	// between runs — show the true state regardless of what's persisted.
	const isEffectivelyExpired =
		quote.expires_at != null &&
		new Date(quote.expires_at).getTime() < Date.now() &&
		(quote.status === "Issued" || quote.status === "Sent" || quote.status === "Viewed");

	// One derived status feeds the whole bar — stage, stepper and gating alike.
	// Splitting them would put an effectively-expired quote on the normal stage
	// while its step name is Expired, and QUOTE_STEPS has no Expired node, so
	// the stepper would render with nothing lit at all.
	const lifecycleStatus: QuoteStatus = isEffectivelyExpired ? "Expired" : quote.status;

	const handleEdit = () => {
		if (!EDIT_QUOTE) return;
		setIsEditModalOpen(true);
	};
	const handleSendToClient = () => { // no specific permissions yet
		setIsSendModalOpen(true);
	};

	const handleSendConfirm = async (email: string) => {
		await sendQuote({ id: quote.id, recipientEmail: email });
	};
	const handleMarkAsIssued = async () => {
		if (!EDIT_QUOTE) return;
		setActionError(null);
		try {
			await updateQuote({ id: quote.id, data: { status: "Issued" } });
		} catch (error) {
			// These doors now hit real refusals (an open-dispute lock, a
			// terminal-quote immutability). A swallowed refusal reads as a dead
			// button; the server's sentence is what the dispatcher needs.
			setActionError(errorMessage(error, "Couldn't mark this quote as issued."));
		}
	};

	const handleMarkAsApproved = async () => {
		if (!EDIT_QUOTE) return;
		setActionError(null);
		try {
			await updateQuote({ id: quote.id, data: { status: "Approved" } });
		} catch (error) {
			setActionError(errorMessage(error, "Couldn't mark this quote as approved."));
		}
	};
	// Both entry points (the lifecycle bar and the Related-Job card) gate on the
	// one `convert` action built by quoteActions — jobsController writes the
	// quote to Approved with no transition guard, so the sold-work / disputed /
	// dead-quote rules in that action are the whole client-side defence, and a
	// second hand-written copy here is exactly what let the card bill sold work
	// twice (DW-04).
	const handleConvertToJob = () => {
		setIsConvertToJobModalOpen(true);
	};

	const handleMarkAsRejected = () => {
		if (!EDIT_QUOTE) return;
		setIsRejectModalOpen(true);
	};

	const handleCancelQuote = () => {
		if (!EDIT_QUOTE) return;
		setIsCancelModalOpen(true);
	};

	const handleCreateRevision = async () => {
		setActionError(null);
		try {
			const replacement = await reviseQuoteMutation({ id: quote.id });
			navigate(`/dispatch/quotes/${replacement.id}`);
		} catch (error) {
			// Surfaced, not swallowed: the server owns which statuses may be
			// revised and its message (on the response envelope, not
			// AxiosError.message) names them.
			setActionError(errorMessage(error, "Failed to create a revision."));
		}
	};

	const handleDownloadPdf = async () => {
		setIsPdfLoading(true);
		try {
			await downloadQuotePdf(quote.id, quote.quote_number);
		} catch (error) {
			console.error("Failed to download PDF:", error);
		} finally {
			setIsPdfLoading(false);
		}
	};

	const handleDelete = async () => {
		if (!DELETE_QUOTE) return;
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			await deleteQuote.mutateAsync({ id: quote.id, hardDelete: false });
			navigate("/dispatch/quotes");
		} catch (error) {
			// Surfaces the D6 refusal: a quote produced by a dispute resolution
			// is audit trail and can only be cancelled, not deleted.
			setActionError(errorMessage(error, "Couldn't delete this quote."));
		}
	};

	// While a dispute is open its three exits ARE the lifecycle bar's actions —
	// the normal quote actions are all gated off anyway, and the exits used to be
	// invisible until the resolve modal was already open.
	const disputeBarActions = openDispute
		? disputeActions(
				"quote",
				openDispute.outcomes ?? [],
				(outcome) => {
					setResolveOutcome(outcome);
					setDisputeModalMode("resolve");
				},
			)
		: null;

	// The dispute list failed to load while the document is still Disputed:
	// neither "terminal" (isOffRamp counts Disputed as an off-ramp, so the bar
	// renders "No reason recorded.") nor "normal" (the stepper lights nothing)
	// tells the truth. Both pages take the same branch (DW-45).
	const disputeUnknownWhileDisputed =
		disputeStateUnknown && lifecycleStatus === "Disputed";

	// One stage value for the whole page: the bar renders it, splitActions keys
	// the slot rule off it, and the kebab's Lifecycle group is the other half of
	// that same split. Three call sites each deriving their own is how the bar
	// and the header menu drifted apart to begin with.
	const lifecycleStage: LifecycleStage =
		openDispute || disputeUnknownWhileDisputed
			? "dispute"
			: isOffRamp("quote", lifecycleStatus) && lifecycleStatus !== "Viewed"
				? "terminal"
				: "normal";

	const lifecycleActionList =
		disputeBarActions ??
		quoteActions({
			status: lifecycleStatus,
			hasJob: Boolean(quote.job),
			hasOpenDispute: Boolean(openDispute),
			disputeStateUnknown,
			openRefusal: disputeList?.open_refusal ?? null,
			soldRefusal: disputeList?.sold_refusal ?? null,
			canEdit: EDIT_QUOTE,
			canCreateJob: CREATE_JOB,
			canOpenDispute: OPEN_DISPUTE,
			revisePending,
			handlers: {
				issue: handleMarkAsIssued,
				send: handleSendToClient,
				approve: handleMarkAsApproved,
				convert: handleConvertToJob,
				dispute: () => setDisputeModalMode("open"),
				reject: handleMarkAsRejected,
				withdraw: handleCancelQuote,
				revise: handleCreateRevision,
			},
		});

	// The bar renders the inline share; this is the remainder, and it is the
	// only reason the kebab carries a Lifecycle group at all.
	const { overflow: lifecycleOverflow } = splitActions(lifecycleStage, lifecycleActionList);

	// The Related-Job card's Convert button is the same action the bar offers —
	// derived, never re-judged here (DW-04).
	const convertAction = lifecycleActionList.find((a) => a.id === "convert");

	// Three separate server refusals, each with its own message: the permission
	// check, the terminal-status gate, and the "converted to a job" gate that
	// isQuoteEditable does not model.
	const editBlockedReason = !EDIT_QUOTE
		? "You don't have permission to perform this action"
		: quote.job
			? "A job was created from this quote — it can no longer be edited. Correct the job instead."
			: !isQuoteEditable(quote.status)
				? `A ${quote.status.toLowerCase()} quote can't be edited. Create a revision instead.`
				: undefined;

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
					label: "Edit Quote",
					icon: <Edit2 size={16} />,
					disabled: editBlockedReason != null,
					disabledReason: editBlockedReason,
					onSelect: handleEdit,
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
				...(DELETE_QUOTE
					? [
							{
								id: "delete",
								label: deleteQuote.isPending
									? "Deleting..."
									: deleteConfirm
										? "Click Again to Confirm"
										: "Delete Quote",
								icon: <Trash2 size={16} />,
								intent: "destructive" as const,
								disabled: deleteQuote.isPending,
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

	// Derived readings, not recorded fields. The Details card keeps the record —
	// the same division the reference page draws between ItemStatRow's computed
	// tiles and its Details grid, and the reason the total is no longer printed
	// twice at the same type size two cards apart.
	const validUntil = quote.valid_until ?? quote.expires_at;
	const daysLeft = validUntil != null ? daysUntil(validUntil) : null;
	const lineItemCount = quote.line_items?.length ?? 0;
	const ageDays = -daysUntil(quote.created_at);
	const statTiles = [
		{
			label: "Quote Total",
			icon: <DollarSign size={13} />,
			value: formatCurrency(Number(quote.total)),
			hint: `${lineItemCount} ${lineItemCount === 1 ? "line item" : "line items"}`,
		},
		{
			label: "Expires",
			icon: <Clock size={13} />,
			value:
				daysLeft == null
					? "No expiry"
					: daysLeft >= 0
						? `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
						: `${-daysLeft} ${daysLeft === -1 ? "day" : "days"} ago`,
			hint: validUntil != null ? formatDate(validUntil) : "None set",
			tone: daysLeft != null && daysLeft < 0 ? ("warning" as const) : undefined,
		},
		{
			label: "Age",
			icon: <Calendar size={13} />,
			value: `${ageDays} ${ageDays === 1 ? "day" : "days"}`,
			hint: "since created",
		},
	];

	// Overview's blocks, built once and only PLACED by `overviewLayout` below, so
	// neither layout branch gets its own copy of a card to drift out of sync.
	const infoCard = (
		<Card title="Quote Information">
			{/* Field labels are <p>, not <h3>. Card renders its own title as an
			    h3, so h3 labels inside it were siblings of their own container —
			    a flat outline reading "Quote Information, Description, Address,
			    Created" where the last three are one-line labels, not navigable
			    sections. The invoice's Details card already used <p>; this is
			    the two pages agreeing. */}
			<div className="space-y-4">
				<div>
					<p className="text-text-tertiary text-sm mb-1">Description</p>
					<p className="text-text-primary break-words whitespace-pre-wrap">
						{quote.description || "No description provided"}
					</p>
				</div>

				{quote.address && (
					<div>
						<p className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
							<MapPin size={14} /> Address
						</p>
						<p className="text-text-primary break-words">
							{quote.address}
						</p>
					</div>
				)}

				<div>
					<p className="text-text-tertiary text-sm mb-1 flex items-center gap-2">
						<Calendar size={14} /> Created
					</p>
					<p className="text-text-primary">{formatDate(quote.created_at)}</p>
				</div>
			</div>
		</Card>
	);

	const clientCard = <ClientDetailsCard client_id={quote.client_id} client={quote.client} />;

	const relationCards = (
		<>
			{/* Related Request */}
			{quote.request ? (
				<button
					onClick={() =>
						navigate(
							`/dispatch/requests/${quote.request?.id}`
						)
					}
					className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
				>
					<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
						Related Request
					</p>
					<div className="flex items-start justify-between gap-3">
						<div className="flex-1 min-w-0">
							<h4 className="text-text-primary font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
								{quote.request.title}
							</h4>
							<div className="flex items-center gap-2 text-xs text-text-muted mt-2">
								<Calendar size={12} />
								<span>
									{new Date(
										quote
											.request
											.created_at
									).toLocaleDateString(
										"en-US",
										{
											month: "short",
											day: "numeric",
											year: "numeric",
										}
									)}
								</span>
							</div>
						</div>
						<span
							className={`flex-shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(quote.request.status)}`}
						>
							{quote.request.status}
						</span>
					</div>
				</button>
			) : (
				<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
					<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
						Related Request
					</p>
					<div className="flex items-center gap-2 text-text-faint text-sm">
						<Link2Off size={14} />
						<span>No request linked</span>
					</div>
				</div>
			)}

			{/* Related Job */}
			{quote.job ? (
				<button
					onClick={() =>
						navigate(`/dispatch/jobs/${quote.job!.id}`)
					}
					className="w-full p-4 bg-base hover:bg-surface rounded-lg border border-border hover:border-border-strong transition-all cursor-pointer text-left group"
				>
					<p className="text-text-muted text-xs uppercase tracking-wide font-semibold mb-2">
						Related Job
					</p>
					<div className="flex items-start justify-between gap-3">
						<div className="flex-1 min-w-0">
							<h4 className="text-text-primary font-medium text-sm mb-1 group-hover:text-primary-text transition-colors">
								{quote.job.job_number}
							</h4>
							<p className="text-text-tertiary text-xs mb-2">
								{quote.job.name}
							</p>
							<div className="flex items-center gap-2 text-xs text-text-muted">
								<Calendar size={12} />
								<span>
									{new Date(
										quote.job
											.created_at
									).toLocaleDateString(
										"en-US",
										{
											month: "short",
											day: "numeric",
											year: "numeric",
										}
									)}
								</span>
							</div>
						</div>
						<div className="flex flex-col items-end gap-2 flex-shrink-0">
							{quote.job.estimated_total !=
								null && (
								<span className="text-success-text font-semibold text-sm whitespace-nowrap">
									{formatCurrency(
										Number(
											quote
												.job
												.estimated_total
										)
									)}
								</span>
							)}
							<span
								className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(quote.job.status)}`}
							>
								{quote.job.status}
							</span>
						</div>
					</div>
				</button>
			) : (
				<div className="p-4 bg-base/40 rounded-lg border border-dashed border-border-subtle">
					<div className="grid grid-cols-3 gap-4">
						<div className="col-span-2 flex flex-col gap-2">
							<p className="text-text-muted text-xs uppercase tracking-wide font-semibold">
								Related Job
							</p>
							<div className="flex items-center gap-2 text-text-faint text-sm">
								<Link2Off
									size={14}
									className="flex-shrink-0"
								/>
								<span>
									No job created yet
								</span>
							</div>
						</div>
						<div className="col-span-1 flex items-center justify-end">
								<button
									title={convertAction?.disabledReason}
									disabled={convertAction?.disabled ?? true}
									onClick={(e) => {
										if (convertAction?.disabled ?? true) return;
										e.stopPropagation();
										convertAction?.onSelect();
									}}
									className="flex items-center gap-2 px-3 py-1.5 bg-primary-hover hover:bg-primary-active rounded-md text-xs font-medium text-on-primary transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
								>
									<Briefcase size={12} />{" "}
									Convert to Job
								</button>
						</div>
					</div>
				</div>
			)}
		</>
	);

	const financialBlock = (
		<FinancialSummary
			lineItems={quote.line_items ?? []}
			contestedIds={contestedIds}
			taxSnapshot={quote.tax_snapshot}
			legacyTaxRate={quote.tax_rate != null ? Number(quote.tax_rate) : null}
			legacyTaxAmount={quote.tax_amount != null ? Number(quote.tax_amount) : null}
			subtotal={quote.subtotal != null ? Number(quote.subtotal) : null}
			discountAmount={quote.discount_amount != null ? Number(quote.discount_amount) : null}
			discountType={quote.discount_type ?? null}
			discountValue={quote.discount_value != null ? Number(quote.discount_value) : null}
			metaLabel="Quote #"
			metaValue={quote.quote_number}
			noLineItemsDescription="No line items have been added to this quote yet."
			totalsContent={
				<div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg border border-border">
					<div>
						<p className="text-text-tertiary text-xs uppercase tracking-wide font-semibold mb-0.5">
							Quote Total
						</p>
						<p className="text-xs text-text-muted">Final amount</p>
					</div>
					<p className="text-2xl font-bold text-primary-text tabular-nums">
						{formatCurrency(Number(quote.total))}
					</p>
				</div>
			}
		/>
	);

	// Two layouts, chosen by whether the info card has long-form content to
	// hold. With no description and no address it collapses to a lone Created
	// field, and a one-field card beside the client card leaves a dead third —
	// the underfilled-rail failure the reference page's `overviewLayout` exists
	// to avoid. So in that case the card is dropped (it would say nothing the
	// stat row and the client card do not) and the client card joins the request
	// and job cards as an equal third of one row, which always fills: both
	// relation cards render either their document or a dashed empty state.
	const overviewLayout: "rail" | "split" =
		quote.description || quote.address ? "rail" : "split";

	return (
		<div className="text-text-primary pb-4 md:pb-6">
			{/* Header, lifecycle and the tab strip are one unit: a tight stack
			    closed by the strip's bottom border, rather than cards floating
			    at the same weight as the body below them. */}
			<div className="space-y-4">
				<DocumentDetailHeader
					title={quote.quote_number}
					badges={<DocumentLineage kind="quote" lineage={quote.lineage} />}
					meta={quote.title}
					statusPill={
						/* lifecycleStatus, not quote.status. The expiry sweep
						   runs periodically, so a quote past its valid-until
						   date still reads Sent in the database — and the pill
						   printed that while a chip beside it printed Expired,
						   one strip carrying two truths. The pill is now the
						   page's single status word, so it has to be the true
						   one; its title explains the gap that the second chip
						   used to. */
						<span
							title={
								isEffectivelyExpired
									? `Stored as ${quote.status} until the expiry sweep next runs.`
									: undefined
							}
							className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(lifecycleStatus)}`}
						>
							{lifecycleStatus}
						</span>
					}
					menuGroups={menuGroups}
					menuLabel="Quote actions"
					onMenuClose={() => setDeleteConfirm(false)}
				/>

				<LifecycleBar
					kind="quote"
					stage={lifecycleStage}
					currentStatus={lifecycleStatus}
					actions={lifecycleActionList}
					detail={
						openDispute ? (
							<DisputeStage
								kind="quote"
								dispute={openDispute}
								lineItems={quote.line_items ?? []}
							/>
						) : disputeUnknownWhileDisputed ? (
							<p className="text-sm text-warning-text">
								This quote's dispute couldn't be loaded, so its
								status and exits aren't shown. Reload the page.
							</p>
						) : (
							<TerminalDetail
								reason={quote.rejection_reason}
								at={
									lifecycleStatus === "Rejected"
										? quote.rejected_at
										: null
								}
								noReasonLabel={
									NO_REASON_COPY[lifecycleStatus] ??
									"No reason recorded."
								}
							/>
						)
					}
				/>

				{actionError && (
					<p className="text-sm text-error-text" role="alert">
						{actionError}
					</p>
				)}

				{/* Directly under the bar on BOTH pages. The invoice put this
				    above its bar and the quote below it, the kind of drift
				    criterion 9 exists to stop. */}
				{disputeStateUnknown && (
					<div className="flex items-center gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
						<AlertTriangle size={16} className="flex-shrink-0" />
						<span>
							This quote's dispute status couldn't be loaded, so
							dispute, cancel and convert actions are
							unavailable. Reload the page to try again.
						</span>
					</div>
				)}

				<DocumentTabs
					tabs={QUOTE_TABS}
					activeTab={activeTab}
					onSelect={setActiveTab}
					label="Quote sections"
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
							{/* The relation cards ride in the main
							    column, not below the row, and they
							    ABSORB the leftover height rather than
							    sitting at their content height: Quote
							    Information (~263px) plus a 60px strip
							    left the column ending ~18px above the
							    client card (~370px), and a 60px strip
							    under a 263px card read as a footnote
							    rather than a section.

							    The row therefore stretches (no
							    `items-start`) so the main column takes
							    the full row height, the relations grid
							    takes `flex-1` of what Quote Information
							    leaves, and its cards stretch into it —
							    the two columns finish on the same line.
							    The rail pins itself with `self-start` so
							    the reverse case (a long description
							    making the main column the taller one)
							    still ends the client card at its own
							    height instead of stretching it into a
							    half-empty card. */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
								<div className="lg:col-span-2 flex flex-col gap-4">
									{infoCard}
									<div className="grid flex-1 grid-cols-1 sm:grid-cols-2 gap-4">
										{relationCards}
									</div>
								</div>
								<div className="lg:col-span-1 self-start">
									{clientCard}
								</div>
							</div>
							{financialBlock}
						</>
					) : (
						<>
							{/* No info card to anchor a main column, so
							    the client card pairs against the two
							    relation cards stacked, rather than a
							    third of the row holding one short card.
							    `grid-rows-2` rather than a flex stack:
							    it splits the client card's height into
							    two equal stretched rows, which grows the
							    cards without reaching into their own
							    markup for a `flex-1`. There are always
							    exactly two — request and job each render
							    either their document or an empty
							    state. */}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
								{clientCard}
								<div className="grid grid-rows-2 gap-4">
									{relationCards}
								</div>
							</div>
							{financialBlock}
						</>
					)}
				</div>
			)}

			{activeTab === "activity" && (
				<DocumentActivityPanel
					notes={<NoteManager quoteId={quoteId!} />}
					lifecycle={<LifecycleRecord disputes={disputes} />}
					history={
						<ChangeHistory
							scope={{ kind: "entity", type: "quote", id: quoteId ?? "" }}
						/>
					}
				/>
			)}

			{quote && (
				<>
					<EditQuote
						isModalOpen={isEditModalOpen}
						setIsModalOpen={setIsEditModalOpen}
						quote={quote}
					/>
					<ConvertToJob
						isModalOpen={isConvertToJobModalOpen}
						setIsModalOpen={setIsConvertToJobModalOpen}
						quote={quote}
						onConvert={async (jobData) => {
							const newJob = await createJob(jobData);
							if (!newJob?.id)
								throw new Error(
									"Job creation failed: no ID returned"
								);
							navigate(`/dispatch/jobs/${newJob.id}`);
							return newJob.id;
						}}
					/>
					<SendDocumentModal
						isOpen={isSendModalOpen}
						onClose={() => setIsSendModalOpen(false)}
						onSend={handleSendConfirm}
						docType="quote"
						docNumber={quote.quote_number}
						clientName={quote.client?.name ?? ""}
						contactEmail={quote.client?.contacts?.[0]?.contact?.email}
						contactName={quote.client?.contacts?.[0]?.contact?.name}
					/>
					<DisputeModal
						isOpen={disputeModalMode === "open"}
						kind="quote"
						documentId={quote.id}
						documentNumber={quote.quote_number}
						lineItems={quote.line_items ?? []}
						mode="open"
						onClose={() => setDisputeModalMode(null)}
					/>
					{/* Resolve is a separate mount, not a mode flip on the one above:
					    a DisputeModal stays mounted while closed so FullPopup can fade
					    out, and swapping `mode` mid-fade would repaint the body of a
					    modal the dispatcher is still watching close. */}
					<DisputeModal
						isOpen={disputeModalMode === "resolve"}
						kind="quote"
						documentId={quote.id}
						documentNumber={quote.quote_number}
						lineItems={quote.line_items ?? []}
						mode="resolve"
						dispute={openDispute}
						initialResolution={resolveOutcome}
						onResolved={(resolved) => {
							// Follow Revise & Resend to the replacement, the
							// way handleCreateRevision does for a direct revise.
							if (
								resolved.resolution === "ReviseAndResend" &&
								resolved.replacement_quote_id
							) {
								navigate(
									`/dispatch/quotes/${resolved.replacement_quote_id}`,
								);
							}
						}}
						onClose={() => {
							setDisputeModalMode(null);
							setResolveOutcome(undefined);
						}}
					/>
					<QuoteReasonModal
						isOpen={isRejectModalOpen}
						quoteId={quote.id}
						mode="reject"
						onClose={() => setIsRejectModalOpen(false)}
					/>
					<QuoteReasonModal
						isOpen={isCancelModalOpen}
						quoteId={quote.id}
						mode="cancel"
						onClose={() => setIsCancelModalOpen(false)}
					/>
				</>
			)}
		</div>
	);
}
