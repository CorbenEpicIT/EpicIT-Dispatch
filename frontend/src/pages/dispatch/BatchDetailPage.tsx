import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
	Boxes,
	Briefcase,
	Check,
	Download,
	Loader2,
	PackagePlus,
	Pencil,
	ShieldAlert,
	ShieldCheck,
	Trash2,
	Truck,
	User,
	X,
} from "lucide-react";
import {
	useBatchesQuery,
	useBatchImpactQuery,
	useDeleteBatchMutation,
	useUpdateBatchMutation,
} from "../../hooks/useTracking";
import { useAllInventoryQuery } from "../../hooks/useInventory";
import { usePermission } from "../../hooks/usePermission";
import { exportBatchImpact } from "../../api/tracking";
import ReceiveStockModal from "../../components/inventory/tracking/ReceiveStockModal";
import { INPUT, LABEL } from "../../components/inventory/tracking/BatchCaptureFields";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import StatCard from "../../components/ui/StatCard";
import { useToast } from "../../components/ui/useToast";
import type {
	BatchImpactAffectedJob,
	BatchImpactAffectedSerial,
	BatchImpactReport,
} from "../../types/tracking";
import { formatDate, formatDateTime } from "../../util/util";

type Tab = "overview" | "traceability";

type ConsumptionRow = {
	key: string;
	clientId: string | null;
	clientName: string | null;
	jobId: string | null;
	jobNumber: string | null;
	jobName: string | null;
	date: string | null;
	qty: number;
	status: "active" | "reversed";
};

function jobRowFromAffectedJob(j: BatchImpactAffectedJob): ConsumptionRow {
	return {
		key: `job-${j.visit_line_item_id}`,
		clientId: j.client_id,
		clientName: j.client_name,
		jobId: j.job_id,
		jobNumber: j.job_number,
		jobName: j.job_name,
		date: null,
		qty: j.net_qty,
		status: j.fully_reversed ? "reversed" : "active",
	};
}

function serialRowFromAffectedSerial(s: BatchImpactAffectedSerial): ConsumptionRow {
	return {
		key: `serial-${s.id}`,
		clientId: s.client?.id ?? null,
		clientName: s.client?.name ?? null,
		jobId: s.visit?.job.id ?? null,
		jobNumber: s.visit?.job.job_number ?? null,
		jobName: s.visit?.job.name ?? null,
		date: s.consumed_at,
		qty: 1,
		status: "active",
	};
}

function OverviewTab({ remaining }: { remaining: BatchImpactReport["remaining"] }) {
	const onVehicles = remaining.vehicles.reduce((sum, v) => sum + v.qty_on_hand, 0);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3">
				<StatCard label="Warehouse" value={String(remaining.warehouse)} />
				<StatCard
					label="On Vehicles"
					value={String(onVehicles)}
					hint={`${remaining.vehicles.length} vehicle${remaining.vehicles.length !== 1 ? "s" : ""}`}
				/>
			</div>

			<div className="bg-surface border border-border-subtle rounded-xl p-4">
				<h3 className="font-semibold text-text-primary mb-3">
					Per-Vehicle Breakdown
				</h3>
				{remaining.vehicles.length === 0 ? (
					<p className="text-sm text-text-muted py-4 text-center">
						No units currently on vehicles.
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{remaining.vehicles.map((v) => (
							<div
								key={v.vehicle_id}
								className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-border text-sm"
							>
								<Truck
									size={13}
									className="text-text-muted"
								/>
								<span className="text-text-primary">
									{v.vehicle_name}
								</span>
								<span className="font-semibold text-text-secondary tabular-nums">
									{v.qty_on_hand}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function TraceabilityTab({
	affectedJobs,
	affectedSerials,
	onExport,
	isExporting,
	exportError,
}: {
	affectedJobs: BatchImpactAffectedJob[];
	affectedSerials: BatchImpactAffectedSerial[];
	onExport: () => void;
	isExporting: boolean;
	exportError: string | null;
}) {
	const rows = useMemo(() => {
		const serialRows = affectedSerials.map(serialRowFromAffectedSerial);
		const jobRows = affectedJobs.map(jobRowFromAffectedJob);
		return [...serialRows, ...jobRows].sort((a, b) => {
			if (a.date && b.date)
				return new Date(b.date).getTime() - new Date(a.date).getTime();
			if (a.date) return -1;
			if (b.date) return 1;
			return 0;
		});
	}, [affectedJobs, affectedSerials]);

	const distinctClients = new Set(
		rows.map((r) => r.clientId).filter((id): id is string => !!id)
	).size;
	const distinctJobs = new Set(rows.map((r) => r.jobId).filter((id): id is string => !!id))
		.size;
	const activeCount = rows.filter((r) => r.status === "active").length;
	const reversedCount = rows.filter((r) => r.status === "reversed").length;
	const totalQtyOut =
		affectedJobs.reduce((sum, j) => sum + j.consumed_qty, 0) + affectedSerials.length;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<StatCard label="Total Units Out" value={String(totalQtyOut)} />
				<StatCard
					label="Clients Affected"
					value={String(distinctClients)}
				/>
				<StatCard label="Jobs Affected" value={String(distinctJobs)} />
				<StatCard
					label="Active / Reversed"
					value={`${activeCount} / ${reversedCount}`}
					tone={activeCount > 0 ? "warning" : undefined}
				/>
			</div>

			<div className="flex items-center justify-between flex-wrap gap-2">
				<h3 className="font-semibold text-text-primary">
					Consumption Trace
				</h3>
				<div className="relative">
					<button
						type="button"
						onClick={onExport}
						disabled={isExporting}
						className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isExporting ? (
							<Loader2
								size={14}
								className="animate-spin"
							/>
						) : (
							<Download size={14} />
						)}
						{isExporting ? "Exporting…" : "Export XLSX"}
					</button>
					{exportError && (
						<div className="absolute right-0 top-full mt-1 z-10 whitespace-nowrap rounded-md border border-error-border bg-error-bg px-2 py-1 text-xs text-error-text">
							{exportError}
						</div>
					)}
				</div>
			</div>

			<div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
				{rows.length === 0 ? (
					<EmptyState
						icon={<Boxes size={28} />}
						title="No consumption recorded"
						description="Nothing has been consumed from this batch yet."
					/>
				) : (
					<div className="overflow-x-auto">
						<div className="min-w-[640px]">
							<div className="grid grid-cols-[1fr_1fr_110px_70px_100px] px-4 py-2 border-b border-border-subtle">
								{[
									"Client",
									"Job",
									"Date",
									"Qty",
									"Status",
								].map((h) => (
									<div
										key={h}
										className="text-[10px] font-semibold text-text-muted uppercase tracking-wider"
									>
										{h}
									</div>
								))}
							</div>
							{rows.map((r) => (
								<div
									key={r.key}
									className="grid grid-cols-[1fr_1fr_110px_70px_100px] items-center px-4 py-2.5 border-b border-border-subtle/50 last:border-b-0 text-sm hover:bg-surface-raised/40 transition-colors"
								>
									<div className="truncate pr-2">
										{r.clientId ? (
											<Link
												to={`/dispatch/clients/${r.clientId}`}
												className="inline-flex items-center gap-1.5 text-text-link hover:underline truncate"
											>
												<User
													size={
														12
													}
													className="flex-shrink-0"
												/>
												<span className="truncate">
													{
														r.clientName
													}
												</span>
											</Link>
										) : (
											<span className="text-text-faint">
												—
											</span>
										)}
									</div>
									<div className="truncate pr-2">
										{r.jobId ? (
											<Link
												to={`/dispatch/jobs/${r.jobId}`}
												className="inline-flex items-center gap-1.5 text-text-link hover:underline truncate"
											>
												<Briefcase
													size={
														12
													}
													className="flex-shrink-0"
												/>
												<span className="truncate">
													{
														r.jobNumber
													}{" "}
													·{" "}
													{
														r.jobName
													}
												</span>
											</Link>
										) : (
											<span className="text-text-faint">
												—
											</span>
										)}
									</div>
									<div className="text-text-muted text-xs">
										{r.date
											? formatDateTime(
													r.date
												)
											: "—"}
									</div>
									<div className="font-semibold text-text-primary tabular-nums">
										{r.qty}
									</div>
									<div>
										<span
											className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
												r.status ===
												"active"
													? "bg-warning-bg text-warning-text border border-warning-border"
													: "bg-surface-raised text-text-tertiary border border-border-strong"
											}`}
										>
											{r.status ===
											"active"
												? "Active"
												: "Reversed"}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

interface BatchEditDraft {
	batch_number: string;
	expires_at: string;
	supplier: string;
}

export default function BatchDetailPage() {
	const { batchId } = useParams<{ batchId: string }>();
	const navigate = useNavigate();
	const toast = useToast();
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmError, setConfirmError] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [receiveOpen, setReceiveOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editDraft, setEditDraft] = useState<BatchEditDraft>({
		batch_number: "",
		expires_at: "",
		supplier: "",
	});
	const [editError, setEditError] = useState<string | null>(null);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const { data: report, isLoading, error } = useBatchImpactQuery(batchId ?? "");
	const updateBatchMutation = useUpdateBatchMutation();
	const deleteBatchMutation = useDeleteBatchMutation();
	const canManage = usePermission("manage_inventory");
	// No single-item GET on the frontend — resolve the parent item's tracking
	// flags off the full list (same pattern as ItemTrackingPage) so the receive
	// modal knows whether to also collect serials for a dual-tracked item.
	const { data: allItems } = useAllInventoryQuery();
	// BatchImpactReport's `batch` doesn't carry `supplier` — pull it from the
	// item's batches list (same source ReceiveStockModal/BatchCaptureFields use)
	// so the edit form can seed its current value.
	const { data: batchesData } = useBatchesQuery(report?.batch.item_id ?? "");

	if (!batchId) return null;

	if (isLoading) {
		return (
			<div className="space-y-4 animate-pulse">
				<div className="h-6 w-56 bg-surface-raised rounded" />
				<div className="h-16 bg-surface-raised rounded-xl" />
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-20 bg-surface-raised rounded-lg"
						/>
					))}
				</div>
				<div className="h-64 bg-surface-raised rounded-xl" />
			</div>
		);
	}

	if (error || !report) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<div className="text-text-primary text-lg">Batch not found</div>
			</div>
		);
	}

	const { batch, remaining, affected_jobs, affected_serials } = report;
	const isRecalled = !!batch.recalled_at;
	const item = allItems?.find((i) => i.id === batch.item_id);
	const batchListRow = batchesData?.batches.find((b) => b.id === batch.id);
	// Empty-lot-only: nothing left in the warehouse or on any vehicle. The
	// backend re-checks this plus serials/consumption history authoritatively.
	const canDeleteBatch = remaining.total === 0;

	const expiresAtMs = batch.expires_at ? new Date(batch.expires_at).getTime() : null;
	const daysUntilExpiry =
		expiresAtMs !== null ? Math.ceil((expiresAtMs - Date.now()) / 86_400_000) : null;
	const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
	const isExpiringSoon =
		daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry < 30;

	const handleToggleRecall = async () => {
		try {
			await updateBatchMutation.mutateAsync({
				batchId: batch.id,
				input: { recalled: !isRecalled },
			});
			setConfirmOpen(false);
			setConfirmError(null);
		} catch (e) {
			setConfirmError(e instanceof Error ? e.message : "Failed to update batch");
		}
	};

	const startEdit = () => {
		setEditDraft({
			batch_number: batch.batch_number,
			expires_at: batch.expires_at ? batch.expires_at.slice(0, 10) : "",
			supplier: batchListRow?.supplier ?? "",
		});
		setEditError(null);
		setEditing(true);
	};

	const cancelEdit = () => {
		setEditing(false);
		setEditError(null);
	};

	const saveEdit = async () => {
		const trimmedNumber = editDraft.batch_number.trim();
		if (!trimmedNumber) {
			setEditError("Batch number is required");
			return;
		}
		setEditError(null);
		try {
			await updateBatchMutation.mutateAsync({
				batchId: batch.id,
				input: {
					batch_number: trimmedNumber,
					expires_at: editDraft.expires_at || null,
					supplier: editDraft.supplier.trim() || null,
				},
			});
			toast.success("Batch updated");
			setEditing(false);
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to update batch";
			setEditError(message);
			toast.error(message);
		}
	};

	const handleDelete = async () => {
		setDeleteError(null);
		try {
			await deleteBatchMutation.mutateAsync(batch.id);
			toast.success("Batch deleted");
			navigate(`/dispatch/inventory/items/${batch.item_id}/tracking`);
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to delete batch";
			setDeleteError(message);
			toast.error(message);
		}
	};

	const handleExport = async () => {
		setIsExporting(true);
		setExportError(null);
		try {
			await exportBatchImpact(batch.id, batch.batch_number);
		} catch (e) {
			setExportError(
				e instanceof Error ? e.message : "Export failed. Please try again."
			);
			setTimeout(() => setExportError(null), 5000);
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-1.5">
					{batch.item_name}
				</div>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2.5 flex-wrap">
							<h2 className="text-2xl font-semibold text-text-primary">
								Batch {batch.batch_number}
							</h2>
							<span
								className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
									isRecalled
										? "bg-error-bg text-error-text border border-error-border"
										: "bg-success-bg text-success-text border border-success-border"
								}`}
							>
								{isRecalled ? (
									<ShieldAlert size={12} />
								) : (
									<ShieldCheck size={12} />
								)}
								{isRecalled ? "RECALLED" : "ACTIVE"}
							</span>
						</div>
						<div className="flex items-center gap-3 mt-1 text-sm text-text-muted flex-wrap">
							<span className="font-mono text-xs">
								{batch.code}
							</span>
							{batch.expires_at && (
								<>
									<span className="text-text-faint">
										·
									</span>
									<span
										className={`text-xs font-medium px-2 py-0.5 rounded ${
											isExpired
												? "bg-error-bg text-error-text border border-error-border"
												: isExpiringSoon
													? "bg-warning-bg text-warning-text border border-warning-border"
													: "text-text-muted"
										}`}
									>
										{isExpired
											? "Expired "
											: "Expires "}
										{formatDate(
											batch.expires_at
										)}
									</span>
								</>
							)}
							{isRecalled && batch.recalled_at && (
								<>
									<span className="text-text-faint">
										·
									</span>
									<span className="text-xs text-error-text">
										Recalled{" "}
										{formatDate(
											batch.recalled_at
										)}
									</span>
								</>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2 flex-wrap">
						{canManage && item && (
							<button
								type="button"
								onClick={() => setReceiveOpen(true)}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded-md transition-colors"
							>
								<PackagePlus size={14} />
								Receive Stock
							</button>
						)}
						{canManage && (
							<button
								type="button"
								onClick={() =>
									editing
										? cancelEdit()
										: startEdit()
								}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-surface border border-border-input rounded-md text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
							>
								<Pencil size={14} />
								{editing ? "Cancel Edit" : "Edit"}
							</button>
						)}
						{canManage && canDeleteBatch && (
							<button
								type="button"
								onClick={() =>
									setDeleteConfirmOpen(true)
								}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-surface border border-border-input rounded-md text-error-text hover:border-error-border transition-colors"
							>
								<Trash2 size={14} />
								Delete
							</button>
						)}
						<button
							type="button"
							onClick={() => setConfirmOpen(true)}
							className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
								isRecalled
									? "bg-surface border border-border text-text-secondary hover:bg-surface-raised hover:text-text-primary"
									: "bg-error hover:bg-error-strong text-on-primary"
							}`}
						>
							{isRecalled ? (
								<ShieldCheck size={14} />
							) : (
								<ShieldAlert size={14} />
							)}
							{isRecalled
								? "Clear Recall"
								: "Mark Recalled"}
						</button>
					</div>
				</div>
			</div>

			{editing && (
				<div className="bg-surface border border-border-subtle rounded-xl p-4 space-y-3">
					<h3 className="text-sm font-semibold text-text-primary">
						Edit Batch
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div>
							<label className={LABEL}>
								Batch / Lot Number
							</label>
							<input
								type="text"
								value={editDraft.batch_number}
								onChange={(e) =>
									setEditDraft((d) => ({
										...d,
										batch_number:
											e.target
												.value,
									}))
								}
								aria-label="Batch or lot number"
								className={INPUT}
							/>
						</div>
						<div>
							<label className={LABEL}>
								Expires
							</label>
							<input
								type="date"
								value={editDraft.expires_at}
								onChange={(e) =>
									setEditDraft((d) => ({
										...d,
										expires_at: e.target
											.value,
									}))
								}
								aria-label="Expiry date"
								className={INPUT}
							/>
						</div>
						<div>
							<label className={LABEL}>
								Supplier
							</label>
							<input
								type="text"
								value={editDraft.supplier}
								onChange={(e) =>
									setEditDraft((d) => ({
										...d,
										supplier: e.target
											.value,
									}))
								}
								placeholder="Optional"
								aria-label="Supplier"
								className={INPUT}
							/>
						</div>
					</div>
					{editError && (
						<p className="text-sm text-error-text">
							{editError}
						</p>
					)}
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={saveEdit}
							disabled={updateBatchMutation.isPending}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Check size={14} />
							{updateBatchMutation.isPending
								? "Saving…"
								: "Save"}
						</button>
						<button
							type="button"
							onClick={cancelEdit}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
						>
							<X size={14} />
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* Tabs */}
			<div className="flex gap-0 border-b border-border -mt-1">
				{(["overview", "traceability"] as Tab[]).map((t) => (
					<button
						key={t}
						onClick={() => setActiveTab(t)}
						className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
							activeTab === t
								? "border-primary text-primary"
								: "border-transparent text-text-muted hover:text-text-secondary"
						}`}
					>
						{t === "overview" ? "Overview" : "Traceability"}
					</button>
				))}
			</div>

			{activeTab === "overview" && <OverviewTab remaining={remaining} />}
			{activeTab === "traceability" && (
				<TraceabilityTab
					affectedJobs={affected_jobs}
					affectedSerials={affected_serials}
					onExport={handleExport}
					isExporting={isExporting}
					exportError={exportError}
				/>
			)}

			{/* Recall confirmation */}
			<ConfirmDialog
				open={confirmOpen}
				title={isRecalled ? "Clear Recall" : "Mark Batch as Recalled"}
				body={
					isRecalled
						? `This clears the recall flag on batch ${batch.batch_number}. It will no longer be flagged in traceability reports.`
						: `This flags batch ${batch.batch_number} as recalled — visible org-wide, including the ${remaining.total} unit(s) still in the warehouse or on vehicles and everything traced in the affected jobs/serials below.`
				}
				confirmLabel={isRecalled ? "Clear Recall" : "Mark Recalled"}
				tone={isRecalled ? "primary" : "destructive"}
				pending={updateBatchMutation.isPending}
				error={confirmError}
				onConfirm={handleToggleRecall}
				onCancel={() => {
					setConfirmOpen(false);
					setConfirmError(null);
				}}
			/>

			{item && (
				<ReceiveStockModal
					isOpen={receiveOpen}
					onClose={() => setReceiveOpen(false)}
					item={item}
				/>
			)}

			<ConfirmDialog
				open={deleteConfirmOpen}
				title="Delete Batch"
				body={`This permanently deletes batch ${batch.batch_number}. Only empty lots — no stock in the warehouse or on any vehicle, no serials, and no consumption history — can be deleted, and this cannot be undone.`}
				confirmLabel="Delete Batch"
				tone="destructive"
				pending={deleteBatchMutation.isPending}
				error={deleteError}
				onConfirm={handleDelete}
				onCancel={() => {
					setDeleteConfirmOpen(false);
					setDeleteError(null);
				}}
			/>
		</div>
	);
}
