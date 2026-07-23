import { useEffect, useState } from "react";
import { X, Check, Barcode, Boxes } from "lucide-react";
import { useSerialsQuery, useBatchesQuery } from "../../../hooks/useTracking";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";
import { SERIAL_STATUS_LABEL, type SerialUnitStatus } from "../../../types/tracking";
import { useToast } from "../../ui/useToast";
import { formatDate } from "../../../util/util";
import LoadSvg from "../../../assets/icons/loading.svg?react";

interface UnitLabelPickerProps {
	itemId: string;
	itemName: string;
	isSerialized: boolean;
	isBatchTracked: boolean;
	onClose: () => void;
}

// Local 300ms debounce for the search inputs — matches ItemTrackingPage's
// useDebouncedValue (kept private here to avoid exporting page-internal helpers).
function useDebouncedValue<T>(value: T, delayMs = 300): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

type Tab = "serials" | "batches";

// Modal to queue per-unit labels for a queued tracked item. Lists that item's
// serial units and/or batches (reusing useSerialsQuery/useBatchesQuery) and adds
// the selected ones to the label queue as kind:"serial"/"batch" with their own
// SU-/LOT- code — the same add shape ItemTrackingPage's QueueLabelButton uses.
export default function UnitLabelPicker({
	itemId,
	itemName,
	isSerialized,
	isBatchTracked,
	onClose,
}: UnitLabelPickerProps) {
	const add = useLabelQueueStore((s) => s.add);
	const toast = useToast();
	const [tab, setTab] = useState<Tab>(isSerialized ? "serials" : "batches");

	// ── Serials ──────────────────────────────────────────────────────────────
	const [serialSearchInput, setSerialSearchInput] = useState("");
	const serialSearch = useDebouncedValue(serialSearchInput, 300);
	const [serialStatus, setSerialStatus] = useState<SerialUnitStatus | "">("");
	const [serialCursor, setSerialCursor] = useState<string | undefined>(undefined);
	const [serialRows, setSerialRows] = useState<
		{ id: string; serial_number: string; code: string; status: SerialUnitStatus }[]
	>([]);
	const {
		data: serialData,
		isLoading: serialsLoading,
		isFetching: serialsFetching,
	} = useSerialsQuery(itemId, {
		status: serialStatus || undefined,
		search: serialSearch || undefined,
		cursor: serialCursor,
	});

	// Filter/search change restarts pagination (same convention as SerialsTab).
	useEffect(() => {
		setSerialCursor(undefined);
		setSerialRows([]);
	}, [serialStatus, serialSearch]);

	useEffect(() => {
		if (!serialData) return;
		setSerialRows((prev) => (serialCursor ? [...prev, ...serialData.serials] : serialData.serials));
	}, [serialData, serialCursor]);

	// ── Batches ──────────────────────────────────────────────────────────────
	const [batchSearchInput, setBatchSearchInput] = useState("");
	const batchSearch = useDebouncedValue(batchSearchInput, 300);
	const { data: batchData, isLoading: batchesLoading } = useBatchesQuery(itemId, {
		search: batchSearch || undefined,
	});
	const batchRows = batchData?.batches ?? [];

	// ── Selection (composite keys so serial + batch selections never collide) ──
	const [selected, setSelected] = useState<
		Map<string, { code: string; kind: "serial" | "batch"; secondary: string }>
	>(new Map());

	const toggle = (
		id: string,
		entry: { code: string; kind: "serial" | "batch"; secondary: string },
	) => {
		setSelected((prev) => {
			const next = new Map(prev);
			if (next.has(id)) next.delete(id);
			else next.set(id, entry);
			return next;
		});
	};

	const handleAdd = () => {
		if (selected.size === 0) return;
		for (const [id, { code, kind, secondary }] of selected) {
			add({ id, code, kind, primaryLabel: itemName, secondaryLabel: secondary });
		}
		const n = selected.size;
		toast.success(`${n} label${n !== 1 ? "s" : ""} queued`);
		onClose();
	};

	const showTabs = isSerialized && isBatchTracked;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={`Choose units of ${itemName} to label`}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		>
			<div className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
					<div className="min-w-0">
						<div className="text-sm font-bold text-text-primary truncate">Choose units to label</div>
						<div className="text-xs text-text-muted truncate">{itemName}</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="text-text-faint hover:text-text-secondary transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				{showTabs && (
					<div className="flex gap-0 border-b border-border px-5 shrink-0">
						{(["serials", "batches"] as Tab[]).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
									tab === t
										? "border-primary text-primary"
										: "border-transparent text-text-muted hover:text-text-secondary"
								}`}
							>
								{t === "serials" ? "Serials" : "Batches"}
							</button>
						))}
					</div>
				)}

				<div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
					{tab === "serials" && isSerialized && (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<input
									type="text"
									value={serialSearchInput}
									onChange={(e) => setSerialSearchInput(e.target.value)}
									placeholder="Search serial or code…"
									aria-label="Search serials"
									className="flex-1 text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
								/>
								<select
									aria-label="Filter by status"
									value={serialStatus}
									onChange={(e) => setSerialStatus(e.target.value as SerialUnitStatus | "")}
									className="text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
								>
									<option value="">All statuses</option>
									{(Object.keys(SERIAL_STATUS_LABEL) as SerialUnitStatus[]).map((s) => (
										<option key={s} value={s}>
											{SERIAL_STATUS_LABEL[s]}
										</option>
									))}
								</select>
							</div>

							{serialsLoading && serialRows.length === 0 ? (
								<div className="flex justify-center py-10">
									<LoadSvg className="w-7 h-7" />
								</div>
							) : serialRows.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-text-muted">
									<Barcode size={24} />
									<p className="text-sm">No serial units match.</p>
								</div>
							) : (
								<div className="border border-border-subtle rounded-lg overflow-hidden">
									{serialRows.map((u) => {
										const checked = selected.has(u.id);
										return (
											<label
												key={u.id}
												className="flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle/60 last:border-b-0 hover:bg-surface transition-colors cursor-pointer"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() =>
														toggle(u.id, {
															code: u.code,
															kind: "serial",
															secondary: u.serial_number,
														})
													}
													className="h-3.5 w-3.5 rounded border-border bg-base text-primary focus:ring-primary cursor-pointer"
												/>
												<span className="text-sm font-medium text-text-primary truncate flex-1">
													{u.serial_number}
												</span>
												<span className="text-[11px] font-mono text-text-muted truncate">
													{u.code}
												</span>
												<span className="text-[10px] text-text-faint whitespace-nowrap">
													{SERIAL_STATUS_LABEL[u.status]}
												</span>
											</label>
										);
									})}
								</div>
							)}

							{serialData?.nextCursor && (
								<div className="flex justify-center">
									<button
										type="button"
										onClick={() => setSerialCursor(serialData.nextCursor ?? undefined)}
										disabled={serialsFetching}
										className="px-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors disabled:opacity-50"
									>
										{serialsFetching ? "Loading…" : "Load more"}
									</button>
								</div>
							)}
						</div>
					)}

					{tab === "batches" && isBatchTracked && (
						<div className="space-y-3">
							<input
								type="text"
								value={batchSearchInput}
								onChange={(e) => setBatchSearchInput(e.target.value)}
								placeholder="Search batch # or code…"
								aria-label="Search batches"
								className="w-full text-xs bg-surface border border-border-input rounded-md px-2 py-1.5 text-text-primary outline-none focus:border-primary transition-colors"
							/>

							{batchesLoading ? (
								<div className="flex justify-center py-10">
									<LoadSvg className="w-7 h-7" />
								</div>
							) : batchRows.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-10 text-center text-text-muted">
									<Boxes size={24} />
									<p className="text-sm">No batches match.</p>
								</div>
							) : (
								<div className="border border-border-subtle rounded-lg overflow-hidden">
									{batchRows.map((b) => {
										const checked = selected.has(b.id);
										return (
											<label
												key={b.id}
												className="flex items-center gap-2.5 px-3 py-2 border-b border-border-subtle/60 last:border-b-0 hover:bg-surface transition-colors cursor-pointer"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() =>
														toggle(b.id, {
															code: b.code,
															kind: "batch",
															secondary: b.batch_number,
														})
													}
													className="h-3.5 w-3.5 rounded border-border bg-base text-primary focus:ring-primary cursor-pointer"
												/>
												<span className="text-sm font-medium text-text-primary truncate flex-1">
													{b.batch_number}
												</span>
												<span className="text-[11px] font-mono text-text-muted truncate">
													{b.code}
												</span>
												<span className="text-[10px] text-text-faint whitespace-nowrap">
													{b.expires_at ? formatDate(b.expires_at) : "—"}
												</span>
											</label>
										);
									})}
								</div>
							)}
						</div>
					)}
				</div>

				<div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border shrink-0">
					<span className="text-xs text-text-muted">
						{selected.size} selected
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onClose}
							className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleAdd}
							disabled={selected.size === 0}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<Check size={14} />
							Add {selected.size > 0 ? selected.size : ""} label{selected.size !== 1 ? "s" : ""}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
