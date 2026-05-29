import { useDispatcherByIdQuery, useDeleteDispatcherMutation } from "../../hooks/useDispatchers";
import EditDispatcher from "../../components/dispatchers/EditDispatcher";
import { groupPermissionsByCategory } from "../../lib/permissionCatalogs";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { usePermission } from "../../hooks/usePermission";

const DispatcherDetailPage = () => {
	const { dispatcherId } = useParams();
	const { data: dispatcher, isLoading } = useDispatcherByIdQuery(dispatcherId!);
	const deleteDispatcherMutation = useDeleteDispatcherMutation();
	const navigate = useNavigate();
	const [editOpen, setEditOpen] = useState(false);

	// permissions
	const EDIT_DISPATCHER = usePermission("manage_dispatchers");

	const permissionGroups = groupPermissionsByCategory(
		dispatcher?.permissions ?? [],
		"dispatcher",
	);

	return (
		<>
			{isLoading ? (
				<div className="flex justify-center py-10">
					<span className="text-sm text-text-secondary">Loading...</span>
				</div>
			) : dispatcher ? (
				<div className="max-w-2xl space-y-6">
					{/* Header */}
					<div className="flex items-start justify-between">
						<div>
							<h1 className="text-xl font-bold text-text-primary">{dispatcher.name}</h1>
							<p className="text-sm text-text-muted mt-0.5">{dispatcher.email}</p>
							{dispatcher.phone && (
								<p className="text-sm text-text-muted">{dispatcher.phone}</p>
							)}
						</div>
						<button
							disabled={!EDIT_DISPATCHER}
							title={!EDIT_DISPATCHER ? "You don't have permission to perform this action." : undefined}
							onClick={() => {
								if (!EDIT_DISPATCHER) return;
								setEditOpen(true);
							}}
							className="px-3 py-1.5 text-sm rounded-md bg-surface border border-border hover:border-border-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40"
						>
							Edit
						</button>
					</div>

					{/* Permissions */}
					<div>
						<h2 className="text-sm font-semibold text-text-primary mb-3">Permissions</h2>
						{permissionGroups.length === 0 ? (
							<p className="text-sm text-text-muted">No permissions assigned.</p>
						) : (
							<div className="space-y-3">
								{permissionGroups.map(({ category, permissions }) => (
									<div key={category} className="rounded-lg border border-border-subtle bg-base px-4 py-3">
										<p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
											{category}
										</p>
										<div className="flex flex-wrap gap-1.5">
											{permissions.map((p) => (
												<span
													key={p.id}
													className="px-2 py-0.5 rounded-md bg-surface text-xs text-text-secondary border border-border-subtle"
												>
													{p.label}
												</span>
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			) : (
				<p className="text-sm text-text-muted">Dispatcher not found.</p>
			)}

			{editOpen && dispatcher && (
				<EditDispatcher
					dispatcher={dispatcher}
					onClose={() => setEditOpen(false)}
					isOpen={editOpen}
				/>
			)}
		</>
	);
};

export default DispatcherDetailPage;
