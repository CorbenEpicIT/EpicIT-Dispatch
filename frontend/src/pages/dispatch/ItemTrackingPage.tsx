import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
	Barcode,
	Boxes,
	Check,
	MoreHorizontal,
	PackageX,
	Plus,
	Printer,
	RotateCcw,
	Trash2,
	Truck,
	Warehouse,
} from "lucide-react";
import { useAllInventoryQuery } from "../../hooks/useInventory";
import { useBatchesQuery, useSerialsQuery, useTrackingSummaryQuery } from "../../hooks/useTracking";
import { usePermission } from "../../hooks/usePermission";
import { useVehiclesQuery } from "../../hooks/useVehicles";
import { useLabelQueueStore } from "../../stores/labelQueueStore";
import { useSerialActions, type SerialConfirmAction } from "../../hooks/useSerialActions";
import { useToast } from "../../components/ui/useToast";
import * as trackingApi from "../../api/tracking";
import { invalidate } from "../../lib/queryKeys";
import ReceiveStockModal from "../../components/inventory/tracking/ReceiveStockModal";
import type { LabelQueueItem } from "../../stores/labelQueueStore";
import StatusFilter, { type StatusOption } from "../../components/ui/StatusFilter";
import SearchBar from "../../components/ui/SearchBar";
import PageControls from "../../components/ui/PageControls";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import LoadSvg from "../../assets/icons/loading.svg?react";
import {
	SERIAL_STATUS_BADGE,
	SERIAL_STATUS_LABEL,
	type BatchListRow,
	type SerialUnitRow,
	type SerialUnitStatus,
} from "../../types/tracking";
import { formatDate } from "../../util/util";

// Shared 300ms debounce for the serials/batches text-search inputs — short
// enough to feel live, long enough to avoid a request per keystroke.
function useDebouncedValue<T>(value: T, delayMs = 300): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

type StatMetric = {
	label: string;
	value: string;
	hint?: string;
	tone?: "warning";
};

// One tracking-kind's KPIs. When both kinds are present the cluster wears an
// accent-colored eyebrow (dot + label + underline) keyed to that kind — blue
// for serials, violet for batches — matching the page's own Serialized /
// Batch-tracked badges so the two run-together clusters read apart at a glance.
// The underline echoes the tab-selection underline used elsewhere on the page.
function StatGroup({
	label,
	accent,
	metrics,
	showHeader,
}: {
	label: string;
	accent: "serials" | "batches";
	metrics: StatMetric[];
	showHeader: boolean;
}) {
	const dotClass = accent === "serials" ? "bg-primary" : "bg-reviewing";
	const underlineClass =
		accent === "serials" ? "border-primary/40" : "border-reviewing/40";
	return (
		<div className="flex flex-col justify-end">
			{showHeader && (
				<div
					className={`flex items-center gap-1.5 pb-1 mb-1.5 border-b ${underlineClass}`}
				>
					<span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
					<span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
						{label}
					</span>
				</div>
			)}
			<div className="flex items-stretch divide-x divide-border-subtle">
				{metrics.map((m) => (
					<div
						key={m.label}
						title={m.hint}
						className="px-4 text-right whitespace-nowrap first:pl-0 last:pr-0"
					>
						<p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted leading-tight">
							{m.label}
						</p>
						<p
							className={`text-lg font-bold tabular-nums leading-tight ${
								m.tone === "warning"
									? "text-warning-text"
									: "text-text-primary"
							}`}
						>
							{m.value}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

// Header stat rollups (C1) — compact, non-blocking KPIs driven by
// GET /inventory/:itemId/tracking-summary. Loading shows muted "…" placeholders
// rather than a spinner so it never blocks. Renders inline on the page header
// row (title · metrics · Receive button). Serial and batch metrics live in two
// color-keyed StatGroups; the wide gap between them (vs. hairlines within) is
// the division. Group eyebrows only appear when both kinds are present — a
// single-tracking item needs no disambiguation and keeps the bare row.
function TrackingStatsRow({
	itemId,
	isSerialized,
	isBatchTracked,
}: {
	itemId: string;
	isSerialized: boolean;
	isBatchTracked: boolean;
}) {
	const { data, isLoading } = useTrackingSummaryQuery(itemId);
	const serials = data?.serials;
	const batches = data?.batches;
	const n = (v: number | undefined) => (isLoading ? "…" : String(v ?? 0));
	const both = isSerialized && isBatchTracked;

	// Labels stay bare ("In Warehouse", not "Batch · Warehouse") — the group
	// eyebrow now carries the serial-vs-batch context, so the two clusters read
	// as parallel scales.
	const serialMetrics: StatMetric[] = [
		{ label: "In Warehouse", value: n(serials?.in_warehouse) },
		{ label: "On Vehicles", value: n(serials?.on_vehicle) },
		{
			label: "Consumed",
			value: n(serials?.consumed),
			hint:
				!isLoading && serials && (serials.lost > 0 || serials.returned > 0)
					? `${serials.lost} lost · ${serials.returned} returned`
					: undefined,
			tone: !isLoading && serials && serials.lost > 0 ? "warning" : undefined,
		},
	];
	const batchMetrics: StatMetric[] = [
		{ label: "Lots", value: n(batches?.lots) },
		{ label: "In Warehouse", value: n(batches?.qty_in_warehouse) },
		{ label: "On Vehicles", value: n(batches?.qty_on_vehicles) },
	];

	return (
		<div className="flex-1 flex items-stretch justify-end gap-6">
			{isSerialized && (
				<StatGroup
					label="Serials"
					accent="serials"
					metrics={serialMetrics}
					showHeader={both}
				/>
			)}
			{isBatchTracked && (
				<StatGroup
					label="Batches"
					accent="batches"
					metrics={batchMetrics}
					showHeader={both}
				/>
			)}
		</div>
	);
}

type Tab = "serials" | "batches";

const STATUS_OPTIONS: StatusOption[] = (
	Object.keys(SERIAL_STATUS_LABEL) as SerialUnitStatus[]
).map((value) => ({
	value,
	label: SERIAL_STATUS_LABEL[value],
}));

const SERIAL_GRID = "grid-cols-[1fr_120px_110px_170px_100px_64px]";
// Same columns as SERIAL_GRID plus a leading checkbox column — only used when
// bulk-select is available (canManage), so non-managers keep the original
// alignment with no empty gutter. The 34px lead column fits the checkbox's
// small symmetric touch-target box (14px + p-1.5) so clicks a few px off the
// checkbox still land on the <label> — and stopPropagation there keeps them
// from firing the row's navigate (see the wrapper in the rows below).
const SERIAL_GRID_SELECTABLE = "grid-cols-[40px_1fr_120px_110px_170px_100px_64px]";
const BATCH_GRID = "grid-cols-[140px_160px_120px_90px_1fr_48px]";

// Copy for the bulk (multi-select) status-change confirm dialog — same shape
// as SERIAL_CONFIRM_COPY but parameterized by count instead of a single
// serial number.
function bulkSerialConfirmCopy(
	action: "lost" | "returned",
	count: number
): { title: string; body: string; cta: string } {
	const unit = count === 1 ? "unit" : "units";
	const pronoun = count === 1 ? "its" : "their";
	if (action === "lost") {
		return {
			title: `Mark ${count} ${unit} as lost`,
			body: `This records a stock movement removing ${count} ${unit} from the warehouse and sets ${pronoun} status to Lost. Marking lost is permanent — a lost unit can't be restored anywhere in the app.`,
			cta: "Mark Lost",
		};
	}
	return {
		title: `Mark ${count} ${unit} as returned`,
		body: `This records a stock movement removing ${count} ${unit} from the warehouse and sets ${pronoun} status to Returned.`,
		cta: "Mark Returned",
	};
}

// Runs fn over ids with at most `limit` in flight at once — a bulk action bar
// can select many rows, and this avoids firing e.g. 100 simultaneous PATCH
// requests while still being much faster than a strict sequential loop.
// Returns which ids succeeded vs. failed (not just counts) so a partial
// failure can re-select exactly the ones that need retrying.
async function runBulk<T>(
	ids: string[],
	limit: number,
	fn: (id: string) => Promise<T>
): Promise<{ succeededIds: string[]; failedIds: string[] }> {
	const succeededIds: string[] = [];
	const failedIds: string[] = [];
	let index = 0;
	const worker = async () => {
		while (index < ids.length) {
			const current = index++;
			const id = ids[current];
			try {
				await fn(id);
				succeededIds.push(id);
			} catch {
				failedIds.push(id);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, () => worker()));
	return { succeededIds, failedIds };
}

function daysUntil(dateStr: string): number {
	return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function expiryTone(expiresAt: string | null): "none" | "soon" | "expired" {
	if (!expiresAt) return "none";
	const days = daysUntil(expiresAt);
	if (days < 0) return "expired";
	if (days <= 30) return "soon";
	return "none";
}

// AddToLabelQueueButton (components/inventory/labels/) only accepts a full
// InventoryItem and hardcodes kind: "item" (it lazily ensures an ITM- code
// via /ensure-code first) — serials/batches already carry their own `code`
// from receiving, so there's nothing to "ensure" and no InventoryItem to
// pass. This talks to the same labelQueueStore directly instead of reusing
// that button, keeping the icon-button visual language consistent.
function QueueLabelButton({
	id,
	code,
	kind,
	primaryLabel,
	secondaryLabel,
}: {
	id: string;
	code: string;
	kind: LabelQueueItem["kind"];
	primaryLabel: string;
	secondaryLabel?: string;
}) {
	const add = useLabelQueueStore((s) => s.add);
	const [added, setAdded] = useState(false);

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				add({ id, code, kind, primaryLabel, secondaryLabel });
				setAdded(true);
				window.setTimeout(() => setAdded(false), 1200);
			}}
			title={added ? "Added to label queue" : "Add to label queue"}
			className="p-2 -my-1 rounded text-text-faint hover:text-primary hover:bg-primary/10 transition-colors"
		>
			{added ? (
				<Check size={14} className="text-success-text" />
			) : (
				<Printer size={14} />
			)}
		</button>
	);
}

// Per-row "More actions" menu. The serials table lives inside overflow-x-auto
// (and an outer overflow-auto), so an absolutely-positioned dropdown gets
// clipped by those scroll boxes and forces a scroll to see it. This floats the
// menu with position:fixed anchored to the trigger's rect — fixed escapes both
// scroll boxes so the menu overlaps content instead. Mirrors DateRangeFilter's
// floating pattern (getBoundingClientRect + flip-up when near the viewport
// bottom + dual-ref outside-close).
function SerialRowActions({
	unit,
	onSelect,
}: {
	unit: SerialUnitRow;
	onSelect: (action: SerialConfirmAction) => void;
}) {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(
		null
	);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Delete is only offered for warehouse units (no vehicle) — matches the
	// backend guard and the prior inline menu's condition. Menu height drives
	// the flip-up threshold, so it tracks whether the third item is present.
	const canDelete = !unit.current_vehicle_id;
	const menuHeight = canDelete ? 118 : 84;

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (
				buttonRef.current?.contains(e.target as Node) ||
				menuRef.current?.contains(e.target as Node)
			)
				return;
			setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		// A fixed menu keeps its viewport coords while the list scrolls, so it
		// would visually detach from its row — close on any scroll rather than
		// let it float over the wrong content. Capture phase catches the inner
		// scroll container, not just window.
		const onScroll = () => setOpen(false);
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		window.addEventListener("scroll", onScroll, true);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
			window.removeEventListener("scroll", onScroll, true);
		};
	}, [open]);

	const toggle = () => {
		if (open) {
			setOpen(false);
			return;
		}
		const rect = buttonRef.current?.getBoundingClientRect();
		if (!rect) return;
		const openAbove = rect.bottom + menuHeight > window.innerHeight - 16;
		setPos({
			right: window.innerWidth - rect.right,
			...(openAbove
				? { bottom: window.innerHeight - rect.top + 4 }
				: { top: rect.bottom + 4 }),
		});
		setOpen(true);
	};

	const pick = (action: SerialConfirmAction) => {
		setOpen(false);
		onSelect(action);
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				onClick={toggle}
				aria-label={`More actions for serial ${unit.serial_number}`}
				aria-haspopup="menu"
				aria-expanded={open}
				className="p-2 -my-1 rounded text-text-faint hover:text-text-primary hover:bg-surface-raised transition-colors"
			>
				<MoreHorizontal size={14} />
			</button>
			{open && pos && (
				<div
					ref={menuRef}
					role="menu"
					style={{
						position: "fixed",
						right: pos.right,
						...(pos.top !== undefined ? { top: pos.top } : {}),
						...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
						zIndex: 60,
					}}
					className="w-44 bg-base border border-border rounded-lg shadow-2xl shadow-black/50 py-1"
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => pick("returned")}
						className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
					>
						<RotateCcw size={13} />
						Mark Returned
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => pick("lost")}
						className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-warning-text hover:bg-surface transition-colors"
					>
						<PackageX size={13} />
						Mark Lost
					</button>
					{canDelete && (
						<button
							type="button"
							role="menuitem"
							onClick={() => pick("delete")}
							className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-error-text hover:bg-surface transition-colors"
						>
							<Trash2 size={13} />
							Delete
						</button>
					)}
				</div>
			)}
		</>
	);
}

function SerialsTab({
	itemId,
	itemName,
	onReceive,
	canManage,
}: {
	itemId: string;
	itemName: string;
	onReceive?: () => void;
	canManage: boolean;
}) {
	const navigate = useNavigate();
	const toast = useToast();
	const queryClient = useQueryClient();
	const addToLabelQueue = useLabelQueueStore((s) => s.add);
	const { data: vehicles } = useVehiclesQuery();
	const [statusFilter, setStatusFilter] = useState<SerialUnitStatus | null>(null);
	const [searchInput, setSearchInput] = useState("");
	const search = useDebouncedValue(searchInput, 300);
	const [cursor, setCursor] = useState<string | undefined>(undefined);
	const [rows, setRows] = useState<SerialUnitRow[]>([]);
	const [confirmTarget, setConfirmTarget] = useState<{
		unit: SerialUnitRow;
		action: SerialConfirmAction;
	} | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [bulkAction, setBulkAction] = useState<"lost" | "returned" | null>(null);
	const [bulkPending, setBulkPending] = useState(false);
	const selectAllRef = useRef<HTMLInputElement>(null);

	const { data, isLoading, isFetching } = useSerialsQuery(itemId, {
		status: statusFilter ?? undefined,
		search: search || undefined,
		cursor,
	});

	const serialActions = useSerialActions(confirmTarget?.unit.id ?? "");

	// Status or search changes restart pagination from the first page — any
	// selection made against the previous page/filter no longer maps to what's
	// loaded, so it's cleared alongside the reset rather than left stale.
	useEffect(() => {
		setCursor(undefined);
		setRows([]);
		setSelectedIds(new Set());
	}, [statusFilter, search]);

	// Only in-warehouse units are eligible for bulk selection — a mixed
	// in-flight/consumed/lost/returned unit can't be marked lost/returned in
	// bulk, so its checkbox is disabled rather than letting it get selected
	// and then silently excluded from the action.
	const eligibleRows = rows.filter((r) => r.status === "in_warehouse");
	const ineligibleCount = rows.length - eligibleRows.length;

	// Native checkboxes don't expose "indeterminate" as a prop — it has to be
	// set imperatively whenever the loaded rows or selection change. Based on
	// eligible rows only, since ineligible ones can never be selected.
	useEffect(() => {
		if (!selectAllRef.current) return;
		const loadedSelected = eligibleRows.filter((r) => selectedIds.has(r.id)).length;
		selectAllRef.current.indeterminate =
			loadedSelected > 0 && loadedSelected < eligibleRows.length;
	}, [eligibleRows, selectedIds]);

	// cursor === undefined means this response is page 1 (replace); otherwise
	// it's a "load more" page (append).
	useEffect(() => {
		if (!data) return;
		setRows((prev) => (cursor ? [...prev, ...data.serials] : data.serials));
	}, [data, cursor]);

	const vehicleName = (vehicleId: string | null): string => {
		if (!vehicleId) return "Warehouse";
		return vehicles?.find((v) => v.id === vehicleId)?.name ?? "Vehicle";
	};

	// Backend re-checks eligibility authoritatively — this only reset local
	// pagination so the tab refetches page 1 (delete removes the row; a status
	// change moves it out of the in-warehouse view either way).
	const handleConfirmAction = async () => {
		if (!confirmTarget) return;
		setActionError(null);
		try {
			if (confirmTarget.action === "delete") {
				await serialActions.remove();
				toast.success("Serial deleted");
			} else {
				await serialActions.update(confirmTarget.action);
				toast.success(
					confirmTarget.action === "lost"
						? "Marked lost"
						: "Marked returned"
				);
			}
			setConfirmTarget(null);
			setCursor(undefined);
			setRows([]);
		} catch (e) {
			const message = e instanceof Error ? e.message : "Action failed";
			setActionError(message);
			toast.error(message);
		}
	};

	const toggleRow = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const toggleSelectAll = () => {
		setSelectedIds((prev) => {
			const allEligibleSelected =
				eligibleRows.length > 0 &&
				eligibleRows.every((r) => prev.has(r.id));
			return allEligibleSelected
				? new Set()
				: new Set(eligibleRows.map((r) => r.id));
		});
	};

	const selectedRows = rows.filter((r) => selectedIds.has(r.id));
	const allSelectedInWarehouse =
		selectedRows.length > 0 && selectedRows.every((r) => r.status === "in_warehouse");
	const gridClass = canManage ? SERIAL_GRID_SELECTABLE : SERIAL_GRID;

	const handleBulkPrint = () => {
		selectedRows.forEach((r) => {
			addToLabelQueue({
				id: r.id,
				code: r.code,
				kind: "serial",
				primaryLabel: itemName,
				secondaryLabel: r.serial_number,
			});
		});
		const count = selectedRows.length;
		toast.success(`${count} label${count !== 1 ? "s" : ""} queued`);
		setSelectedIds(new Set());
		navigate("/dispatch/inventory/labels/print");
	};

	// Loops the update PATCH across every selected unit (bounded concurrency),
	// then resets pagination exactly like the single-row flow so units that
	// moved out of the current status/search view disappear from `rows`.
	const handleBulkConfirm = async () => {
		if (!bulkAction) return;
		setBulkPending(true);
		const ids = selectedRows.map((r) => r.id);
		const action = bulkAction;
		const { succeededIds, failedIds } = await runBulk(ids, 5, (id) =>
			trackingApi.updateSerial(id, { status: action })
		);
		invalidate.warehouse(queryClient);
		setBulkPending(false);
		setBulkAction(null);
		setCursor(undefined);
		setRows([]);
		if (failedIds.length === 0) {
			setSelectedIds(new Set());
			toast.success(`${succeededIds.length} marked ${action}`);
		} else if (succeededIds.length === 0) {
			// Nothing changed — keep the same selection so the toolbar stays open
			// and the user can retry without re-picking rows.
			setSelectedIds(new Set(failedIds));
			toast.error(
				`Failed to update ${failedIds.length} unit${failedIds.length !== 1 ? "s" : ""}`
			);
		} else {
			// Partial failure — re-select just the failed subset and keep the
			// bulk toolbar open for a retry instead of clearing everything.
			setSelectedIds(new Set(failedIds));
			toast.success(`${succeededIds.length} marked ${action}`);
			toast.error(
				`${failedIds.length} unit${failedIds.length !== 1 ? "s" : ""} failed to update`
			);
		}
	};

	// Computed once per render rather than 3x inline in each ConfirmDialog below.
	const copy = confirmTarget
		? serialActions.confirmCopy(confirmTarget.action, confirmTarget.unit.serial_number)
		: null;
	const bulkCopy = bulkAction ? bulkSerialConfirmCopy(bulkAction, selectedRows.length) : null;

	return (
		<div>
			<div className="px-5 pt-3">
			<PageControls
				className="mb-3"
				left={
					<SearchBar
						value={searchInput}
						onChange={setSearchInput}
						placeholder="Search serial or code..."
					/>
				}
				middle={
					<StatusFilter
						options={STATUS_OPTIONS}
						value={statusFilter}
						onChange={(v) =>
							setStatusFilter(
								v as SerialUnitStatus | null
							)
						}
						placeholder="Status"
						allLabel="All statuses"
					/>
				}
				right={
					<span className="text-sm text-text-tertiary whitespace-nowrap">
						<span className="font-semibold text-text-primary tabular-nums">
							{rows.length}
						</span>{" "}
						unit{rows.length !== 1 ? "s" : ""}
						{canManage && ineligibleCount > 0 && (
							<span className="text-text-muted">
								{" · "}
								{ineligibleCount} ineligible
							</span>
						)}
					</span>
				}
			/>
			</div>

			{isLoading && rows.length === 0 && (
				<div className="flex justify-center py-16">
					<LoadSvg className="w-8 h-8" />
				</div>
			)}

			{!isLoading && rows.length === 0 && (
				<EmptyState
					icon={<Barcode size={28} />}
					title={
						search || statusFilter
							? "No serial units match your filters"
							: "No serial units yet"
					}
					description={
						search || statusFilter
							? "Try a different search term or status."
							: "Receive stock to add serial units for this item."
					}
					action={
						!search && !statusFilter && onReceive
							? {
									label: "Receive Stock",
									onClick: onReceive,
									icon: <Plus size={14} />,
								}
							: undefined
					}
				/>
			)}

			{rows.length > 0 && (
				<div className="mx-5 mb-4 border border-border-subtle bg-base rounded-lg overflow-hidden">
					<div className="overflow-x-auto">
						<div className="min-w-[820px]">
							<div
								className={`grid ${gridClass} items-center px-4 py-2.5 border-b border-border-subtle bg-base sticky top-0 z-10`}
							>
							{canManage && (
								<label className="flex items-center justify-center place-self-center rounded-md p-2 -my-1 border border-transparent cursor-pointer hover:bg-surface-raised/40 hover:border-border-subtle transition-colors">
									<input
										type="checkbox"
										ref={selectAllRef}
										checked={
											eligibleRows.length >
												0 &&
											eligibleRows.every(
												(
													r
												) =>
													selectedIds.has(
														r.id
													)
											)
										}
										disabled={
											eligibleRows.length ===
											0
										}
										onChange={
											toggleSelectAll
										}
										aria-label="Select all eligible serial units"
										title={
											eligibleRows.length >
											0
												? `Select all ${eligibleRows.length} eligible loaded unit${eligibleRows.length !== 1 ? "s" : ""}`
												: "No in-warehouse units loaded to select"
										}
										className="h-3.5 w-3.5 rounded border-border bg-base text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
									/>
								</label>
							)}
							{[
								"Serial Number",
								"Code",
								"Status",
								"Location",
								"Received",
								"",
							].map((h) => (
								<div
									key={h}
									className="text-xs font-bold text-text-tertiary"
								>
									{h}
								</div>
							))}
						</div>
						{rows.map((unit) => (
							<div
								key={unit.id}
								role="button"
								tabIndex={0}
								onClick={() =>
									navigate(
										`/dispatch/inventory/serials/${unit.id}`
									)
								}
								onKeyDown={(e) => {
									if (
										e.key !== "Enter" &&
										e.key !== " "
									)
										return;
									e.preventDefault();
									navigate(
										`/dispatch/inventory/serials/${unit.id}`
									);
								}}
								aria-label={`View serial ${unit.serial_number}`}
								className={`grid ${gridClass} items-center px-4 py-2.5 border-t border-border-subtle hover:bg-surface transition-colors cursor-pointer`}
							>
								{canManage && (
									// Small symmetric box hugging the 14px
									// checkbox (equal p-1.5 all sides, sized to
									// content via place-self-center). No resting
									// border/bg; hover reveals a slight tint +
									// faint border. onClick stopPropagation means
									// a near-miss toggles (via <label>) or does
									// nothing — never the row's navigate.
									<label
										className={`flex items-center justify-center place-self-center rounded-md p-2 -my-1 border border-transparent transition-colors ${
											unit.status ===
											"in_warehouse"
												? "cursor-pointer hover:bg-surface-raised/40 hover:border-border-subtle"
												: "cursor-default"
										}`}
										onClick={(e) =>
											e.stopPropagation()
										}
									>
										<input
											type="checkbox"
											checked={selectedIds.has(
												unit.id
											)}
											disabled={
												unit.status !==
												"in_warehouse"
											}
											onChange={() =>
												toggleRow(
													unit.id
												)
											}
											aria-label={`Select serial ${unit.serial_number}`}
											title={
												unit.status !==
												"in_warehouse"
													? "Only in-warehouse units are eligible for bulk actions"
													: undefined
											}
											className="h-3.5 w-3.5 rounded border-border bg-base text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
										/>
									</label>
								)}
								<div className="text-sm font-medium text-text-primary break-all pr-2">
									{unit.serial_number}
								</div>
								<div className="text-xs font-mono text-text-muted break-all pr-2">
									{unit.code}
								</div>
								<div>
									<span
										className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SERIAL_STATUS_BADGE[unit.status]}`}
									>
										{
											SERIAL_STATUS_LABEL[
												unit
													.status
											]
										}
									</span>
								</div>
								<div className="flex items-center gap-1.5 text-xs text-text-secondary pr-2">
									{unit.current_vehicle_id ? (
										<Truck
											size={12}
											className="shrink-0 text-primary"
										/>
									) : (
										<Warehouse
											size={12}
											className="shrink-0 text-text-faint"
										/>
									)}
									<span className="break-words">
										{vehicleName(
											unit.current_vehicle_id
										)}
									</span>
								</div>
								<div className="text-xs text-text-muted">
									{formatDate(
										unit.received_at
									)}
								</div>
								<div
									className="flex justify-end items-center gap-1"
									onClick={(e) =>
										e.stopPropagation()
									}
								>
									<QueueLabelButton
										id={unit.id}
										code={unit.code}
										kind="serial"
										primaryLabel={
											itemName
										}
										secondaryLabel={
											unit.serial_number
										}
									/>
									{canManage &&
										(unit.status ===
										"in_warehouse" ? (
											<SerialRowActions
												unit={unit}
												onSelect={(
													action
												) =>
													setConfirmTarget(
														{
															unit,
															action,
														}
													)
												}
											/>
										) : (
											<span className="w-[28px] h-[28px]" />
										))}
								</div>
							</div>
						))}
						</div>
					</div>
				</div>
			)}

			{data?.nextCursor && (
				<div className="px-5 py-3 flex justify-center">
					<button
						type="button"
						onClick={() =>
							setCursor(data.nextCursor ?? undefined)
						}
						disabled={isFetching}
						className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors disabled:opacity-50"
					>
						{isFetching ? "Loading…" : "Load more"}
					</button>
				</div>
			)}

			{canManage && selectedIds.size > 0 && (
				<div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 px-5 py-2.5 border-t border-border-strong bg-surface-raised shadow-[0_-4px_12px_rgba(0,0,0,0.25)] flex-wrap">
					<span className="text-xs font-medium text-text-secondary">
						{selectedIds.size} selected
					</span>
					<div className="flex items-center gap-2 flex-wrap">
						<button
							type="button"
							onClick={handleBulkPrint}
							className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
						>
							<Printer size={13} />
							Print labels
						</button>
						<button
							type="button"
							onClick={() => setBulkAction("returned")}
							disabled={!allSelectedInWarehouse}
							title={
								!allSelectedInWarehouse
									? "Only in-warehouse units can be marked returned"
									: undefined
							}
							className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-text-secondary"
						>
							<RotateCcw size={13} />
							Mark Returned
						</button>
						<button
							type="button"
							onClick={() => setBulkAction("lost")}
							disabled={!allSelectedInWarehouse}
							title={
								!allSelectedInWarehouse
									? "Only in-warehouse units can be marked lost"
									: undefined
							}
							className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-warning-text hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface"
						>
							<PackageX size={13} />
							Mark Lost
						</button>
						<button
							type="button"
							onClick={() => setSelectedIds(new Set())}
							className="px-2 py-1.5 text-xs text-text-faint hover:text-text-primary transition-colors"
						>
							Clear
						</button>
					</div>
				</div>
			)}

			<ConfirmDialog
				open={confirmTarget !== null}
				title={copy?.title ?? ""}
				body={copy?.body ?? ""}
				confirmLabel={copy?.cta ?? ""}
				tone={confirmTarget?.action === "delete" ? "destructive" : "primary"}
				pending={serialActions.isPending}
				error={actionError}
				onConfirm={handleConfirmAction}
				onCancel={() => {
					setConfirmTarget(null);
					setActionError(null);
				}}
			/>

			<ConfirmDialog
				open={bulkAction !== null}
				title={bulkCopy?.title ?? ""}
				body={bulkCopy?.body ?? ""}
				confirmLabel={bulkCopy?.cta ?? ""}
				tone="primary"
				pending={bulkPending}
				onConfirm={handleBulkConfirm}
				onCancel={() => setBulkAction(null)}
			/>
		</div>
	);
}

function BatchesTab({
	itemId,
	itemName,
	onReceive,
}: {
	itemId: string;
	itemName: string;
	onReceive?: () => void;
}) {
	const navigate = useNavigate();
	const [searchInput, setSearchInput] = useState("");
	const search = useDebouncedValue(searchInput, 300);
	const { data, isLoading } = useBatchesQuery(itemId, { search: search || undefined });
	const batches: BatchListRow[] = data?.batches ?? [];
	const hasSearch = search.trim().length > 0;

	return (
		<div>
			<div className="px-5 pt-3">
				<PageControls
					className="mb-3"
					left={
						<SearchBar
							value={searchInput}
							onChange={setSearchInput}
							placeholder="Search batch # or code..."
						/>
					}
					right={
						<span className="text-sm text-text-tertiary whitespace-nowrap">
							<span className="font-semibold text-text-primary tabular-nums">
								{batches.length}
							</span>{" "}
							batch{batches.length !== 1 ? "es" : ""}
						</span>
					}
				/>
			</div>

			{isLoading && (
				<div className="flex justify-center py-16">
					<LoadSvg className="w-8 h-8" />
				</div>
			)}

			{!isLoading && batches.length === 0 && (
				<EmptyState
					icon={<Boxes size={28} />}
					title={
						hasSearch
							? "No batches match your search"
							: "No batches yet"
					}
					description={
						hasSearch
							? "Try a different batch number or code."
							: "Receive stock to add batches/lots for this item."
					}
					action={
						!hasSearch && onReceive
							? {
									label: "Receive Stock",
									onClick: onReceive,
									icon: <Plus size={14} />,
								}
							: undefined
					}
				/>
			)}

			{batches.length > 0 && (
				<div className="mx-5 mb-4 border border-border-subtle bg-base rounded-lg overflow-hidden">
					<div className="overflow-x-auto">
						<div className="min-w-[720px]">
							<div
								className={`grid ${BATCH_GRID} items-center px-4 py-2.5 border-b border-border-subtle bg-base sticky top-0 z-10`}
							>
							{[
								"Batch #",
								"Code",
								"Expiry",
								"Warehouse Qty",
								"Vehicles",
								"",
							].map((h) => (
								<div
									key={h}
									className="text-xs font-bold text-text-tertiary"
								>
									{h}
								</div>
							))}
						</div>
					{batches.map((batch) => {
						const tone = expiryTone(batch.expires_at);
						return (
							<div
								key={batch.id}
								role="button"
								tabIndex={0}
								onClick={() =>
									navigate(
										`/dispatch/inventory/batches/${batch.id}`
									)
								}
								onKeyDown={(e) => {
									if (
										e.key !== "Enter" &&
										e.key !== " "
									)
										return;
									e.preventDefault();
									navigate(
										`/dispatch/inventory/batches/${batch.id}`
									);
								}}
								aria-label={`View batch ${batch.batch_number}`}
								className={`grid ${BATCH_GRID} items-center px-4 py-2.5 border-t border-border-subtle hover:bg-surface transition-colors cursor-pointer`}
							>
								<div className="min-w-0 pr-2">
									<div className="text-sm font-medium text-text-primary break-all">
										{batch.batch_number}
									</div>
									{batch.recalled_at && (
										<span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-error/20 text-error-text border border-error/30">
											RECALLED
										</span>
									)}
								</div>
								<div className="text-xs font-mono text-text-muted break-all pr-2">
									{batch.code}
								</div>
								<div className="text-xs pr-2">
									{batch.expires_at ? (
										<div
											className={
												tone ===
												"expired"
													? "text-orange-text font-semibold"
													: tone ===
														  "soon"
														? "text-warning-text font-semibold"
														: "text-text-secondary"
											}
										>
											<div>
												{formatDate(
													batch.expires_at
												)}
											</div>
											{tone ===
												"expired" && (
												<div className="text-[10px]">
													Expired
												</div>
											)}
											{tone ===
												"soon" && (
												<div className="text-[10px]">
													Expires
													in{" "}
													{daysUntil(
														batch.expires_at
													)}

													d
												</div>
											)}
										</div>
									) : (
										<span className="text-text-faint">
											—
										</span>
									)}
								</div>
								<div className="text-sm font-semibold tabular-nums text-text-primary">
									{Number(
										batch.qty_in_warehouse
									)}
								</div>
								<div className="min-w-0 pr-2">
									{batch.vehicles.length ===
									0 ? (
										<span className="text-text-faint text-xs">
											—
										</span>
									) : (
										<div className="flex flex-wrap gap-1">
											{batch.vehicles.map(
												(
													v
												) => (
													<span
														key={
															v.vehicle_id
														}
														className="inline-flex items-center gap-1 text-[11px] bg-surface-raised border border-border-subtle rounded-full px-2 py-0.5 text-text-secondary"
													>
														<Truck
															size={
																10
															}
														/>
														{
															v.vehicle_name
														}{" "}
														·{" "}
														{Number(
															v.qty_on_hand
														)}
													</span>
												)
											)}
										</div>
									)}
								</div>
								<div className="flex justify-end">
									<QueueLabelButton
										id={batch.id}
										code={batch.code}
										kind="batch"
										primaryLabel={
											itemName
										}
										secondaryLabel={
											batch.batch_number
										}
									/>
								</div>
							</div>
						);
					})}
					</div>
				</div>
			</div>
		)}
		</div>
	);
}

export default function ItemTrackingPage() {
	const { itemId } = useParams<{ itemId: string }>();
	const [activeTab, setActiveTab] = useState<Tab>("serials");
	const [receiveOpen, setReceiveOpen] = useState(false);
	const canReceive = usePermission("manage_inventory");

	// No single-item GET endpoint is wired up on the frontend yet (InventoryPage
	// itself only ever fetches the full list + client-side highlight/filter, see
	// its "?highlight=" convention) — mirror that rather than adding a new API
	// call, since this page is restricted to tracking-only changes.
	const { data: items, isLoading } = useAllInventoryQuery();
	const item = items?.find((i) => i.id === itemId);

	if (isLoading) {
		return (
			<div className="space-y-4 animate-pulse p-5">
				<div className="h-6 w-48 bg-surface-raised rounded" />
				<div className="h-10 bg-surface-raised rounded-xl" />
				<div className="h-64 bg-surface-raised rounded-xl" />
			</div>
		);
	}

	if (!item) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<div className="text-text-primary text-lg">Item not found</div>
			</div>
		);
	}

	if (!item.is_serialized && !item.is_batch_tracked) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
				<div className="text-text-primary text-lg">Not tracked</div>
				<p className="text-sm text-text-muted max-w-sm">
					{item.name} isn't serialized or batch-tracked, so there are
					no individual units or lots to show here.
				</p>
			</div>
		);
	}

	const tabs: Tab[] = [
		...(item.is_serialized ? (["serials"] as const) : []),
		...(item.is_batch_tracked ? (["batches"] as const) : []),
	];
	// Falls back to whichever tab is actually available (e.g. a batch-only item
	// renders straight into Batches, skipping the (hidden) Serials default).
	const effectiveTab: Tab = tabs.includes(activeTab) ? activeTab : tabs[0];

	return (
		<div className="flex flex-col h-full text-text-primary">
			<div className="px-5 pt-4 border-b border-border">
				<div className="flex items-center gap-6 pb-3">
					<div className="shrink-0 min-w-0">
						<div className="flex items-center gap-2.5 flex-wrap">
							<h2 className="text-2xl font-semibold text-text-primary">
								{item.name}
							</h2>
							{item.is_serialized && (
								<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary-text">
									Serialized
								</span>
							)}
							{item.is_batch_tracked && (
								<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-reviewing/15 text-reviewing-text">
									Batch-tracked
								</span>
							)}
						</div>
						{item.sku && (
							<div className="text-xs text-text-muted mt-1 font-mono">
								{item.sku}
							</div>
						)}
					</div>
					<TrackingStatsRow
						itemId={item.id}
						isSerialized={item.is_serialized}
						isBatchTracked={item.is_batch_tracked}
					/>
					{canReceive && (
						<button
							type="button"
							onClick={() => setReceiveOpen(true)}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded-md transition-colors shrink-0"
						>
							<Plus size={15} />
							Receive Stock
						</button>
					)}
				</div>
				{tabs.length > 1 && (
					<div className="flex gap-0 -mb-px">
						{tabs.map((t) => (
							<button
								key={t}
								onClick={() => setActiveTab(t)}
								className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
									effectiveTab === t
										? "border-primary text-primary"
										: "border-transparent text-text-muted hover:text-text-secondary"
								}`}
							>
								{t === "serials"
									? "Serials"
									: "Batches"}
							</button>
						))}
					</div>
				)}
			</div>

			<div className="flex-1 overflow-auto min-h-0">
				{effectiveTab === "serials" && item.is_serialized && (
					<SerialsTab
						itemId={item.id}
						itemName={item.name}
						onReceive={
							canReceive
								? () => setReceiveOpen(true)
								: undefined
						}
						canManage={canReceive}
					/>
				)}
				{effectiveTab === "batches" && item.is_batch_tracked && (
					<BatchesTab
						itemId={item.id}
						itemName={item.name}
						onReceive={
							canReceive
								? () => setReceiveOpen(true)
								: undefined
						}
					/>
				)}
			</div>

			<ReceiveStockModal
				isOpen={receiveOpen}
				onClose={() => setReceiveOpen(false)}
				item={item}
			/>
		</div>
	);
}
