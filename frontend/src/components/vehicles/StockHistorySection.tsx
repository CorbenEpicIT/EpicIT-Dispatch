import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { resolveItemName } from "../../lib/stockUtils";
import {
	useVehicleStockAdjustmentHistoryQuery,
	useVehicleRestockHistoryQuery,
} from "../../hooks/useVehicleStock";
import type {
	VehicleStockItem,
	VehicleStockAdjustment,
	VehicleStockAdjustmentLine,
	VehicleAdjustmentType,
	VehicleRestockRecord,
} from "../../types/vehicles";
import { ADJUSTMENT_TYPE_LABELS } from "../../types/vehicles";

type HistoryTab = "adjustments" | "restock";
type FilterType = VehicleAdjustmentType | "all";

const TYPE_BADGE: Record<VehicleAdjustmentType, string> = {
	field_loss:         "bg-error/15 text-error-text",
	transfer:           "bg-primary/15 text-primary",
	audit:              "bg-surface-raised border border-border text-text-secondary",
	warehouse_exchange: "bg-success/15 text-success",
	supplier_purchase:  "bg-violet-500/15 text-violet-400",
};

const TYPE_BADGE_LABEL: Record<VehicleAdjustmentType, string> = {
	field_loss:         "Loss",
	transfer:           "Transfer",
	audit:              "Audit",
	warehouse_exchange: "Exchange",
	supplier_purchase:  "Purchase",
};

const TYPE_FILTER_LABEL: Record<VehicleAdjustmentType | "all", string> = {
	all: "All",
	...TYPE_BADGE_LABEL,
};

const ALL_TYPES = Object.keys(ADJUSTMENT_TYPE_LABELS) as VehicleAdjustmentType[];

function relativeTime(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const hours = Math.floor(ms / 3_600_000);
	if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (hours < 48) return "Yesterday";
	return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function absTime(iso: string): string {
	const d = new Date(iso);
	return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function AdjRow({
	adj,
	stockItems,
	expanded,
	onToggle,
}: {
	adj: VehicleStockAdjustment;
	stockItems: VehicleStockItem[];
	expanded: boolean;
	onToggle: () => void;
}) {
	const actor = adj.created_by?.name ?? adj.created_by_tech?.name;
	const isWarehouse = adj.type === "warehouse_exchange";
	const hasNote = !!adj.note;
	const singleItem =
		adj.lines.length === 1 ? resolveItemName(adj.lines[0].stock_item_id, stockItems) : null;
	const totalUnits =
		adj.lines.length > 1
			? adj.lines.reduce((sum, l) => sum + Math.abs(l.qty_after - l.qty_before), 0)
			: 0;

	return (
		<div>
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-raised/40 transition-colors text-left border-b border-border-subtle/60"
			>
				<span
					className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_BADGE[adj.type]}`}
					aria-label={ADJUSTMENT_TYPE_LABELS[adj.type]}
				>
					{TYPE_BADGE_LABEL[adj.type]}
				</span>
				<div className="flex-1 min-w-0">
					<span className="text-sm text-text-primary">
						{singleItem ?? `${adj.lines.length} items · ${totalUnits} units`}
					</span>
					{(isWarehouse || hasNote) && (
						<div className="flex items-center gap-1.5 mt-0.5">
							{isWarehouse && (
								<span className="text-[10px] font-medium bg-success/10 text-success px-1 py-0.5 rounded">
									Warehouse +
								</span>
							)}
							{hasNote && <FileText size={10} className="text-text-faint" />}
						</div>
					)}
				</div>
				<div className="flex items-center gap-2 flex-shrink-0 text-right">
					<div>
						{actor && (
							<div className="text-[10px] text-text-muted whitespace-nowrap">by {actor}</div>
						)}
						<div className="text-[10px] text-text-faint">{relativeTime(adj.created_at)}</div>
					</div>
					<ChevronDown
						size={13}
						className={`text-text-muted flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
					/>
				</div>
			</button>

			{expanded && (
				<div className="px-4 py-2.5 border-b border-border bg-surface/30">
					<div className="space-y-1 mb-2.5">
						{adj.lines.map((line: VehicleStockAdjustmentLine) => {
							const delta = line.qty_after - line.qty_before;
							const itemName = resolveItemName(line.stock_item_id, stockItems);
							const showItemNames = adj.lines.length > 1;
							return (
								<div key={line.id}>
									<div className={`grid ${showItemNames ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]"} items-center gap-3 py-0.5`}>
										{showItemNames && (
											<span className="text-sm text-text-primary truncate">{itemName}</span>
										)}
										<span className="text-xs text-text-muted tabular-nums whitespace-nowrap">
											{line.qty_before} → {line.qty_after}
										</span>
										<span
											className={`text-sm font-semibold tabular-nums w-10 text-right ${
												delta > 0 ? "text-success" : delta < 0 ? "text-error-text" : "text-text-muted"
											}`}
										>
											{delta > 0 ? `+${delta}` : `${delta}`}
										</span>
									</div>
									{adj.type === "warehouse_exchange" && line.inventory_impact !== 0 && (
										<div className="text-[11px] text-success pb-1">
											Warehouse: {line.inventory_impact > 0 ? `+${line.inventory_impact}` : line.inventory_impact}
										</div>
									)}
								</div>
							);
						})}
					</div>
					{adj.note && <p className="text-xs text-text-muted italic mb-2">"{adj.note}"</p>}
					<p className="text-[10px] text-text-faint">{absTime(adj.created_at)}</p>
				</div>
			)}
		</div>
	);
}

function RestockRow({
	record,
	stockItems,
	expanded,
	onToggle,
}: {
	record: VehicleRestockRecord;
	stockItems: VehicleStockItem[];
	expanded: boolean;
	onToggle: () => void;
}) {
	const person = record.completed_by?.name ?? record.completed_by_tech?.name;
	const totalItems = record.restock_lines.length;
	const totalUnits = record.restock_lines.reduce((sum, l) => sum + l.qty_restocked, 0);
	const date = new Date(record.completed_at).toLocaleDateString(undefined, {
		month: "short", day: "numeric", year: "numeric",
	});
	const time = new Date(record.completed_at).toLocaleTimeString([], {
		hour: "numeric", minute: "2-digit",
	});
	const isPrepare = record.mode === "prepare";

	return (
		<div>
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-raised/40 transition-colors text-left border-b border-border-subtle/60"
			>
				<span className="text-sm font-semibold text-text-primary flex-shrink-0">{date}</span>
				<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wider ${
					isPrepare ? "bg-primary/15 text-primary" : "bg-surface-raised border border-border text-text-muted"
				}`}>
					{isPrepare ? "Prepare" : "Restock"}
				</span>
				<span className="text-xs text-text-muted flex-1 min-w-0 truncate">
					{totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""} · +${totalUnits}` : "No items"}
				</span>
				<div className="flex items-center gap-2 flex-shrink-0">
					{person && (
						<span className="text-[10px] text-text-muted whitespace-nowrap">{person} · {time}</span>
					)}
					<ChevronDown
						size={13}
						className={`text-text-muted flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
					/>
				</div>
			</button>

			{expanded && (
				<div className="px-4 py-2.5 border-b border-border bg-surface/30">
					{record.restock_lines.length > 0 ? (
						<div className="space-y-1.5 mb-2.5">
							{record.restock_lines.map((line) => (
								<div key={line.id} className="flex items-center gap-2.5">
									<span className="text-[10px] font-bold text-success tabular-nums bg-success/10 px-1.5 py-0.5 rounded flex-shrink-0">
										+{line.qty_restocked}
									</span>
									<span
										className="text-sm text-text-primary truncate"
										title={resolveItemName(line.stock_item_id, stockItems)}
									>
										{resolveItemName(line.stock_item_id, stockItems)}
									</span>
									{line.qty_shortfall > 0 && (
										<span className="text-[10px] text-warning-text flex-shrink-0">
											({line.qty_shortfall} short)
										</span>
									)}
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-text-muted mb-2.5">No items restocked.</p>
					)}
					{record.notes && <p className="text-xs text-text-muted italic mb-2">"{record.notes}"</p>}
					<p className="text-[10px] text-text-faint">{absTime(record.completed_at)}</p>
				</div>
			)}
		</div>
	);
}

export default function StockHistorySection({
	vehicleId,
	stockItems,
}: {
	vehicleId: string;
	stockItems: VehicleStockItem[];
}) {
	const [activeTab, setActiveTab] = useState<HistoryTab>("adjustments");
	const [typeFilter, setTypeFilter] = useState<FilterType>("all");
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [expandedRestockId, setExpandedRestockId] = useState<string | null>(null);

	const filterScrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const checkFilterScroll = useCallback(() => {
		const el = filterScrollRef.current;
		if (!el) return;
		setCanScrollLeft(el.scrollLeft > 0);
		setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
	}, []);

	useEffect(() => {
		const el = filterScrollRef.current;
		if (!el) return;
		checkFilterScroll();
		const ro = new ResizeObserver(checkFilterScroll);
		ro.observe(el);
		el.addEventListener("scroll", checkFilterScroll, { passive: true });
		return () => {
			ro.disconnect();
			el.removeEventListener("scroll", checkFilterScroll);
		};
	}, [checkFilterScroll]);

	const scrollFilterBy = (dir: -1 | 1) =>
		filterScrollRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });

	const { data: adjustments = [], isLoading: adjLoading } =
		useVehicleStockAdjustmentHistoryQuery(vehicleId, true);
	const { data: restockRecords = [], isLoading: restockLoading } =
		useVehicleRestockHistoryQuery(vehicleId, true);

	const filtered =
		typeFilter === "all" ? adjustments : adjustments.filter((a) => a.type === typeFilter);

	const handleToggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
	const handleRestockToggle = (id: string) => setExpandedRestockId((prev) => (prev === id ? null : id));

	return (
		<div>
			{/* Tab bar */}
			<div className="flex gap-0 border-b border-border">
				{(["adjustments", "restock"] as HistoryTab[]).map((t) => {
					const count = t === "adjustments" ? adjustments.length : restockRecords.length;
					return (
						<button
							key={t}
							onClick={() => setActiveTab(t)}
							className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
								activeTab === t
									? "border-primary text-primary"
									: "border-transparent text-text-muted hover:text-text-secondary"
							}`}
						>
							{t === "adjustments" ? "Adjustments" : "Restock"}
							{count > 0 && (
								<span className={`text-[10px] tabular-nums ${activeTab === t ? "text-primary/70" : "text-text-faint"}`}>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{activeTab === "adjustments" && (
				<>
					{/* Type filter chips with overflow arrows */}
					<div className="relative flex items-center border-b border-border-subtle/60">
						{canScrollLeft && (
							<button
								onClick={() => scrollFilterBy(-1)}
								className="absolute left-0 z-10 flex items-center justify-center w-7 h-full bg-gradient-to-r from-canvas via-canvas/90 to-transparent text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
								aria-label="Scroll filters left"
							>
								<ChevronLeft size={13} />
							</button>
						)}
						<div
							ref={filterScrollRef}
							className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto scrollbar-none flex-1 min-w-0"
						>
							{(["all", ...ALL_TYPES] as FilterType[]).map((t) => (
								<button
									key={t}
									onClick={() => setTypeFilter(t)}
									title={t === "all" ? "All types" : ADJUSTMENT_TYPE_LABELS[t]}
									className={`whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full border transition-colors flex-shrink-0 ${
										typeFilter === t
											? "bg-primary/15 border-primary/30 text-primary font-medium"
											: "bg-surface border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary"
									}`}
								>
									{TYPE_FILTER_LABEL[t]}
								</button>
							))}
						</div>
						{canScrollRight && (
							<button
								onClick={() => scrollFilterBy(1)}
								className="absolute right-0 z-10 flex items-center justify-center w-7 h-full bg-gradient-to-l from-canvas via-canvas/90 to-transparent text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
								aria-label="Scroll filters right"
							>
								<ChevronRight size={13} />
							</button>
						)}
					</div>
					{typeFilter !== "all" && (
						<div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-subtle/40 bg-primary/5">
							<span className="text-[11px] text-text-muted">
								Filtered: <span className="text-primary font-medium">{ADJUSTMENT_TYPE_LABELS[typeFilter]}</span>
							</span>
							<button
								onClick={() => setTypeFilter("all")}
								className="text-[11px] text-text-faint hover:text-primary ml-auto transition-colors"
							>
								Clear ×
							</button>
						</div>
					)}

					{adjLoading ? (
						<div className="space-y-0">
							{[0, 1, 2].map((i) => (
								<div key={i} className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle/60 animate-pulse">
									<div className="w-24 h-4 bg-surface rounded" />
									<div className="flex-1 h-4 bg-surface/60 rounded" />
									<div className="w-16 h-4 bg-surface/40 rounded" />
								</div>
							))}
						</div>
					) : filtered.length === 0 ? (
						<div className="py-8 text-center">
							{typeFilter !== "all" ? (
								<>
									<p className="text-sm text-text-muted">
										No {ADJUSTMENT_TYPE_LABELS[typeFilter]} adjustments in recent history.
									</p>
									<button
										onClick={() => setTypeFilter("all")}
										className="text-xs text-primary mt-2 hover:underline"
									>
										Clear filter
									</button>
								</>
							) : (
								<p className="text-sm text-text-muted">No stock adjustments recorded yet.</p>
							)}
						</div>
					) : (
						<div>
							{filtered.map((adj) => (
								<AdjRow
									key={adj.id}
									adj={adj}
									stockItems={stockItems}
									expanded={expandedId === adj.id}
									onToggle={() => handleToggle(adj.id)}
								/>
							))}
							{adjustments.length >= 50 && (
								<p className="text-center text-[11px] text-text-faint py-3">
									Showing most recent 50 adjustments
								</p>
							)}
						</div>
					)}
				</>
			)}

			{activeTab === "restock" && (
				<>
					{restockLoading ? (
						<div className="space-y-0">
							{[0, 1, 2].map((i) => (
								<div key={i} className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle/60 animate-pulse">
									<div className="w-24 h-4 bg-surface rounded" />
									<div className="flex-1 h-4 bg-surface/60 rounded" />
									<div className="w-16 h-4 bg-surface/40 rounded" />
								</div>
							))}
						</div>
					) : restockRecords.length === 0 ? (
						<p className="text-sm text-text-muted text-center py-8">No restock records yet.</p>
					) : (
						<div>
							{restockRecords.map((record) => (
								<RestockRow
									key={record.id}
									record={record}
									stockItems={stockItems}
									expanded={expandedRestockId === record.id}
									onToggle={() => handleRestockToggle(record.id)}
								/>
							))}
							{restockRecords.length >= 50 && (
								<p className="text-center text-[11px] text-text-faint py-3">
									Showing most recent 50 records
								</p>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
}
