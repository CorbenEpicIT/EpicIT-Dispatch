import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
	AlertTriangle,
	RefreshCw,
	Send,
	ShieldQuestion,
	Trash2,
	Undo2,
	WifiOff,
	X,
} from "lucide-react";
import {
	useCreateRefund,
	useDeleteFieldPurchase,
	useFieldPurchase,
	usePurchaseLimitGate,
	usePurchaseExtraction,
	useRequestPreauth,
	useSubmitFieldPurchase,
} from "../../hooks/useFieldPurchases";
import { useMyJobsQuery } from "../../hooks/useJobs";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import { useAuthStore } from "../../auth/authStore";
import ReceiptCaptureCard from "../../components/technician/procurement/ReceiptCaptureCard";
import PurchaseLineEditor from "../../components/technician/procurement/PurchaseLineEditor";
import ReceiptValueDiff from "../../components/technician/procurement/ReceiptValueDiff";
import LimitBreachNotice from "../../components/technician/procurement/LimitBreachNotice";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
	clampDestinations,
	toDrafts,
	type LineDraft,
} from "../../components/technician/procurement/lineDrafts";
import { useToast } from "../../components/ui/useToast";
import { money } from "../../components/fieldPurchases/fieldPurchaseFormat";
import { errorMessage } from "../../util/util";
import {
	FIELD_PURCHASE_STATUS_LABELS,
	isTechEditable,
	type FieldPurchase,
} from "../../types/fieldPurchases";

/**
 * One job the receipt covers. No amount: the share is the sum of the lines tagged
 * to this job, so it is read off them rather than typed twice. A row added here
 * has no server id until the submit that creates it, so the key is its own.
 */
interface AllocDraft {
	key: string;
	job_id: string;
	job_visit_id: string | null;
	label: string;
}

/**
 * Where every exit from this screen leads. Deliberately one place: this sheet is
 * reachable from a visit, from the vehicle page's Adjust Stock doorway, from the
 * list and from a notification, and guessing a destination from the purchase's
 * own data sent people somewhere they had never been.
 */
const PURCHASES = "/technician/purchases";

// datetime-local reads and writes wall clock. Seeding it from toISOString()
// would show the UTC instant and then re-submit it as local, shifting the
// timestamp by the offset on every save.
function toLocalInputValue(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** A receipt amount in the form the money fields hold, so a diff compares like with like. */
const money2 = (v: number | null | undefined): string | null => (v == null ? null : v.toFixed(2));

/**
 * One purchase, one screen, one button. The three separate saves this replaced were
 * three chances to lose a receipt at a counter, and one silently dropped the
 * confirmations it had just been given. The over-limit path lives here too, because
 * a technician finds out they are over at the counter, not before.
 */
export default function TechnicianPurchaseDetailPage() {
	const { purchaseId } = useParams<{ purchaseId: string }>();
	const { data, isLoading, isError, isFetching, refetch } = useFieldPurchase(purchaseId);

	if (isLoading) {
		return <p className="p-4 text-sm text-text-muted">Loading…</p>;
	}

	// A failed request must not render the loading line forever, which at a supply
	// counter would read as a phone that has hung rather than one that needs a retry.
	if (isError || !data) {
		return (
			<div className="flex items-start gap-3 rounded-xl border border-border bg-base p-4">
				<WifiOff
					size={18}
					aria-hidden
					className="mt-0.5 flex-shrink-0 text-warning-text"
				/>
				<div className="min-w-0">
					<h1 className="text-sm font-semibold text-text-primary">
						Could not open this purchase
					</h1>
					<p className="mt-1 text-xs text-text-muted">
						Check your signal and try again. Nothing you sent
						has been lost.
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-3">
						<button
							type="button"
							disabled={isFetching}
							onClick={() => void refetch()}
							className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary hover:enabled:bg-surface-raised disabled:opacity-40"
						>
							<RefreshCw
								size={12}
								aria-hidden
								className={
									isFetching
										? "animate-spin"
										: ""
								}
							/>
							{isFetching ? "Retrying…" : "Try again"}
						</button>
						<Link
							to={PURCHASES}
							className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline"
						>
							Back to your purchases
						</Link>
					</div>
				</div>
			</div>
		);
	}
	return <PurchaseSheet purchase={data.purchase} />;
}

function PurchaseSheet({ purchase }: { purchase: FieldPurchase }) {
	const navigate = useNavigate();
	// The truck the technician is signed onto, and the only vehicle a line may
	// stock. Read from the profile, not a `?vehicleId=` query param: a URL the
	// technician can edit could name a truck they've since handed over, and the
	// profile is the one answer the server will also accept.
	const { user } = useAuthStore();
	const { data: techProfile } = useTechnicianByIdQuery(user?.userId ?? null);
	const myVehicle = techProfile?.current_vehicle
		? { id: techProfile.current_vehicle.id, name: techProfile.current_vehicle.name }
		: null;
	const submit = useSubmitFieldPurchase();
	const preauth = useRequestPreauth();
	const remove = useDeleteFieldPurchase();
	const refund = useCreateRefund();
	const toast = useToast();

	const [vendor, setVendor] = useState("");
	// The ask, before there is a receipt. Kept apart from `total` on purpose: an
	// estimate is not a price paid, and the two must never be the same field.
	const [estimate, setEstimate] = useState("");
	const [reason, setReason] = useState("");
	const [total, setTotal] = useState("");
	const [tax, setTax] = useState("");
	const [purchasedAt, setPurchasedAt] = useState("");
	const [lines, setLines] = useState<LineDraft[]>(() => toDrafts(purchase));
	// One receipt can serve more than one job — the counter trip that fixes two
	// call-outs is the ordinary case, not an exotic one. A single-job purchase
	// follows its own total server-side and never needs touching.
	const [allocs, setAllocs] = useState<AllocDraft[]>([]);
	// Anything the technician has touched and not yet sent. The detail query polls
	// while OCR runs, so without this a result landing mid-sentence would overwrite
	// whatever they were typing.
	const [dirty, setDirty] = useState(false);
	const [confirmingDiscard, setConfirmingDiscard] = useState(false);

	// What the receipt read, which the purchase may well not hold: extraction stands
	// down from every field the technician filled and from the lines entirely once
	// there is one. Asked for separately so a landing extraction reaches an open
	// sheet as an offer rather than as a rewrite of what they were typing.
	const { data: extraction } = usePurchaseExtraction(
		purchase.id,
		purchase.ocr_status === "succeeded"
	);
	const receipt = extraction?.header ?? null;
	const scoreOf = (field: string) => extraction?.field_confidence?.[field] ?? null;

	const serverShape = `${purchase.updated_at}|${purchase.lines.map((l) => l.id).join(",")}`;
	useEffect(() => {
		if (dirty) return;
		setVendor(purchase.vendor_name ?? "");
		setEstimate(Number(purchase.estimated_amount ?? purchase.total).toFixed(2));
		setReason(purchase.reason ?? "");
		setTotal(Number(purchase.total).toFixed(2));
		setTax(Number(purchase.tax_amount).toFixed(2));
		setPurchasedAt(toLocalInputValue(purchase.purchased_at));
		// The roster keys a server-known job by its allocation id, which is what
		// `toDrafts` then matches each line's own allocation against.
		setLines(toDrafts(purchase));
		setAllocs(
			purchase.allocations.map((a) => ({
				key: a.id,
				job_id: a.job_id,
				job_visit_id: a.job_visit_id,
				label: a.job?.name || a.job_id,
			}))
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [serverShape, dirty]);

	// Runs after the profile lands, and after every re-seed that brings a stored
	// destination back. Deliberately does not mark the sheet dirty: nothing the
	// technician typed changed, and a false "unsaved changes" on open would be
	// worse than re-clamping on the next poll. The submit sends what is here.
	useEffect(() => {
		if (!techProfile) return;
		setLines((prev) => clampDestinations(prev, myVehicle?.id ?? null));
	}, [techProfile, myVehicle?.id]);

	const editable = isTechEditable(purchase.status);
	// Asked for but not yet bought — the receipt half of this screen has nothing
	// to hold. `preauth_approved` is deliberately not here: dispatch said yes, so
	// the technician is at the counter and the receipt flow is exactly right.
	const awaitingPurchase =
		purchase.status === "pending_preauth" || purchase.status === "preauth_denied";
	const totalNum = Number(total) || 0;
	const estimateNum = Number(estimate) || 0;
	const isSplit = allocs.length > 1;
	const unconfirmed = lines.filter((l) => !l.acknowledged).length;
	// A line nobody claimed bills no customer and counts towards no job's share,
	// which is the one thing a split receipt can get wrong. With a single job the
	// server assigns it, so there is nothing to be missing.
	const unassigned = isSplit ? lines.filter((l) => !l.allocationKey).length : 0;
	// Whether the receipt bills a visit, which is a fact about the money. It used
	// to double as a back destination, which sent a technician who arrived from
	// the vehicle page to a visit they had never been on.
	const billsAVisit = purchase.allocations.some((a) => a.job_visit_id);
	const canRefund = purchase.kind === "purchase" && purchase.status === "approved";

	// Asked of the server against the real total, which is only known once the
	// receipt is in hand. A breach turns the submit into a pre-approval request
	// rather than sending the technician to another screen.
	const checkedAmount = awaitingPurchase ? estimateNum : totalNum;
	// Every job's ceiling, not just the first one's — and measured against the
	// lines on screen rather than the shares the server last derived, because the
	// lines being edited are what the technician is deciding on.
	const shares = useMemo(() => {
		if (allocs.length <= 1) {
			return allocs.map((a) => ({ job_id: a.job_id, amount: checkedAmount }));
		}
		const lineTotal = (d: LineDraft) =>
			(Number(d.quantity) || 0) * (Number(d.unit_price) || 0);
		const subtotals = new Map(allocs.map((a) => [a.key, 0]));
		for (const d of lines) {
			if (subtotals.has(d.allocationKey)) {
				subtotals.set(
					d.allocationKey,
					subtotals.get(d.allocationKey)! + lineTotal(d)
				);
			}
		}
		// Tax pro-rata by line subtotal, the same rule the server derives with —
		// a ceiling answered on a different figure is not an answer.
		const assigned = [...subtotals.values()].reduce((n, v) => n + v, 0);
		const taxNum = Number(tax) || 0;
		return allocs.map((a) => ({
			job_id: a.job_id,
			amount:
				subtotals.get(a.key)! +
				(assigned > 0
					? (subtotals.get(a.key)! / assigned) * taxNum
					: taxNum / allocs.length),
		}));
	}, [allocs, lines, tax, checkedAmount]);
	// The roster, read three ways: what the server calls a row, what to label it,
	// and what it came to. Declared here because the submit payload below needs
	// the first of them.
	const jobOfKey = useMemo(() => new Map(allocs.map((a) => [a.key, a.job_id])), [allocs]);
	const jobOptions = useMemo(
		() => allocs.map((a) => ({ key: a.key, label: a.label })),
		[allocs]
	);
	const shareOfKey = useMemo(
		() => new Map(allocs.map((a, i) => [a.key, shares[i]?.amount ?? 0])),
		[allocs, shares]
	);

	const { breaches, assumeBreach } = usePurchaseLimitGate({
		scopeKey: purchase.id,
		total: checkedAmount,
		allocations: shares,
		enabled: editable && purchase.kind === "purchase",
	});
	// Never the more permissive button on an unverified figure: while a check is
	// in flight for an amount larger than the last one the server answered for,
	// this routes through dispatch and says so rather than offering the submit.
	// Two statuses are past the point where permission is worth asking for:
	// dispatch already said yes to one, and a queried receipt was already
	// submitted once, so the money is spent. On those the breach is information
	// for the reviewer, not a gate on the technician.
	const spentAlready =
		purchase.status === "preauth_approved" || purchase.status === "queried";
	const needsPreauth =
		(breaches.length > 0 || assumeBreach) &&
		!spentAlready &&
		purchase.kind === "purchase";

	const sheet = useMemo(
		() => ({
			vendor_name: vendor.trim() || null,
			total: totalNum,
			tax_amount: Number(tax) || 0,
			...(purchasedAt
				? { purchased_at: new Date(purchasedAt).toISOString() }
				: {}),
			// Always sent once the roster is known, so removing a job here actually
			// removes it. Shares are not sent at all — the server derives them from
			// the lines below, which is the same split.
			...(allocs.length > 0
				? {
						allocations: allocs.map((a) => ({
							job_id: a.job_id,
							job_visit_id: a.job_visit_id,
						})),
					}
				: {}),
			lines: lines.map((d, i) => ({
				description: d.description.trim(),
				quantity: Number(d.quantity),
				unit_price: Number(d.unit_price),
				inventory_item_id: d.inventory_item_id || null,
				disposition: d.disposition || null,
				disposition_vehicle_id:
					d.disposition === "receive" && d.disposition_vehicle_id
						? d.disposition_vehicle_id
						: null,
				// `allocationKey` is the sheet's own handle on a roster row and means
				// nothing to the server, so the job is named here deliberately rather
				// than by spreading the draft.
				job_id: jobOfKey.get(d.allocationKey) ?? null,
				acknowledged: d.acknowledged,
				ocr_confidence: d.ocrConfidence,
				sort_order: i,
			})),
		}),
		[vendor, totalNum, tax, purchasedAt, lines, allocs, jobOfKey]
	);

	// `Number("")` is 0 and `Number("abc")` is NaN, so neither a blank nor a
	// typo is a number anybody chose. NaN also serializes as null and fails at
	// the server, which tells the technician nothing they can act on here.
	const notANumber = (v: string) => !v.trim() || !Number.isFinite(Number(v));

	const incomplete =
		lines.length === 0 ||
		unconfirmed > 0 ||
		!purchase.receipt_image_url ||
		unassigned > 0 ||
		lines.some((l) => !l.description.trim()) ||
		lines.some((l) => notANumber(l.quantity) || notANumber(l.unit_price));

	// Why the submit is dead, said in the button rather than under it: a line of
	// its own cost 24px of a 390x844 screen at all times, and a technician staring
	// at a disabled button is asking exactly this question.
	const blockedReason = !incomplete
		? null
		: !purchase.receipt_image_url
			? "Photograph the receipt first"
			: lines.length === 0
				? "Add what you bought first"
				: unconfirmed > 0
					? `Check ${unconfirmed} line${unconfirmed === 1 ? "" : "s"} against the paper`
					: unassigned > 0
						? `Say which job ${unassigned === 1 ? "one line was" : `${unassigned} lines were`} for`
						: lines.some((l) => !l.description.trim())
							? "Every line needs a description"
							: "Enter a number for quantity and price on every line";

	// A job the technician can add the receipt to. Their own jobs only, and never
	// one the receipt already covers.
	const { data: myJobs = [] } = useMyJobsQuery(editable);
	const addableJobs = myJobs.filter((j) => !allocs.some((a) => a.job_id === j.job_id));

	function addJob(id: string) {
		const job = myJobs.find((j) => j.job_id === id);
		if (!job) return;
		setDirty(true);
		// Every line was the lone job's by definition; say so explicitly before a
		// second job exists, or they all read as unclaimed the moment it does.
		if (allocs.length === 1) {
			const only = allocs[0]!.key;
			setLines((prev) =>
				prev.map((d) =>
					d.allocationKey ? d : { ...d, allocationKey: only }
				)
			);
		}
		setAllocs((prev) => [
			...prev,
			{
				key: `new-${id}`,
				job_id: id,
				job_visit_id: job.visit_id ?? null,
				label: job.job_name || `Job ${job.job_number ?? ""}`.trim(),
			},
		]);
	}

	// A job leaving takes its claim on the lines with it, rather than leaving them
	// pointing at a row that is gone.
	function removeJob(key: string) {
		setDirty(true);
		setLines((prev) =>
			prev.map((d) => (d.allocationKey === key ? { ...d, allocationKey: "" } : d))
		);
		setAllocs((prev) => prev.filter((a) => a.key !== key));
	}

	function touch(set: (v: string) => void) {
		return (v: string) => {
			setDirty(true);
			set(v);
		};
	}

	async function onDiscard() {
		try {
			await remove.mutateAsync(purchase.id);
			navigate(PURCHASES);
		} catch (err) {
			toast.error(errorMessage(err, "Could not discard the draft"));
		}
	}

	async function onSubmit() {
		try {
			const result = await submit.mutateAsync({ id: purchase.id, sheet });
			setDirty(false);
			toast.success(
				result.flags.length > 0
					? `Submitted with ${result.flags.length} note${result.flags.length === 1 ? "" : "s"} for dispatch`
					: "Submitted for review"
			);
			navigate(PURCHASES);
		} catch (err) {
			toast.error(errorMessage(err, "Failed to submit"));
		}
	}

	async function onRequestPreauth() {
		try {
			// The pre-approval button is deliberately not gated on a finished sheet —
			// a technician asks permission before they have typed everything. Sending
			// a half-typed line would fail validation and lose the request, so the
			// header goes on its own and the lines wait for submit.
			const linesReady = lines.every(
				(l) => l.description.trim() && !notANumber(l.quantity) && !notANumber(l.unit_price)
			);
			const preauthSheet = linesReady ? sheet : { ...sheet, lines: undefined };
			await preauth.mutateAsync({
				id: purchase.id,
				estimatedAmount: awaitingPurchase
					? estimateNum
					: totalNum || Number(purchase.estimated_amount) || 0,
				reason: reason.trim() || null,
				// Sent for the same reason submit sends it: clearing `dirty` below
				// re-arms the re-seed effect, which would overwrite the sheet with
				// whatever the server last knew.
				sheet: preauthSheet,
			});
			// Only cleared when the whole sheet went. Otherwise the lines the
			// technician is still typing were never persisted, and re-arming the
			// re-seed effect would overwrite them with the server's stale copy —
			// the original bug, reintroduced through the back door.
			if (linesReady) setDirty(false);
			toast.success("Sent to dispatch for pre-approval");
		} catch (err) {
			toast.error(errorMessage(err, "Failed to request pre-approval"));
		}
	}

	async function startRefund() {
		try {
			const created = await refund.mutateAsync({ parentPurchaseId: purchase.id });
			navigate(`/technician/purchases/${created.id}`);
			toast.success("Refund started — attach the credit slip");
		} catch (err) {
			toast.error(errorMessage(err, "Could not start the refund"));
		}
	}

	return (
		// No page padding: the technician layout already supplies it, including its
		// own pb-20. `pb` adds what the fixed action bar needs on top of the equally
		// fixed bottom nav — 65px + 64px against the layout's 80, plus slack.
		<div className="space-y-4 pb-16">
			{/* Status and total stay put: the line list is long enough that a
			    technician scrolling it loses both, and both decide what to do next.
			    Discard rides up here rather than under the submit — it is
			    irreversible, and the top corner is the one place on a phone a thumb
			    does not reach by accident. */}
			<header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border bg-canvas px-4 py-2.5">
				<div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
					<h1 className="min-w-0 truncate text-base font-semibold text-text-primary">
						{purchase.status === "draft" ? (
							purchase.kind === "refund" ? (
								"New refund"
							) : (
								"New field purchase"
							)
						) : (
							<>
								{purchase.kind === "refund" ? "Refund · " : ""}
								{FIELD_PURCHASE_STATUS_LABELS[purchase.status]}
							</>
						)}
					</h1>
					<span className="flex-shrink-0 text-base font-semibold tabular-nums text-text-primary">
						{money(awaitingPurchase ? estimateNum : totalNum)}
					</span>
				</div>
				{editable && purchase.status === "draft" && (
					// The negative margin keeps a 44px target inside a 44px header
					// rather than growing the one bar that is always on screen.
					<button
						type="button"
						aria-label="Discard this draft"
						onClick={() => setConfirmingDiscard(true)}
						className="-my-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface hover:text-error-text"
					>
						<Trash2 aria-hidden size={16} />
					</button>
				)}
			</header>

			{/* ConfirmDialog is z-50, and so is the technician bottom nav — which
			    renders after the page, so at equal z-index the nav paints over the
			    dialog and stays tappable behind a destructive confirm. A positioned
			    ancestor gives the fixed dialog a stacking context of its own, which
			    lifts it without touching the component every dispatch page shares. */}
			<div className="relative z-[60]">
				<ConfirmDialog
					open={confirmingDiscard}
					title="Discard this draft?"
					body="The photo and every line on it go with it. There is no undo."
					confirmLabel="Discard"
					tone="destructive"
					pending={remove.isPending}
					onConfirm={() => void onDiscard()}
					onCancel={() => setConfirmingDiscard(false)}
				/>
			</div>

			{(canRefund || purchase.review_note || purchase.preauth_note) && (
				<div>
					{/* A return is its own purchase pointing back at this one: same receipt
				    (the credit slip), same lines, same review. */}
					{canRefund && (
						<button
							type="button"
							disabled={refund.isPending}
							onClick={() => void startRefund()}
							className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-secondary hover:bg-surface-raised disabled:opacity-40"
						>
							<Undo2 aria-hidden size={13} /> Returned a
							part
						</button>
					)}
					{purchase.review_note && (
						<p className="mt-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
							Dispatch: {purchase.review_note}
						</p>
					)}
					{purchase.preauth_note && (
						<p
							className={`mt-1 text-xs ${
								purchase.status === "preauth_denied"
									? "rounded-md border border-warning/40 bg-warning/10 p-2 text-warning"
									: "text-text-muted"
							}`}
						>
							{purchase.status === "preauth_denied"
								? "Dispatch said no: "
								: "Pre-approval note: "}
							{purchase.preauth_note}
						</p>
					)}
				</div>
			)}

			{purchase.flags.length > 0 && (
				<ul className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3">
					{purchase.flags.map((f, i) => (
						<li
							key={`${f.code}-${i}`}
							className="flex items-start gap-1.5 text-xs text-warning"
						>
							<AlertTriangle
								aria-hidden
								size={12}
								className="mt-0.5 flex-shrink-0"
							/>
							{f.message}
						</li>
					))}
				</ul>
			)}

			{awaitingPurchase ? (
				// Nothing has been bought, so a receipt card, a priced "Total paid" field
				// and an empty line editor are three forms for work that cannot be done
				// yet. What matters at this point is the ask itself.
				<section className="rounded-xl border border-border bg-base p-4">
					<h2 className="mb-1 text-sm font-semibold text-text-primary">
						What you asked for
					</h2>
					<p className="mb-3 text-xs text-text-muted">
						There is no receipt to photograph and no lines to
						check until dispatch says yes and you have paid.
					</p>
					<label className="block">
						<span className="mb-1 block text-xs text-text-muted">
							Estimated cost
						</span>
						<input
							value={estimate}
							disabled={!editable}
							inputMode="decimal"
							onChange={(e) =>
								touch(setEstimate)(e.target.value)
							}
							className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm tabular-nums text-text-primary disabled:opacity-60"
						/>
					</label>
					<label className="mt-3 block">
						<span className="mb-1 block text-xs text-text-muted">
							Reason
						</span>
						<input
							value={reason}
							disabled={!editable}
							onChange={(e) =>
								touch(setReason)(e.target.value)
							}
							placeholder="Part not on the truck, job is down"
							className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60"
						/>
					</label>
					{purchase.status === "pending_preauth" && (
						<p className="mt-3 text-xs text-text-secondary">
							Waiting on dispatch. You get a notification
							either way — do not pay for it until then.
						</p>
					)}
				</section>
			) : (
				<>
					<ReceiptCaptureCard
						purchase={purchase}
						editable={editable}
					/>

					<section className="rounded-xl border border-border bg-base p-4">
						<h2 className="mb-3 text-sm font-semibold text-text-primary">
							Receipt details
						</h2>
						{/* Label and diff are siblings, not both inside the <label>:
						    a <label> may hold only the one control it names, and a
						    nested button gets double-activated by implicit
						    click-forwarding. */}
						<div>
							<div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
								<label htmlFor="fp-vendor">
									Vendor
								</label>
								<ReceiptValueDiff
									label="Vendor"
									entered={vendor}
									receipt={
										receipt?.vendor_name ??
										null
									}
									confidence={scoreOf(
										"vendor_name"
									)}
									editable={editable}
									controlId="fp-vendor"
									onUse={touch(setVendor)}
								/>
							</div>
							<input
								id="fp-vendor"
								value={vendor}
								disabled={!editable}
								onChange={(e) =>
									touch(setVendor)(
										e.target.value
									)
								}
								placeholder="As printed on the receipt"
								className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60"
							/>
						</div>
						<div className="mt-3 flex gap-2">
							<div className="flex-1">
								<div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
									<label htmlFor="fp-total">
										Total paid
									</label>
									<ReceiptValueDiff
										label="total"
										entered={total}
										receipt={money2(
											receipt?.total
										)}
										confidence={scoreOf(
											"total"
										)}
										numeric
										editable={editable}
										controlId="fp-total"
										onUse={touch(
											setTotal
										)}
									/>
								</div>
								<input
									id="fp-total"
									value={total}
									disabled={!editable}
									inputMode="decimal"
									onChange={(e) =>
										touch(setTotal)(
											e.target
												.value
										)
									}
									className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm tabular-nums text-text-primary disabled:opacity-60"
								/>
							</div>
							<div className="flex-1">
								<div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
									<label htmlFor="fp-tax">
										Tax
									</label>
									<ReceiptValueDiff
										label="tax"
										entered={tax}
										receipt={money2(
											receipt?.tax_amount
										)}
										confidence={scoreOf(
											"tax_amount"
										)}
										numeric
										editable={editable}
										controlId="fp-tax"
										onUse={touch(
											setTax
										)}
									/>
								</div>
								<input
									id="fp-tax"
									value={tax}
									disabled={!editable}
									inputMode="decimal"
									onChange={(e) =>
										touch(setTax)(
											e.target
												.value
										)
									}
									className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm tabular-nums text-text-primary disabled:opacity-60"
								/>
							</div>
						</div>
						<div className="mt-3">
							<div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
								<label htmlFor="fp-purchased-at">
									When it was bought
								</label>
								<ReceiptValueDiff
									label="purchase time"
									entered={purchasedAt}
									receipt={
										receipt?.purchased_at
											? toLocalInputValue(
													receipt.purchased_at
												)
											: null
									}
									confidence={scoreOf(
										"purchased_at"
									)}
									editable={editable}
									controlId="fp-purchased-at"
									onUse={touch(
										setPurchasedAt
									)}
								/>
							</div>
							<input
								id="fp-purchased-at"
								type="datetime-local"
								value={purchasedAt}
								disabled={!editable}
								onChange={(e) =>
									touch(setPurchasedAt)(
										e.target.value
									)
								}
								className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary disabled:opacity-60"
							/>
						</div>
					</section>

					<PurchaseLineEditor
						purchase={purchase}
						editable={editable}
						extractedLines={extraction?.lines ?? []}
						totalPaid={totalNum}
						taxAmount={Number(tax) || 0}
						myVehicle={myVehicle}
						jobs={jobOptions}
						lines={lines}
						onChange={(next) => {
							setDirty(true);
							setLines(next);
						}}
					/>
				</>
			)}

			<section className="rounded-xl border border-border bg-base p-4">
				<h2 className="mb-2 text-sm font-semibold text-text-primary">
					Jobs this covers
				</h2>
				<ul className="space-y-1">
					{allocs.map((a) => (
						<li
							key={a.key}
							className="flex items-center justify-between gap-2 text-sm text-text-secondary"
						>
							<span className="min-w-0 flex-1 truncate">
								{a.label}
							</span>
							<span className="flex-shrink-0 tabular-nums">
								{/* Read off the lines, never typed. A lone job carries the whole
								    receipt, and before the receipt exists that is the estimate
								    rather than the zero total. */}
								{money(
									isSplit
										? (shareOfKey.get(
												a.key
											) ?? 0)
										: awaitingPurchase
											? estimateNum
											: totalNum
								)}
							</span>
							{isSplit && editable && (
								<button
									type="button"
									aria-label={`Remove ${a.label}`}
									onClick={() =>
										removeJob(a.key)
									}
									className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-border text-text-secondary hover:text-error-text"
								>
									<X aria-hidden size={14} />
								</button>
							)}
						</li>
					))}
				</ul>

				{/* One counter trip can serve two call-outs. Adding the job here is what
				    lets each line say which of them it was for. */}
				{editable && addableJobs.length > 0 && (
					<label className="mt-2 block">
						<span className="mb-1 block text-xs text-text-muted">
							Also bought for another job?
						</span>
						<select
							value=""
							onChange={(e) => addJob(e.target.value)}
							className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary"
						>
							<option value="">
								Add a job to split this receipt…
							</option>
							{addableJobs.map((j) => (
								<option
									key={j.job_id}
									value={j.job_id}
								>
									{j.job_name ||
										`Job ${j.job_number ?? ""}`.trim()}
								</option>
							))}
						</select>
					</label>
				)}
				{unassigned > 0 && (
					<p className="mt-2 text-xs text-warning">
						{unassigned} line{unassigned === 1 ? "" : "s"} do
						not say which job they were for — tag them above
						before you can submit.
					</p>
				)}
				{!billsAVisit && (
					<p className="mt-2 text-xs text-text-muted">
						Not attached to a visit, so nothing is added to the
						customer's bill — dispatch will handle the charge.
					</p>
				)}
			</section>

			{editable && (
				// Clear of the layout's bottom nav (fixed, h-16, z-50) — at bottom-0
				// it painted over the button. One row at rest: both notices below
				// render nothing until a ceiling is actually crossed, so a breach
				// grows the bar rather than reserving room for one that never comes.
				<div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-base px-4 py-2.5">
					{/* The reason the numbers changed, above the button that acts on them. */}
					<LimitBreachNotice
						breaches={breaches}
						amount={checkedAmount}
						shares={shares}
					/>
					{/* Which ceiling is crossed is not known yet, but the button
					    already had to choose. Say so, rather than letting a
					    notice-less warning button imply the figure has been cleared. */}
					{!awaitingPurchase && needsPreauth && assumeBreach && (
						<p
							role="status"
							aria-live="polite"
							className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs text-warning-text"
						>
							Checking this against your limits…
						</p>
					)}
					{(breaches.length > 0 ||
						(!awaitingPurchase &&
							needsPreauth &&
							assumeBreach)) && <div className="h-2.5" />}

					{awaitingPurchase ? (
						// Live whenever a preauth request was denied: without it, "Ask
						// dispatch again" would be refused because the purchase is no
						// longer a draft, and "Submit for review" would want a receipt
						// for something that was never bought — leaving both buttons
						// dead with no way forward.
						<FooterButton
							tone="warning"
							icon={
								<ShieldQuestion
									aria-hidden
									size={16}
								/>
							}
							label="Ask dispatch again"
							blockedReason={
								estimateNum <= 0
									? "Put an estimated cost in first"
									: null
							}
							disabled={
								preauth.isPending ||
								estimateNum <= 0
							}
							onClick={() => void onRequestPreauth()}
						/>
					) : needsPreauth ? (
						<FooterButton
							tone="warning"
							icon={
								<ShieldQuestion
									aria-hidden
									size={16}
								/>
							}
							label="Send for pre-approval"
							blockedReason={null}
							disabled={preauth.isPending}
							onClick={() => void onRequestPreauth()}
						/>
					) : (
						<FooterButton
							tone="primary"
							icon={<Send aria-hidden size={16} />}
							label="Submit for review"
							blockedReason={blockedReason}
							disabled={submit.isPending || incomplete}
							onClick={() => void onSubmit()}
						/>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * The one action, and — when it is dead — the reason, carried as its own label. A
 * disabled button plus a sentence underneath is two rows for one message, and the
 * sentence was on screen whether or not it applied.
 */
function FooterButton({
	tone,
	icon,
	label,
	blockedReason,
	disabled,
	onClick,
}: {
	tone: "primary" | "warning";
	icon: ReactNode;
	label: string;
	blockedReason: string | null;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<>
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold disabled:opacity-40 ${
					tone === "warning"
						? "bg-warning text-on-warning hover:enabled:opacity-90"
						: "bg-primary-hover text-on-primary hover:enabled:bg-primary-active"
				}`}
			>
				{blockedReason ? <AlertTriangle aria-hidden size={16} /> : icon}
				{blockedReason ?? label}
			</button>
			{/* Renaming a button nobody is focused on announces nothing, and this is
			    the message that decides whether the trip is over. */}
			<p role="status" aria-live="polite" className="sr-only">
				{blockedReason ?? ""}
			</p>
		</>
	);
}
