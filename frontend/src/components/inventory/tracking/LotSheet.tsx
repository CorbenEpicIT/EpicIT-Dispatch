import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import Drawer from "../../ui/Drawer";
import { Field, SheetError, formatDate } from "./sheetShared";
import { useBatchesQuery } from "../../../hooks/useTracking";
import type { BatchListRow } from "../../../types/tracking";

export interface LotSheetTarget {
	itemId: string;
	itemName: string;
}

export interface LotSheetProps {
	target: LotSheetTarget | null;
	onClose: () => void;
	/** Which vehicle's on-hand qty to surface — the tech's own truck. */
	vehicleId: string;
}

function LotDetail({ lot, vehicleId }: { lot: BatchListRow; vehicleId: string }) {
	const onThisVehicle = lot.vehicles.find((v) => v.vehicle_id === vehicleId);
	const otherVehicles = lot.vehicles.filter((v) => v.vehicle_id !== vehicleId);

	return (
		<div className="flex flex-col">
			<div className="px-5 pt-4 pb-3">
				<div className="flex items-start justify-between gap-3">
					<p className="font-mono text-base font-semibold text-text-primary break-all">
						{lot.batch_number}
					</p>
					{lot.recalled_at && (
						<span className="shrink-0 rounded border border-error-border bg-error-bg px-2 py-0.5 text-[10px] font-semibold text-error-text">
							Recalled
						</span>
					)}
				</div>
			</div>

			{lot.recalled_at && (
				<div
					role="alert"
					className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-error-border bg-error-bg px-3 py-2.5"
				>
					<AlertTriangle
						size={14}
						className="mt-0.5 shrink-0 text-error-text"
					/>
					<p className="text-xs text-error-text">
						This lot was recalled on {formatDate(lot.recalled_at)}. Do
						not install remaining units — report and set aside.
					</p>
				</div>
			)}

			<div className="px-5">
				<Field
					label="On this vehicle"
					value={String(onThisVehicle?.qty_on_hand ?? 0)}
				/>
				<Field label="In warehouse" value={String(lot.qty_in_warehouse)} />
				<Field label="Received (total)" value={String(lot.qty_received)} />
				{lot.expires_at && (
					<Field label="Expires" value={formatDate(lot.expires_at)} />
				)}
				{lot.supplier && (
					<Field label="Supplier" value={lot.supplier} />
				)}
			</div>

			{otherVehicles.length > 0 && (
				<>
					<div className="px-5 pt-4 pb-2">
						<p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
							Also On
						</p>
					</div>
					<div className="px-5 pb-4 space-y-1.5">
						{otherVehicles.map((v) => (
							<div
								key={v.vehicle_id}
								className="flex items-center justify-between text-sm"
							>
								<span className="text-text-secondary truncate">
									{v.vehicle_name}
								</span>
								<span className="text-text-muted tabular-nums shrink-0">
									{v.qty_on_hand}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function LotList({
	itemId,
	vehicleId,
	onPick,
}: {
	itemId: string;
	vehicleId: string;
	onPick: (lot: BatchListRow) => void;
}) {
	const { data, isLoading, isError } = useBatchesQuery(itemId);
	const lots = (data?.batches ?? []).filter((lot) =>
		lot.vehicles.some((v) => v.vehicle_id === vehicleId),
	);

	if (isLoading) {
		return <p className="px-5 py-6 text-sm text-text-muted">Loading lots…</p>;
	}

	if (isError) {
		return (
			<SheetError message="Couldn't load lots. Check your connection and try again." />
		);
	}

	if (lots.length === 0) {
		return <p className="px-5 py-6 text-sm text-text-muted">No lots on this vehicle.</p>;
	}

	return (
		<div className="px-5 py-3">
			<p className="mb-2 text-xs text-text-muted">
				{lots.length} lot{lots.length !== 1 ? "s" : ""} on this vehicle
			</p>
			<div className="space-y-1.5">
				{lots.map((lot) => {
					const onThisVehicle = lot.vehicles.find((v) => v.vehicle_id === vehicleId);
					return (
						<button
							key={lot.id}
							type="button"
							onClick={() => onPick(lot)}
							className="flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 text-left transition-colors hover:bg-surface-raised"
						>
							{lot.recalled_at && (
								<AlertTriangle
									size={14}
									className="shrink-0 text-error-text"
								/>
							)}
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-text-primary">
								{lot.batch_number}
							</span>
							<span className="shrink-0 text-xs text-text-muted tabular-nums">
								{onThisVehicle?.qty_on_hand ?? 0}
							</span>
							<ChevronRight size={16} className="shrink-0 text-text-muted" />
						</button>
					);
				})}
			</div>
		</div>
	);
}

export default function LotSheet({ target, onClose, vehicleId }: LotSheetProps) {
	// Drilling from list into a single lot is local state — the page only ever
	// hands us the entry point. See SerialSheet's identical comment for why this
	// resets on target change rather than on unmount (Drawer keeps children
	// mounted through its 200ms exit transition).
	const [drilledLot, setDrilledLot] = useState<BatchListRow | null>(null);
	const [lastItemId, setLastItemId] = useState<string | null>(null);
	// Normalize to null FIRST, then compare against the stored (also-null) value.
	// Comparing the raw `target?.itemId` (which is `undefined` when closed) against
	// a stored null never stabilizes — `undefined !== null` re-fires the setState
	// every render forever. See SerialSheet's identical guard.
	const targetItemId = target?.itemId ?? null;
	if (targetItemId !== lastItemId) {
		setLastItemId(targetItemId);
		if (drilledLot !== null) setDrilledLot(null);
	}

	const title = drilledLot ? "Lot" : (target?.itemName ?? "");

	return (
		<Drawer isOpen={!!target} onClose={onClose} title={title} side="center">
			{drilledLot && (
				<button
					type="button"
					onClick={() => setDrilledLot(null)}
					className="flex h-11 w-full items-center gap-1.5 border-b border-border-subtle px-5 text-left text-sm text-text-secondary transition-colors hover:text-text-primary"
				>
					<ChevronLeft size={16} />
					Back to lots
				</button>
			)}

			{drilledLot ? (
				<LotDetail lot={drilledLot} vehicleId={vehicleId} />
			) : target ? (
				<LotList itemId={target.itemId} vehicleId={vehicleId} onPick={setDrilledLot} />
			) : null}
		</Drawer>
	);
}
