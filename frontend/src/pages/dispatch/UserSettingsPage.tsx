import { useState, useEffect } from "react";
import { useAuthStore } from "../../auth/authStore";
import { useDispatcherByIdQuery } from "../../hooks/useDispatchers";
import { useUpdateTechnicianMutation } from "../../hooks/useTechnicians";
import { useUpdateDispatcherMutation } from "../../hooks/useDispatchers";
import { Loader2 } from "lucide-react";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";

const inputBase =
	"w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder-zinc-500 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary";

export default function UserSettingsPage() {
	const { user } = useAuthStore();
	const isTech = user?.role === "technician";
	const { data: dispatcher } = useDispatcherByIdQuery(isTech ? null : user?.userId);
	const { data: technician } = useTechnicianByIdQuery(isTech ? user?.userId : null);

	const [form, setForm] = useState({ phone: "", title: "", description: "" });
	const [saving, setSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const updateDispatcherMutation = useUpdateDispatcherMutation();
	const updateTechnicianMutation = useUpdateTechnicianMutation();

	useEffect(() => {
		if (dispatcher) {
			setForm({
				phone: dispatcher.phone ?? "",
				title: dispatcher.title ?? "",
				description: dispatcher.description ?? "",
			});
		}else{
			setForm({
				phone: technician?.phone ?? "",
				title: technician?.title ?? "",
				description: technician?.description ?? "",
			});
		}
	}, [dispatcher, technician]);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!user?.userId) return;
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);
		try {
			if (isTech) {
				await updateTechnicianMutation.mutateAsync({
					id: user.userId,
					data: {
						phone: form.phone,
						title: form.title,
						description: form.description,
					},
				});
			} else {
				await updateDispatcherMutation.mutateAsync({
					id: user.userId,
					data: {
						phone: form.phone,
						title: form.title,
						description: form.description,
					},
				});
			}
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 3000);
		} catch {
			setSaveError("Failed to save changes. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			<h1 className="text-xl font-bold text-text-primary mb-8">User Settings</h1>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
			<div className="space-y-6">

			{/* Profile */}
			<section>
				<h2 className="text-sm font-semibold text-text-primary mb-3">Profile</h2>
				<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
					{/* Read-only fields */}
					<div className="mb-4 space-y-3">
						<div>
							<p className="mb-1 text-xs font-medium text-text-tertiary">Email</p>
							<p className="text-base text-text-primary">
								{isTech? technician?.email : dispatcher?.name}
							</p>
						</div>
						<div>
							{!isTech && (
								<>
									<p className="mb-1 text-xs font-medium text-text-tertiary">Role</p>
									<p className="text-base text-text-primary capitalize">{dispatcher?.role}</p>
								</>
							)}
						</div>
					</div>

					<hr className="border-border-subtle mb-4" />

					<form onSubmit={handleSave} className="space-y-4">
						<div>
							<label className="mb-1 block text-xs font-medium text-text-tertiary">
								Phone
							</label>
							<input
								type="text"
								value={form.phone}
								onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
								placeholder="e.g. (555) 123-4567"
								className={inputBase}
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium text-text-tertiary">
								Title
							</label>
							<input
								type="text"
								value={form.title}
								onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
								placeholder="e.g. Field Dispatcher"
								className={inputBase}
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium text-text-tertiary">
								Description
							</label>
							<textarea
								value={form.description}
								onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
								rows={3}
								className={`${inputBase} resize-none`}
							/>
						</div>

						<div className="flex items-center gap-3 pt-1">
							<button
								type="submit"
								disabled={saving}
								className="flex items-center gap-1.5 rounded-md bg-primary-hover px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
							>
								{saving && <Loader2 size={12} className="animate-spin" />}
								{saving ? "Saving…" : "Save Changes"}
							</button>
							{saveSuccess && <span className="text-xs text-success-text">Changes saved.</span>}
							{saveError && <span className="text-xs text-error-text">{saveError}</span>}
						</div>
					</form>
				</div>
			</section>

			{/* Password */}
			<section>
				<h2 className="text-sm font-semibold text-text-primary mb-3">Password</h2>
				<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
					<p className="text-sm text-text-muted mb-4">
						Password changes are done via a reset link sent to your email.
					</p>
					<a
						href="/reset-password"
						className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised"
					>
						Send Reset Email
					</a>
				</div>
			</section>

			</div>{/* end left column */}

			{/* Right column */}
			<div>
				<section>
					<h2 className="text-sm font-semibold text-text-primary mb-3">Preferences</h2>
					<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
						<p className="text-sm text-text-muted">Coming soon.</p>
					</div>
				</section>
			</div>

			</div>{/* end grid */}
		</div>
	);
}
