import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Barcode as BarcodeIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { BarcodeScanner } from "../BarcodeScanner";
import { useResolveCodeMutation } from "../../../hooks/useTracking";

export interface SerialCaptureListProps {
	/** For the debounced "already exists" check against this item's own serials. */
	itemId: string;
	/** How many serials are expected — the qty being received. */
	targetCount: number;
	value: string[];
	onChange: (serials: string[]) => void;
}

const RESOLVE_DEBOUNCE_MS = 400;

// Splits bulk-pasted text into individual serial candidates. HID scanners and
// spreadsheet copy/paste commonly separate entries with any of these three.
function splitPasted(text: string): string[] {
	return text
		.split(/[\n,\t]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

type RowConflict =
	| { status: "checking" }
	| { status: "clear" }
	| { status: "duplicate" }
	| { status: "conflict"; message: string };

function SerialRow({
	serial,
	itemId,
	isDuplicate,
	onRemove,
}: {
	serial: string;
	itemId: string;
	isDuplicate: boolean;
	onRemove: () => void;
}) {
	const resolveMutation = useResolveCodeMutation();
	const resolveRef = useRef(resolveMutation.mutateAsync);
	resolveRef.current = resolveMutation.mutateAsync;
	const [conflict, setConflict] = useState<RowConflict>({ status: "checking" });

	useEffect(() => {
		if (isDuplicate) {
			setConflict({ status: "duplicate" });
			return;
		}

		const trimmed = serial.trim();
		if (!trimmed) {
			setConflict({ status: "clear" });
			return;
		}

		let cancelled = false;
		setConflict({ status: "checking" });

		const timer = setTimeout(() => {
			resolveRef
				.current(trimmed)
				.then((result) => {
					if (cancelled) return;
					if (result.type === "serial") {
						setConflict({
							status: "conflict",
							message:
								result.item.id === itemId
									? "Already registered to this item"
									: `Already registered to ${result.item.name}`,
						});
					} else {
						// Resolves to an item's own code or a batch label — not a
						// registered serial, but still not a safe brand-new serial.
						setConflict({
							status: "conflict",
							message: "Matches an existing code, not a new serial",
						});
					}
				})
				.catch(() => {
					// No match — exactly what we expect for a brand-new serial.
					if (!cancelled) setConflict({ status: "clear" });
				});
		}, RESOLVE_DEBOUNCE_MS);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [serial, isDuplicate, itemId]);

	const isFlagged = conflict.status === "duplicate" || conflict.status === "conflict";
	const message =
		conflict.status === "duplicate"
			? "Duplicate in this list"
			: conflict.status === "conflict"
				? conflict.message
				: null;

	return (
		<div
			className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-sm transition-colors ${
				isFlagged ? "border-error-border bg-error-bg" : "border-border bg-surface"
			}`}
		>
			<span className="flex-1 min-w-0 truncate font-mono text-text-primary">{serial}</span>
			{conflict.status === "checking" && (
				<Loader2 size={12} className="shrink-0 animate-spin text-text-faint" />
			)}
			{isFlagged && (
				<span className="flex shrink-0 items-center gap-1 text-xs font-medium text-error-text">
					<AlertTriangle size={12} />
					{message}
				</span>
			)}
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove serial ${serial}`}
				className="shrink-0 text-text-faint hover:text-error transition-colors"
			>
				<Trash2 size={13} />
			</button>
		</div>
	);
}

export default function SerialCaptureList({
	itemId,
	targetCount,
	value,
	onChange,
}: SerialCaptureListProps) {
	const [draft, setDraft] = useState("");
	const [scannerOpen, setScannerOpen] = useState(false);

	const duplicateFlags = useMemo(() => {
		const counts = new Map<string, number>();
		for (const s of value) {
			const key = s.trim();
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return value.map((s) => (counts.get(s.trim()) ?? 0) > 1);
	}, [value]);

	const addSerials = (tokens: string[]) => {
		const nonEmpty = tokens.map((t) => t.trim()).filter(Boolean);
		if (nonEmpty.length === 0) return;
		onChange([...value, ...nonEmpty]);
	};

	const handleRemove = (index: number) => {
		onChange(value.filter((_, i) => i !== index));
	};

	// HID wedge burst: each physical scan types the code then an Enter. Commit
	// on Enter and clear without losing focus so the next scan lands cleanly.
	const commitDraft = () => {
		const trimmed = draft.trim();
		if (trimmed) addSerials([trimmed]);
		setDraft("");
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		commitDraft();
	};

	// Bulk paste — multi-token paste (newline/comma/tab separated) adds every
	// entry immediately; a single-token paste just fills the input as normal,
	// left for Enter to commit like any typed/scanned entry.
	const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
		const text = e.clipboardData.getData("text");
		const tokens = splitPasted(text);
		if (tokens.length > 1) {
			e.preventDefault();
			addSerials(tokens);
			setDraft("");
		}
	};

	// Camera scan loop — brand-new serials won't resolve to anything yet, so we
	// add the raw scanned string directly rather than routing through
	// useScanDispatcher's onItem/onSerial/onBatch handlers (those assume the
	// code already resolves). The per-row debounced check above still runs
	// against the raw scanned text, so a scan that *does* collide with an
	// existing serial/item/batch code is flagged the same way a typed one
	// would be. `continuous` keeps the camera mounted across the whole scan
	// burst, matching BarcodeScanner's existing multi-scan pattern.
	const handleScan = (code: string) => {
		addSerials([code]);
	};

	const countState: "short" | "exact" | "over" =
		value.length < targetCount ? "short" : value.length === targetCount ? "exact" : "over";

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
					Serial Numbers
				</span>
				<span
					className={`text-xs font-semibold tabular-nums ${
						countState === "exact"
							? "text-success-text"
							: countState === "over"
								? "text-error-text"
								: "text-text-muted"
					}`}
				>
					{value.length} / {targetCount} serials
				</span>
			</div>

			<div className="flex items-center gap-1.5">
				<input
					type="text"
					data-barcode-input="true"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={handleInputKeyDown}
					onPaste={handlePaste}
					placeholder="Scan or type a serial number, press Enter…"
					aria-label="Add serial number"
					className="flex-1 border border-border-input px-2.5 h-[34px] rounded bg-base text-text-primary text-sm focus:border-primary focus:outline-none transition-colors min-w-0"
				/>
				<button
					type="button"
					onClick={commitDraft}
					disabled={!draft.trim()}
					aria-label="Submit serial number"
					className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded border border-border text-text-muted hover:text-primary hover:border-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
				>
					<Plus size={16} />
				</button>
				<button
					type="button"
					onClick={() => setScannerOpen(true)}
					aria-label="Scan serial number"
					className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded border border-border text-text-muted hover:text-primary hover:border-primary transition-colors"
				>
					<BarcodeIcon size={16} />
				</button>
			</div>

			{value.length > 0 && (
				<div className="space-y-1 max-h-56 overflow-y-auto">
					{value.map((serial, i) => (
						<SerialRow
							key={i}
							serial={serial}
							itemId={itemId}
							isDuplicate={duplicateFlags[i]}
							onRemove={() => handleRemove(i)}
						/>
					))}
				</div>
			)}

			{scannerOpen && (
				<BarcodeScanner continuous onScan={handleScan} onClose={() => setScannerOpen(false)} />
			)}
		</div>
	);
}
