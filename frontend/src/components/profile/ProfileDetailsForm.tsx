import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const inputBase =
	"w-full rounded-md border border-border bg-base px-3 py-1.5 text-sm text-text-primary placeholder:text-faint outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary-border";

interface ProfileDetailsFormProps {
	initial: { phone: string; title: string; description: string };
	onSave: (data: { phone: string; title: string; description: string }) => Promise<void>;
}

export default function ProfileDetailsForm({ initial, onSave }: ProfileDetailsFormProps) {
	const [form, setForm] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		setForm(initial);
	}, [initial.phone, initial.title, initial.description]);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);
		try {
			await onSave(form);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 3000);
		} catch {
			setSaveError("Failed to save changes. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<section>
			<div className="rounded-lg border border-border-subtle bg-base px-5 py-5">
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
	);
}
