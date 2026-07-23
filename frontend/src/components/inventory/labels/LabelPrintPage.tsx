import { useState } from "react";
import { X, Printer, Trash2, Minus, Plus, ListPlus, ScanLine } from "lucide-react";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";
import { resolveCode } from "../../../api/tracking";
import { BarcodeScanner } from "../BarcodeScanner";
import { useToast } from "../../ui/useToast";
import { LABEL_TEMPLATES, sheetSlots, type LabelTemplateId, type FillDirection } from "../../../lib/labels";
import PageHeader from "../../ui/PageHeader";
import LabelSheet from "./LabelSheet";
import AlignmentSheet from "./AlignmentSheet";
import UnitLabelPicker from "./UnitLabelPicker";

const CALIBRATION_MIN_MM = -10;
const CALIBRATION_MAX_MM = 10;

function clampMm(n: number): number {
	if (Number.isNaN(n)) return 0;
	return Math.min(CALIBRATION_MAX_MM, Math.max(CALIBRATION_MIN_MM, n));
}

// Per-kind queue-chip badge. Colors mirror the tracking page: serial = primary
// blue, batch = reviewing violet, item = neutral. A tracked item's SKU badge is
// re-toned to warning below to flag that it's the general product code.
const KIND_BADGE: Record<"item" | "serial" | "batch", { label: string; className: string }> = {
	item: { label: "SKU", className: "bg-surface-raised text-text-muted border border-border-subtle" },
	serial: { label: "SN", className: "bg-primary/15 text-primary-text" },
	batch: { label: "LOT", className: "bg-reviewing/15 text-reviewing-text" },
};

const TRACKED_SKU_HINT =
	"General product code — identifies the SKU, not individual units. Use Choose units to label specific serials/batches.";

export default function LabelPrintPage() {
	const {
		items,
		templateId,
		symbology,
		startOffset,
		calibration,
		fillDirection,
		lockedColumn,
		remove,
		clear,
		setTemplate,
		setStartOffset,
		setSymbology,
		setCopies,
		setCalibration,
		resetCalibration,
		setFillDirection,
		setLockedColumn,
	} = useLabelQueueStore();
	const [showAlignment, setShowAlignment] = useState(false);
	const [scanOpen, setScanOpen] = useState(false);
	const add = useLabelQueueStore((s) => s.add);
	const toast = useToast();

	// Scan → resolve → queue. resolveCode disambiguates SN:/LOT:/bare, so a scan
	// lands the exact unit/lot (or the item's general SKU code). Fire-and-forget
	// from the scanner's sync onScan; continuous mode keeps it open to rack up a
	// queue in one pass.
	const handleScan = (code: string) => {
		void (async () => {
			try {
				const res = await resolveCode(code);
				if (res.type === "item") {
					add({
						id: res.item.id,
						code: res.item.barcode ?? code,
						kind: "item",
						primaryLabel: res.item.name,
						secondaryLabel: res.item.sku ?? undefined,
						isSerialized: res.item.is_serialized,
						isBatchTracked: res.item.is_batch_tracked,
					});
					toast.success(`Queued ${res.item.name}`);
				} else if (res.type === "serial") {
					add({
						id: res.serialUnitId,
						code: res.code,
						kind: "serial",
						primaryLabel: res.item.name,
						secondaryLabel: res.code,
					});
					toast.success(`Queued serial for ${res.item.name}`);
				} else {
					add({
						id: res.batchId,
						code: res.code,
						kind: "batch",
						primaryLabel: res.item.name,
						secondaryLabel: res.batchNumber,
					});
					toast.success(`Queued batch ${res.batchNumber}`);
				}
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "No match for that code");
			}
		})();
	};

	// The queued tracked item whose serial/batch chooser is open, or null.
	const [pickerItem, setPickerItem] = useState<{
		id: string;
		name: string;
		isSerialized: boolean;
		isBatchTracked: boolean;
	} | null>(null);
	const template = LABEL_TEMPLATES[templateId];
	// A locked column from a previously-selected wider template can exceed this
	// template's column count — fall back to "all columns" rather than render off-sheet.
	const effectiveLockedColumn = lockedColumn != null && lockedColumn < template.columns ? lockedColumn : null;
	const perSheet = sheetSlots(template, { fillDirection, lockedColumn: effectiveLockedColumn }).length;
	// Clamp the start cell to the current slot count. Stored offset can outrun a
	// shrunken sheet (template change or column-lock); an out-of-range offset
	// wraps `slots[i % perSheet]` to the wrong cells and inflates sheet count.
	const effectiveStartOffset = Math.min(startOffset, Math.max(0, perSheet - 1));
	const templateCalibration = calibration[templateId];
	const totalLabels = items.reduce((sum, it) => sum + it.copies, 0);
	const canPreview = items.length > 0 || showAlignment;

	return (
		<div className="flex flex-col gap-4 text-text-primary">
			{/* @page size tracks the selected template so the browser's print dialog
			    defaults to the right sheet — "print at 100%" still matters since some
			    browsers ignore @page size and fall back to fit-to-page. */}
			<style>{`
				@page { size: ${template.sheetWidthIn}in ${template.sheetHeightIn}in; margin: 0; }
				@media print {
					/* Release the app shell's h-screen + overflow clamp so nothing
					   clips or shows a scrollbar in the print output. */
					html, body { height: auto !important; overflow: visible !important; background: white !important; }
					/* Hide the entire app (sidenav, top bar, this page's own chrome,
					   toasts) then re-show only the label sheet. visibility (not
					   display) lets a descendant opt back in under hidden ancestors. */
					body * { visibility: hidden !important; }
					#label-print-root, #label-print-root * { visibility: visible !important; }
					/* Lift the sheet out of the scroll container to the page origin. */
					#label-print-root { position: absolute; top: 0; left: 0; width: 100%; }
				}
			`}</style>

			{/* Independent page header. Wrapped to hide on print (no className prop). */}
			<div className="label-print-chrome">
				<PageHeader
					title="Print Labels"
					subtitle={
						<span className="text-xs text-text-muted">
							{items.length} label{items.length === 1 ? "" : "s"} queued
							{totalLabels !== items.length && ` — ${totalLabels} total with copies`}
						</span>
					}
				>
					<button
						type="button"
						onClick={() => setScanOpen(true)}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-surface hover:bg-surface-raised border border-border text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
					>
						<ScanLine size={14} /> Scan
					</button>
					<button
						type="button"
						onClick={clear}
						disabled={items.length === 0}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-surface hover:bg-surface-raised border border-border text-sm font-medium text-text-secondary hover:text-error-text disabled:opacity-40 transition-colors"
					>
						<Trash2 size={14} /> Clear
					</button>
					<button
						type="button"
						onClick={() => window.print()}
						disabled={!canPreview}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary hover:bg-primary-active text-on-primary text-sm font-medium disabled:opacity-40 transition-colors"
					>
						<Printer size={14} /> Print
					</button>
				</PageHeader>
			</div>

			{/* Sheet setup + selected items + tip — one section. */}
			<div className="label-print-chrome bg-base border border-border rounded-xl">
				<div className="flex flex-wrap items-center gap-3 px-4 py-3">
					<select
						aria-label="Label sheet template"
						value={templateId}
						onChange={(e) => setTemplate(e.target.value as LabelTemplateId)}
						className="text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
					>
						{Object.values(LABEL_TEMPLATES).map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
					{!template.continuous && (
						<label className="flex items-center gap-1.5 text-xs text-text-secondary">
							Start at cell
							<input
								type="number"
								min={0}
								max={perSheet - 1}
								value={effectiveStartOffset}
								onChange={(e) => setStartOffset(parseInt(e.target.value, 10) || 0)}
								className="w-14 text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
							/>
							<span className="text-text-faint">of {perSheet}</span>
						</label>
					)}
					{/* Symbology toggle — applies to item labels; serial/batch stay QR. */}
					<div className="inline-flex rounded-md border border-border-input overflow-hidden" role="group" aria-label="Label symbology">
						{(["qr", "barcode"] as const).map((sym) => (
							<button
								key={sym}
								type="button"
								aria-pressed={symbology === sym}
								onClick={() => setSymbology(sym)}
								className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
									symbology === sym
										? "bg-primary text-on-primary"
										: "bg-surface text-text-secondary hover:text-text-primary"
								}`}
							>
								{sym === "qr" ? "QR" : "Barcode"}
							</button>
						))}
					</div>
					{!template.continuous && (
						<>
							{/* Fill direction — order labels are placed in across the sheet.
							    Switching to Rows releases any single-column lock, since
							    row-fill spans every column. */}
							<div
								className="inline-flex rounded-md border border-border-input overflow-hidden"
								role="group"
								aria-label="Fill direction"
							>
								{(["row", "column"] as const).map((dir: FillDirection) => (
									<button
										key={dir}
										type="button"
										aria-pressed={fillDirection === dir}
										onClick={() => {
											setFillDirection(dir);
											// Rows fills across all columns, so drop any single-column lock.
											if (dir === "row") setLockedColumn(null);
										}}
										className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
											fillDirection === dir
												? "bg-primary text-on-primary"
												: "bg-surface text-text-secondary hover:text-text-primary"
										}`}
									>
										{dir === "row" ? "Rows" : "Columns"}
									</button>
								))}
							</div>
							<select
								aria-label="Locked column"
								value={effectiveLockedColumn ?? ""}
								onChange={(e) => {
									const col = e.target.value === "" ? null : parseInt(e.target.value, 10);
									setLockedColumn(col);
									// Locking one column implies column-major fill; flip the toggle.
									if (col != null) setFillDirection("column");
								}}
								className="text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
							>
								<option value="">All columns</option>
								{Array.from({ length: template.columns }, (_, i) => (
									<option key={i} value={i}>{`Col ${i + 1}`}</option>
								))}
							</select>
						</>
					)}
					<button
						type="button"
						aria-pressed={showAlignment}
						onClick={() => setShowAlignment((v) => !v)}
						className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
							showAlignment
								? "bg-primary text-on-primary border-primary"
								: "bg-surface text-text-secondary border-border-input hover:text-text-primary"
						}`}
					>
						Alignment guide
					</button>
				</div>

				{/* Calibration — per-template printer-drift fine-tune, in mm. */}
				<div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-border/60">
					<span className="text-xs text-text-muted">Fine-tune alignment (mm)</span>
					<label className="flex items-center gap-1.5 text-xs text-text-secondary">
						X
						<input
							type="number"
							step={0.5}
							min={CALIBRATION_MIN_MM}
							max={CALIBRATION_MAX_MM}
							value={templateCalibration?.xMm ?? 0}
							onChange={(e) =>
								setCalibration(templateId, {
									xMm: clampMm(parseFloat(e.target.value)),
									yMm: templateCalibration?.yMm ?? 0,
								})
							}
							className="w-16 text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
						/>
					</label>
					<label className="flex items-center gap-1.5 text-xs text-text-secondary">
						Y
						<input
							type="number"
							step={0.5}
							min={CALIBRATION_MIN_MM}
							max={CALIBRATION_MAX_MM}
							value={templateCalibration?.yMm ?? 0}
							onChange={(e) =>
								setCalibration(templateId, {
									xMm: templateCalibration?.xMm ?? 0,
									yMm: clampMm(parseFloat(e.target.value)),
								})
							}
							className="w-16 text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
						/>
					</label>
					<button
						type="button"
						onClick={() => resetCalibration(templateId)}
						disabled={!templateCalibration}
						className="text-xs text-text-faint hover:text-text-primary disabled:opacity-40 transition-colors"
					>
						Reset
					</button>
				</div>

				{items.length === 0 ? (
					<div className="px-4 py-3 border-t border-border/60 text-xs text-text-muted">
						No labels queued. On the Inventory page, use the label icon on an
						item card or its ⋯ menu to add labels here.
					</div>
				) : (
					<div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border/60">
						{items.map((item) => {
							const trackedItem =
								item.kind === "item" &&
								(item.isSerialized || item.isBatchTracked);
							return (
							<span
								key={item.id}
								className="flex items-center gap-1.5 text-xs bg-surface border border-border-subtle rounded-md pl-1.5 pr-2 py-1 text-text-secondary"
							>
								{/* Remove sits first (before the name) so it's clear of the
								    copies steppers — avoids misclicks between −/+ and delete. */}
								<button
									type="button"
									onClick={() => remove(item.id)}
									aria-label={`Remove ${item.primaryLabel}`}
									className="text-error-text hover:text-error transition-colors"
								>
									<X size={11} />
								</button>
								<span
									title={trackedItem ? TRACKED_SKU_HINT : undefined}
									className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none tracking-wide ${
										trackedItem
											? "bg-warning-bg text-warning-text border border-warning-border"
											: KIND_BADGE[item.kind].className
									}`}
								>
									{KIND_BADGE[item.kind].label}
								</span>
								<span className="truncate max-w-[10rem]">{item.primaryLabel}</span>
								{item.secondaryLabel && (
									<span className="text-text-faint truncate max-w-[8rem]">
										{item.secondaryLabel}
									</span>
								)}
								{trackedItem && (
									<button
										type="button"
										onClick={() =>
											setPickerItem({
												id: item.id,
												name: item.primaryLabel,
												isSerialized: !!item.isSerialized,
												isBatchTracked: !!item.isBatchTracked,
											})
										}
										title={TRACKED_SKU_HINT}
										className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary-active transition-colors"
									>
										<ListPlus size={12} /> Choose units
									</button>
								)}
								<span className="inline-flex items-center gap-1 pl-1">
									<button
										type="button"
										onClick={() => setCopies(item.id, item.copies - 1)}
										disabled={item.copies <= 1}
										aria-label={`Fewer copies of ${item.primaryLabel}`}
										className="text-text-faint hover:text-text-primary disabled:opacity-30 transition-colors"
									>
										<Minus size={11} />
									</button>
									<span className="w-3.5 text-center tabular-nums">{item.copies}</span>
									<button
										type="button"
										onClick={() => setCopies(item.id, item.copies + 1)}
										aria-label={`More copies of ${item.primaryLabel}`}
										className="text-text-faint hover:text-text-primary transition-colors"
									>
										<Plus size={11} />
									</button>
								</span>
							</span>
							);
						})}
					</div>
				)}

				<div className="px-4 py-2 border-t border-border/60 text-xs text-text-muted">
					Print at 100% scale (disable "Fit to page") with no margins for correct alignment.
					{symbology === "barcode" && (
						<> Barcode mode applies to item labels; serial &amp; batch labels always print as QR.</>
					)}
				</div>
			</div>

			{/* Sheet preview — outside chrome so it prints. The sheet is a fixed
			    physical width (e.g. 8.5in ≈ 816px); on a narrower viewport,
			    centering it clips the right columns off-screen. Scroll on the
			    outer box + `w-max mx-auto` inner keeps the whole sheet reachable
			    (centered when it fits, scrollable when it doesn't). Print resets
			    all of this so the sheet lands at the page origin, unscaled. */}
			{canPreview && (
				<div id="label-print-root" className="w-full overflow-x-auto py-4 print:overflow-visible print:p-0">
					<div className="flex flex-col items-center gap-6 w-max mx-auto print:gap-0 print:w-auto print:mx-0 print:items-start">
						{showAlignment ? (
							<AlignmentSheet
								templateId={templateId}
								fillDirection={fillDirection}
								lockedColumn={effectiveLockedColumn}
								calibration={templateCalibration}
							/>
						) : (
							<LabelSheet
								items={items}
								templateId={templateId}
								startOffset={effectiveStartOffset}
								symbology={symbology}
								fillDirection={fillDirection}
								lockedColumn={effectiveLockedColumn}
								calibration={templateCalibration}
							/>
						)}
					</div>
				</div>
			)}

			{pickerItem && (
				<UnitLabelPicker
					itemId={pickerItem.id}
					itemName={pickerItem.name}
					isSerialized={pickerItem.isSerialized}
					isBatchTracked={pickerItem.isBatchTracked}
					onClose={() => setPickerItem(null)}
				/>
			)}

			{scanOpen && (
				<BarcodeScanner onScan={handleScan} onClose={() => setScanOpen(false)} continuous />
			)}
		</div>
	);
}
