import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { Technician } from "../../types/technicians";
import { usePermission } from "../../hooks/usePermission";
import { useDeleteTechnicianMutation } from "../../hooks/useTechnicians";
import { useResetMfaMutation } from "../../hooks/useMfa";
import { requestPasswordResetCall } from "../../api/authenticate";
import { useToast } from "../ui/useToast";

// Scheduled counts here (unlike "current activity") — deleting a tech would orphan future work.
const BLOCKS_DELETE = ["Scheduled", "Driving", "OnSite", "InProgress", "Paused", "Delayed"];

type ConfirmKey = "password" | "mfa" | "delete" | null;

interface TechnicianActionsMenuProps {
	technician: Technician;
	displayName: string;
	onEdit?: (technician: Technician) => void;
	onAssignRole?: (technician: Technician) => void;
	// List rows drop their Assign Visits button below sm; the menu carries it there instead.
	assignInMenuBelowSm?: boolean;
	className?: string;
}

const ITEM =
	"w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed";
const ITEM_DEFAULT = `${ITEM} text-text-primary hover:enabled:bg-surface-raised focus-visible:bg-surface-raised`;
const ITEM_DANGER = `${ITEM} text-error-text hover:enabled:bg-surface-raised focus-visible:bg-surface-raised`;
const ITEM_CONFIRM = `${ITEM} bg-error hover:enabled:bg-error-strong text-on-primary`;

export default function TechnicianActionsMenu({
	technician,
	displayName,
	onEdit,
	onAssignRole,
	assignInMenuBelowSm = false,
	className = "",
}: TechnicianActionsMenuProps) {
	const navigate = useNavigate();
	const toast = useToast();
	const MANAGE_TECHNICIANS = usePermission("manage_technicians");
	const VIEW_TECHNICIANS = usePermission("view_technicians");
	const VIEW_REPORTS = usePermission("view_reports");

	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState<ConfirmKey>(null);
	const [isSendingReset, setIsSendingReset] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const { mutateAsync: deleteTechnician, isPending: isDeleting } = useDeleteTechnicianMutation();
	const { mutateAsync: resetMfa, isPending: isResettingMfa } = useResetMfaMutation();

	const canDelete = !(technician.visit_techs ?? []).some((vt) =>
		BLOCKS_DELETE.includes(vt.visit.status)
	);

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false);
				setConfirm(null);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			setConfirm(null);
			triggerRef.current?.focus();
		};
		document.addEventListener("mousedown", onPointer);
		// Capture phase: the root's React stopPropagation would otherwise swallow
		// Escape pressed while focus is inside the menu.
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("mousedown", onPointer);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [open]);

	if (!VIEW_TECHNICIANS && !VIEW_REPORTS && !MANAGE_TECHNICIANS) return null;

	// Returns focus to the trigger so keyboard users don't land on <body> once the panel unmounts.
	const close = () => {
		setOpen(false);
		setConfirm(null);
		triggerRef.current?.focus();
	};

	const go = (path: string) => {
		close();
		navigate(path);
	};

	const handleResetPassword = async () => {
		if (confirm !== "password") return setConfirm("password");
		setIsSendingReset(true);
		try {
			await requestPasswordResetCall(technician.id, "technician");
			toast.success(`Password reset email sent to ${technician.email}`);
			close();
		} catch (error) {
			setConfirm(null);
			toast.error(error instanceof Error ? error.message : "Failed to send the reset email");
		} finally {
			setIsSendingReset(false);
		}
	};

	const handleResetMfa = async () => {
		if (confirm !== "mfa") return setConfirm("mfa");
		try {
			await resetMfa({ userId: technician.id, role: "technician" });
			toast.success(`Two-factor authentication reset for ${displayName}`);
			close();
		} catch (error) {
			setConfirm(null);
			toast.error(error instanceof Error ? error.message : "Failed to reset MFA");
		}
	};

	const handleDelete = async () => {
		if (confirm !== "delete") return setConfirm("delete");
		try {
			await deleteTechnician(technician.id);
			toast.success(`${displayName} deleted`);
		} catch (error) {
			setConfirm(null);
			toast.error(error instanceof Error ? error.message : "Failed to delete technician");
		}
	};

	const clearConfirm = (key: ConfirmKey) => () => {
		if (confirm === key) setConfirm(null);
	};

	return (
		// Stops row/card click + Enter-to-open from firing through the menu.
		<div
			ref={rootRef}
			className={`relative ${className}`}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<button
				ref={triggerRef}
				type="button"
				aria-label={`More actions for ${displayName}`}
				aria-expanded={open}
				onClick={() => (open ? close() : setOpen(true))}
				className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
			>
				<MoreHorizontal size={16} />
			</button>

			{open && (
				<div
					role="group"
					aria-label={`Actions for ${displayName}`}
					className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
				>
					{VIEW_TECHNICIANS && (
						<button
							type="button"
							className={ITEM_DEFAULT}
							onClick={() => go(`/dispatch/technicians/${technician.id}`)}
						>
							Open Profile
						</button>
					)}
					{MANAGE_TECHNICIANS && assignInMenuBelowSm && (
						<button
							type="button"
							className={`${ITEM_DEFAULT} sm:hidden`}
							onClick={() => go(`/dispatch/technicians/${technician.id}/assign`)}
						>
							Assign Visits
						</button>
					)}
					{MANAGE_TECHNICIANS && onEdit && (
						<button
							type="button"
							className={ITEM_DEFAULT}
							onClick={() => {
								close();
								onEdit(technician);
							}}
						>
							Edit Details
						</button>
					)}
					{MANAGE_TECHNICIANS && onAssignRole && (
						<button
							type="button"
							className={ITEM_DEFAULT}
							onClick={() => {
								close();
								onAssignRole(technician);
							}}
						>
							Assign Role
						</button>
					)}
					{VIEW_REPORTS && (
						<button
							type="button"
							className={ITEM_DEFAULT}
							onClick={() =>
								go(
									`/dispatch/reporting/technician-scorecard?techId=${technician.id}`
								)
							}
						>
							View Scorecard
						</button>
					)}

					{MANAGE_TECHNICIANS && (
						<>
							<div role="separator" className="my-1 border-t border-border-subtle" />
							<button
								type="button"
								disabled={isSendingReset}
								onMouseLeave={clearConfirm("password")}
								className={confirm === "password" ? ITEM_CONFIRM : ITEM_DEFAULT}
								onClick={handleResetPassword}
							>
								{isSendingReset
									? "Sending…"
									: confirm === "password"
										? "Click again to send"
										: "Send Password Reset"}
							</button>
							{technician.mfaEnabled && (
								<button
									type="button"
									disabled={isResettingMfa}
									onMouseLeave={clearConfirm("mfa")}
									className={confirm === "mfa" ? ITEM_CONFIRM : ITEM_DEFAULT}
									onClick={handleResetMfa}
								>
									{isResettingMfa
										? "Resetting…"
										: confirm === "mfa"
											? "Click again to reset"
											: "Reset MFA"}
								</button>
							)}
							{canDelete && (
								<>
									<div
										role="separator"
										className="my-1 border-t border-border-subtle"
									/>
									<button
										type="button"
										disabled={isDeleting}
										onMouseLeave={clearConfirm("delete")}
										className={confirm === "delete" ? ITEM_CONFIRM : ITEM_DANGER}
										onClick={handleDelete}
									>
										<Trash2 size={15} />
										{isDeleting
											? "Deleting…"
											: confirm === "delete"
												? "Click again to delete"
												: "Delete Technician"}
									</button>
								</>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
