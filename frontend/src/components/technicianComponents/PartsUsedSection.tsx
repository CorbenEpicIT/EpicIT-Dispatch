import { useState, useMemo, useEffect, useRef } from "react";
import {
	Search,
	Plus,
	Package,
	Wrench,
	ChevronDown,
	ChevronUp,
	AlertTriangle,
} from "lucide-react";
import { useVehicleStockQuery, useAddPartsUsedMutation } from "../../hooks/useVehicles";
import { useUpdateJobVisitMutation } from "../../hooks/useJobs";

import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import { useAuthStore } from "../../auth/authStore";
import type { VehicleStockItem } from "../../types/vehicles";
import type { VisitLineItem } from "../../types/jobs";

type Mode = "stock" | "free";

// ── Stock Mode ────────────────────────────────────────────────────────────────

function StockPartPicker({
	stockItems,
	visitId,
	vehicleId,
	technicianId,
	lineItems,
	search,
	onSearchChange,
	onUpdateQty,
	onClose,
}: {
	stockItems: VehicleStockItem[];
	visitId: string;
	vehicleId: string;
	technicianId: string;
	lineItems: VisitLineItem[];
	search: string;
	onSearchChange: (q: string) => void;
	onUpdateQty: (item: VisitLineItem, newQty: number) => Promise<void>;
	onClose: () => void;
}) {
	const addParts = useAddPartsUsedMutation();
	const [selected, setSelected] = useState<VehicleStockItem | null>(null);
	const [qty, setQty] = useState("1");
	const [err, setErr] = useState<string | null>(null);
	const [editingLineItem, setEditingLineItem] = useState<VisitLineItem | null>(null);

	useEffect(() => {
		if (editingLineItem) {
			setQty(String(editingLineItem.quantity));
			setErr(null);
		}
	}, [editingLineItem]);

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		if (!q) return stockItems;
		return stockItems.filter(
			(i) =>
				i.inventory_item.name.toLowerCase().includes(q) ||
				(i.inventory_item.category?.toLowerCase().includes(q) ?? false)
		);
	}, [stockItems, search]);

	const isAlreadyAdded = (stockItem: VehicleStockItem): VisitLineItem | undefined =>
		lineItems.find(
			(li) =>
				li.name.toLowerCase() ===
				stockItem.inventory_item.name.toLowerCase()
		);

	const handleConfirm = async () => {
		if (!selected) return;
		const parsedQty = Number(qty);
		if (!parsedQty || parsedQty <= 0) {
			setErr("Enter a valid quantity.");
			return;
		}
		if (parsedQty > Number(selected.qty_on_hand)) {
			setErr("Not enough stock on hand.");
			return;
		}
		setErr(null);
		await addParts.mutateAsync({
			visitId,
			vehicleId,
			data: {
				stock_item_id: selected.id,
				qty_used: parsedQty,
				technician_id: technicianId,
			},
		});
		onClose();
	};

	if (editingLineItem) {
		return (
			<div className="p-4">
				<p className="text-sm font-semibold text-white mb-1">
					{editingLineItem.name}
				</p>
				<p className="text-xs text-zinc-500 mb-4">
					Currently: {Number(editingLineItem.quantity)} · Set to 0 to
					remove
				</p>
				<label className="text-xs text-zinc-400 mb-1 block">
					New Quantity
				</label>
				<input
					type="number"
					min="0"
					value={qty}
					onChange={(e) => setQty(e.target.value)}
					autoFocus
					className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 mb-3 tabular-nums"
				/>
				{err && <p className="text-xs text-red-400 mb-2">{err}</p>}
				<div className="flex gap-2">
					<button
						onClick={() => setEditingLineItem(null)}
						className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
					>
						Back
					</button>
					<button
						onClick={async () => {
							const parsedQty = Number(qty);
							if (parsedQty < 0) {
								setErr(
									"Quantity cannot be negative."
								);
								return;
							}
							setErr(null);
							await onUpdateQty(
								editingLineItem,
								parsedQty
							);
							setEditingLineItem(null);
							if (parsedQty === 0) onClose();
						}}
						className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
					>
						Update
					</button>
				</div>
			</div>
		);
	}

	if (selected) {
		return (
			<div className="p-4">
				<p className="text-sm font-semibold text-white mb-1">
					{selected.inventory_item.name}
				</p>
				<p className="text-xs text-zinc-500 mb-4">
					On hand: {Number(selected.qty_on_hand)}{" "}
					{selected.inventory_item.unit}
				</p>
				<label className="text-xs text-zinc-400 mb-1 block">
					Quantity Used
				</label>
				<input
					type="number"
					min="1"
					max={Number(selected.qty_on_hand)}
					value={qty}
					onChange={(e) => setQty(e.target.value)}
					autoFocus
					className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 mb-3 tabular-nums"
				/>
				{err && <p className="text-xs text-red-400 mb-2">{err}</p>}
				<div className="flex gap-2">
					<button
						onClick={() => setSelected(null)}
						className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
					>
						Back
					</button>
					<button
						onClick={handleConfirm}
						disabled={addParts.isPending}
						className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40"
					>
						{addParts.isPending ? "Adding…" : "Add Part"}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4">
			<div className="relative mb-3">
				<Search
					size={13}
					className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
				/>
				<input
					type="text"
					placeholder="Search parts…"
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					autoFocus
					className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
				/>
			</div>
			{search.length > 0 && (
				<>
					<div className="divide-y divide-zinc-800/40">
						{filtered.length === 0 && (
							<p className="px-4 py-4 text-center text-sm text-zinc-600">
								No matching parts
							</p>
						)}
						{filtered.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/40 transition-colors"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm text-white">
										{
											item
												.inventory_item
												.name
										}
									</p>
									<p className="text-[10px] text-zinc-500 mt-0.5">
										{item.inventory_item
											.category
											? `${item.inventory_item.category} · `
											: ""}
										<span
											className={
												Number(
													item.qty_on_hand
												) <=
												Number(
													item.qty_min
												)
													? "text-amber-400"
													: ""
											}
										>
											{Number(
												item.qty_on_hand
											)}{" "}
											on hand
											{Number(
												item.qty_on_hand
											) <=
												Number(
													item.qty_min
												) && (
												<AlertTriangle
													size={
														10
													}
													className="inline text-amber-400 ml-0.5"
													aria-hidden="true"
												/>
											)}
										</span>
									</p>
								</div>
								{(() => {
									const existing =
										isAlreadyAdded(
											item
										);
									return existing ? (
										<button
											onClick={() =>
												setEditingLineItem(
													existing
												)
											}
											className="ml-3 shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/50 transition-colors"
										>
											✓ Added
										</button>
									) : (
										<button
											onClick={() =>
												setSelected(
													item
												)
											}
											className="ml-3 shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 hover:text-blue-200 transition-colors border border-blue-700/30"
										>
											+ Add
										</button>
									);
								})()}
							</div>
						))}
					</div>
					<p className="px-4 py-2 text-[10px] text-zinc-600 italic border-t border-zinc-800/60 text-center">
						Parts list hidden while searching — clear search to
						view
					</p>
				</>
			)}
		</div>
	);
}

// ── Free Entry Form ───────────────────────────────────────────────────────────

function FreeEntryForm({
	visitId,
	lineItems,
	onClose,
}: {
	visitId: string;
	lineItems: VisitLineItem[];
	onClose: () => void;
}) {
	const updateVisit = useUpdateJobVisitMutation();
	const [name, setName] = useState("");
	const [qty, setQty] = useState("1");
	const [unitCost, setUnitCost] = useState("");
	const [err, setErr] = useState<string | null>(null);

	const handleSubmit = async () => {
		const parsedQty = Number(qty);
		const parsedCost = Number(unitCost);
		if (!name.trim()) {
			setErr("Part name required.");
			return;
		}
		if (!parsedQty || parsedQty <= 0) {
			setErr("Enter a valid quantity.");
			return;
		}
		setErr(null);

		await updateVisit.mutateAsync({
			id: visitId,
			data: {
				line_items: [
					...lineItems.map((li) => ({
						id: li.id,
						name: li.name,
						description: li.description ?? null,
						quantity: Number(li.quantity),
						unit_price: Number(li.unit_price),
						total: parseFloat(
							(
								Number(li.quantity) *
								Number(li.unit_price)
							).toFixed(2)
						),
						item_type: li.item_type ?? null,
						source: li.source,
					})),
					{
						name: name.trim(),
						quantity: parsedQty,
						unit_price: parsedCost || 0,
						total: parseFloat(
							(parsedQty * (parsedCost || 0)).toFixed(2)
						),
					},
				],
			},
		});
		onClose();
	};

	return (
		<div className="p-4 space-y-3">
			<div>
				<label className="text-xs text-zinc-400 mb-1 block">
					Part / Material Name
				</label>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					autoFocus
					placeholder="e.g. 1/2 inch copper fitting"
					className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
				/>
			</div>
			<div className="flex gap-2">
				<div className="flex-1">
					<label className="text-xs text-zinc-400 mb-1 block">
						Qty
					</label>
					<input
						type="number"
						min="1"
						value={qty}
						onChange={(e) => setQty(e.target.value)}
						className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 tabular-nums"
					/>
				</div>
				<div className="flex-1">
					<label className="text-xs text-zinc-400 mb-1 block">
						Unit Cost ($)
					</label>
					<input
						type="number"
						min="0"
						step="0.01"
						value={unitCost}
						onChange={(e) => setUnitCost(e.target.value)}
						placeholder="0.00"
						className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 tabular-nums"
					/>
				</div>
			</div>
			{err && <p className="text-xs text-red-400">{err}</p>}
			<div className="pt-1">
				<button
					onClick={handleSubmit}
					disabled={updateVisit.isPending}
					className="w-full py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40"
				>
					{updateVisit.isPending ? "Adding…" : "Add Part"}
				</button>
			</div>
		</div>
	);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PartsUsedSection({
	visitId,
	lineItems = [],
	total,
}: {
	visitId: string;
	lineItems: VisitLineItem[];
	total: number;
}) {
	const { user } = useAuthStore();
	const { data: techProfile } = useTechnicianByIdQuery(user?.userId ?? null);
	const vehicleId = techProfile?.current_vehicle_id ?? null;
	const { data: stockItems = [] } = useVehicleStockQuery(vehicleId);
	const updateVisit = useUpdateJobVisitMutation();

	const handleQtyChange = async (item: VisitLineItem, newQty: number) => {
		const updatedItems =
			newQty <= 0
				? lineItems.filter((li) => li.id !== item.id)
				: lineItems.map((li) =>
						li.id === item.id
							? {
									...li,
									quantity: newQty,
									total: parseFloat(
										(
											newQty *
											Number(
												li.unit_price
											)
										).toFixed(2)
									),
								}
							: li
					);
		await updateVisit.mutateAsync({
			id: visitId,
			data: {
				line_items: updatedItems.map((li) => ({
					id: li.id,
					name: li.name,
					description: li.description ?? null,
					quantity: Number(li.quantity),
					unit_price: Number(li.unit_price),
					total: parseFloat(
						(
							Number(li.quantity) * Number(li.unit_price)
						).toFixed(2)
					),
					item_type: li.item_type ?? null,
					source: li.source,
				})),
			},
		});
	};

	const [expanded, setExpanded] = useState(true);
	const [adding, setAdding] = useState(false);
	const [mode, setMode] = useState<Mode>("stock");
	const [stockSearch, setStockSearch] = useState("");

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!adding) return;
		const handler = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setAdding(false);
				setStockSearch("");
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [adding]);

	const hasStock = stockItems.length > 0;

	return (
		<div
			ref={containerRef}
			className="rounded-xl border border-zinc-800 overflow-hidden"
		>
			{/* Header */}
			<button
				onClick={() => setExpanded((p) => !p)}
				aria-expanded={expanded}
				aria-controls="parts-used-panel"
				className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800"
			>
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Parts Used
					{lineItems.length > 0 && (
						<span className="ml-2 text-zinc-500 font-normal normal-case tracking-normal">
							({lineItems.length})
						</span>
					)}
				</span>
				{expanded ? (
					<ChevronUp size={14} className="text-zinc-500" />
				) : (
					<ChevronDown size={14} className="text-zinc-500" />
				)}
			</button>

			{expanded && (
				<div id="parts-used-panel">
					{/* Add part trigger */}
					{!adding ? (
						<div className="px-4 py-3 border-b border-zinc-800">
							<button
								onClick={() => {
									setAdding(true);
									setStockSearch("");
								}}
								className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
							>
								<Plus size={14} />
								Add / Edit Parts
							</button>
						</div>
					) : (
						<div className="border-b border-zinc-800">
							{/* Edit zone header */}
							<div className="flex items-center px-4 py-2 bg-blue-600/[.09] border-b border-blue-600/[.18]">
								<span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
									Editing Parts
								</span>
							</div>
							{/* Mode toggle */}
							<div className="flex px-4 pt-3 gap-2 mb-0">
								<button
									onClick={() =>
										setMode("stock")
									}
									className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
										mode === "stock"
											? "bg-zinc-700 text-white"
											: "text-zinc-500 hover:text-zinc-300"
									}`}
								>
									<Package size={12} />
									Vehicle Stock
								</button>
								<button
									onClick={() => {
										setMode("free");
										setStockSearch("");
									}}
									className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
										mode === "free"
											? "bg-zinc-700 text-white"
											: "text-zinc-500 hover:text-zinc-300"
									}`}
								>
									<Wrench size={12} />
									Free Entry
								</button>
							</div>

							{mode === "stock" &&
							hasStock &&
							user?.userId ? (
								<StockPartPicker
									stockItems={stockItems}
									visitId={visitId}
									vehicleId={vehicleId!}
									technicianId={user.userId}
									lineItems={lineItems}
									search={stockSearch}
									onSearchChange={
										setStockSearch
									}
									onUpdateQty={
										handleQtyChange
									}
									onClose={() => {
										setAdding(false);
										setStockSearch("");
									}}
								/>
							) : mode === "stock" && !hasStock ? (
								<div className="px-4 py-4">
									<p className="text-sm text-zinc-500">
										No vehicle stock
										available.{" "}
										<button
											onClick={() =>
												setMode(
													"free"
												)
											}
											className="text-blue-400 hover:underline"
										>
											Use free
											entry
										</button>
									</p>
								</div>
							) : (
								<FreeEntryForm
									visitId={visitId}
									lineItems={lineItems}
									onClose={() => {
										setAdding(false);
										setStockSearch("");
									}}
								/>
							)}
							{/* Done strip — persistent close, always visible */}
							<div className="px-4 py-2.5 bg-zinc-900 border-t border-zinc-800">
								<button
									onClick={() => {
										setAdding(false);
										setStockSearch("");
									}}
									className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
								>
									Done
								</button>
							</div>
						</div>
					)}

					{/* Parts list — hidden while searching vehicle stock */}
					{!(
						mode === "stock" &&
						adding &&
						stockSearch.length > 0
					) && (
						<>
							{lineItems.length === 0 ? (
								<p className="px-4 py-5 text-center text-sm text-zinc-600">
									No parts added yet
								</p>
							) : (
								<div className="divide-y divide-zinc-800/60">
									{lineItems.map(
										(item, idx) => {
											const qty =
												Number(
													item.quantity
												);
											const unitPrice =
												Number(
													item.unit_price
												);
											const rowTotal =
												qty *
												unitPrice;
											const isOne =
												qty ===
												1;

											return adding ? (
												/* Edit mode — ± controls */
												<div
													key={
														item.id ??
														idx
													}
													className="flex items-center justify-between px-4 py-2.5 gap-3"
												>
													{/* Name + description — no unit price subtitle */}
													<div className="flex-1 min-w-0">
														<p className="text-sm text-white line-clamp-2">
															{
																item.name
															}
														</p>
														{item.description && (
															<p className="text-xs text-zinc-600 truncate">
																{
																	item.description
																}
															</p>
														)}
													</div>

													{/* Stepper + qty×ea / total */}
													<div className="shrink-0 flex flex-col items-end gap-0.5">
														<div className="flex items-center gap-1.5">
															<button
																onClick={() =>
																	handleQtyChange(
																		item,
																		isOne
																			? 0
																			: qty -
																					1
																	)
																}
																disabled={
																	updateVisit.isPending
																}
																className={`flex items-center justify-center w-5 h-5 rounded text-xs font-bold border transition-colors disabled:opacity-40 ${
																	isOne
																		? "border-red-500/30 bg-red-500/8 text-red-400 hover:bg-red-500/15"
																		: "border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
																}`}
																aria-label={
																	isOne
																		? "Remove part"
																		: "Decrease quantity"
																}
															>
																{isOne
																	? "✕"
																	: "−"}
															</button>
															<span className="text-sm font-semibold text-white tabular-nums min-w-[18px] text-center">
																{
																	qty
																}
															</span>
															<button
																onClick={() =>
																	handleQtyChange(
																		item,
																		qty +
																			1
																	)
																}
																disabled={
																	updateVisit.isPending
																}
																className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-40"
																aria-label="Increase quantity"
															>
																＋
															</button>
															<span className="text-sm text-white tabular-nums">
																×
																$
																{unitPrice.toFixed(
																	2
																)}
															</span>
														</div>
														<span className="text-xs text-zinc-500 tabular-nums">
															$
															{rowTotal.toFixed(
																2
															)}
														</span>
													</div>
												</div>
											) : (
												/* Read-only mode — original display */
												<div
													key={
														item.id ??
														idx
													}
													className="flex items-center justify-between px-4 py-2.5"
												>
													<div className="flex-1 min-w-0">
														<p className="text-sm text-white line-clamp-2">
															{
																item.name
															}
														</p>
														{item.description && (
															<p className="text-xs text-zinc-600 truncate">
																{
																	item.description
																}
															</p>
														)}
													</div>
													<div className="text-right shrink-0 ml-4">
														<p className="text-sm text-white tabular-nums">
															{
																qty
															}{" "}
															×
															$
															{unitPrice.toFixed(
																2
															)}
														</p>
														<p className="text-xs text-zinc-500 tabular-nums">
															$
															{rowTotal.toFixed(
																2
															)}
														</p>
													</div>
												</div>
											);
										}
									)}
								</div>
							)}
						</>
					)}

					{/* Running total — hidden while searching vehicle stock */}
					{!(mode === "stock" && adding && stockSearch.length > 0) &&
						lineItems.length > 0 && (
							<div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-t border-zinc-800">
								<span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
									Running Total
								</span>
								<span className="text-base font-bold text-white tabular-nums">
									${total.toFixed(2)}
								</span>
							</div>
						)}
				</div>
			)}
		</div>
	);
}
