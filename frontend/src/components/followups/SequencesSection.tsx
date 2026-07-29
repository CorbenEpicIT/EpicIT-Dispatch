import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { usePermission } from "../../hooks/usePermission";
import {
	useSequencesQuery,
	useCreateSequenceMutation,
	useUpdateSequenceMutation,
	useDeleteSequenceMutation,
	useEnrollClientMutation,
} from "../../hooks/useFollowups";
import {
	FollowupTriggerTypeLabels,
	type FollowupSequence,
	type CreateSequenceInput,
	type EnrollInput,
} from "../../types/followups";
import { ActiveBadge, useFeedback, FeedbackBanner } from "./shared";
import SequenceFormModal from "./SequenceFormModal";
import EnrollModal from "./EnrollModal";

export default function SequencesSection() {
	const { data: sequences, isLoading, error } = useSequencesQuery();
	const createMutation = useCreateSequenceMutation();
	const updateMutation = useUpdateSequenceMutation();
	const deleteMutation = useDeleteSequenceMutation();
	const enrollMutation = useEnrollClientMutation();

	const [showAddModal, setShowAddModal] = useState(false);
	const [showEnrollModal, setShowEnrollModal] = useState(false);
	const [editingSequence, setEditingSequence] = useState<FollowupSequence | null>(null);
	const { feedback, showFeedback } = useFeedback();

	const MANAGE_FOLLOWUPS = usePermission("manage_followups");

	const handleCreate = async (data: CreateSequenceInput) => {
		await createMutation.mutateAsync(data);
		setShowAddModal(false);
		showFeedback("success", "Sequence created.");
	};

	const handleEnroll = async (data: EnrollInput) => {
		await enrollMutation.mutateAsync(data);
		setShowEnrollModal(false);
		showFeedback("success", "Client enrolled.");
	};

	const handleUpdate = async (data: CreateSequenceInput) => {
		if (!editingSequence) return;
		await updateMutation.mutateAsync({ id: editingSequence.id, data });
		setEditingSequence(null);
		showFeedback("success", "Sequence updated.");
	};

	const handleDelete = async (sequence: FollowupSequence) => {
		const enrollmentCount = sequence._count?.enrollments ?? 0;
		const warning =
			enrollmentCount > 0
				? ` It has ${enrollmentCount} enrollment${enrollmentCount === 1 ? "" : "s"} on record.`
				: "";
		if (!window.confirm(`Delete sequence "${sequence.name}"?${warning} This cannot be undone.`)) {
			return;
		}
		try {
			await deleteMutation.mutateAsync(sequence.id);
			showFeedback("success", "Sequence deleted.");
		} catch (e) {
			showFeedback("error", e instanceof Error ? e.message : "Failed to delete sequence.");
		}
	};

	const displaySequences = sequences ?? [];

	return (
		<div className="rounded-lg border border-border-subtle bg-base">
			<div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
				<div>
					<h2 className="text-sm font-semibold text-text-primary">Sequences</h2>
					<p className="mt-0.5 text-xs text-text-muted">
						Ordered email steps triggered manually or automatically.
					</p>
				</div>
				{MANAGE_FOLLOWUPS && (
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setShowEnrollModal(true)}
							className="flex items-center gap-1.5 rounded-md bg-plan px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-plan-hover"
						>
							<UserPlus size={12} />
							Enroll Client
						</button>
						<button
							type="button"
							onClick={() => setShowAddModal(true)}
							className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
						>
							<Plus size={12} />
							New Sequence
						</button>
					</div>
				)}
			</div>

			<FeedbackBanner feedback={feedback} />

			{isLoading && (
				<div className="flex items-center justify-center px-5 py-10">
					<Loader2 size={20} className="animate-spin text-text-muted" />
				</div>
			)}

			{error && !isLoading && (
				<div className="px-5 py-6">
					<p className="text-sm text-error-text">{error.message}</p>
				</div>
			)}

			{!isLoading && !error && displaySequences.length === 0 && (
				<div className="px-5 py-10 text-center">
					<p className="text-sm text-text-muted">
						No sequences yet. Create one to start automating follow-ups.
					</p>
				</div>
			)}

			{!isLoading && !error && displaySequences.length > 0 && (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px]">
						<thead>
							<tr className="border-b border-border-subtle">
								<th className="px-5 py-2.5 text-left text-xs font-medium text-text-muted">Name</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Trigger
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Steps
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Enrollments
								</th>
								<th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">
									Status
								</th>
								<th className="w-16 px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{displaySequences.map((sequence, idx) => (
								<tr
									key={sequence.id}
									className={`border-b border-border-subtle/50 transition-colors hover:bg-surface/40 ${
										idx === displaySequences.length - 1 ? "border-b-0" : ""
									}`}
								>
									<td className="px-5 py-3 text-sm font-medium text-text-primary">
										{sequence.name}
										{sequence.description && (
											<p className="mt-0.5 text-xs font-normal text-text-muted">
												{sequence.description}
											</p>
										)}
									</td>
									<td className="px-3 py-3 text-xs text-text-secondary">
										{FollowupTriggerTypeLabels[sequence.trigger_type]}
									</td>
									<td className="px-3 py-3 text-sm tabular-nums text-text-primary">
										{sequence.steps.length}
									</td>
									<td className="px-3 py-3 text-sm tabular-nums text-text-primary">
										{sequence._count?.enrollments ?? 0}
									</td>
									<td className="px-3 py-3">
										<ActiveBadge active={sequence.is_active} />
									</td>
									<td className="px-3 py-3">
										{MANAGE_FOLLOWUPS && (
											<div className="flex items-center justify-end gap-1">
												<button
													type="button"
													title="Edit"
													onClick={() => setEditingSequence(sequence)}
													className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-muted transition-colors hover:border-border hover:bg-surface-raised hover:text-text-primary"
												>
													<Pencil size={14} />
												</button>
												<button
													type="button"
													title="Delete"
													onClick={() => handleDelete(sequence)}
													className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-muted transition-colors hover:border-error-border hover:bg-error-bg hover:text-error-text"
												>
													<Trash2 size={14} />
												</button>
											</div>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{showAddModal && (
				<SequenceFormModal
					isModalOpen={showAddModal}
					onClose={() => setShowAddModal(false)}
					mode="create"
					isPending={createMutation.isPending}
					onSubmit={handleCreate}
				/>
			)}

			{editingSequence && (
				<SequenceFormModal
					isModalOpen={!!editingSequence}
					onClose={() => setEditingSequence(null)}
					mode="edit"
					initial={editingSequence}
					isPending={updateMutation.isPending}
					onSubmit={handleUpdate}
				/>
			)}

			{showEnrollModal && (
				<EnrollModal
					isModalOpen={showEnrollModal}
					onClose={() => setShowEnrollModal(false)}
					isPending={enrollMutation.isPending}
					onSubmit={handleEnroll}
				/>
			)}
		</div>
	);
}
