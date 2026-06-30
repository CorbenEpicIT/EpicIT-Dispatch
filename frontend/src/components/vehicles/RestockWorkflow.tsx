import { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import LoadSvg from "../../assets/icons/loading.svg?react";
import { formatRestockDate } from "../../lib/stockUtils";
import {
	useCompleteRestockMutation,
	useTomorrowRequirementsQuery,
	useVehicleUsageTodayQuery,
} from "../../hooks/useVehicleStock";
import type { VehicleStockItem, VehicleRestockRecord } from "../../types/vehicles";

type SubTab = "restock" | "prepare";

interface RestockLine {
	stockItemId: string;
	item: VehicleStockItem;
	qtyToRestock: number;
	tomorrowNeed: number;
}

// ── CompleteStep ──────────────────────────────────────────────────────────────

function CompleteStep({ record, stockItems }: {
	record: VehicleRestockRecord;
	stockItems: VehicleStockItem[];
}) {
	const hasShortfall = record.restock_lines.some((l) => l.qty_shortfall > 0);
	return (
		<div className="px-5 py-6">
			<div className="flex flex-col items-center text-center mb-6">
				<div className="w-12 h-12 rounded-full bg-success/15 border-2 border-success flex items-center justify-center text-xl mb-3">✓</div>
				<div className="text-base font-bold text-text-primary">{record.mode === "prepare" ? "Prep Complete" : "Restock Complete"}</div>
				<div className="text-xs text-text-muted mt-1">
					{formatRestockDate(record.completed_at)}
					{" · "}{record.completed_by?.name ?? record.completed_by_tech?.name ?? "—"}
				</div>
			</div>
			{record.restock_lines.length > 0 && (
				<div className="bg-surface rounded-lg border border-border overflow-hidden mb-4">
					<div className="px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-muted uppercase tracking-wider">Restocked</div>
					{record.restock_lines.map((line) => (
						<div key={line.id} className="flex items-center justify-between px-4 py-2 border-b border-border-subtle last:border-0">
							<span className="text-sm text-text-primary">
								{stockItems.find((s) => s.id === line.stock_item_id)?.inventory_item.name ?? line.stock_item_id}
							</span>
							<div className="flex items-center gap-3">
								<span className="text-sm font-semibold text-success">+{line.qty_restocked}</span>
								{line.qty_shortfall > 0 && <span className="text-xs text-warning-text">({line.qty_shortfall} short)</span>}
							</div>
						</div>
					))}
				</div>
			)}
			{record.restock_lines.length === 0 && (
				<p className="text-sm text-text-muted text-center mb-4">No items restocked — all were at or above standard.</p>
			)}
			{hasShortfall && (
				<p className="text-xs text-warning-text mb-4">Some items were short in the warehouse. Order more stock to fully restock next time.</p>
			)}
		</div>
	);
}

// ── RestockContextPanel — implemented in Task 2 ───────────────────────────────────

function RestockContextPanel({ vehicleId, showHeader = false }: { vehicleId: string; showHeader?: boolean }) {
	const { data: groups = [], isLoading } = useVehicleUsageTodayQuery(vehicleId);
	if (isLoading) return <div className="flex justify-center py-16"><LoadSvg className="w-8 h-8" /></div>;

	const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

	return (
		<div className="px-4 py-4">
			{showHeader && (
				<div className="flex items-center gap-2 mb-3">
					<span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Usage Since Last Restock</span>
					{totalItems > 0 && (
						<span className="text-[10px] font-bold bg-surface-raised border border-border text-text-muted px-1.5 py-0.5 rounded">{totalItems}</span>
					)}
				</div>
			)}
			{groups.length === 0 ? (
				<p className="text-sm text-text-muted">No usage since last restock — proceed to restock.</p>
			) : (
				<div className="space-y-3">
					{groups.map((group) => (
						<div key={group.visitId} className="bg-surface rounded-lg border border-border overflow-hidden">
							<div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
								<span className="text-sm font-semibold text-text-primary">{group.visitName}</span>
								{group.scheduledAt && (
									<span className="text-xs text-text-muted">
										{new Date(group.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
									</span>
								)}
							</div>
							<div className="divide-y divide-border-subtle">
								{group.items.map((item) => (
									<div key={item.itemName} className="flex items-center justify-between px-4 py-2">
										<span className="text-sm text-text-primary">{item.itemName}</span>
										<span className="text-sm font-semibold text-error-text">−{item.qtyUsed}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── PrepContextPanel — implemented in Task 2 ──────────────────────────────────

function PrepContextPanel({ vehicleId }: { vehicleId: string }) {
	const { data: visits = [], isLoading } = useTomorrowRequirementsQuery(vehicleId);
	if (isLoading) return <div className="flex justify-center py-16"><LoadSvg className="w-8 h-8" /></div>;

	return (
		<div className="px-4 py-4">
			<div className="flex items-center gap-2 mb-3">
				<span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Tomorrow's Visits</span>
				{visits.length > 0 && (
					<span className="text-[10px] font-bold bg-surface-raised border border-border text-text-muted px-1.5 py-0.5 rounded">{visits.length}</span>
				)}
			</div>
			{visits.length === 0 ? (
				<p className="text-sm text-text-muted">No visits scheduled for tomorrow.</p>
			) : (
				<div className="space-y-3">
					{visits.map((visit) => (
						<div key={visit.visitId} className="bg-surface rounded-lg border border-border overflow-hidden">
							<div className="px-4 py-2 border-b border-border-subtle">
								<div className="flex items-center justify-between">
									<span className="text-sm font-semibold text-text-primary">{visit.visitName}</span>
									{visit.scheduledAt && (
										<span className="text-xs text-text-muted">
											{new Date(visit.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
										</span>
									)}
								</div>
								<span className="text-xs text-text-muted">{visit.clientName}</span>
							</div>
							<div className="divide-y divide-border-subtle">
								{visit.items.map((item) => {
									const isShort = item.qtyOnHand < item.qtyNeeded;
									const isEqual = item.qtyOnHand === item.qtyNeeded;
									return (
										<div key={item.inventoryItemId} className="flex items-center justify-between px-4 py-2">
											<span className="text-sm text-text-primary">{item.itemName}</span>
											<div className="flex items-center gap-2 text-xs">
												<span className="text-text-muted">Need <span className="text-text-primary font-semibold">{item.qtyNeeded}</span></span>
												<span className={`font-semibold ${isShort ? "text-error-text" : isEqual ? "text-warning-text" : "text-success"}`}>
													Have {item.qtyOnHand}
												</span>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── RestockPanel — implemented in Task 3 ──────────────────────────────────────

const RESTOCK_GRID = "grid-cols-[1fr_72px_72px_80px_80px]";
const PREP_GRID = "grid-cols-[1fr_64px_64px_72px_72px_80px]";

function RestockRow({ line, dimmed, subTab, grid, mobile, onChange }: {
	line: RestockLine;
	dimmed: boolean;
	subTab: SubTab;
	grid: string;
	mobile: boolean;
	onChange: (stockItemId: string, qty: number) => void;
}) {
	const onHand = Number(line.item.qty_on_hand);
	const standard = line.item.qty_standard !== null ? Number(line.item.qty_standard) : null;
	const warehouse = Number(line.item.inventory_item.quantity);
	const overLimit = line.qtyToRestock > warehouse;
	return (
		<div className={`grid ${grid} items-center px-5 py-2.5 border-b border-border/20 transition-opacity ${dimmed ? "opacity-50" : ""}`}>
			<span className="text-sm text-text-primary">{line.item.inventory_item.name}</span>
			<span className="text-center text-sm tabular-nums text-text-secondary">{onHand}</span>
			{!mobile && (
				<span className="text-center text-sm tabular-nums text-text-secondary">{standard ?? "—"}</span>
			)}
			{subTab === "prepare" && (
				<span className={`text-center text-sm tabular-nums font-medium ${line.tomorrowNeed > onHand ? "text-warning-text" : "text-text-secondary"}`}>
					{line.tomorrowNeed > 0 ? line.tomorrowNeed : "—"}
				</span>
			)}
			<span className={`text-center text-sm tabular-nums font-medium ${
				warehouse === 0 ? "text-error-text font-semibold" : overLimit ? "text-warning-text" : "text-text-secondary"
			}`}>
				{warehouse}
			</span>
			<div className={mobile ? "flex flex-col items-center gap-0.5" : "flex justify-center"}>
				<input
					type="number"
					min={0}
					value={line.qtyToRestock}
					onChange={(e) => onChange(line.stockItemId, Math.max(0, Number(e.target.value)))}
					className={`w-16 text-center text-sm rounded border ${mobile ? "py-1.5" : "py-0.5"} ${
						overLimit ? "border-warning text-warning-text" : "border-border-input text-text-primary"
					} bg-base px-1 outline-none focus:border-primary`}
				/>
				{mobile && overLimit && (
					<span className="text-[10px] text-warning-text whitespace-nowrap">⚠ Only {warehouse} in warehouse</span>
				)}
			</div>
		</div>
	);
}

function RestockPanel({
	subTab,
	restockLines,
	notes,
	onNotesChange,
	onApply,
	isPending,
	onChange,
	layout = "desktop",
}: {
	subTab: SubTab;
	restockLines: RestockLine[];
	notes: string;
	onNotesChange: (v: string) => void;
	onApply: () => void;
	isPending: boolean;
	onChange: (stockItemId: string, qty: number) => void;
	layout?: "desktop" | "mobile";
}) {
	const RESTOCK_GRID_MOBILE = "grid-cols-[1fr_56px_56px_64px]";
	const PREP_GRID_MOBILE = "grid-cols-[1fr_48px_48px_48px_64px]";

	const mobile = layout === "mobile";
	const needs = restockLines.filter((l) => l.qtyToRestock > 0);
	const met = restockLines.filter((l) => l.qtyToRestock === 0);
	const grid = mobile
		? (subTab === "restock" ? RESTOCK_GRID_MOBILE : PREP_GRID_MOBILE)
		: (subTab === "restock" ? RESTOCK_GRID : PREP_GRID);
	const headers = mobile
		? (subTab === "restock" ? ["Item", "Vehicle", "Whse", "Add"] : ["Item", "Vehicle", "Need", "Whse", "Add"])
		: (subTab === "restock"
			? ["Item", "Vehicle", "Standard", "Warehouse", "Qty to Add"]
			: ["Item", "Vehicle", "Standard", "Tomorrow Need", "Warehouse", "Qty to Add"]);
	const totalToRestock = restockLines.reduce((sum, l) => sum + l.qtyToRestock, 0);
	const anyShortfall = restockLines.some((l) => l.qtyToRestock > Number(l.item.inventory_item.quantity));

	return (
		<div>
			{/* Header */}
			<div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
				<span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Restock Quantities</span>
				{needs.length > 0 ? (
					<span className="text-[10px] font-bold bg-warning/15 text-warning-text px-1.5 py-0.5 rounded">{needs.length} items</span>
				) : restockLines.length > 0 ? (
					<span className="text-[10px] font-bold bg-success/15 text-success px-1.5 py-0.5 rounded">All stocked</span>
				) : null}
			</div>

			{/* Column headers */}
			{restockLines.length > 0 && (
				<div className={`grid ${grid} px-5 py-2 border-b border-border/30 bg-canvas sticky top-0 z-10`}>
					{headers.map((h) => (
						<div key={h} className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-center first:text-left">{h}</div>
					))}
				</div>
			)}

			{/* Empty state */}
			{restockLines.length === 0 && (
				<div className="flex flex-col items-center justify-center py-14 text-center px-8">
					<p className="text-sm text-text-muted">No items configured for restocking.</p>
					<p className="text-xs text-text-faint mt-1">Set a standard qty on the Stock tab to include items here.</p>
				</div>
			)}

			{/* Needs restock */}
			{needs.map((l) => (
				<RestockRow key={l.stockItemId} line={l} dimmed={false} subTab={subTab} grid={grid} mobile={mobile} onChange={onChange} />
			))}

			{/* Already met */}
			{needs.length > 0 && met.length > 0 && (
				<div className="flex items-center gap-2 px-5 pt-3 pb-1 text-text-faint">
					<span className="text-[10px] font-semibold uppercase tracking-wider">Already met</span>
					<span className="text-[10px] font-semibold tabular-nums">{met.length}</span>
					<div className="flex-1 h-px bg-border/30" />
				</div>
			)}
			{met.map((l) => (
				<RestockRow key={l.stockItemId} line={l} dimmed={true} subTab={subTab} grid={grid} mobile={mobile} onChange={onChange} />
			))}

			{/* Shortfall warning */}
			{anyShortfall && (
				<div className="mx-5 mt-3 flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
					<span className="text-warning-text text-xs font-semibold">⚠</span>
					<span className="text-xs text-warning-text">Some quantities exceed warehouse stock — restock will be capped at available.</span>
				</div>
			)}

			{/* Notes + Apply */}
			<div className="px-5 py-4 mt-6 border-t border-border/20">
				<label className="block text-xs text-text-muted mb-1">Notes (optional)</label>
				<textarea
					value={notes}
					onChange={(e) => onNotesChange(e.target.value)}
					rows={2}
					maxLength={500}
					placeholder="e.g. short on filters, will reorder Monday…"
					className="w-full text-sm bg-surface border border-border-input rounded-md px-3 py-2 text-text-primary placeholder:text-faint outline-none focus:border-primary resize-none mb-3"
				/>
				<button
					onClick={onApply}
					disabled={isPending}
					className="w-full px-4 py-2.5 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md transition-colors disabled:opacity-50"
				>
					{isPending ? "Applying…"
						: totalToRestock === 0 && !notes.trim() ? "Complete — Nothing to Restock"
						: subTab === "restock" ? "Apply Restock" : "Apply Prep"}
				</button>
			</div>
		</div>
	);
}

// ── ConfirmModal — implemented in Task 4 ─────────────────────────────────────

function ConfirmModal({ subTab, restockLines, notes, isPending, error, onConfirm, onCancel }: {
	subTab: SubTab;
	restockLines: RestockLine[];
	notes: string;
	isPending: boolean;
	error: string | null;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const activeLines = restockLines.filter((l) => l.qtyToRestock > 0);
	const totalUnits = activeLines.reduce((sum, l) => sum + l.qtyToRestock, 0);
	const hasShortfall = activeLines.some((l) => l.qtyToRestock > Number(l.item.inventory_item.quantity));

	return (
		<>
			<div className="fixed inset-0 z-40 bg-overlay" onClick={onCancel} />
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div className="bg-base border border-border rounded-xl shadow-xl w-full max-w-md flex flex-col">
					<div className="px-5 pt-5 pb-3 border-b border-border">
						<div className="text-base font-bold text-text-primary">
							{subTab === "restock" ? "Confirm Restock" : "Confirm Prep"}
						</div>
						<div className="text-xs text-text-muted mt-1">
							{activeLines.length > 0
								? `${activeLines.length} item${activeLines.length !== 1 ? "s" : ""} · ${totalUnits} total units moving from warehouse to vehicle.`
								: "No items to move — recording completion."
							}
						</div>
					</div>

					<div className="overflow-y-auto max-h-64 px-5 py-3">
						{activeLines.length > 0 && (
							<>
								<div className="grid grid-cols-[1fr_56px_88px] text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
									<span>Item</span>
									<span className="text-center">Adding</span>
									<span className="text-center">Warehouse After</span>
								</div>
								<div className="space-y-0.5">
									{activeLines.map((line) => {
										const warehouse = Number(line.item.inventory_item.quantity);
										const after = warehouse - line.qtyToRestock;
										const isShort = after < 0;
										return (
											<div key={line.stockItemId} className={`grid grid-cols-[1fr_56px_88px] items-center py-1.5 px-2 rounded ${isShort ? "bg-warning/5" : ""}`}>
												<span className="text-sm text-text-primary">{line.item.inventory_item.name}</span>
												<span className="text-center text-sm font-semibold text-success">+{line.qtyToRestock}</span>
												<span className={`text-center text-sm font-medium ${isShort ? "text-warning-text" : "text-text-secondary"}`}>
													{isShort ? `0 (−${Math.abs(after)} short)` : after}
												</span>
											</div>
										);
									})}
								</div>
							</>
						)}
						{hasShortfall && (
							<div className="mt-3 flex items-center gap-2 bg-warning/10 border border-warning/30 rounded px-3 py-2">
								<span className="text-warning-text text-xs font-semibold">⚠</span>
								<span className="text-xs text-warning-text">Some quantities exceed warehouse stock — restock will be capped at available.</span>
							</div>
						)}
						{notes.trim() && (
							<p className="mt-3 text-xs text-text-muted italic">"{notes.trim()}"</p>
						)}
					</div>

					{error && (
						<div className="mx-5 mb-2 text-xs text-error-text bg-error/10 border border-error/30 rounded-md px-3 py-2">{error}</div>
					)}

					<div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3">
						<button onClick={onCancel} disabled={isPending} className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50">
							Cancel
						</button>
						<button onClick={onConfirm} disabled={isPending} className="px-4 py-2 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md transition-colors disabled:opacity-50">
							{isPending ? "Applying…" : "Confirm & Apply"}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

// ── computeRestockLines ───────────────────────────────────────────────────────

function computeRestockLines(
	stockItems: VehicleStockItem[],
	tomorrowNeeds: Map<string, number>,
	mode: SubTab,
): RestockLine[] {
	const eligible = mode === "restock"
		? stockItems.filter((i) => i.qty_standard !== null)
		: stockItems.filter((i) => i.qty_standard !== null || tomorrowNeeds.has(i.inventory_item_id));

	return eligible.map((item) => {
		const onHand = Number(item.qty_on_hand);
		const standard = item.qty_standard !== null ? Number(item.qty_standard) : 0;
		const needed = tomorrowNeeds.get(item.inventory_item_id) ?? 0;
		const target = mode === "prepare" ? Math.max(standard, needed) : standard;
		return { stockItemId: item.id, item, qtyToRestock: Math.max(0, target - onHand), tomorrowNeed: needed };
	});
}

// ── MobileContextAccordion ────────────────────────────────────────────────────

function MobileContextAccordion({ vehicleId, subTab }: { vehicleId: string; subTab: SubTab }) {
	const [open, setOpen] = useState(false);
	const usage = useVehicleUsageTodayQuery(vehicleId);
	const prep = useTomorrowRequirementsQuery(vehicleId);

	const title = subTab === "restock" ? "Usage Since Last Restock" : "Tomorrow's Visits";
	const loading = subTab === "restock" ? usage.isLoading : prep.isLoading;

	let summary: string;
	if (loading) {
		summary = "…";
	} else if (subTab === "restock") {
		const n = (usage.data ?? []).reduce((s, g) => s + g.items.length, 0);
		summary = n === 0 ? "No usage since last restock" : `${n} item${n !== 1 ? "s" : ""} used`;
	} else {
		const n = (prep.data ?? []).length;
		summary = n === 0 ? "No visits tomorrow" : `${n} visit${n !== 1 ? "s" : ""} tomorrow`;
	}

	return (
		<div className="border-b border-border">
			<button
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{title}</span>
				<span className="flex items-center gap-2 min-w-0">
					<span className="text-xs text-text-muted truncate">{summary}</span>
					<ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
				</span>
			</button>
			{open && (subTab === "restock"
				? <RestockContextPanel vehicleId={vehicleId} />
				: <PrepContextPanel vehicleId={vehicleId} />
			)}
		</div>
	);
}

// ── RestockWorkflow ───────────────────────────────────────────────────────────

export default function RestockWorkflow({ vehicleId, stockItems, layout = "desktop" }: { vehicleId: string; stockItems: VehicleStockItem[]; layout?: "desktop" | "mobile" }) {
	const [subTab, setSubTab] = useState<SubTab>("restock");
	const [completedRecord, setCompletedRecord] = useState<VehicleRestockRecord | null>(null);
	const [restockLines, setRestockLines] = useState<RestockLine[]>([]);
	const [notes, setNotes] = useState("");
	const [showConfirm, setShowConfirm] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const { data: tomorrowVisits = [] } = useTomorrowRequirementsQuery(vehicleId);
	const completeMutation = useCompleteRestockMutation(vehicleId);

	const tomorrowNeeds = useMemo(() => {
		const map = new Map<string, number>();
		for (const visit of tomorrowVisits) {
			for (const item of visit.items) {
				map.set(item.inventoryItemId, (map.get(item.inventoryItemId) ?? 0) + item.qtyNeeded);
			}
		}
		return map;
	}, [tomorrowVisits]);

	useEffect(() => {
		setRestockLines(computeRestockLines(stockItems, tomorrowNeeds, subTab));
	}, [stockItems, tomorrowNeeds, subTab]);

	const handleSubTabChange = (tab: SubTab) => {
		setSubTab(tab);
		setCompletedRecord(null);
		setNotes("");
		setSubmitError(null);
		setShowConfirm(false);
	};

	const handleReset = () => {
		handleSubTabChange(subTab);
		setRestockLines([]);
	};

	const handleComplete = () => {
		setSubmitError(null);
		completeMutation.mutate(
			{
				notes: notes.trim() || null,
				mode: subTab === "restock" ? "restock" : "prepare",
				restock_lines: restockLines
					.filter((l) => l.qtyToRestock > 0)
					.map((l) => ({ stock_item_id: l.stockItemId, qty_to_restock: l.qtyToRestock })),
			},
			{
				onSuccess: (record) => {
					setCompletedRecord(record);
					setShowConfirm(false);
				},
				onError: (e) => {
					setSubmitError(e instanceof Error ? e.message : "Failed to complete restock");
				},
			},
		);
	};

	const handleLineChange = (stockItemId: string, qty: number) => {
		setRestockLines((prev) => prev.map((l) => l.stockItemId === stockItemId ? { ...l, qtyToRestock: qty } : l));
	};

	return (
		<div className={layout === "mobile" ? "flex flex-col" : "flex flex-col h-full"}>
			{/* Sub-tab bar */}
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
				<div className="flex items-center gap-1 p-1 bg-surface-inset rounded-lg">
					{(["restock", "prepare"] as SubTab[]).map((t) => (
						<button
							key={t}
							onClick={() => handleSubTabChange(t)}
							className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
								subTab === t ? "bg-primary text-on-primary" : "text-text-muted hover:text-text-secondary"
							}`}
						>
							{t === "restock" ? "Restock" : "Prep for Tomorrow"}
						</button>
					))}
				</div>
				{completedRecord && (
					<button
						onClick={handleReset}
						className="px-3 py-1.5 text-xs font-semibold bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
					>
						New Restock
					</button>
				)}
			</div>

			{layout === "mobile" ? (
				<div className="flex flex-col">
					{completedRecord ? (
						<CompleteStep record={completedRecord} stockItems={stockItems} />
					) : (
						<>
							<MobileContextAccordion vehicleId={vehicleId} subTab={subTab} />
							<RestockPanel
								subTab={subTab}
								restockLines={restockLines}
								notes={notes}
								onNotesChange={setNotes}
								onApply={() => setShowConfirm(true)}
								isPending={completeMutation.isPending}
								onChange={handleLineChange}
								layout="mobile"
							/>
						</>
					)}
				</div>
			) : (
				<div className="flex flex-row flex-1 overflow-hidden">
					<div className="w-2/5 border-r border-border overflow-y-auto">
						{subTab === "restock"
							? <RestockContextPanel vehicleId={vehicleId} showHeader />
							: <PrepContextPanel vehicleId={vehicleId} />
						}
					</div>
					<div className="flex-1 overflow-y-auto">
						{completedRecord ? (
							<CompleteStep record={completedRecord} stockItems={stockItems} />
						) : (
							<RestockPanel
								subTab={subTab}
								restockLines={restockLines}
								notes={notes}
								onNotesChange={setNotes}
								onApply={() => setShowConfirm(true)}
								isPending={completeMutation.isPending}
								onChange={handleLineChange}
							/>
						)}
					</div>
				</div>
			)}

			{showConfirm && (
				<ConfirmModal
					subTab={subTab}
					restockLines={restockLines}
					notes={notes}
					isPending={completeMutation.isPending}
					error={submitError}
					onConfirm={handleComplete}
					onCancel={() => { setShowConfirm(false); setSubmitError(null); }}
				/>
			)}
		</div>
	);
}
