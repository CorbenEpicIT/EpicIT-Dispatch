import { useState } from "react";
import { useVehicleRestockRequestsQuery, useConfirmReceiptMutation } from "../../hooks/useVehicleStock";
import type { RestockRequest } from "../../types/vehicles";

export default function RestockStatusList({ vehicleId }: { vehicleId: string }) {
	const { data: requests = [], isLoading } = useVehicleRestockRequestsQuery(vehicleId);
	const confirm = useConfirmReceiptMutation(vehicleId);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [qty, setQty] = useState(0);

	if (isLoading) return null;
	if (requests.length === 0) return null;

	const pending = requests.filter((r) => r.status === "pending");
	const toReceive = requests.filter((r) => r.status === "fulfilled" && r.received_at === null);
	const resolved = requests.filter(
		(r) => r.status === "dismissed" || (r.status === "fulfilled" && r.received_at !== null),
	);

	const startConfirm = (r: RestockRequest) => {
		setConfirming(r.id);
		setQty(Number(r.qty_fulfilled ?? 0));
	};
	const submit = async (r: RestockRequest) => {
		await confirm.mutateAsync({ items: [{ request_id: r.id, qty_received: qty }] });
		setConfirming(null);
	};

	const name = (r: RestockRequest) => r.stock_item.inventory_item.name;

	return (
		<div className="rounded-xl border border-border-subtle overflow-hidden">
			<div className="px-4 py-3 bg-base/60 border-b border-border-subtle text-xs font-medium text-text-tertiary uppercase tracking-wide">
				Restock Requests
			</div>

			{toReceive.length > 0 && (
				<div className="border-b border-border-subtle">
					<div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-warning-text">
						Arrived — confirm receipt
					</div>
					{toReceive.map((r) => (
						<div key={r.id} className="px-4 py-2.5 border-b border-border-subtle/60 last:border-0">
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm text-text-primary">{name(r)}</span>
								{confirming === r.id ? (
									<div className="flex items-center gap-2">
										<input
											type="number"
											min={0}
											value={qty}
											onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value))))}
											className="w-16 text-center text-sm rounded border border-border-input bg-base px-1 py-0.5"
										/>
										<button
											onClick={() => submit(r)}
											disabled={confirm.isPending}
											className="text-xs font-semibold px-2.5 py-1.5 rounded bg-primary-hover text-on-primary disabled:opacity-50"
										>
											Save
										</button>
										<button onClick={() => setConfirming(null)} className="text-xs text-text-muted">
											Cancel
										</button>
									</div>
								) : (
									<button
										onClick={() => startConfirm(r)}
										className="text-xs font-semibold px-2.5 py-1.5 rounded bg-warning/15 text-warning-text"
									>
										Confirm {Number(r.qty_fulfilled ?? 0)}
									</button>
								)}
							</div>
							{confirming === r.id && qty !== Number(r.qty_fulfilled ?? 0) && (
								<p className="text-[11px] text-warning-text mt-1">
									Differs from {Number(r.qty_fulfilled ?? 0)} fulfilled — a discrepancy will be recorded.
								</p>
							)}
						</div>
					))}
				</div>
			)}

			{pending.length > 0 && (
				<div className="border-b border-border-subtle">
					<div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-text-muted">Pending</div>
					{pending.map((r) => (
						<div
							key={r.id}
							className="flex items-center justify-between px-4 py-2 border-b border-border-subtle/60 last:border-0"
						>
							<span className="text-sm text-text-primary">{name(r)}</span>
							<span className="text-xs text-text-muted">
								requested {r.qty_requested != null ? Number(r.qty_requested) : "—"}
							</span>
						</div>
					))}
				</div>
			)}

			{resolved.length > 0 && (
				<div>
					<div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-text-faint">Recent</div>
					{resolved.map((r) => (
						<div
							key={r.id}
							className="flex items-center justify-between px-4 py-2 border-b border-border-subtle/60 last:border-0"
						>
							<span className="text-sm text-text-muted">{name(r)}</span>
							<span className="text-[11px] text-text-faint">
								{r.status === "dismissed" ? "dismissed" : "received"}
								{r.discrepant ? " · discrepancy" : ""}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
