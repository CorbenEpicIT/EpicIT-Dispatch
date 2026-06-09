import { useState, useEffect } from "react";
import { useAuthStore } from "../../auth/authStore";
import { useDispatcherByIdQuery } from "../../hooks/useDispatchers";
import { useUpdateTechnicianMutation } from "../../hooks/useTechnicians";
import { useUpdateDispatcherMutation } from "../../hooks/useDispatchers";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import { useThemeStore, type LightPalette } from "../../stores/themeStore";

const inputBase =
	"w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-faint outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary-border";

export default function UserSettingsPage() {
	const { user } = useAuthStore();
	const isTech = user?.role === "technician";
	const { data: dispatcher } = useDispatcherByIdQuery(isTech ? null : user?.userId);
	const { data: technician } = useTechnicianByIdQuery(isTech ? user?.userId : null);

	const { theme, setTheme, lightPalette, setLightPalette } = useThemeStore();

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
			if (dispatcher.theme && !updateDispatcherMutation.isPending) setTheme(dispatcher.theme);
		} else {
			setForm({
				phone: technician?.phone ?? "",
				title: technician?.title ?? "",
				description: technician?.description ?? "",
			});
			if (technician?.theme && !updateTechnicianMutation.isPending) setTheme(technician.theme);
		}
	}, [dispatcher, technician, setTheme, updateDispatcherMutation.isPending, updateTechnicianMutation.isPending]);

	const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
		setTheme(newTheme);
		if (!user?.userId) return;
		if (isTech) {
			updateTechnicianMutation.mutate({ id: user.userId, data: { theme: newTheme } });
		} else {
			updateDispatcherMutation.mutate({ id: user.userId, data: { theme: newTheme } });
		}
	};

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
								className="flex items-center gap-1.5 rounded-md bg-primary-hover px-4 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
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
						<p className="mb-2 text-xs font-medium text-text-tertiary">Theme</p>
						<div className="inline-flex rounded-md bg-surface-inset p-0.5">
							<button
								onClick={() => handleThemeChange("system")}
								className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
									theme === "system"
										? "bg-surface text-text-primary shadow-sm"
										: "text-text-muted hover:text-text-secondary"
								}`}
							>
								<Monitor size={14} />
								System
							</button>
							<button
								onClick={() => handleThemeChange("dark")}
								className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
									theme === "dark"
										? "bg-surface text-text-primary shadow-sm"
										: "text-text-muted hover:text-text-secondary"
								}`}
							>
								<Moon size={14} />
								Dark
							</button>
							<button
								onClick={() => handleThemeChange("light")}
								className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
									theme === "light"
										? "bg-surface text-text-primary shadow-sm"
										: "text-text-muted hover:text-text-secondary"
								}`}
							>
								<Sun size={14} />
								Light
							</button>
						</div>

						{theme !== "dark" && (
							<div className="mt-4">
								<p className="mb-2 text-xs font-medium text-text-tertiary">Light mode style</p>
								<div className="inline-flex rounded-md bg-surface-inset p-0.5">
									{(
										[
											{ value: "blue", label: "Blue", swatch: "#dce2ed" },
											{ value: "warm", label: "Warm", swatch: "#e6dfd5" },
											{ value: "neutral", label: "Neutral", swatch: "#e0e0e0" },
										] as { value: LightPalette; label: string; swatch: string }[]
									).map(({ value, label, swatch }) => (
										<button
											key={value}
											onClick={() => setLightPalette(value)}
											className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
												lightPalette === value
													? "bg-surface text-text-primary shadow-sm"
													: "text-text-muted hover:text-text-secondary"
											}`}
										>
											<span
												className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
												style={{ backgroundColor: swatch }}
											/>
											{label}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				</section>
			</div>

			</div>{/* end grid */}
		</div>
	);
}
