import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Loader2, ChevronDown, X, Check, AlertTriangle } from "lucide-react";
import {
	useTaxRates,
	useTaxGroups,
	useCreateTaxRate,
	useUpdateTaxRate,
	useDeleteTaxRate,
	useCreateTaxGroup,
	useUpdateTaxGroup,
	useDeleteTaxGroup,
} from "../../hooks/useTaxGroups";
import type { TaxRate, TaxGroup } from "../../types/tax";
import { formatCombinedRate } from "../../types/tax";
import type { CreateTaxRateInput, UpdateTaxRateInput, CreateTaxGroupInput, UpdateTaxGroupInput } from "../../api/tax";
import { formatRatePercent } from "../../lib/formatTax";

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================

const inputBase =
	"w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder-text-faint outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary";

const labelBase = "mb-1 block text-xs font-medium text-text-tertiary";

// ============================================================================
// RATE % INPUT HELPERS
// rate in DB is 0-1; we show/edit as 0-100
// ============================================================================

/** Convert a 0-1 rate to display percent string. Uses 4-decimal precision for edit fields. */
function rateToPercent(rate: number): string {
	return (rate * 100).toFixed(4).replace(/\.?0+$/, "");
}

/** Alias to shared utility for display-only contexts (strips trailing zeros, 2 decimal). */
const rateToDisplayPercent = formatRatePercent;

function percentToRate(pct: string): number {
	const n = parseFloat(pct);
	if (isNaN(n)) return 0;
	return Math.min(100, Math.max(0, n)) / 100;
}

// ============================================================================
// INLINE FEEDBACK
// ============================================================================

interface FeedbackState {
	type: "success" | "error";
	message: string;
}

function useFeedback() {
	const [feedback, setFeedback] = useState<FeedbackState | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => { if (timerRef.current) clearTimeout(timerRef.current); };
	}, []);

	const showFeedback = useCallback((type: "success" | "error", message: string) => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setFeedback({ type, message });
		timerRef.current = setTimeout(() => setFeedback(null), 3000);
	}, []);

	return { feedback, showFeedback };
}

// ============================================================================
// DEACTIVATE CONFIRMATION MODAL
// ============================================================================

interface DeactivateModalProps {
	title: string;
	body: string;
	warning?: string;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

function DeactivateModal({ title, body, warning, isPending, onConfirm, onCancel }: DeactivateModalProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="deactivate-modal-title"
				className="w-full max-w-sm rounded-lg border border-border bg-base shadow-xl"
			>
				<div className="border-b border-border-subtle px-5 py-4">
					<h3 id="deactivate-modal-title" className="text-sm font-semibold text-text-primary">{title}</h3>
				</div>
				<div className="px-5 py-4 space-y-3">
					<p className="text-sm text-text-secondary">{body}</p>
					{warning && (
						<div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2.5">
							<AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-warning" />
							<p className="text-xs text-warning-text">{warning}</p>
						</div>
					)}
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={isPending}
						className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isPending}
						className="flex items-center gap-1.5 rounded-md bg-error px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-error-strong disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isPending && <Loader2 size={12} className="animate-spin" />}
						{isPending ? "Deactivating…" : "Deactivate"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// TAX RATE FORM MODAL
// ============================================================================

interface RateFormModalProps {
	mode: "create" | "edit";
	initial?: TaxRate;
	isPending: boolean;
	error: string | null;
	onSubmit: (data: CreateTaxRateInput | UpdateTaxRateInput) => void;
	onClose: () => void;
}

function RateFormModal({ mode, initial, isPending, error, onSubmit, onClose }: RateFormModalProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [pct, setPct] = useState(initial ? rateToPercent(initial.rate) : "");
	const [jurisdiction, setJurisdiction] = useState(initial?.jurisdiction ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
	const [nameErr, setNameErr] = useState<string | null>(null);
	const [pctErr, setPctErr] = useState<string | null>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		let valid = true;
		if (!name.trim()) {
			setNameErr("Name is required.");
			valid = false;
		}
		const rateVal = parseFloat(pct);
		if (isNaN(rateVal) || rateVal < 0 || rateVal > 100) {
			setPctErr("Enter a rate between 0 and 100.");
			valid = false;
		}
		if (!valid) return;

		onSubmit({
			name: name.trim(),
			rate: percentToRate(pct),
			jurisdiction: jurisdiction.trim() || null,
			description: description.trim() || null,
			is_default: isDefault,
		});
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="rate-modal-title"
				className="w-full max-w-md rounded-lg border border-border bg-base shadow-xl"
			>
				<div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
					<h3 id="rate-modal-title" className="text-sm font-semibold text-text-primary">
						{mode === "create" ? "Add Tax Rate" : "Edit Tax Rate"}
					</h3>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="rounded p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
					>
						<X size={14} />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
					{/* Name */}
					<div>
						<label className={labelBase}>Name <span className="text-error-text">*</span></label>
						<input
							type="text"
							value={name}
							onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameErr(null); }}
							className={`${inputBase} ${nameErr ? "!border-error focus:!border-error focus:!ring-error" : ""}`}
							placeholder="e.g. Sales Tax"
							autoFocus
						/>
						{nameErr && <p className="mt-1 text-xs text-error-text">{nameErr}</p>}
					</div>

					{/* Rate % */}
					<div>
						<label className={labelBase}>Rate % <span className="text-error-text">*</span></label>
						<div className="relative">
							<input
								type="number"
								step="any"
								min="0"
								max="100"
								value={pct}
								onChange={(e) => { setPct(e.target.value); setPctErr(null); }}
								className={`${inputBase} pr-7 ${pctErr ? "!border-error focus:!border-error focus:!ring-error" : ""}`}
								placeholder="6.5"
							/>
							<span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
						</div>
						{pctErr && <p className="mt-1 text-xs text-error-text">{pctErr}</p>}
					</div>

					{/* Jurisdiction */}
					<div>
						<label className={labelBase}>Jurisdiction</label>
						<input
							type="text"
							value={jurisdiction}
							onChange={(e) => setJurisdiction(e.target.value)}
							className={inputBase}
							placeholder="e.g. State, County, City"
						/>
					</div>

					{/* Description */}
					<div>
						<label className={labelBase}>Description</label>
						<input
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className={inputBase}
							placeholder="Optional note"
						/>
					</div>

					{/* Default */}
					<label className="flex cursor-pointer items-center gap-2.5">
						<input
							type="checkbox"
							checked={isDefault}
							onChange={(e) => setIsDefault(e.target.checked)}
							className="sr-only"
						/>
						<div
							aria-hidden="true"
							className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
								isDefault
									? "border-primary bg-primary"
									: "border-border bg-surface hover:border-border-strong"
							}`}
						>
							{isDefault && <Check size={10} className="text-white" strokeWidth={3} />}
						</div>
						<span className="text-xs text-text-secondary">Set as default rate</span>
					</label>

					{error && (
						<div className="rounded-md border border-error-border bg-error-bg px-3 py-2">
							<p className="text-xs text-error-text">{error}</p>
						</div>
					)}

					<div className="flex items-center justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							disabled={isPending}
							className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isPending}
							className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isPending && <Loader2 size={12} className="animate-spin" />}
							{isPending ? "Saving…" : mode === "create" ? "Add Rate" : "Save Changes"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ============================================================================
// TAX GROUP FORM MODAL
// ============================================================================

interface GroupFormModalProps {
	mode: "create" | "edit";
	initial?: TaxGroup;
	activeRates: TaxRate[];
	isPending: boolean;
	error: string | null;
	onSubmit: (data: CreateTaxGroupInput | UpdateTaxGroupInput) => void;
	onClose: () => void;
}

function GroupFormModal({ mode, initial, activeRates, isPending, error, onSubmit, onClose }: GroupFormModalProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
	const [selectedRateIds, setSelectedRateIds] = useState<string[]>(
		initial?.rates.map((r) => r.tax_rate.id) ?? []
	);
	const [nameErr, setNameErr] = useState<string | null>(null);

	const combinedRate = activeRates
		.filter((r) => selectedRateIds.includes(r.id))
		.reduce((sum, r) => sum + Number(r.rate), 0);

	const toggleRate = (id: string) => {
		setSelectedRateIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			setNameErr("Name is required.");
			return;
		}
		onSubmit({
			name: name.trim(),
			description: description.trim() || null,
			is_default: isDefault,
			rate_ids: selectedRateIds,
		});
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="group-modal-title"
				className="w-full max-w-md rounded-lg border border-border bg-base shadow-xl"
			>
				<div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
					<h3 id="group-modal-title" className="text-sm font-semibold text-text-primary">
						{mode === "create" ? "Add Tax Group" : "Edit Tax Group"}
					</h3>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="rounded p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
					>
						<X size={14} />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
					{/* Name */}
					<div>
						<label className={labelBase}>Name <span className="text-error-text">*</span></label>
						<input
							type="text"
							value={name}
							onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameErr(null); }}
							className={`${inputBase} ${nameErr ? "!border-error focus:!border-error focus:!ring-error" : ""}`}
							placeholder="e.g. Standard Rate"
							autoFocus
						/>
						{nameErr && <p className="mt-1 text-xs text-error-text">{nameErr}</p>}
					</div>

					{/* Description */}
					<div>
						<label className={labelBase}>Description</label>
						<input
							type="text"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className={inputBase}
							placeholder="Optional note"
						/>
					</div>

					{/* Tax Rates multi-select */}
					<div>
						<label className={labelBase}>Tax Rates</label>
						{activeRates.length === 0 ? (
							<p className="text-xs text-text-muted">No active tax rates available.</p>
						) : (
							<div className="space-y-1 rounded-md border border-border bg-surface p-2">
								{activeRates.map((rate) => (
									<label
										key={rate.id}
										className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-surface-raised"
									>
										<input
											type="checkbox"
											checked={selectedRateIds.includes(rate.id)}
											onChange={() => toggleRate(rate.id)}
											className="sr-only"
										/>
										<div
											aria-hidden="true"
											className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
												selectedRateIds.includes(rate.id)
													? "border-primary bg-primary"
													: "border-border hover:border-border-strong"
											}`}
										>
											{selectedRateIds.includes(rate.id) && (
												<Check size={10} className="text-white" strokeWidth={3} />
											)}
										</div>
										<span className="flex-1 text-xs text-text-primary">{rate.name}</span>
										<span className="text-xs text-text-muted">
											{rateToDisplayPercent(rate.rate)}%
											{rate.jurisdiction && (
												<span className="ml-1 text-text-muted/60">· {rate.jurisdiction}</span>
											)}
										</span>
									</label>
								))}
							</div>
						)}
						{selectedRateIds.length > 0 && (
							<p className="mt-1.5 text-xs text-text-tertiary">
								Combined: <span className="font-medium text-text-primary">{formatCombinedRate(combinedRate)}</span>
							</p>
						)}
					</div>

					{/* Default */}
					<label className="flex cursor-pointer items-center gap-2.5">
						<input
							type="checkbox"
							checked={isDefault}
							onChange={(e) => setIsDefault(e.target.checked)}
							className="sr-only"
						/>
						<div
							aria-hidden="true"
							className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
								isDefault
									? "border-primary bg-primary"
									: "border-border bg-surface hover:border-border-strong"
							}`}
						>
							{isDefault && <Check size={10} className="text-white" strokeWidth={3} />}
						</div>
						<span className="text-xs text-text-secondary">Set as default group</span>
					</label>

					{error && (
						<div className="rounded-md border border-error-border bg-error-bg px-3 py-2">
							<p className="text-xs text-error-text">{error}</p>
						</div>
					)}

					<div className="flex items-center justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							disabled={isPending}
							className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isPending}
							className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isPending && <Loader2 size={12} className="animate-spin" />}
							{isPending ? "Saving…" : mode === "create" ? "Add Group" : "Save Changes"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ============================================================================
// ROW DROPDOWN MENU
// ============================================================================

interface RowMenuProps {
	onEdit: () => void;
	onDeactivate: () => void;
	deactivateLabel?: string;
}

function RowMenu({ onEdit, onDeactivate, deactivateLabel = "Deactivate" }: RowMenuProps) {
	const [open, setOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
	const btnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	const handleToggle = () => {
		if (open) { setOpen(false); return; }
		if (btnRef.current) {
			const rect = btnRef.current.getBoundingClientRect();
			setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
		}
		setOpen(true);
	};

	return (
		<div>
			<button
				ref={btnRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label="Row actions"
				onClick={handleToggle}
				className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text-primary"
			>
				<ChevronDown size={14} />
			</button>
			{open && menuPos && (
				<>
					<div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
					<div
						role="menu"
						style={{ top: menuPos.top, right: menuPos.right }}
						className="fixed z-20 w-36 rounded-md border border-border bg-base shadow-lg"
					>
						<button
							type="button"
							role="menuitem"
							onClick={() => { setOpen(false); onEdit(); }}
							className="w-full px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-surface-raised"
						>
							Edit
						</button>
						<button
							type="button"
							role="menuitem"
							onClick={() => { setOpen(false); onDeactivate(); }}
							className="w-full px-3 py-2 text-left text-xs text-error-text transition-colors hover:bg-error-bg"
						>
							{deactivateLabel}
						</button>
					</div>
				</>
			)}
		</div>
	);
}

// ============================================================================
// TAX RATES SECTION
// ============================================================================

interface TaxRatesSectionProps {
	showInactive: boolean;
}

function TaxRatesSection({ showInactive }: TaxRatesSectionProps) {
	const { data: rates, isLoading, error } = useTaxRates(showInactive);
	const createMutation = useCreateTaxRate();
	const updateMutation = useUpdateTaxRate();
	const deleteMutation = useDeleteTaxRate();

	const [showAddModal, setShowAddModal] = useState(false);
	const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
	const [deactivatingRate, setDeactivatingRate] = useState<TaxRate | null>(null);
	const [deactivateWarning, setDeactivateWarning] = useState<string | null>(null);
	const [mutationError, setMutationError] = useState<string | null>(null);
	const { feedback, showFeedback } = useFeedback();

	const handleCreate = async (data: CreateTaxRateInput | UpdateTaxRateInput) => {
		setMutationError(null);
		try {
			await createMutation.mutateAsync(data as CreateTaxRateInput);
			setShowAddModal(false);
			showFeedback("success", "Tax rate added.");
		} catch (err) {
			setMutationError(err instanceof Error ? err.message : "Failed to create tax rate.");
		}
	};

	const handleUpdate = async (data: CreateTaxRateInput | UpdateTaxRateInput) => {
		if (!editingRate) return;
		setMutationError(null);
		try {
			await updateMutation.mutateAsync({ id: editingRate.id, data: data as UpdateTaxRateInput });
			setEditingRate(null);
			showFeedback("success", "Tax rate updated.");
		} catch (err) {
			setMutationError(err instanceof Error ? err.message : "Failed to update tax rate.");
		}
	};

	const handleDeactivateClick = (rate: TaxRate) => {
		setDeactivateWarning(null);
		setDeactivatingRate(rate);
	};

	const handleDeactivateConfirm = async () => {
		if (!deactivatingRate) return;
		try {
			await deleteMutation.mutateAsync(deactivatingRate.id);
			setDeactivatingRate(null);
			setDeactivateWarning(null);
			showFeedback("success", "Tax rate deactivated.");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to deactivate.";
			// 409 conflict — rate is in use by a group
			setDeactivateWarning(msg);
		}
	};

	const displayRates = rates ?? [];

	return (
		<div className="rounded-lg border border-border-subtle bg-base">
			{/* Card header */}
			<div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
				<div>
					<h2 className="text-sm font-semibold text-text-primary">Tax Rates</h2>
					<p className="mt-0.5 text-xs text-text-muted">Individual rate components</p>
				</div>
				<button
					type="button"
					onClick={() => { setMutationError(null); setShowAddModal(true); }}
					className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
				>
					<Plus size={12} />
					Add Rate
				</button>
			</div>

			{/* Inline feedback */}
			{feedback && (
				<div className={`border-b border-border-subtle px-5 py-2 text-xs ${feedback.type === "success" ? "text-success-text" : "text-error-text"}`}>
					{feedback.message}
				</div>
			)}

			{/* Loading */}
			{isLoading && (
				<div className="flex items-center justify-center px-5 py-10">
					<Loader2 size={20} className="animate-spin text-text-muted" />
				</div>
			)}

			{/* Error */}
			{error && !isLoading && (
				<div className="px-5 py-6">
					<p className="text-sm text-error-text">{error.message}</p>
				</div>
			)}

			{/* Empty */}
			{!isLoading && !error && displayRates.length === 0 && (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-text-muted">No tax rates yet. Add your first tax rate to get started.</p>
				</div>
			)}

			{/* Table */}
			{!isLoading && !error && displayRates.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[480px]">
						<thead>
							<tr className="border-b border-border-subtle">
								<th className="px-5 py-2.5 text-left text-xs font-medium text-text-muted">Name</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Jurisdiction</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Rate</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Default</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Status</th>
								<th className="w-8 px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{displayRates.map((rate, idx) => (
								<tr
									key={rate.id}
									className={`border-b border-border-subtle/50 transition-colors hover:bg-surface/40 ${!rate.is_active ? "opacity-50" : ""} ${idx === displayRates.length - 1 ? "border-b-0" : ""}`}
								>
									<td className="px-5 py-3 text-sm font-medium text-text-primary">
										{rate.name}
										{rate.description && (
											<p className="mt-0.5 text-xs font-normal text-text-muted">{rate.description}</p>
										)}
									</td>
									<td className="px-3 py-3 text-xs text-text-secondary">
										{rate.jurisdiction ?? <span className="text-text-muted">—</span>}
									</td>
									<td className="px-3 py-3 text-sm tabular-nums text-text-primary">
										{rateToDisplayPercent(rate.rate)}%
									</td>
									<td className="px-3 py-3">
										{rate.is_default && (
											<span className="inline-flex items-center align-middle rounded-full border border-primary-border bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-text">
												Default
											</span>
										)}
									</td>
									<td className="px-3 py-3">
										{rate.is_active ? (
											<span className="text-xs text-text-muted">Active</span>
										) : (
											<span className="text-xs text-text-faint">Inactive</span>
										)}
									</td>
									<td className="px-3 py-3">
										{rate.is_active && (
											<RowMenu
												onEdit={() => { setMutationError(null); setEditingRate(rate); }}
												onDeactivate={() => handleDeactivateClick(rate)}
											/>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Modals */}
			{showAddModal && (
				<RateFormModal
					mode="create"
					isPending={createMutation.isPending}
					error={mutationError}
					onSubmit={handleCreate}
					onClose={() => { setShowAddModal(false); setMutationError(null); }}
				/>
			)}

			{editingRate && (
				<RateFormModal
					mode="edit"
					initial={editingRate}
					isPending={updateMutation.isPending}
					error={mutationError}
					onSubmit={handleUpdate}
					onClose={() => { setEditingRate(null); setMutationError(null); }}
				/>
			)}

			{deactivatingRate && (
				<DeactivateModal
					title="Deactivate Tax Rate"
					body={`Deactivate "${deactivatingRate.name}"? It will no longer be available for new assignments.`}
					warning={deactivateWarning ?? undefined}
					isPending={deleteMutation.isPending}
					onConfirm={handleDeactivateConfirm}
					onCancel={() => { setDeactivatingRate(null); setDeactivateWarning(null); }}
				/>
			)}
		</div>
	);
}

// ============================================================================
// TAX GROUPS SECTION
// ============================================================================

interface TaxGroupsSectionProps {
	showInactive: boolean;
}

function TaxGroupsSection({ showInactive }: TaxGroupsSectionProps) {
	const { data: groups, isLoading, error } = useTaxGroups(showInactive);
	const { data: activeRates } = useTaxRates(false);
	const createMutation = useCreateTaxGroup();
	const updateMutation = useUpdateTaxGroup();
	const deleteMutation = useDeleteTaxGroup();

	const [showAddModal, setShowAddModal] = useState(false);
	const [editingGroup, setEditingGroup] = useState<TaxGroup | null>(null);
	const [deactivatingGroup, setDeactivatingGroup] = useState<TaxGroup | null>(null);
	const [mutationError, setMutationError] = useState<string | null>(null);
	const { feedback, showFeedback } = useFeedback();

	const handleCreate = async (data: CreateTaxGroupInput | UpdateTaxGroupInput) => {
		setMutationError(null);
		try {
			await createMutation.mutateAsync(data as CreateTaxGroupInput);
			setShowAddModal(false);
			showFeedback("success", "Tax group added.");
		} catch (err) {
			setMutationError(err instanceof Error ? err.message : "Failed to create tax group.");
		}
	};

	const handleUpdate = async (data: CreateTaxGroupInput | UpdateTaxGroupInput) => {
		if (!editingGroup) return;
		setMutationError(null);
		try {
			await updateMutation.mutateAsync({ id: editingGroup.id, data: data as UpdateTaxGroupInput });
			setEditingGroup(null);
			showFeedback("success", "Tax group updated.");
		} catch (err) {
			setMutationError(err instanceof Error ? err.message : "Failed to update tax group.");
		}
	};

	const handleDeactivateConfirm = async () => {
		if (!deactivatingGroup) return;
		try {
			await deleteMutation.mutateAsync(deactivatingGroup.id);
			setDeactivatingGroup(null);
			showFeedback("success", "Tax group deactivated.");
		} catch (err) {
			setMutationError(err instanceof Error ? err.message : "Failed to deactivate tax group.");
			setDeactivatingGroup(null);
			showFeedback("error", err instanceof Error ? err.message : "Failed to deactivate.");
		}
	};

	const displayGroups = groups ?? [];
	const availableRates = activeRates ?? [];

	return (
		<div className="rounded-lg border border-border-subtle bg-base">
			{/* Card header */}
			<div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
				<div>
					<h2 className="text-sm font-semibold text-text-primary">Tax Groups</h2>
					<p className="mt-0.5 text-xs text-text-muted">Bundles of rates applied together</p>
				</div>
				<button
					type="button"
					onClick={() => { setMutationError(null); setShowAddModal(true); }}
					className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
				>
					<Plus size={12} />
					Add Group
				</button>
			</div>

			{/* Inline feedback */}
			{feedback && (
				<div className={`border-b border-border-subtle px-5 py-2 text-xs ${feedback.type === "success" ? "text-success-text" : "text-error-text"}`}>
					{feedback.message}
				</div>
			)}

			{/* Loading */}
			{isLoading && (
				<div className="flex items-center justify-center px-5 py-10">
					<Loader2 size={20} className="animate-spin text-text-muted" />
				</div>
			)}

			{/* Error */}
			{error && !isLoading && (
				<div className="px-5 py-6">
					<p className="text-sm text-error-text">{error.message}</p>
				</div>
			)}

			{/* Empty */}
			{!isLoading && !error && displayGroups.length === 0 && (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-text-muted">No tax groups yet. Create a group to bundle rates together.</p>
				</div>
			)}

			{/* Table */}
			{!isLoading && !error && displayGroups.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[520px]">
						<thead>
							<tr className="border-b border-border-subtle">
								<th className="px-5 py-2.5 text-left text-xs font-medium text-text-muted">Name</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Rates</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Total</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Default</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Status</th>
								<th className="w-8 px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{displayGroups.map((group, idx) => (
								<tr
									key={group.id}
									className={`border-b border-border-subtle/50 transition-colors hover:bg-surface/40 ${!group.is_active ? "opacity-50" : ""} ${idx === displayGroups.length - 1 ? "border-b-0" : ""}`}
								>
									<td className="px-5 py-3 text-sm font-medium text-text-primary">
										{group.name}
										{group.description && (
											<p className="mt-0.5 text-xs font-normal text-text-muted">{group.description}</p>
										)}
									</td>
									<td className="px-3 py-3">
										{group.rates.length === 0 ? (
											<span className="text-xs text-text-muted">No rates</span>
										) : (
											<span className="text-xs text-text-secondary">
												{group.rates.map((r) => r.tax_rate.name).join(" + ")}
											</span>
										)}
									</td>
									<td className="px-3 py-3 text-sm tabular-nums text-text-primary">
										{formatCombinedRate(group.combined_rate)}
									</td>
									<td className="px-3 py-3">
										{group.is_default && (
											<span className="inline-flex items-center align-middle rounded-full border border-primary-border bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-text">
												Default
											</span>
										)}
									</td>
									<td className="px-3 py-3">
										{group.is_active ? (
											<span className="text-xs text-text-muted">Active</span>
										) : (
											<span className="text-xs text-text-faint">Inactive</span>
										)}
									</td>
									<td className="px-3 py-3">
										{group.is_active && (
											<RowMenu
												onEdit={() => { setMutationError(null); setEditingGroup(group); }}
												onDeactivate={() => setDeactivatingGroup(group)}
											/>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Modals */}
			{showAddModal && (
				<GroupFormModal
					mode="create"
					activeRates={availableRates}
					isPending={createMutation.isPending}
					error={mutationError}
					onSubmit={handleCreate}
					onClose={() => { setShowAddModal(false); setMutationError(null); }}
				/>
			)}

			{editingGroup && (
				<GroupFormModal
					mode="edit"
					initial={editingGroup}
					activeRates={availableRates}
					isPending={updateMutation.isPending}
					error={mutationError}
					onSubmit={handleUpdate}
					onClose={() => { setEditingGroup(null); setMutationError(null); }}
				/>
			)}

			{deactivatingGroup && (
				<DeactivateModal
					title="Deactivate Tax Group"
					body={`Deactivate "${deactivatingGroup.name}"? It will no longer be available for new assignments.`}
					isPending={deleteMutation.isPending}
					onConfirm={handleDeactivateConfirm}
					onCancel={() => setDeactivatingGroup(null)}
				/>
			)}
		</div>
	);
}

// ============================================================================
// TOP-LEVEL EXPORT
// ============================================================================

interface TaxSettingsSectionProps {
	showInactive?: boolean;
}

export default function TaxSettingsSection({ showInactive = false }: TaxSettingsSectionProps) {
	return (
		<div className="space-y-4">
			<TaxRatesSection showInactive={showInactive} />
			<TaxGroupsSection showInactive={showInactive} />
		</div>
	);
}
