import { useChangeDispatcherPasswordMutation } from "../../hooks/useDispatchers";
import { useChangeTechnicianPasswordMutation } from "../../hooks/useTechnicians";
import { useAuthStore } from "../../auth/authStore";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function SecurityCard() {
	const user = useAuthStore((state) => state.user);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmNewPassword, setConfirmNewPassword] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [saving, setSaving] = useState(false);

	const changeDispatcherPassword = useChangeDispatcherPasswordMutation();
	const changeTechnicianPassword = useChangeTechnicianPasswordMutation();

	const handleChangePassword = () => {
		if (!user) return;
		if (currentPassword === "") {
			setError("Current password is required");
			return;
		}
		if (newPassword === "") {
			setError("New password is required");
			return;
		}
		if (confirmNewPassword === "") {
			setError("Confirm new password is required");
			return;
		}
		if (newPassword !== confirmNewPassword) {
			setError("New passwords do not match");
			return;
		}
		if (newPassword.length < 8) {
			setError("New password must be at least 8 characters long");
			return;
		}
		if (newPassword === currentPassword) {
			setError("New password cannot be the same as the current password");
			return;
		}
		if (!/[A-Z]/.test(newPassword)) {
			setError("New password must contain at least one uppercase letter");
			return;
		}
		if (!/[^a-zA-Z0-9]/.test(newPassword)) {
			setError("New password must contain at least one special character");
			return;
		}

		setError("");
		setSaving(true);
		const mutation = user.role === "technician"
			? changeTechnicianPassword
			: changeDispatcherPassword;
		mutation.mutateAsync({
			id: user.userId,
			data: { current_password: currentPassword, new_password: newPassword },
		}).then(() => {
			setSuccess(true);
			setCurrentPassword("");
			setNewPassword("");
			setConfirmNewPassword("");
			setTimeout(() => setSuccess(false), 3000);
		}).catch((error: any) => {
			const msg = error?.response?.data?.error?.message || error?.message || "Failed to change password";
			setError(msg);
		}).finally(() => {
			setSaving(false);
		});
	}

	const inputBase =
		"w-full rounded-md border border-border bg-base px-3 py-1.5 text-sm text-text-primary placeholder:text-faint outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary-border";

	return (
		<section>
			<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
				<h2 className="text-lg font-semibold text-text-primary mb-2">Change Password</h2>
				<form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-4">
					<div>
						<label className="mb-1 block text-xs font-medium text-text-tertiary">
							Current Password
						</label>
						<input
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder="Enter your current password"
							className={inputBase}
						/>
					</div>

					<div>
						<label className="mb-1 block text-xs font-medium text-text-tertiary">
							New Password
						</label>
						<input
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="Enter your new password"
							className={inputBase}
						/>
					</div>

					<div>
						<label className="mb-1 block text-xs font-medium text-text-tertiary">
							Confirm New Password
						</label>
						<input
							type="password"
							value={confirmNewPassword}
							onChange={(e) => setConfirmNewPassword(e.target.value)}
							placeholder="Confirm your new password"
							className={inputBase}
						/>
					</div>

					<div className="flex items-center gap-3 pt-1">
						<button
							type="submit"
							disabled={saving}
							className="flex items-center gap-1.5 rounded-md bg-primary-hover px-4 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
						>
							{saving && <Loader2 size={12} className="animate-spin" />}
							{saving ? "Changing…" : "Change Password"}
						</button>
						{success && <span className="text-xs text-success-text">Password changed.</span>}
						{error && <span className="text-xs text-error-text">{error}</span>}
					</div>
				</form>
			</div>
		</section>
	);
}
