import { useState } from "react";
import {
	useProvisionalItemsQuery,
	useApproveItemMutation,
	useMergeItemMutation,
	useRejectItemMutation,
	useAllInventoryQuery,
} from "../../hooks/useInventory";
import type { ProvisionalItem } from "../../types/inventory";

export default function PendingPartsQueue() {
	const { data: items = [], isLoading } = useProvisionalItemsQuery();
	const approve = useApproveItemMutation();
	const merge = useMergeItemMutation();
	const reject = useRejectItemMutation();

	const [approving, setApproving] = useState<string | null>(null);
	const [merging, setMerging] = useState<string | null>(null);
	const [mergeTarget, setMergeTarget] = useState("");

	if (isLoading) return null;

	if (items.length === 0) {
		return (
			<div className="text-sm text-text-muted px-4 py-6 text-center">
				No pending parts submissions.
			</div>
		);
	}

	const handleApprove = async (item: ProvisionalItem, initialQty: number) => {
		await approve.mutateAsync({
			itemId: item.id,
			initial_warehouse_qty: initialQty > 0 ? initialQty : undefined,
		});
		setApproving(null);
	};

	const handleMerge = async (item: ProvisionalItem) => {
		if (!mergeTarget) return;
		await merge.mutateAsync({ itemId: item.id, targetId: mergeTarget });
		setMerging(null);
		setMergeTarget("");
	};

	return (
		<div className="flex flex-col gap-2">
			{items.map((item) => (
				<div
					key={item.id}
					className="rounded-xl border border-border-subtle bg-surface p-4"
				>
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="font-medium text-sm text-text-primary">{item.name}</div>
							<div className="text-xs text-text-muted mt-0.5">
								Submitted by {item.created_by_tech?.name ?? "unknown"}
								{item.cost != null ? ` · Cost: $${Number(item.cost).toFixed(2)}` : ""}
							</div>
							{item.vehicle_stocks.length > 0 && (
								<div className="text-xs text-text-muted">
									On:{" "}
									{item.vehicle_stocks
										.map((vs) => `${vs.vehicle.name} (${vs.qty_on_hand})`)
										.join(", ")}
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<button
								onClick={() => { setApproving(item.id); setMerging(null); }}
								className="text-xs font-semibold px-2.5 py-1.5 rounded bg-primary/15 text-primary hover:bg-primary/25"
							>
								Approve
							</button>
							<button
								onClick={() => {
									setMerging(item.id);
									setApproving(null);
									setMergeTarget("");
								}}
								className="text-xs font-semibold px-2.5 py-1.5 rounded bg-surface-hover text-text-secondary hover:bg-border-subtle"
							>
								Merge
							</button>
							<button
								onClick={() => reject.mutate(item.id)}
								disabled={reject.isPending}
								className="text-xs font-semibold px-2.5 py-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
							>
								Reject
							</button>
						</div>
					</div>

					{approving === item.id && (
						<ApprovePicker
							onConfirm={(qty) => handleApprove(item, qty)}
							onCancel={() => setApproving(null)}
							isPending={approve.isPending}
						/>
					)}

					{merging === item.id && (
						<MergePicker
							item={item}
							provisionalIds={items.map((i) => i.id)}
							value={mergeTarget}
							onChange={setMergeTarget}
							onConfirm={() => handleMerge(item)}
							onCancel={() => {
								setMerging(null);
								setMergeTarget("");
							}}
							isPending={merge.isPending}
						/>
					)}
				</div>
			))}
		</div>
	);
}

function ApprovePicker({
	onConfirm,
	onCancel,
	isPending,
}: {
	onConfirm: (initialQty: number) => void;
	onCancel: () => void;
	isPending: boolean;
}) {
	const [qty, setQty] = useState("0");
	return (
		<div className="mt-3 pt-3 border-t border-border-subtle flex flex-col gap-2">
			<div className="text-xs text-text-muted">Initial warehouse quantity after approval:</div>
			<input
				type="number"
				min={0}
				value={qty}
				onChange={(e) => setQty(e.target.value)}
				className="w-24 text-sm rounded border border-border-input bg-base px-2 py-1.5 text-text-primary outline-none focus:border-primary"
			/>
			<div className="flex gap-2">
				<button
					onClick={() => onConfirm(Math.max(0, parseInt(qty, 10) || 0))}
					disabled={isPending}
					className="text-xs font-semibold px-2.5 py-1.5 rounded bg-primary text-on-primary disabled:opacity-50"
				>
					Confirm Approval
				</button>
				<button onClick={onCancel} className="text-xs text-text-muted">Cancel</button>
			</div>
		</div>
	);
}

function MergePicker({
	item,
	provisionalIds,
	value,
	onChange,
	onConfirm,
	onCancel,
	isPending,
}: {
	item: ProvisionalItem;
	provisionalIds: string[];
	value: string;
	onChange: (v: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
	isPending: boolean;
}) {
	const { data: catalog = [] } = useAllInventoryQuery();
	// Filter out this item and any provisional items (by id cross-reference)
	const filtered = catalog.filter((c) => !provisionalIds.includes(c.id) && c.id !== item.id);

	return (
		<div className="mt-3 pt-3 border-t border-border-subtle flex flex-col gap-2">
			<div className="text-xs text-text-muted">Select catalog item to merge into:</div>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="text-sm rounded border border-border-input bg-base px-2 py-1.5 text-text-primary"
			>
				<option value="">— choose —</option>
				{filtered.map((c) => (
					<option key={c.id} value={c.id}>
						{c.name}
					</option>
				))}
			</select>
			<div className="flex gap-2">
				<button
					onClick={onConfirm}
					disabled={!value || isPending}
					className="text-xs font-semibold px-2.5 py-1.5 rounded bg-primary text-on-primary disabled:opacity-50"
				>
					Merge
				</button>
				<button onClick={onCancel} className="text-xs text-text-muted">
					Cancel
				</button>
			</div>
		</div>
	);
}
