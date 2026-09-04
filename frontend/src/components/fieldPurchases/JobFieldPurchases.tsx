import { Link } from "react-router-dom";
import { AlertTriangle, Receipt } from "lucide-react";
import { useFieldPurchases } from "../../hooks/useFieldPurchases";
import { useAnyPermission } from "../../hooks/usePermission";
import { money } from "./fieldPurchaseFormat";
import {
	FIELD_PURCHASE_STATUS_LABELS,
	isPrePurchase,
	type FieldPurchase,
	type FieldPurchaseStatus,
} from "../../types/fieldPurchases";
import { purchaseHref } from "./queueFilters";

function statusTone(status: FieldPurchaseStatus) {
	switch (status) {
		case "approved":
			return "text-success";
		case "rejected":
		case "preauth_denied":
			return "text-error-text";
		case "queried":
			return "text-warning";
		default:
			return "text-text-secondary";
	}
}

/** Lines that actually reached the customer's bill. */
function billedCount(p: FieldPurchase): number {
	return p.lines.filter((l) => l.visit_line_item_id).length;
}

interface Props {
	jobId: string;
	/** Narrows to one visit's purchases. Omit on a job page. */
	visitId?: string;
}

/**
 * What was bought in the field for this job - the other half of an allocation that
 * was written and read by nothing, leaving a part bought mid-job visible only
 * inside the review queue. Hidden when there are none, which is most jobs.
 */
/**
 * What THIS job owes of a receipt, which on a split is not the receipt. Attributing
 * the whole total to every job it touched double-counted the spend across their
 * two pages and overstated what each job cost.
 */
function shareOfJob(p: FieldPurchase, jobId: string): number {
	if (p.allocations.length <= 1) return Number(p.total);
	return Number(p.allocations.find((a) => a.job_id === jobId)?.amount ?? 0);
}

export default function JobFieldPurchases({ jobId, visitId }: Props) {
	const canSee = useAnyPermission(["view_field_purchases", "review_field_purchases"]);
	const {
		data: purchases = [],
		isLoading,
		isError,
	} = useFieldPurchases({ job_id: jobId }, canSee);

	// A draft is a technician's unfinished sheet with no receipt behind it and an
	// allocation that is usually still zero. It is not a cost this job has
	// incurred, and dispatch has no action on one.
	const claimed = purchases.filter((p) => p.status !== "draft");
	// The list endpoint filters by job, not by visit — the visit lives on the
	// allocation, and a job's purchases are few enough to narrow here.
	const rows = visitId
		? claimed.filter((p) => p.allocations.some((a) => a.job_visit_id === visitId))
		: claimed;

	if (!canSee || isLoading) return null;

	// Staying hidden on failure claims this job had nothing bought for it, and this
	// panel is the only place a job reports field spend. Says so instead — but stays
	// a one-line strip, since most jobs genuinely have none and the panel is hidden
	// in that case rather than sitting empty on every job page.
	if (isError) {
		return (
			<div className="flex items-center gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5">
				<AlertTriangle size={13} aria-hidden className="flex-shrink-0 text-warning-text" />
				<p className="text-xs text-warning-text">
					Could not load field purchases for this job — this is not a statement
					that there are none.
				</p>
			</div>
		);
	}

	if (rows.length === 0) return null;

	// Only money actually handed over. Before the counter `total` holds the estimate,
	// so summing every row reported an unspent ask as cost this job had incurred —
	// on the one panel a dispatcher reads to learn what the job cost.
	const bought = rows.filter((p) => !isPrePurchase(p.status));
	const total = bought.reduce((n, p) => n + shareOfJob(p, jobId), 0);
	const pending = rows.length - bought.length;

	return (
		<div className="rounded-xl border border-border bg-base overflow-hidden">
			<div className="flex items-baseline justify-between gap-2 px-4 py-3 border-b border-border-subtle">
				<span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
					<Receipt aria-hidden size={13} className="text-text-muted" />
					Field purchases
				</span>
				<span className="text-xs tabular-nums text-text-muted">
					{bought.length} · {money(total)}
					{pending > 0 && (
						<span className="ml-1.5 text-text-tertiary">
							+{pending} not bought yet
						</span>
					)}
				</span>
			</div>

			<ul>
				{rows.map((p) => (
					<li key={p.id} className="border-b border-border-subtle last:border-0">
						<Link
							to={purchaseHref(p.id, p.status)}
							className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm text-text-primary">
									{p.vendor_name || "Vendor not recorded"}
									{p.kind === "refund" && (
										<span className="ml-1.5 text-xs text-text-muted">refund</span>
									)}
								</span>
								<span className="block truncate text-[11px] text-text-muted">
									{p.technician.name}
									{billedCount(p) > 0 && ` · ${billedCount(p)} billed to the visit`}
								</span>
							</span>
							<span className={`flex-shrink-0 text-xs font-medium ${statusTone(p.status)}`}>
								{FIELD_PURCHASE_STATUS_LABELS[p.status]}
							</span>
							{p.flags.length > 0 && (
								<span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-warning">
									<AlertTriangle aria-hidden size={11} />
									{p.flags.length}
								</span>
							)}
							<span className="w-20 flex-shrink-0 text-right text-sm tabular-nums text-text-primary">
								{money(shareOfJob(p, jobId))}
								{p.allocations.length > 1 && (
									<span className="block text-[10px] text-text-tertiary">
										of {money(p.total)}
									</span>
								)}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
