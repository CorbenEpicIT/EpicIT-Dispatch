import { useState } from "react";
import { X } from "lucide-react";
import type { Vehicle, VehicleReadiness } from "../../types/vehicles";
import {
	useConfirmReadinessMutation,
	useRevokeReadinessMutation,
} from "../../hooks/useVehicles";

type Props = {
	vehicle: Vehicle;
	readiness: VehicleReadiness;
	date: string;
	onClose: () => void;
};

export default function VehicleReadinessPanel({ vehicle, readiness, date, onClose }: Props) {
	const [notes, setNotes] = useState("");
	const confirmMutation = useConfirmReadinessMutation();
	const revokeMutation = useRevokeReadinessMutation();

	const handleConfirmReadiness = () => {
		confirmMutation.mutate(
			{ vehicleId: vehicle.id, body: { date, notes: notes.trim() || undefined } },
			{ onSuccess: () => setNotes("") }
		);
	};

	const handleRevokeReadiness = () => {
		revokeMutation.mutate({ vehicleId: vehicle.id, date });
	};

	const activeGaps = readiness.gaps.filter((g) => g.gap > 0);

	return (
		<div className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-border flex flex-col z-50 shadow-xl">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-border">
				<div>
					<div className="text-sm font-semibold text-text-secondary">{vehicle.name}</div>
					<div className="text-xs text-text-faint mt-0.5">Readiness — {date}</div>
				</div>
				<button
					onClick={onClose}
					className="text-text-muted hover:text-text-secondary p-1 rounded transition-colors"
					aria-label="Close panel"
				>
					<X size={16} />
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
				{readiness.state === "unknown" && (
					<p className="text-sm text-text-muted">
						No inventory-linked materials on scheduled visits. Add line items with inventory item
						links on the visit detail page to enable automatic gap tracking.
					</p>
				)}

				{readiness.state === "not_applicable" && (
					<p className="text-sm text-text-muted">No visits scheduled for this date.</p>
				)}

				{/* Gap table */}
				{readiness.gaps.length > 0 && (
					<div>
						<div className="grid grid-cols-4 gap-2 text-xs font-semibold text-text-muted uppercase tracking-wide pb-1 border-b border-border mb-1">
							<span className="col-span-2">Item</span>
							<span className="text-right">Needed</span>
							<span className="text-right">Gap</span>
						</div>
						{readiness.gaps.map((gap) => (
							<div
								key={gap.inventory_item_id}
								className={`grid grid-cols-4 gap-2 py-2 text-sm border-b border-border/50 ${
									gap.gap > 0 ? "bg-warning/5" : ""
								}`}
							>
								<span className="col-span-2 text-text-secondary truncate">{gap.name}</span>
								<span className="text-right text-text-muted">{gap.qty_needed}</span>
								<span
									className={`text-right font-semibold ${
										gap.gap > 0 ? "text-warning-text" : "text-success"
									}`}
								>
									{gap.gap > 0 ? `−${gap.gap}` : "✓"}
								</span>
							</div>
						))}

						{activeGaps.length > 0 && (
							<div className="pt-2 text-xs text-warning-text font-medium">
								{activeGaps.length} item{activeGaps.length !== 1 ? "s" : ""} short
							</div>
						)}
					</div>
				)}

				{/* Confirmation record */}
				{readiness.confirmed && (
					<div className="text-xs text-text-muted border border-success/30 rounded px-3 py-2 bg-success/5 space-y-1">
						<div className="flex items-center gap-2">
							<span className="font-medium text-success">Confirmed</span>
							{readiness.confirmed.confirmed_by_type === "restock_auto" && (
								<span className="text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded">Auto-confirmed</span>
							)}
							{readiness.confirmed.confirmed_by_type === "technician" && (
								<span className="text-[10px] font-semibold bg-surface-raised text-text-secondary px-1.5 py-0.5 rounded">Tech confirmed</span>
							)}
						</div>
						<div>
							by {readiness.confirmed.confirmed_by} at{" "}
							{new Date(readiness.confirmed.confirmed_at).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</div>
						{readiness.confirmed.notes && (
							<div className="italic">"{readiness.confirmed.notes}"</div>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="px-4 py-3 border-t border-border space-y-2">
				{readiness.state === "confirmed" ? (
					<button
						onClick={handleRevokeReadiness}
						disabled={revokeMutation.isPending}
						className="w-full text-sm text-text-muted hover:text-error py-1.5 transition-colors disabled:opacity-50"
					>
						{revokeMutation.isPending ? "Revoking…" : "Revoke confirmation"}
					</button>
				) : (
					<>
						{(readiness.state === "needs_action" || readiness.state === "unknown") && (
							<textarea
								className="w-full text-sm bg-canvas border border-border-input rounded px-3 py-2 text-text-secondary placeholder:text-text-faint resize-none focus:outline-none focus:border-primary"
								rows={2}
								placeholder="Note (optional) — e.g. staged from warehouse"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
							/>
						)}
						<button
							onClick={handleConfirmReadiness}
							disabled={confirmMutation.isPending}
							className="w-full bg-primary text-on-primary text-sm font-semibold py-2 rounded hover:bg-primary-hover disabled:opacity-50 transition-colors"
						>
							{confirmMutation.isPending ? "Confirming…" : "Confirm Ready"}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
