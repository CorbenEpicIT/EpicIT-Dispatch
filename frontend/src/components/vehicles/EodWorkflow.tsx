import { useState, useEffect } from "react";
import LoadSvg from "../../assets/icons/loading.svg?react";
import { useVehicleEodTodayQuery, useCompleteEodMutation, useVehicleUsageTodayQuery, useVehicleEodHistoryQuery } from "../../hooks/useVehicleStock";
import type { VehicleStockItem, VehicleEodRecord } from "../../types/vehicles";

type EodStep = "review" | "restock" | "complete";

interface RestockLine {
	stockItemId: string;
	item: VehicleStockItem;
	qtyToRestock: number;
}

function StepIndicator({ step }: { step: EodStep }) {
	const steps: { key: EodStep; label: string }[] = [
		{ key: "review", label: "Review Usage" },
		{ key: "restock", label: "Confirm Restock" },
		{ key: "complete", label: "Complete" },
	];
	const order: Record<EodStep, number> = { review: 0, restock: 1, complete: 2 };
	const current = order[step];

	return (
		<div className="flex items-center px-5 py-3 border-b border-border/20 bg-base/60">
			{steps.map((s, i) => (
				<div key={s.key} className="flex items-center gap-2">
					{i > 0 && <div className={`w-8 h-px mx-1 ${current >= i ? "bg-primary" : "bg-border"}`} />}
					<div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
						current > i ? "bg-success text-white" :
						current === i ? "bg-primary text-white" :
						"bg-surface border border-border text-text-faint"
					}`}>
						{current > i ? "✓" : i + 1}
					</div>
					<span className={`text-xs font-medium whitespace-nowrap ${current === i ? "text-text-primary" : "text-text-muted"}`}>
						{s.label}
					</span>
				</div>
			))}
		</div>
	);
}

function ReviewStep({ vehicleId, onNext }: { vehicleId: string; onNext: () => void }) {
	const { data: groups = [], isLoading } = useVehicleUsageTodayQuery(vehicleId);

	if (isLoading) return <div className="flex justify-center py-16"><LoadSvg className="w-8 h-8" /></div>;

	return (
		<div className="px-5 py-4 max-w-2xl">
			<p className="text-xs text-text-muted mb-4">Review items consumed during today&apos;s visits. Confirm accuracy before restocking.</p>
			{groups.length === 0 ? (
				<p className="text-sm text-text-muted mb-6">No usage recorded today — proceed to restock.</p>
			) : (
				<div className="space-y-3 mb-6">
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
									<div key={`${group.visitId}-${item.itemName}`} className="flex items-center justify-between px-4 py-2">
										<span className="text-sm text-text-primary">{item.itemName}</span>
										<span className="text-sm font-semibold text-error-text">−{item.qtyUsed}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}
			<div className="flex justify-end">
				<button
					onClick={onNext}
					className="px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-on-primary rounded-md transition-colors"
				>
					Looks correct — Confirm Restock →
				</button>
			</div>
		</div>
	);
}

function RestockStep({
	lines,
	onChange,
	onBack,
	onComplete,
	isPending,
	notes,
	onNotesChange,
	error,
}: {
	lines: RestockLine[];
	onChange: (stockItemId: string, qty: number) => void;
	onBack: () => void;
	onComplete: () => void;
	isPending: boolean;
	notes: string;
	onNotesChange: (v: string) => void;
	error: string | null;
}) {
	if (lines.length === 0) {
		return (
			<div className="px-5 py-4 max-w-2xl">
				<p className="text-sm text-success mb-6">All items are at or above standard load — no restock needed.</p>
				<div className="mb-4">
					<label className="block text-xs text-text-muted mb-1">Notes (optional)</label>
					<textarea
						value={notes}
						onChange={(e) => onNotesChange(e.target.value)}
						rows={2}
						maxLength={500}
						placeholder="e.g. short on filters, will reorder Monday…"
						className="w-full text-sm bg-surface border border-border-input rounded-md px-3 py-2 text-text-primary placeholder:text-faint outline-none focus:border-primary resize-none"
					/>
				</div>
				{error && (
					<p className="text-xs text-error-text bg-error/10 border border-error/30 rounded-md px-3 py-2 mb-3">{error}</p>
				)}
				<div className="flex items-center justify-between">
					<button
						onClick={onBack}
						className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised transition-colors"
					>
						← Back
					</button>
					<button
						onClick={onComplete}
						disabled={isPending}
						className="px-4 py-2 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md transition-colors disabled:opacity-50"
					>
						{isPending ? "Completing…" : "Complete EOD"}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="px-5 py-4 max-w-2xl">
			<p className="text-xs text-text-muted mb-4">
				Items below standard load. Adjust restock quantities if warehouse stock is limited. All quantities will be deducted from central inventory.
			</p>

			<div className="bg-surface rounded-lg border border-border overflow-hidden mb-4">
				<div className="grid grid-cols-[1fr_64px_64px_72px_80px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-muted uppercase tracking-wider">
					<span>Item</span>
					<span className="text-center">On Hand</span>
					<span className="text-center">Standard</span>
					<span className="text-center">Warehouse</span>
					<span className="text-center">Restock Qty</span>
				</div>
				{lines.map((line) => {
					const warehouseQty = line.item.inventory_item.quantity;
					const overLimit = line.qtyToRestock > warehouseQty;
					return (
						<div key={line.stockItemId} className="grid grid-cols-[1fr_64px_64px_72px_80px] items-center px-4 py-2 border-b border-border-subtle last:border-0">
							<span className="text-sm text-text-primary">{line.item.inventory_item.name}</span>
							<span className="text-center text-sm text-text-secondary">{line.item.qty_on_hand}</span>
							<span className="text-center text-sm text-text-secondary">{line.item.qty_standard}</span>
							<span className={`text-center text-sm font-medium ${warehouseQty === 0 ? "text-error-text" : overLimit ? "text-warning-text" : "text-text-secondary"}`}>
								{warehouseQty}
							</span>
							<div className="flex justify-center">
								<input
									type="number"
									min={0}
									value={line.qtyToRestock}
									onChange={(e) => onChange(line.stockItemId, Math.max(0, Number(e.target.value)))}
									className={`w-16 text-center text-sm rounded border ${overLimit ? "border-warning text-warning-text" : "border-border-input text-text-primary"} bg-base px-1 py-0.5 outline-none focus:border-primary`}
								/>
							</div>
						</div>
					);
				})}
			</div>

			{lines.some((l) => l.qtyToRestock > l.item.inventory_item.quantity) && (
				<div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-md px-3 py-2 mb-4">
					<span className="text-warning-text text-xs font-semibold">⚠</span>
					<span className="text-xs text-warning-text">Some quantities exceed warehouse stock — actual restock will be capped at available.</span>
				</div>
			)}

			<div className="mb-4">
				<label className="block text-xs text-text-muted mb-1">Notes (optional)</label>
				<textarea
					value={notes}
					onChange={(e) => onNotesChange(e.target.value)}
					rows={2}
					maxLength={500}
					placeholder="e.g. short on filters, will reorder Monday…"
					className="w-full text-sm bg-surface border border-border-input rounded-md px-3 py-2 text-text-primary placeholder:text-faint outline-none focus:border-primary resize-none"
				/>
			</div>

			{error && (
				<p className="text-xs text-error-text bg-error/10 border border-error/30 rounded-md px-3 py-2 mb-3">{error}</p>
			)}
			<div className="flex items-center justify-between">
				<button
					onClick={onBack}
					className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised transition-colors"
				>
					← Back
				</button>
				<button
					onClick={onComplete}
					disabled={isPending}
					className="px-4 py-2 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md transition-colors disabled:opacity-50"
				>
					{isPending ? "Completing…" : "Apply & Complete EOD"}
				</button>
			</div>
		</div>
	);
}

function CompleteStep({ record, stockItems, onViewHistory }: {
	record: VehicleEodRecord;
	stockItems: VehicleStockItem[];
	onViewHistory: () => void;
}) {
	const hasShortfall = record.restock_lines.some((l) => l.qty_shortfall > 0);

	return (
		<div className="px-5 py-6 max-w-2xl">
			<div className="flex flex-col items-center text-center mb-6">
				<div className="w-12 h-12 rounded-full bg-success/15 border-2 border-success flex items-center justify-center text-xl mb-3">✓</div>
				<div className="text-base font-bold text-text-primary">EOD Complete</div>
				<div className="text-xs text-text-muted mt-1">
					{new Date(record.completed_at).toLocaleString([], {
						month: "short", day: "numeric", year: "numeric",
						hour: "numeric", minute: "2-digit",
					})}
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
								{line.qty_shortfall > 0 && (
									<span className="text-xs text-warning-text">({line.qty_shortfall} short)</span>
								)}
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

			<div className="flex justify-center">
				<button
					onClick={onViewHistory}
					className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
				>
					View EOD History
				</button>
			</div>
		</div>
	);
}

function EodHistoryView({ vehicleId, stockItems, onBack }: {
	vehicleId: string;
	stockItems: VehicleStockItem[];
	onBack: () => void;
}) {
	const { data: records = [], isLoading } = useVehicleEodHistoryQuery(vehicleId, true);

	if (isLoading) return <div className="flex justify-center py-16"><LoadSvg className="w-8 h-8" /></div>;

	return (
		<div className="px-5 py-4 max-w-2xl">
			<div className="flex items-center justify-between mb-4">
				<button
					onClick={onBack}
					className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised transition-colors"
				>
					← Back
				</button>
				<span className="text-xs text-text-muted">{records.length} record{records.length !== 1 ? "s" : ""}</span>
			</div>
			{records.length === 0 ? (
				<p className="text-sm text-text-muted text-center py-8">No EOD records yet.</p>
			) : (
				<div className="space-y-3">
					{records.map((record) => (
						<div key={record.id} className="bg-surface rounded-lg border border-border overflow-hidden">
							<div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between">
								<span className="text-sm font-semibold text-text-primary">
									{new Date(record.completed_at).toLocaleDateString(undefined, {
										weekday: "short", month: "short", day: "numeric", year: "numeric",
									})}
								</span>
								<span className="text-xs text-text-muted">
									{new Date(record.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
									{" · "}{record.completed_by?.name ?? record.completed_by_tech?.name ?? "—"}
								</span>
							</div>
							{record.restock_lines.length > 0 ? (
								<div className="divide-y divide-border-subtle">
									{record.restock_lines.map((line) => (
										<div key={line.id} className="flex items-center justify-between px-4 py-2">
											<span className="text-sm text-text-primary">
												{stockItems.find((s) => s.id === line.stock_item_id)?.inventory_item.name ?? line.stock_item_id}
											</span>
											<div className="flex items-center gap-3">
												<span className="text-sm font-semibold text-success">+{line.qty_restocked}</span>
												{line.qty_shortfall > 0 && (
													<span className="text-xs text-warning-text">({line.qty_shortfall} short)</span>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<p className="px-4 py-2 text-xs text-text-muted">No items restocked.</p>
							)}
							{record.notes && (
								<div className="px-4 py-2 border-t border-border-subtle">
									<span className="text-xs text-text-muted italic">{record.notes}</span>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default function EodWorkflow({ vehicleId, stockItems }: { vehicleId: string; stockItems: VehicleStockItem[] }) {
	const [step, setStep] = useState<EodStep>("review");
	const [restockLines, setRestockLines] = useState<RestockLine[]>([]);
	const [notes, setNotes] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	const { data: eodToday, isLoading: eodLoading } = useVehicleEodTodayQuery(vehicleId);
	const completeMutation = useCompleteEodMutation(vehicleId);

	useEffect(() => {
		if (eodToday) setStep("complete");
	}, [eodToday]);

	const handleProceedToRestock = () => {
		const lines = stockItems
			.filter((i) => i.qty_standard !== null && Number(i.qty_on_hand) < Number(i.qty_standard))
			.map((i) => ({
				stockItemId: i.id,
				item: i,
				qtyToRestock: Number(i.qty_standard) - Number(i.qty_on_hand),
			}));
		setRestockLines(lines);
		setStep("restock");
	};

	const handleUpdateLine = (stockItemId: string, qty: number) => {
		setRestockLines((prev) => prev.map((l) => l.stockItemId === stockItemId ? { ...l, qtyToRestock: qty } : l));
	};

	const handleComplete = async () => {
		setSubmitError(null);
		const linesToSubmit = restockLines.filter((l) => l.qtyToRestock > 0);
		try {
			await completeMutation.mutateAsync({
				notes: notes.trim() || null,
				restock_lines: linesToSubmit.map((l) => ({
					stock_item_id: l.stockItemId,
					qty_to_restock: l.qtyToRestock,
				})),
			});
		} catch (e: unknown) {
			setSubmitError(e instanceof Error ? e.message : "Failed to complete EOD");
		}
	};

	if (eodLoading) return <div className="flex justify-center py-16"><LoadSvg className="w-8 h-8" /></div>;

	return (
		<div className="flex flex-col h-full">
			{!showHistory && <StepIndicator step={step} />}
			<div className="flex-1 overflow-auto min-h-0">
				{showHistory ? (
					<EodHistoryView vehicleId={vehicleId} stockItems={stockItems} onBack={() => setShowHistory(false)} />
				) : (
					<>
						{step === "review" && <ReviewStep vehicleId={vehicleId} onNext={handleProceedToRestock} />}
						{step === "restock" && (
							<RestockStep
								lines={restockLines}
								onChange={handleUpdateLine}
								onBack={() => setStep("review")}
								onComplete={handleComplete}
								isPending={completeMutation.isPending}
								notes={notes}
								onNotesChange={setNotes}
								error={submitError}
							/>
						)}
						{step === "complete" && eodToday && (
							<CompleteStep
								record={eodToday}
								stockItems={stockItems}
								onViewHistory={() => setShowHistory(true)}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
