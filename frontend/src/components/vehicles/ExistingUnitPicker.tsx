import { useMemo, useState } from "react";
import { AlertTriangle, Barcode as BarcodeIcon } from "lucide-react";
import { useSerialsQuery } from "../../hooks/useTracking";
import { useScanDispatcher } from "../../hooks/useScanDispatcher";
import { BarcodeScanner } from "../inventory/BarcodeScanner";
import type { SerialUnitStatus } from "../../types/tracking";

export interface ExistingUnitPickerProps {
	itemId: string;
	itemName: string;
	/** Omitted → no status constraint (see AdjustStockModal's tracking-step notes on why). */
	statusFilter?: SerialUnitStatus;
	/** Scopes the candidate list to units currently on this vehicle. */
	vehicleId?: string;
	/** Exactly how many units must be selected — abs(delta) for this line. */
	targetCount: number;
	value: string[];
	onChange: (unitIds: string[]) => void;
}

// Lighter-weight sibling of SerialCaptureList — picks *existing* serial_unit
// rows (rather than capturing brand-new serial numbers) for every adjustment
// type except supplier_purchase. See AdjustStockModal.tsx for how
// statusFilter/vehicleId are derived per adjustment direction.
export default function ExistingUnitPicker({
	itemId,
	itemName,
	statusFilter,
	vehicleId,
	targetCount,
	value,
	onChange,
}: ExistingUnitPickerProps) {
	const { data, isLoading } = useSerialsQuery(itemId, { status: statusFilter, vehicleId });
	const candidates = useMemo(() => data?.serials ?? [], [data]);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scanError, setScanError] = useState<string | null>(null);

	const toggle = (id: string) => {
		if (value.includes(id)) onChange(value.filter((v) => v !== id));
		else onChange([...value, id]);
	};

	const { handleScan } = useScanDispatcher({
		onItem: () => setScanError("That code is an item, not a serial unit"),
		onBatch: () => setScanError("That code is a batch/lot, not a serial unit"),
		onSerial: (serial) => {
			if (serial.item.id !== itemId) {
				setScanError(`That unit belongs to ${serial.item.name}, not ${itemName}`);
				return;
			}
			const candidate = candidates.find((c) => c.id === serial.serialUnitId);
			if (!candidate) {
				setScanError("That unit isn't available for this adjustment (wrong status or location)");
				return;
			}
			setScanError(null);
			if (!value.includes(candidate.id)) onChange([...value, candidate.id]);
		},
		onNotFound: () => setScanError("No unit found for that code"),
	});

	const countState: "short" | "exact" | "over" =
		value.length < targetCount ? "short" : value.length === targetCount ? "exact" : "over";

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
					Select existing units
				</span>
				<div className="flex items-center gap-2">
					<span
						className={`text-xs font-semibold tabular-nums ${
							countState === "exact"
								? "text-success-text"
								: countState === "over"
									? "text-error-text"
									: "text-text-muted"
						}`}
					>
						{value.length} / {targetCount} selected
					</span>
					<button
						type="button"
						onClick={() => setScannerOpen(true)}
						aria-label="Scan serial unit"
						className="h-[26px] w-[26px] shrink-0 flex items-center justify-center rounded border border-border text-text-muted hover:text-primary hover:border-primary transition-colors"
					>
						<BarcodeIcon size={14} />
					</button>
				</div>
			</div>

			{scanError && (
				<div
					role="alert"
					className="flex items-center gap-1.5 text-xs text-error-text bg-error-bg border border-error-border rounded px-2 py-1"
				>
					<AlertTriangle size={12} />
					{scanError}
				</div>
			)}

			{isLoading && <p className="text-xs text-text-muted">Loading units…</p>}

			{!isLoading && candidates.length === 0 && (
				<p className="text-xs text-text-muted">No matching units available.</p>
			)}

			{candidates.length > 0 && (
				<div className="space-y-1 max-h-56 overflow-y-auto">
					{candidates.map((unit) => {
						const checked = value.includes(unit.id);
						return (
							<label
								key={unit.id}
								className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
									checked ? "border-primary bg-primary/10" : "border-border bg-surface"
								}`}
							>
								<input
									type="checkbox"
									checked={checked}
									onChange={() => toggle(unit.id)}
									aria-label={`Select unit ${unit.serial_number}`}
									className="shrink-0"
								/>
								<span className="flex-1 min-w-0 truncate font-mono text-text-primary">
									{unit.serial_number}
								</span>
							</label>
						);
					})}
				</div>
			)}

			{scannerOpen && (
				<BarcodeScanner continuous onScan={(code) => handleScan(code)} onClose={() => setScannerOpen(false)} />
			)}
		</div>
	);
}
