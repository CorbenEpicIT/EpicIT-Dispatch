import { useState } from "react";
import { AlertTriangle, Check, Link2, Plus, RotateCcw, X } from "lucide-react";
import {
	useReconcileQueueQuery,
	useApplyLinkageMatchMutation,
	useDismissUnmappedMutation,
	useRestoreUnmappedMutation,
	useAllInventoryQuery,
	useCreateProvisionalItemMutation,
	useApproveItemMutation,
	useMergeItemMutation,
	useRejectItemMutation,
} from "../../hooks/useInventory";
import {
	ITEM_ORIGIN_LABELS,
	type ItemOrigin,
	type LinkageCandidate,
	type LinkageEntity,
	type LinkageMatchTier,
	type ReconcileDismissedRow,
	type ReconcileProvisionalRow,
} from "../../api/inventory";
import PageHeader from "../../components/ui/PageHeader";
import LoadSvg from "../../assets/icons/loading.svg?react";
import { formatQty } from "../../lib/units";

const ENTITY_LABELS: Record<LinkageEntity, string> = {
	quote: "Quotes",
	job: "Jobs",
	job_visit: "Visits",
	recurring_plan: "Plans",
	invoice: "Invoices",
};

const TIER_LABELS: Record<LinkageMatchTier, string> = {
	exact: "exact name",
	case_insensitive: "name match",
	code: "SKU match",
};

const money = (n: number) =>
	n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const ORIGIN_FILTERS: (ItemOrigin | "all")[] = [
	"all",
	"tech_submission",
	"dispatch_quick_add",
	"field_purchase",
	"import",
];

/**
 * One surface for both an under-specified item row and a billable line
 * pointing at nothing. These were two queues on the inventory page, which
 * made the seam look like a difference in kind: which one a problem lands in
 * depends only on whether an item row got created, and dispatch quick-add
 * resolved one by creating the other.
 *
 * Ranked by summed line value — a $4 grommet billed nine times does not
 * belong above a $2,400 compressor billed once.
 */
export default function InventoryReconcilePage() {
	const [origin, setOrigin] = useState<ItemOrigin | "all">("all");
	const [showDismissed, setShowDismissed] = useState(false);

	const { data: queue, isLoading } = useReconcileQueueQuery({
		includeDismissed: showDismissed,
		origin: origin === "all" ? undefined : origin,
	});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<LoadSvg className="w-8 h-8 animate-spin text-primary" />
			</div>
		);
	}

	const coverage = queue?.coverage ?? { linked: 0, unmapped: 0, total: 0, pct: 100 };
	const provisional = queue?.provisional ?? [];
	const unmapped = queue?.unmapped ?? [];
	const dismissed = queue?.dismissed ?? [];
	const openValue = (queue?.unmapped_value ?? 0) + provisional.reduce((n, p) => n + p.value, 0);

	return (
		<div className="flex-1 overflow-y-auto p-4">
			<PageHeader title="Reconcile Parts" />

			{/* Coverage first: it is the number that decides whether the catalog
			    is trustworthy enough for the picker to require a link. */}
			<div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-xl border border-border bg-base px-4 py-3">
				<div className="flex items-baseline gap-2">
					<span className="text-2xl font-semibold text-text-primary tabular-nums">
						{coverage.pct}%
					</span>
					<span className="text-xs text-text-muted">
						of {coverage.total} material lines mapped
					</span>
				</div>
				<div className="text-xs text-text-muted">
					<span className="font-medium text-text-primary tabular-nums">
						{money(openValue)}
					</span>{" "}
					billed through parts the catalog doesn&apos;t know
				</div>
				<div className="text-xs text-text-muted">
					{provisional.length} needing detail · {queue?.unmapped_total ?? 0} unmapped names
				</div>
			</div>

			<section className="mb-6">
				<SectionHeading
					title="Needs detail"
					count={provisional.length}
					blurb="The item exists but isn't specified enough to stock, cost or reorder."
				/>

				{/* Origin was inferred from a null tech id until 2026-08-20, which
				    is why every dispatch quick-add used to read "Submitted by
				    unknown". Filtering on it is only honest now that it is stored. */}
				<div className="mb-2 flex flex-wrap items-center gap-1">
					{ORIGIN_FILTERS.map((o) => (
						<button
							key={o}
							type="button"
							onClick={() => setOrigin(o)}
							className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
								origin === o
									? "border-primary bg-primary/15 text-primary-text"
									: "border-border text-text-muted hover:bg-surface"
							}`}
						>
							{o === "all" ? "All origins" : ITEM_ORIGIN_LABELS[o]}
						</button>
					))}
				</div>

				{provisional.length === 0 ? (
					<EmptyRow>
						{origin === "all"
							? "No parts are waiting for detail."
							: "No parts from this origin are waiting for detail."}
					</EmptyRow>
				) : (
					<div className="flex flex-col gap-2">
						{provisional.map((row) => (
							<ProvisionalCard key={row.item_id} row={row} />
						))}
					</div>
				)}
			</section>

			<section className="mb-6">
				<SectionHeading
					title="Unmapped names"
					count={queue?.unmapped_total ?? 0}
					blurb="A line bills this part but points at no catalog item, so nothing deducts it from stock."
				/>

				{unmapped.length === 0 ? (
					<EmptyRow>Every material line points at a catalog item.</EmptyRow>
				) : (
					<>
						<div className="border border-border rounded overflow-hidden">
							{unmapped.map((row) => (
								<UnmappedRow key={row.name} row={row} />
							))}
						</div>
						{/* The list is capped server-side. Saying so beats letting a
						    200-row page read as the whole backlog. */}
						{(queue?.unmapped_total ?? 0) > unmapped.length && (
							<p className="mt-1 px-1 text-[10px] text-text-muted">
								Showing the {unmapped.length} highest-value names of{" "}
								{queue?.unmapped_total}. Clearing these shortens the rest.
							</p>
						)}
					</>
				)}
			</section>

			<section>
				<button
					type="button"
					onClick={() => setShowDismissed((s) => !s)}
					className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
				>
					{showDismissed ? "Hide" : "Show"} names marked intentional
					{dismissed.length > 0 ? ` (${dismissed.length})` : ""}
				</button>

				{showDismissed && (
					<div className="mt-2">
						{dismissed.length === 0 ? (
							<EmptyRow>Nothing has been marked intentional yet.</EmptyRow>
						) : (
							<div className="border border-border rounded overflow-hidden">
								{dismissed.map((d) => (
									<DismissedRow key={d.folded_name} row={d} />
								))}
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
}

function SectionHeading({ title, count, blurb }: { title: string; count: number; blurb: string }) {
	return (
		<div className="mb-2 flex items-baseline gap-2">
			<h2 className="text-sm font-semibold text-text-primary">{title}</h2>
			<span className="text-xs text-text-muted tabular-nums">{count}</span>
			<span className="text-xs text-text-muted">· {blurb}</span>
		</div>
	);
}

function EmptyRow({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border-subtle bg-surface px-4 py-6 text-center text-sm text-text-muted">
			{children}
		</div>
	);
}

function ActionError({ error }: { error: unknown }) {
	if (!(error instanceof Error)) return null;
	return (
		<div className="mt-2 flex items-center gap-1.5 text-xs text-error-text">
			<AlertTriangle size={12} className="flex-shrink-0" />
			{error.message}
		</div>
	);
}

/** adopt = complete it, merge = duplicate of something else, reject = bin it. */
function ProvisionalCard({ row }: { row: ReconcileProvisionalRow }) {
	const adopt = useApproveItemMutation();
	const merge = useMergeItemMutation();
	const reject = useRejectItemMutation();
	const [open, setOpen] = useState<"adopt" | "merge" | null>(null);

	const busy = adopt.isPending || merge.isPending || reject.isPending;

	return (
		<div className="rounded-xl border border-border-subtle bg-surface p-4">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2 min-w-0">
						<span className="truncate text-sm font-medium text-text-primary">
							{row.name}
						</span>
						<span className="flex-shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-muted">
							{ITEM_ORIGIN_LABELS[row.origin]}
						</span>
					</div>
					<div className="mt-0.5 text-xs text-text-muted">
						{row.submitted_by ? `From ${row.submitted_by.name}` : "From dispatch"}
						{row.cost != null ? ` · Cost $${row.cost.toFixed(2)}` : " · No cost yet"}
						{row.lines > 0 &&
							` · ${row.lines} line${row.lines === 1 ? "" : "s"} worth ${money(row.value)}`}
					</div>
					{row.vehicle_stocks.length > 0 && (
						<div className="text-xs text-text-muted">
							On:{" "}
							{row.vehicle_stocks
								.map(
									(vs) =>
										`${vs.vehicle.name} (${formatQty(vs.qty_on_hand, row.unit)})`,
								)
								.join(", ")}
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<button
						onClick={() => setOpen(open === "adopt" ? null : "adopt")}
						className="rounded bg-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25"
					>
						Adopt
					</button>
					<button
						onClick={() => setOpen(open === "merge" ? null : "merge")}
						className="rounded bg-surface-hover px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-border-subtle"
					>
						Merge
					</button>
					<button
						onClick={() => reject.mutate(row.item_id)}
						disabled={busy}
						className="rounded bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
					>
						Reject
					</button>
				</div>
			</div>

			{open === "adopt" && (
				<AdoptForm
					row={row}
					isPending={adopt.isPending}
					onCancel={() => setOpen(null)}
					onConfirm={async (body) => {
						try {
							await adopt.mutateAsync({ itemId: row.item_id, ...body });
							setOpen(null);
						} catch {
							// Surfaced through adopt.error; caught only to avoid an unhandled rejection.
						}
					}}
				/>
			)}

			{open === "merge" && (
				<MergeForm
					itemId={row.item_id}
					isPending={merge.isPending}
					onCancel={() => setOpen(null)}
					onConfirm={async (targetId) => {
						try {
							await merge.mutateAsync({ itemId: row.item_id, targetId });
							setOpen(null);
						} catch {
							// See above.
						}
					}}
				/>
			)}

			<ActionError error={adopt.error ?? merge.error ?? reject.error} />
		</div>
	);
}

/**
 * Cost cannot be skipped: with no cost basis an item reads as free to
 * weighted average cost and shows 100% margin on every line billing it. The
 * server refuses it too; disabling here only saves the round trip.
 */
function AdoptForm({
	row,
	onConfirm,
	onCancel,
	isPending,
}: {
	row: ReconcileProvisionalRow;
	onConfirm: (body: {
		cost?: number;
		low_stock_threshold?: number | null;
		initial_warehouse_qty?: number;
	}) => void;
	onCancel: () => void;
	isPending: boolean;
}) {
	const [cost, setCost] = useState(row.cost != null ? String(row.cost) : "");
	const [threshold, setThreshold] = useState(
		row.low_stock_threshold != null ? String(row.low_stock_threshold) : "",
	);
	const [qty, setQty] = useState("0");

	const costValue = cost.trim() === "" ? null : Number(cost);
	const costOk = costValue !== null && Number.isFinite(costValue) && costValue >= 0;

	return (
		<div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border-subtle pt-3">
			<Field label="Cost per unit" hint={row.cost == null ? "Required" : undefined}>
				<input
					type="number"
					min={0}
					step="0.01"
					value={cost}
					onChange={(e) => setCost(e.target.value)}
					aria-label="Cost per unit"
					className="w-24 rounded border border-border-input bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
				/>
			</Field>
			<Field label="Low-stock at">
				<input
					type="number"
					min={0}
					step="0.01"
					value={threshold}
					onChange={(e) => setThreshold(e.target.value)}
					aria-label="Low-stock at"
					className="w-24 rounded border border-border-input bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
				/>
			</Field>
			<Field label="Warehouse qty now">
				<input
					type="number"
					min={0}
					value={qty}
					onChange={(e) => setQty(e.target.value)}
					aria-label="Warehouse qty now"
					className="w-24 rounded border border-border-input bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
				/>
			</Field>
			<div className="flex items-center gap-2">
				<button
					onClick={() =>
						onConfirm({
							...(costOk ? { cost: costValue! } : {}),
							...(threshold.trim() === ""
								? {}
								: { low_stock_threshold: Number(threshold) }),
							...(Number(qty) > 0 ? { initial_warehouse_qty: Number(qty) } : {}),
						})
					}
					disabled={isPending || !costOk}
					title={!costOk ? "A cost is required to adopt an item" : undefined}
					className="rounded bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
				>
					Adopt into catalog
				</button>
				<button onClick={onCancel} className="text-xs text-text-muted">
					Cancel
				</button>
			</div>
		</div>
	);
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-[10px] uppercase tracking-wide text-text-muted">
				{label}
				{hint && <span className="ml-1 normal-case text-warning-text">{hint}</span>}
			</span>
			{children}
		</label>
	);
}

function MergeForm({
	itemId,
	onConfirm,
	onCancel,
	isPending,
}: {
	itemId: string;
	onConfirm: (targetId: string) => void;
	onCancel: () => void;
	isPending: boolean;
}) {
	const { data: catalog = [] } = useAllInventoryQuery();
	const [target, setTarget] = useState("");
	// The catalog list already excludes provisional rows; only this item itself
	// needs filtering out.
	const options = catalog.filter((c) => c.id !== itemId);

	return (
		<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
			<span className="text-xs text-text-muted">Merge into:</span>
			<select
				value={target}
				onChange={(e) => setTarget(e.target.value)}
				aria-label="Merge into"
				className="rounded border border-border-input bg-base px-2 py-1.5 text-sm text-text-primary"
			>
				<option value="">— choose —</option>
				{options.map((c) => (
					<option key={c.id} value={c.id}>
						{c.name}
					</option>
				))}
			</select>
			<button
				onClick={() => onConfirm(target)}
				disabled={!target || isPending}
				className="rounded bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary disabled:opacity-50"
			>
				Merge
			</button>
			<button onClick={onCancel} className="text-xs text-text-muted">
				Cancel
			</button>
		</div>
	);
}

/**
 * Marking a name intentional is a real answer, not a postponement: a one-off
 * gasket or a subcontractor's own material will never be stocked, and forcing
 * an item row for each would fill the catalog with things nobody reorders.
 */
function UnmappedRow({ row }: { row: LinkageCandidate }) {
	const apply = useApplyLinkageMatchMutation();
	const createItem = useCreateProvisionalItemMutation();
	const dismiss = useDismissUnmappedMutation();
	const { data: catalog = [] } = useAllInventoryQuery();
	const [pick, setPick] = useState(row.match?.inventory_item_id ?? "");
	const [mapped, setMapped] = useState<number | null>(null);

	const busy = apply.isPending || createItem.isPending || dismiss.isPending;

	const handleMap = async (itemId: string) => {
		try {
			const updated = await apply.mutateAsync({ name: row.name, inventory_item_id: itemId });
			setMapped(Object.values(updated).reduce((a, b) => a + b, 0));
		} catch {
			// Surfaced through apply.error.
		}
	};

	/**
		 * Create-and-map in one click, or the row is a dead end and the dispatcher
		 * has to leave, create the item, and come back to find it.
		 */
	const handleCreateAndMap = async () => {
		try {
			const created = await createItem.mutateAsync({ name: row.name });
			await handleMap(created.id);
		} catch {
			// Both mutations surface their own error. The item survives a failed
			// map — it is in the queue above — so a retry maps rather than
			// duplicating (the server folds by name).
		}
	};

	return (
		<div className="border-b border-border-subtle px-3 py-2 last:border-0">
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1.5">
						{!row.match && mapped === null && (
							<AlertTriangle size={11} className="flex-shrink-0 text-warning-text" />
						)}
						<span className="truncate text-sm text-text-primary" title={row.name}>
							{row.name}
						</span>
						<span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
							{money(row.value)}
						</span>
					</div>
					<div className="text-[10px] text-text-muted">
						{row.lines} line{row.lines === 1 ? "" : "s"} ·{" "}
						{row.entities.map((e) => ENTITY_LABELS[e]).join(", ")}
						{row.match && ` · suggested by ${TIER_LABELS[row.match.tier]}`}
					</div>
				</div>

				{mapped !== null ? (
					<span className="flex flex-shrink-0 items-center gap-1 text-xs text-success-text">
						<Check size={12} />
						{mapped} mapped
					</span>
				) : (
					<>
						<select
							value={pick}
							onChange={(e) => setPick(e.target.value)}
							aria-label={`Catalog item for ${row.name}`}
							className="h-[28px] max-w-[180px] rounded border border-border bg-base px-2 text-xs text-text-muted focus:border-primary focus:outline-none [&>option]:bg-base [&>option]:text-text-primary"
						>
							<option value="">Choose item…</option>
							{catalog.map((i) => (
								<option key={i.id} value={i.id}>
									{i.name}
								</option>
							))}
						</select>
						{pick ? (
							<button
								type="button"
								disabled={busy}
								onClick={() => void handleMap(pick)}
								className="flex h-[28px] flex-shrink-0 items-center gap-1 rounded bg-primary px-2 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
							>
								<Link2 size={11} />
								Map
							</button>
						) : (
							<button
								type="button"
								title={`Create "${row.name}" as an item awaiting detail, then map these lines to it`}
								disabled={busy}
								onClick={() => void handleCreateAndMap()}
								className="flex h-[28px] flex-shrink-0 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-text-primary transition-colors hover:bg-surface disabled:opacity-40"
							>
								<Plus size={11} />
								Create &amp; map
							</button>
						)}
						<button
							type="button"
							title="This part is never stocked — keep the line billable and stop asking"
							disabled={busy}
							onClick={() => dismiss.mutate({ name: row.name })}
							className="flex h-[28px] flex-shrink-0 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface disabled:opacity-40"
						>
							<X size={11} />
							Intentional
						</button>
					</>
				)}
			</div>

			<ActionError error={apply.error ?? createItem.error ?? dismiss.error} />
		</div>
	);
}

/** Attributed and reversible: dismissal is the lazy way out, so it stays visible. */
function DismissedRow({ row }: { row: ReconcileDismissedRow }) {
	const restore = useRestoreUnmappedMutation();

	return (
		<div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-0">
			<div className="min-w-0 flex-1">
				<span className="truncate text-sm text-text-primary">{row.folded_name}</span>
				<div className="text-[10px] text-text-muted">
					{row.decided_by ? row.decided_by.name : "Unknown"} ·{" "}
					{new Date(row.decided_at).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					})}
					{row.reason && ` · ${row.reason}`}
				</div>
			</div>
			<button
				type="button"
				disabled={restore.isPending}
				onClick={() => restore.mutate({ name: row.folded_name })}
				className="flex h-[28px] flex-shrink-0 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface disabled:opacity-40"
			>
				<RotateCcw size={11} />
				Reopen
			</button>
		</div>
	);
}
