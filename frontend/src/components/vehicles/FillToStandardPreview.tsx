import { useState, useEffect, useMemo, useRef } from "react";
import LoadSvg from "../../assets/icons/loading.svg?react";
import { useFillPlanQuery, useApplyFillMutation } from "../../hooks/useVehicleStock";
import type { FillPlanLine } from "../../types/vehicles";

function Section({ title, lines, qtys, onQty }: {
	title: string;
	lines: FillPlanLine[];
	qtys: Record<string, number>;
	onQty: (id: string, qty: number) => void;
}) {
	if (lines.length === 0) return null;
	return (
		<div className="mb-4">
			<div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">{title}</div>
			<div className="bg-surface rounded-lg border border-border overflow-hidden">
				<div className="grid grid-cols-[1fr_56px_56px_64px_72px] px-4 py-2 border-b border-border-subtle text-[10px] font-semibold text-text-muted uppercase tracking-wider">
					<span>Item</span><span className="text-center">Have</span><span className="text-center">Need</span><span className="text-center">Stock</span><span className="text-center">Add</span>
				</div>
				{lines.map((l) => {
					const qty = qtys[l.inventory_item_id] ?? l.suggested_qty;
					const over = qty > l.warehouse_available;
					return (
						<div key={l.inventory_item_id} className="grid grid-cols-[1fr_56px_56px_64px_72px] items-center px-4 py-2 border-b border-border-subtle last:border-0">
							<span className="text-sm text-text-primary">{l.name}</span>
							<span className="text-center text-sm text-text-muted">{l.on_hand}</span>
							<span className="text-center text-sm text-text-muted">{l.target}</span>
							<span className={`text-center text-sm font-medium ${l.warehouse_available === 0 ? "text-error-text" : over ? "text-warning-text" : "text-text-muted"}`}>{l.warehouse_available}</span>
							<div className="flex justify-center">
								<input type="number" min={0} value={qty}
									onChange={(e) => onQty(l.inventory_item_id, Math.max(0, Math.floor(Number(e.target.value))))}
									className={`w-14 text-center text-sm rounded border ${over ? "border-warning text-warning-text" : "border-border-input text-text-primary"} bg-base px-1 py-0.5 outline-none focus:border-primary`} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default function FillToStandardPreview({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
	const { data: plan, isLoading } = useFillPlanQuery(vehicleId, true);
	const applyMutation = useApplyFillMutation(vehicleId);
	const [qtys, setQtys] = useState<Record<string, number>>({});
	const [applied, setApplied] = useState(false);
	const initialised = useRef(false);

	useEffect(() => {
		if (!plan || initialised.current) return;
		const init: Record<string, number> = {};
		[...plan.standard, ...plan.visits].forEach((l) => { init[l.inventory_item_id] = l.suggested_qty; });
		setQtys(init);
		initialised.current = true;
	}, [plan]);

	const anyOver = useMemo(
		() => [...(plan?.standard ?? []), ...(plan?.visits ?? [])].some((l) => (qtys[l.inventory_item_id] ?? l.suggested_qty) > l.warehouse_available),
		[plan, qtys],
	);
	const nothing = !plan || (plan.standard.length === 0 && plan.visits.length === 0);

	const handleApply = async () => {
		// Sum per inventory item across both buckets (an item can appear in both)
		const merged: Record<string, number> = {};
		[...(plan?.standard ?? []), ...(plan?.visits ?? [])].forEach((l) => {
			const q = qtys[l.inventory_item_id] ?? l.suggested_qty;
			if (q > 0) merged[l.inventory_item_id] = (merged[l.inventory_item_id] ?? 0) + q;
		});
		const lines = Object.entries(merged).map(([inventory_item_id, qty]) => ({ inventory_item_id, qty }));
		if (lines.length === 0) { onClose(); return; }
		try {
			await applyMutation.mutateAsync({ lines });
			setApplied(true);
		} catch {
			// TanStack Query sets applyMutation.isError + applyMutation.error automatically
		}
	};

	if (isLoading) return <div className="flex justify-center py-12"><LoadSvg className="w-7 h-7" /></div>;
	if (applied) return (
		<div className="px-5 py-8 text-center">
			<div className="text-sm font-semibold text-text-primary mb-1">Stock filled</div>
			<p className="text-xs text-text-muted mb-4">Quantities exceeding warehouse stock were capped at what was available.</p>
			<button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-on-primary rounded-md">Done</button>
		</div>
	);
	if (nothing) return (
		<div className="px-5 py-8 text-center">
			<p className="text-sm text-text-muted mb-4">Already at standard — nothing to fill, and no extra needed for upcoming visits.</p>
			<button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-surface border border-border rounded-md text-text-secondary">Close</button>
		</div>
	);

	const setQty = (id: string, qty: number) => setQtys((p) => ({ ...p, [id]: qty }));
	return (
		<div className="px-1 py-3">
			<p className="text-xs text-text-muted px-4 mb-3">Review the proposed refill. Quantities over warehouse stock are capped on apply.</p>
			<Section title="Top up to standard load" lines={plan.standard} qtys={qtys} onQty={setQty} />
			<Section title="Extra for upcoming visits" lines={plan.visits} qtys={qtys} onQty={setQty} />
			{anyOver && (
				<div className="mx-4 mb-3 flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
					<span className="text-xs text-warning-text">Some quantities exceed warehouse stock — they&apos;ll be capped at what&apos;s available.</span>
				</div>
			)}
			<div className="flex items-center justify-between px-4">
				<button onClick={onClose} className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised">Cancel</button>
				<button onClick={handleApply} disabled={applyMutation.isPending}
					className="px-4 py-2 text-sm font-semibold bg-primary hover:enabled:bg-primary-hover text-on-primary rounded-md disabled:opacity-50">
					{applyMutation.isPending ? "Filling…" : "Apply refill"}
				</button>
			</div>
			{applyMutation.isError && (
				<p className="text-xs text-error-text mt-2 text-center">
					{applyMutation.error instanceof Error ? applyMutation.error.message : "Failed to apply fill. Try again."}
				</p>
			)}
		</div>
	);
}
