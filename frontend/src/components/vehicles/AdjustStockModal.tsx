import { useMemo, useState } from "react";
import { X, Barcode } from "lucide-react";
import { useAdjustStockMutation } from "../../hooks/useVehicleStock";
import { useAllInventoryQuery, useBarcodeScanHandler } from "../../hooks/useInventory";
import { BarcodeScanner } from "../inventory/BarcodeScanner";
import type { VehicleStockItem, VehicleAdjustmentType, AdjustStockInput } from "../../types/vehicles";
import { ADJUSTMENT_TYPE_LABELS } from "../../types/vehicles";
import { useAuthStore } from "../../auth/authStore";

const ADJUST_TYPE_PERMS: Record<VehicleAdjustmentType, string> = {
	field_loss:         "adjust_field_loss",
	transfer:           "adjust_transfer",
	audit:              "adjust_audit",
	warehouse_exchange: "adjust_warehouse_exchange",
	supplier_purchase:  "adjust_supplier_purchase",
};

const TYPE_META: Record<VehicleAdjustmentType, { label?: string; description: string; warehouseEffect: string | null; note?: string }> = {
	warehouse_exchange: { label: "Return to Warehouse", description: "Return surplus parts to the warehouse — vehicle qty goes down, warehouse qty goes up", warehouseEffect: "Warehouse +" },
	field_loss:         { description: "Parts used on jobs, damaged, or lost — permanently out of org inventory", warehouseEffect: null },
	transfer:           { description: "Receive parts from another vehicle — org total unchanged",               warehouseEffect: null, note: "Adjust the source vehicle separately" },
	audit:              { description: "Override count to match physical reality — no accounting impact",         warehouseEffect: null },
	supplier_purchase:  { description: "Bought on a job — enters the truck, records cost, no warehouse change",   warehouseEffect: null },
};

function TypeStep({
	selected,
	onSelect,
	onNext,
	onClose,
	availableTypes,
}: {
	selected: VehicleAdjustmentType | null;
	onSelect: (t: VehicleAdjustmentType) => void;
	onNext: () => void;
	onClose: () => void;
	availableTypes: VehicleAdjustmentType[];
}) {
	return (
		<>
			<div className="px-5 py-4 space-y-2">
				{availableTypes.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-sm text-text-muted">No adjustment types available.</p>
						<p className="text-xs text-text-faint mt-1">Contact your dispatcher to enable adjustment permissions.</p>
					</div>
				) : (
				<>
				<p className="text-xs text-text-secondary mb-3">Select the type of stock adjustment.</p>
				{availableTypes.map((type) => {
					const meta = TYPE_META[type];
					const isSelected = selected === type;
					return (
						<button
							key={type}
							onClick={() => onSelect(type)}
							className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
								isSelected
									? "border-primary bg-primary/10"
									: "border-border bg-surface hover:bg-surface-raised"
							}`}
						>
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm font-semibold text-text-primary">{meta.label ?? ADJUSTMENT_TYPE_LABELS[type]}</span>
								{meta.warehouseEffect && (
									<span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 text-primary bg-primary/10 border-primary/30">
										{meta.warehouseEffect}
									</span>
								)}
							</div>
							<p className="text-xs text-text-secondary mt-1">{meta.description}</p>
							{meta.note && (
								<p className="text-[10px] text-text-muted mt-1 italic">{meta.note}</p>
							)}
						</button>
					);
				})}
				</>
				)}
			</div>
			<StepFooter onBack={onClose} backLabel="Cancel" onNext={onNext} nextLabel="Next →" nextDisabled={!selected} />
		</>
	);
}

function QuantitiesStep({
	type,
	stockItems,
	quantities,
	note,
	onQtyChange,
	onNoteChange,
	onBack,
	onNext,
}: {
	type: VehicleAdjustmentType;
	stockItems: VehicleStockItem[];
	quantities: Record<string, number>;
	note: string;
	onQtyChange: (id: string, qty: number) => void;
	onNoteChange: (v: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const [clampedId, setClampedId] = useState<string | null>(null);
	const isDecreaseOnly = isDecreaseOnlyType(type);
	const isReturn = type === "warehouse_exchange";
	const hasChanges = isDecreaseOnly
		? stockItems.some((i) => quantities[i.id] < Number(i.qty_on_hand))
		: stockItems.some((i) => quantities[i.id] !== Number(i.qty_on_hand));

	return (
		<>
			<div className="px-5 py-4">
				<p className="text-xs text-text-secondary mb-3">
					{isReturn
						? "Set the qty to return to the warehouse. Only items with a lower qty will be recorded."
						: type === "field_loss"
						? "Set the new qty after loss. Only items with a lower qty will be recorded."
						: "Edit quantities below. Only items with changed quantities will be recorded."}
				</p>
				{isDecreaseOnly && (
					<div className="flex items-start gap-2 text-xs text-warning-text bg-warning/10 border border-warning/20 rounded-md px-3 py-2 mb-3">
						<span className="font-semibold flex-shrink-0">⚠</span>
						<span>
							{isReturn
								? "Quantities can only be decreased — this adjustment returns stock to the warehouse."
								: "Quantities can only be decreased — this adjustment records permanent stock loss."}
						</span>
					</div>
				)}
				<div className="bg-surface rounded-lg border border-border overflow-hidden mb-3">
					<div className="grid grid-cols-[1fr_72px_80px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
						<span>Item</span>
						<span className="text-center">Current</span>
						<span className="text-center">New Qty</span>
					</div>
					{stockItems.map((item) => {
						const current = Number(item.qty_on_hand);
						const newQty = quantities[item.id] ?? current;
						const changed = isDecreaseOnly ? newQty < current : newQty !== current;
						const showClampWarning = clampedId === item.id;

						return (
							<div
								key={item.id}
								className={`grid grid-cols-[1fr_72px_80px] items-center px-4 py-2 border-b border-border-subtle last:border-0 ${changed ? "bg-primary/5" : ""}`}
							>
								<div className="min-w-0">
									<span className="text-sm text-text-primary">{item.inventory_item.name}</span>
									{showClampWarning && (
										<span className="block text-[10px] text-warning-text mt-0.5">
											Cannot exceed current qty
										</span>
									)}
								</div>
								<span className="text-center text-sm text-text-secondary">{current}</span>
								<div className="flex justify-center">
									<input
										type="number"
										min={0}
										value={newQty}
										onChange={(e) => {
											const raw = Math.max(0, Number(e.target.value));
											if (isDecreaseOnly && raw > current) {
												setClampedId(item.id);
												onQtyChange(item.id, current);
											} else {
												setClampedId(null);
												onQtyChange(item.id, raw);
											}
										}}
										onBlur={() => setClampedId(null)}
										className={`w-16 text-center text-sm rounded border ${
											showClampWarning
												? "border-warning text-warning-text"
												: changed
												? "border-primary text-text-primary font-semibold"
												: "border-border-input text-text-secondary"
										} bg-base px-1 py-0.5 outline-none focus:border-primary`}
									/>
								</div>
							</div>
						);
					})}
				</div>
				<NoteField value={note} onChange={onNoteChange} />
			</div>
			<StepFooter onBack={onBack} onNext={onNext} nextLabel="Review →" nextDisabled={!hasChanges} />
		</>
	);
}

function SupplierStep({
	supplierRows,
	note,
	onRowChange,
	onNewItemChange,
	newItem,
	onNoteChange,
	onBack,
	onNext,
}: {
	supplierRows: Record<string, { cost: number; qty: number }>;
	note: string;
	onRowChange: (id: string, field: "cost" | "qty", value: number | null) => void;
	onNewItemChange: (field: "name" | "cost" | "qty", value: string | number) => void;
	newItem: { name: string; cost: number; qty: number };
	onNoteChange: (v: string) => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const { data: catalog = [] } = useAllInventoryQuery();
	const [search, setSearch] = useState("");
	const [isScannerOpen, setIsScannerOpen] = useState(false);
	const [scanError, setScanError] = useState<string | null>(null);
	const { handleScan: scanAndBranch } = useBarcodeScanHandler(
		(item) => {
			if (!catalog.some((c) => c.id === item.id)) {
				setScanError("Item not in catalog");
				return;
			}
			setSearch(item.name);
			onRowChange(item.id, "qty", supplierRows[item.id]?.qty ?? 1);
		},
		() => setScanError("No item found for that code"),
	);

	const handleScan = async (code: string) => {
		setScanError(null);
		await scanAndBranch(code);
	};

	const searchable = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return catalog;
		return catalog.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				(c.category ?? "").toLowerCase().includes(q),
		);
	}, [catalog, search]);

	const canNext =
		(newItem.name.trim() !== "" && newItem.qty > 0) ||
		Object.values(supplierRows).some((r) => r.qty > 0);

	return (
		<>
			<div className="px-5 py-4">
				<p className="text-xs text-text-secondary mb-3">
					Record items purchased from a supplier. Choose from the catalog or enter a new item. No warehouse impact.
				</p>

				{/* New item row */}
				<div className="bg-surface rounded-lg border border-border overflow-hidden mb-3">
					<div className="grid grid-cols-[1fr_64px_80px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
						<span>New Item</span>
						<span className="text-center">Cost ($)</span>
						<span className="text-center">Qty</span>
					</div>
					<div className="grid grid-cols-[1fr_64px_80px] items-center px-4 py-2 gap-2">
						<input
							type="text"
							value={newItem.name}
							onChange={(e) => onNewItemChange("name", e.target.value)}
							placeholder="Item name…"
							className="text-sm bg-base border border-border-input rounded px-2 py-0.5 text-text-primary placeholder:text-faint outline-none focus:border-primary"
						/>
						<input
							type="number"
							min={0}
							step={0.01}
							value={newItem.cost === 0 ? "" : newItem.cost}
							onChange={(e) => onNewItemChange("cost", parseFloat(e.target.value) || 0)}
							placeholder="0.00"
							className="w-full text-center text-sm bg-base border border-border-input rounded px-1 py-0.5 text-text-primary outline-none focus:border-primary"
						/>
						<div className="flex justify-center">
							<input
								type="number"
								min={1}
								value={newItem.qty}
								onChange={(e) => onNewItemChange("qty", Math.max(1, Math.floor(Number(e.target.value)) || 1))}
								className={`w-16 text-center text-sm rounded border ${newItem.name.trim() ? "border-primary text-text-primary font-semibold" : "border-border-input text-text-secondary"} bg-base px-1 py-0.5 outline-none focus:border-primary`}
							/>
						</div>
					</div>
				</div>

				{/* Catalog search */}
				<div className="flex items-center gap-2 mb-1">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search catalog…"
						className="w-full text-sm bg-surface border border-border-input rounded-md px-3 py-2 text-text-primary placeholder:text-faint outline-none focus:border-primary"
					/>
					<button
						type="button"
						onClick={() => setIsScannerOpen(true)}
						title="Scan barcode"
						className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded-md border border-border-input text-text-muted hover:text-primary hover:border-primary transition-colors"
					>
						<Barcode size={16} />
					</button>
				</div>
				{scanError && (
					<div role="alert" className="bg-error-bg border border-error-border rounded-md px-3 py-2 mb-2 text-sm text-error-text">
						{scanError}
					</div>
				)}
				{isScannerOpen && (
					<BarcodeScanner
						onScan={(code) => {
							setIsScannerOpen(false);
							handleScan(code);
						}}
						onClose={() => setIsScannerOpen(false)}
					/>
				)}

				<div className="bg-surface rounded-lg border border-border overflow-hidden mb-3">
					<div className="grid grid-cols-[1fr_64px_80px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
						<span>Catalog Item</span>
						<span className="text-center">Cost ($)</span>
						<span className="text-center">Qty</span>
					</div>
					{searchable.length === 0 && (
						<div className="px-4 py-6 text-center text-xs text-text-muted">
							No matching catalog items.
						</div>
					)}
					{searchable.map((item) => {
						const row = supplierRows[item.id];
						const isAdded = !!row;
						return (
							<div
								key={item.id}
								className={`grid grid-cols-[1fr_64px_80px] items-center px-4 py-2 border-b border-border-subtle last:border-0 ${isAdded ? "bg-primary/5" : ""}`}
							>
								<div className="min-w-0">
									<span className="block text-sm text-text-primary truncate">{item.name}</span>
									{item.category && (
										<span className="block text-[10px] text-text-muted truncate">{item.category}</span>
									)}
								</div>
								<div className="flex justify-center">
									{isAdded ? (
										<input
											type="number"
											min={0}
											step={0.01}
											value={row.cost === 0 ? "" : row.cost}
											onChange={(e) => onRowChange(item.id, "cost", parseFloat(e.target.value) || 0)}
											placeholder="0.00"
											className="w-full text-center text-sm bg-base border border-primary rounded px-1 py-0.5 text-text-primary outline-none focus:border-primary"
										/>
									) : (
										<span className="text-sm text-text-muted">—</span>
									)}
								</div>
								<div className="flex justify-center">
									{isAdded ? (
										<input
											type="number"
											min={1}
											value={row.qty}
											onChange={(e) => onRowChange(item.id, "qty", Math.max(1, Math.floor(Number(e.target.value)) || 1))}
											className="w-16 text-center text-sm rounded border border-primary text-text-primary font-semibold bg-base px-1 py-0.5 outline-none focus:border-primary"
										/>
									) : (
										<button
											onClick={() => onRowChange(item.id, "qty", 1)}
											className="px-2 py-0.5 text-xs font-semibold bg-primary hover:bg-primary-hover text-on-primary rounded transition-colors"
										>
											+ Add
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>

				<NoteField value={note} onChange={onNoteChange} />
			</div>
			<StepFooter onBack={onBack} onNext={onNext} nextLabel="Review →" nextDisabled={!canNext} />
		</>
	);
}

function ConfirmStep({
	type,
	stockItems,
	quantities,
	catalogById,
	supplierRows,
	supplierNewItem,
	note,
	onBack,
	onConfirm,
	isPending,
	error,
}: {
	type: VehicleAdjustmentType;
	stockItems: VehicleStockItem[];
	quantities: Record<string, number>;
	catalogById: Record<string, { name: string }>;
	supplierRows: Record<string, { cost: number; qty: number }>;
	supplierNewItem: { name: string; cost: number; qty: number };
	note: string;
	onBack: () => void;
	onConfirm: () => void;
	isPending: boolean;
	error: string | null;
}) {
	const meta = TYPE_META[type];
	const isDecreaseOnly = isDecreaseOnlyType(type);
	const changedItems = stockItems.filter((i) => {
		const newQty = quantities[i.id] ?? Number(i.qty_on_hand);
		return isDecreaseOnly ? newQty < Number(i.qty_on_hand) : newQty !== Number(i.qty_on_hand);
	});

	if (type === "supplier_purchase") {
		const catalogEntries = Object.entries(supplierRows).filter(([, r]) => r.qty > 0);
		const hasNew = supplierNewItem.name.trim() !== "" && supplierNewItem.qty > 0;
		const totalLines = catalogEntries.length + (hasNew ? 1 : 0);
		return (
			<>
				<div className="px-5 py-4">
					<p className="text-xs text-text-secondary mb-3">
						Review supplier purchase. No warehouse impact.
					</p>
					<div className="bg-surface rounded-lg border border-border overflow-hidden mb-3">
						<div className="grid grid-cols-[1fr_64px_80px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
							<span>Supplier Purchase — {totalLines} item{totalLines !== 1 ? "s" : ""}</span>
							<span className="text-center">Cost</span>
							<span className="text-center">Qty</span>
						</div>
						{hasNew && (
							<div className="grid grid-cols-[1fr_64px_80px] items-center px-4 py-2 border-b border-border-subtle last:border-0 bg-primary/5">
								<div className="min-w-0">
									<span className="block text-sm text-text-primary truncate">{supplierNewItem.name.trim()}</span>
									<span className="block text-[10px] text-text-muted">New item</span>
								</div>
								<span className="text-center text-sm text-text-secondary">
									{supplierNewItem.cost > 0 ? `$${supplierNewItem.cost.toFixed(2)}` : "—"}
								</span>
								<span className="text-center text-sm font-semibold text-success">+{supplierNewItem.qty}</span>
							</div>
						)}
						{catalogEntries.map(([id, row]) => (
							<div key={id} className="grid grid-cols-[1fr_64px_80px] items-center px-4 py-2 border-b border-border-subtle last:border-0">
								<span className="text-sm text-text-primary truncate">{catalogById[id]?.name ?? id}</span>
								<span className="text-center text-sm text-text-secondary">
									{row.cost > 0 ? `$${row.cost.toFixed(2)}` : "—"}
								</span>
								<span className="text-center text-sm font-semibold text-success">+{row.qty}</span>
							</div>
						))}
					</div>
					{note && (
						<p className="text-xs text-text-secondary italic mb-3">Note: {note}</p>
					)}
					{error && (
						<p className="text-xs text-error-text bg-error/10 border border-error/30 rounded-md px-3 py-2">{error}</p>
					)}
				</div>
			<StepFooter onBack={onBack} onNext={onConfirm} nextLabel="Apply Adjustment" nextDisabled={totalLines === 0} isPending={isPending} />
		</>
		);
	}

	return (
		<>
			<div className="px-5 py-4">
				<p className="text-xs text-text-secondary mb-3">
					Review changes. {meta.warehouseEffect ? "Warehouse quantities will be updated." : "No warehouse impact."}
				</p>
				<div className="bg-surface rounded-lg border border-border overflow-hidden mb-3">
					<div className="px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
						{meta.label ?? ADJUSTMENT_TYPE_LABELS[type]} — {changedItems.length} item{changedItems.length !== 1 ? "s" : ""}
					</div>
					{changedItems.map((item) => {
						const current = Number(item.qty_on_hand);
						const newQty = quantities[item.id];
						const delta = newQty - current;
						return (
							<div key={item.id} className="flex items-center justify-between px-4 py-2 border-b border-border-subtle last:border-0">
								<span className="text-sm text-text-primary">{item.inventory_item.name}</span>
								<div className="flex items-center gap-3">
									<span className="text-sm text-text-secondary">{current} → {newQty}</span>
									<span className={`text-sm font-semibold ${delta > 0 ? "text-success" : "text-error-text"}`}>
										{delta > 0 ? "+" : ""}{delta}
									</span>
								</div>
							</div>
						);
					})}
				</div>
				{note && (
					<p className="text-xs text-text-secondary italic mb-3">Note: {note}</p>
				)}
				{error && (
					<p className="text-xs text-error-text bg-error/10 border border-error/30 rounded-md px-3 py-2">{error}</p>
				)}
			</div>
			<StepFooter onBack={onBack} onNext={onConfirm} nextLabel="Apply Adjustment" isPending={isPending} />
		</>
	);
}

const isDecreaseOnlyType = (t: VehicleAdjustmentType): boolean =>
	t === "warehouse_exchange" || t === "field_loss";

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	return (
		<div>
			<label className="block text-xs text-text-secondary mb-1">Note (optional)</label>
			<textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={2}
				maxLength={500}
				placeholder="Reason for adjustment…"
				className="w-full text-sm bg-surface border border-border-input rounded-md px-3 py-2 text-text-primary placeholder:text-faint outline-none focus:border-primary resize-none"
			/>
		</div>
	);
}

function StepFooter({
	onBack,
	backLabel = "← Back",
	onNext,
	nextLabel,
	nextDisabled,
	isPending,
}: {
	onBack: () => void;
	backLabel?: string;
	onNext: () => void;
	nextLabel: string;
	nextDisabled?: boolean;
	isPending?: boolean;
}) {
	return (
		<div className="flex items-center justify-between px-5 py-3 border-t border-border">
			<button onClick={onBack} disabled={isPending} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised transition-colors disabled:opacity-50">
				{backLabel}
			</button>
			<button
				onClick={onNext}
				disabled={isPending || nextDisabled}
				className="px-4 py-2 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md transition-colors disabled:opacity-50"
			>
				{isPending ? "Saving…" : nextLabel}
			</button>
		</div>
	);
}

const STEP_ORDER = ["type", "quantities", "confirm"] as const;
type ModalStep = (typeof STEP_ORDER)[number];

const STEP_TITLES: Record<ModalStep, string> = {
	type: "Adjust Stock",
	quantities: "Edit Quantities",
	confirm: "Confirm Adjustment",
};

const STEP_LABELS: Record<ModalStep, string> = { type: "Type", quantities: "Quantities", confirm: "Confirm" };

export default function AdjustStockModal({
	vehicleId,
	stockItems,
	onClose,
	initialType,
	initialFocusItemId,
}: {
	vehicleId: string;
	stockItems: VehicleStockItem[];
	onClose: () => void;
	initialType?: VehicleAdjustmentType;
	initialFocusItemId?: string;
}) {
	const [modalStep, setModalStep] = useState<ModalStep>(initialType ? "quantities" : "type");
	const [selectedType, setSelectedType] = useState<VehicleAdjustmentType | null>(initialType ?? null);
	const [note, setNote] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [quantities, setQuantities] = useState<Record<string, number>>(
		() => Object.fromEntries(stockItems.map((i) => [
			i.id,
			i.id === initialFocusItemId && initialType === "field_loss"
				? Math.max(0, Number(i.qty_on_hand) - 1)
				: Number(i.qty_on_hand),
		])),
	);
	const [supplierRows, setSupplierRows] = useState<Record<string, { cost: number; qty: number }>>({});
	const [supplierNewItem, setSupplierNewItem] = useState({ name: "", cost: 0, qty: 1 });

	const adjustMutation = useAdjustStockMutation(vehicleId);
	const { user } = useAuthStore();
	const { data: catalog = [] } = useAllInventoryQuery();

	const availableTypes = useMemo<VehicleAdjustmentType[]>(() => {
		const allTypes = Object.keys(TYPE_META) as VehicleAdjustmentType[];
		if (!user || user.role !== "technician") return allTypes;
		return allTypes.filter((t) => user.permissions.includes(ADJUST_TYPE_PERMS[t]));
	}, [user]);
	const catalogById = useMemo(
		() => Object.fromEntries(catalog.map((c) => [c.id, { name: c.name }])),
		[catalog],
	);

	const handleQtyChange = (id: string, qty: number) => {
		setQuantities((prev) => ({ ...prev, [id]: qty }));
	};

	const handleConfirm = async () => {
		if (!selectedType) return;
		setSubmitError(null);

		try {
			if (selectedType === "supplier_purchase") {
				const lines: AdjustStockInput["lines"] = [];
				Object.entries(supplierRows)
					.filter(([, r]) => r.qty > 0)
					.forEach(([inventory_item_id, r]) => {
						lines.push({ inventory_item_id, qty_after: r.qty });
					});
				if (supplierNewItem.name.trim() && supplierNewItem.qty > 0) {
					lines.push({ new_item: { name: supplierNewItem.name.trim(), cost: supplierNewItem.cost }, qty_after: supplierNewItem.qty });
				}
				if (lines.length === 0) return;
				await adjustMutation.mutateAsync({ type: "supplier_purchase", note: note.trim() || null, lines });
				onClose();
				return;
			}

			const isDecreaseOnly = isDecreaseOnlyType(selectedType);
			const changedLines = stockItems
				.filter((i) => isDecreaseOnly
					? quantities[i.id] < Number(i.qty_on_hand)
					: quantities[i.id] !== Number(i.qty_on_hand))
				.map((i) => ({ stock_item_id: i.id, qty_after: quantities[i.id] }));

			await adjustMutation.mutateAsync({
				type: selectedType,
				note: note.trim() || null,
				lines: changedLines,
			});
			onClose();
		} catch (e: unknown) {
			setSubmitError(e instanceof Error ? e.message : "Failed to adjust stock");
		}
	};

	const stepIndex = STEP_ORDER.indexOf(modalStep);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
					<span className="text-sm font-bold text-text-primary">{STEP_TITLES[modalStep]}</span>
					<button onClick={onClose} className="text-text-faint hover:text-text-secondary transition-colors">
						<X size={16} />
					</button>
				</div>

				{/* Step indicator */}
				<div className="flex items-center px-5 py-2 border-b border-border/30 bg-base/40 flex-shrink-0">
					{STEP_ORDER.map((s, i) => (
						<div key={s} className="flex items-center gap-1">
							{i > 0 && <div className={`w-6 h-px mx-1 ${stepIndex >= i ? "bg-primary" : "bg-border"}`} />}
							<div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
								stepIndex === i ? "bg-primary text-on-primary" :
								stepIndex > i ? "bg-success text-on-primary" :
								"bg-surface border border-border text-text-faint"
							}`}>
								{stepIndex > i ? "✓" : i + 1}
							</div>
							<span className={`text-[10px] font-medium whitespace-nowrap ${stepIndex === i ? "text-text-primary" : "text-text-muted"}`}>
								{STEP_LABELS[s]}
							</span>
						</div>
					))}
				</div>

				{/* Scrollable body */}
				<div className="flex-1 overflow-auto min-h-0">
					{modalStep === "type" && (
						<TypeStep
							selected={selectedType}
							onSelect={setSelectedType}
							onNext={() => setModalStep("quantities")}
							onClose={onClose}
							availableTypes={availableTypes}
						/>
					)}
					{modalStep === "quantities" && selectedType === "supplier_purchase" && (
						<SupplierStep
							supplierRows={supplierRows}
							note={note}
							onRowChange={(id, field, value) => {
								setSupplierRows((prev) => ({
									...prev,
									[id]: { ...(prev[id] ?? { cost: 0, qty: 1 }), [field]: value ?? 0 },
								}));
							}}
							onNewItemChange={(field, value) => setSupplierNewItem((p) => ({ ...p, [field]: value }))}
							newItem={supplierNewItem}
							onNoteChange={setNote}
							onBack={() => {
								setSupplierRows({});
								setSupplierNewItem({ name: "", cost: 0, qty: 1 });
								setNote("");
								setModalStep("type");
							}}
							onNext={() => setModalStep("confirm")}
						/>
					)}
					{modalStep === "quantities" && selectedType && selectedType !== "supplier_purchase" && (
						<QuantitiesStep
							type={selectedType}
							stockItems={stockItems}
							quantities={quantities}
							note={note}
							onQtyChange={handleQtyChange}
							onNoteChange={setNote}
							onBack={() => {
								setQuantities(Object.fromEntries(stockItems.map((i) => [i.id, Number(i.qty_on_hand)])));
								setNote("");
								setModalStep("type");
							}}
							onNext={() => setModalStep("confirm")}
						/>
					)}
					{modalStep === "confirm" && selectedType && (
						<ConfirmStep
							type={selectedType}
							stockItems={stockItems}
							quantities={quantities}
							catalogById={catalogById}
							supplierRows={supplierRows}
							supplierNewItem={supplierNewItem}
							note={note}
							onBack={() => { setSubmitError(null); setModalStep("quantities"); }}
							onConfirm={handleConfirm}
							isPending={adjustMutation.isPending}
							error={submitError}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
