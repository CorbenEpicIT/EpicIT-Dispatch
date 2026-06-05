import { useState, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
	useInventoryTagsQuery,
	useCreateInventoryTagMutation,
	useUpdateInventoryTagMutation,
	useDeleteInventoryTagMutation,
} from "../../hooks/useInventory";

interface TagManagerModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function TagManagerModal({ isOpen, onClose }: TagManagerModalProps) {
	const [newLabel, setNewLabel] = useState("");
	const newLabelRef = useRef<HTMLInputElement>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editLabel, setEditLabel] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [createError, setCreateError] = useState("");

	const { data: tags = [] } = useInventoryTagsQuery();
	const createMutation = useCreateInventoryTagMutation();
	const updateMutation = useUpdateInventoryTagMutation();
	const deleteMutation = useDeleteInventoryTagMutation();

	if (!isOpen) return null;

	const handleCreate = async () => {
		const label = newLabel.trim();
		if (!label) return;
		try {
			await createMutation.mutateAsync(label);
			setNewLabel("");
			setCreateError("");
		} catch (e: unknown) {
			setCreateError(e instanceof Error ? e.message : "Failed to create tag");
		}
	};

	const startEdit = (id: string, label: string) => {
		setEditingId(id);
		setEditLabel(label);
	};

	const handleUpdate = async (tagId: string) => {
		const label = editLabel.trim();
		if (!label) return;
		try {
			await updateMutation.mutateAsync({ tagId, label });
			setEditingId(null);
		} catch {
			// error shown inline if needed
		}
	};

	const handleDelete = async (tagId: string) => {
		try {
			await deleteMutation.mutateAsync(tagId);
			setDeleteConfirmId(null);
		} catch {
			// ignore
		}
	};

	return (
		<div className="fixed inset-0 bg-overlay flex items-center justify-center z-50">
			<div className="bg-surface border border-border rounded-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border">
					<h2 className="text-base font-semibold text-text-primary">Manage Tags</h2>
					<button
						onClick={onClose}
						className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				{/* Create new tag */}
				<div className="px-5 py-3 border-b border-border-subtle">
					<div className="flex gap-2">
						<input
							ref={newLabelRef}
							type="text"
							placeholder="New tag label..."
							value={newLabel}
							onChange={(e) => {
								setNewLabel(e.target.value);
								setCreateError("");
							}}
							onKeyDown={(e) => e.key === "Enter" && handleCreate()}
							className="flex-1 h-8 px-2.5 rounded bg-surface-inset border border-input text-sm text-primary placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary-border"
						/>
						<button
							onClick={handleCreate}
							disabled={!newLabel.trim() || createMutation.isPending}
							className="h-8 px-3 rounded bg-primary hover:bg-primary-hover disabled:opacity-40 text-sm font-medium text-on-primary transition-colors flex items-center gap-1"
						>
							<Plus size={14} />
							Add
						</button>
					</div>
					{createError && (
						<p className="mt-1.5 text-xs text-error-text">{createError}</p>
					)}
				</div>

				{/* Tag list */}
				<div className="overflow-y-auto flex-1 px-5 py-3 space-y-1.5">
					{tags.length === 0 && (
						<div className="py-6 text-center">
							<p className="text-sm text-text-muted mb-3">No tags yet.</p>
							<button
								onClick={() => newLabelRef.current?.focus()}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-raised hover:bg-base border border-border text-sm text-text-secondary transition-colors"
							>
								<Plus size={13} />
								Create your first tag
							</button>
						</div>
					)}
					{tags.map((tag) => (
						<div
							key={tag.id}
							className="flex items-center gap-2 group"
						>
							{editingId === tag.id ? (
								<>
									<input
										type="text"
										value={editLabel}
										onChange={(e) => setEditLabel(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleUpdate(tag.id);
											if (e.key === "Escape") setEditingId(null);
										}}
										autoFocus
										className="flex-1 h-7 px-2 rounded bg-surface-inset border border-input text-sm text-primary placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary-border"
									/>
									<button
										onClick={() => handleUpdate(tag.id)}
										disabled={updateMutation.isPending}
										className="p-1 rounded text-success-text hover:bg-surface-raised transition-colors"
									>
										<Check size={14} />
									</button>
									<button
										onClick={() => setEditingId(null)}
										className="p-1 rounded text-text-muted hover:bg-surface-raised transition-colors"
									>
										<X size={14} />
									</button>
								</>
							) : deleteConfirmId === tag.id ? (
								<>
									<span className="flex-1 text-sm text-text-secondary">
										Delete <span className="font-medium text-text-primary">"{tag.label}"</span>?
									</span>
									<button
										onClick={() => handleDelete(tag.id)}
										disabled={deleteMutation.isPending}
										className="h-6 px-2 rounded bg-error hover:bg-error-strong text-xs font-medium text-on-primary transition-colors"
									>
										Delete
									</button>
									<button
										onClick={() => setDeleteConfirmId(null)}
										className="p-1 rounded text-text-muted hover:bg-surface-raised transition-colors"
									>
										<X size={14} />
									</button>
								</>
							) : (
								<>
									<span className="flex-1 text-sm text-text-secondary px-2 py-1 rounded bg-base border border-border">
										{tag.label}
									</span>
									<button
										onClick={() => startEdit(tag.id, tag.label)}
										className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-raised opacity-0 group-hover:opacity-100 transition-all"
									>
										<Pencil size={13} />
									</button>
									<button
										onClick={() => setDeleteConfirmId(tag.id)}
										className="p-1 rounded text-text-muted hover:text-error hover:bg-surface-raised opacity-0 group-hover:opacity-100 transition-all"
									>
										<Trash2 size={13} />
									</button>
								</>
							)}
						</div>
					))}
				</div>

				{/* Footer */}
				<div className="px-5 py-3 border-t border-border flex justify-end">
					<button
						onClick={onClose}
						className="px-3 py-1.5 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
