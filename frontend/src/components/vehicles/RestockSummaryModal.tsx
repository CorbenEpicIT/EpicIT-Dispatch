import { X } from "lucide-react";

// Normalized shape both call sites map their data into — RestockWorkflow joins
// VehicleRestockLine + RestockLineDetail by stock_item_id, FillToStandardPreview
// maps FillToStandardLine directly. Keeping the mapping at each call site (not
// inside this modal) avoids this component knowing about either backend shape.
export interface RestockSummaryLine {
	label: string;
	requested: number;
	moved: number;
	message?: string;
	serialCodes?: string[];
	lotCodes?: string[];
}

export default function RestockSummaryModal({
	title = "Restock Summary",
	lines,
	onAcknowledge,
}: {
	title?: string;
	lines: RestockSummaryLine[];
	onAcknowledge: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onAcknowledge}>
			<div
				className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
					<span className="text-sm font-bold text-text-primary">{title}</span>
					<button onClick={onAcknowledge} className="text-text-faint hover:text-text-secondary transition-colors">
						<X size={16} />
					</button>
				</div>

				<div className="px-5 py-3 border-b border-border-subtle flex-shrink-0">
					<p className="text-xs text-text-secondary">
						{lines.length} item{lines.length !== 1 ? "s" : ""} need{lines.length === 1 ? "s" : ""} a second look — cross-check against what&apos;s physically on the truck.
					</p>
				</div>

				<div className="flex-1 overflow-auto min-h-0 px-5 py-3 space-y-2">
					{lines.map((line, i) => {
						const short = line.requested - line.moved;
						return (
							<div key={`${line.label}-${i}`} className="bg-surface rounded-lg border border-border p-3">
								<div className="flex items-center justify-between gap-3">
									<span className="text-sm font-semibold text-text-primary">{line.label}</span>
									<span className="text-xs tabular-nums text-text-secondary whitespace-nowrap">
										Requested <span className="text-text-primary font-semibold">{line.requested}</span>
										{" · "}Moved <span className="text-text-primary font-semibold">{line.moved}</span>
										{short > 0 && <span className="text-warning-text font-semibold"> ({short} short)</span>}
									</span>
								</div>
								{line.message && (
									<p className="text-xs text-text-muted mt-1.5">{line.message}</p>
								)}
								{(line.serialCodes?.length || line.lotCodes?.length) ? (
									<div className="mt-2 flex flex-wrap gap-1">
										{line.serialCodes?.map((code) => (
											<span key={code} className="text-[10px] font-mono bg-surface-raised border border-border text-text-secondary px-1.5 py-0.5 rounded">
												{code}
											</span>
										))}
										{line.lotCodes?.map((code) => (
											<span key={code} className="text-[10px] font-mono bg-surface-raised border border-border text-text-secondary px-1.5 py-0.5 rounded">
												Lot {code}
											</span>
										))}
									</div>
								) : null}
							</div>
						);
					})}
				</div>

				<div className="px-5 py-4 border-t border-border flex-shrink-0">
					<button
						onClick={onAcknowledge}
						className="w-full px-4 py-2.5 text-sm font-semibold bg-primary hover:bg-primary-hover text-on-primary rounded-md transition-colors"
					>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}
