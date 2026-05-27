import { useState, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import { useOrgRolesQuery, useAssignOrgRoleMutation } from "../../hooks/useOrgRoles";
import LoadSvg from "../../assets/icons/loading.svg?react";

interface AssignRoleModalProps {
	isOpen: boolean;
	onClose: () => void;
	userId: string;
	userType: "dispatcher" | "technician";
	userName: string;
	currentRoleId?: string | null;
}

const SELECT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm focus:border-primary focus:outline-none transition-colors";
const LABEL = "block mb-0.5 text-xs font-medium text-text-tertiary uppercase tracking-wider";

const AssignRoleModal = ({ isOpen, onClose, userId, userType, userName, currentRoleId }: AssignRoleModalProps) => {
	const { data: roles, isLoading: rolesLoading } = useOrgRolesQuery();
	const assignMutation = useAssignOrgRoleMutation();
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");

	useEffect(() => {
		if (isOpen) {
			setSelectedRoleId(currentRoleId ?? "");
		}
	}, [isOpen, currentRoleId]);

	const tierRoles = roles?.filter((r) => r.base_tier === userType) ?? [];

	const handleConfirm = async () => {
		await assignMutation.mutateAsync({
			user_id: userId,
			user_type: userType,
			role_id: selectedRoleId || null,
		});
		onClose();
	};

	const content = (
		<div className="p-5 w-full flex flex-col gap-4">
			<div>
				<h2 className="text-base font-semibold text-text-primary">Assign Role</h2>
				<p className="text-sm text-text-tertiary mt-0.5">{userName}</p>
			</div>

			{rolesLoading ? (
				<div className="flex justify-center py-4">
					<LoadSvg className="w-8 h-8 animate-spin text-primary" />
				</div>
			) : (
				<div>
					<label className={LABEL}>Role</label>
					<select
						value={selectedRoleId}
						onChange={(e) => setSelectedRoleId(e.target.value)}
						className={SELECT}
						disabled={assignMutation.isPending}
					>
						<option value="">— No Role —</option>
						{tierRoles.map((role) => (
							<option key={role.id} value={role.id}>
								{role.name}
							</option>
						))}
					</select>
					{tierRoles.length === 0 && (
						<p className="mt-1 text-xs text-text-tertiary">
							No {userType} roles exist yet. Create one first.
						</p>
					)}
				</div>
			)}

			{assignMutation.isError && (
				<p className="text-xs text-error-text">
					{(assignMutation.error as Error)?.message ?? "Failed to assign role."}
				</p>
			)}

			<div className="flex justify-end gap-2 pt-1">
				<button
					onClick={onClose}
					disabled={assignMutation.isPending}
					className="px-4 h-[34px] rounded border border-border text-sm text-text-secondary hover:bg-surface transition-colors disabled:opacity-40"
				>
					Cancel
				</button>
				<button
					onClick={handleConfirm}
					disabled={assignMutation.isPending || rolesLoading}
					className="px-4 h-[34px] rounded bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
				>
					{assignMutation.isPending ? "Saving..." : "Confirm"}
				</button>
			</div>
		</div>
	);

	return <FullPopup content={content} isModalOpen={isOpen} onClose={onClose} size="md" />;
};

export default AssignRoleModal;
