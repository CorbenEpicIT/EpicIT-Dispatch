import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import FullPopup from "../ui/FullPopup";

interface SaveReportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string, description: string) => void;
	isSaving: boolean;
	error: string | null;
}

export default function SaveReportModal({
	isOpen,
	onClose,
	onSave,
	isSaving,
	error,
}: SaveReportModalProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const canSave = name.trim().length > 0 && !isSaving;

	const handleSave = () => {
		if (!canSave) return;
		onSave(name.trim(), description.trim());
	};

	const content = (
		<div className="flex flex-col">
			<div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
				<div className="flex items-center gap-2">
					<Save size={18} className="text-text-tertiary" />
					<h2 className="text-base font-semibold text-text-primary">Save Report</h2>
				</div>
				<button
					onClick={onClose}
					aria-label="Close"
					className="text-text-muted hover:text-text-primary p-1 -mr-1 rounded-md hover:bg-surface-raised transition-colors"
				>
					<X size={16} />
				</button>
			</div>

			<div className="px-6 py-5 space-y-4">
				<div>
					<label
						htmlFor="save-report-name"
						className="block text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5"
					>
						Report name
					</label>
					<input
						id="save-report-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSave();
						}}
						placeholder="e.g. Weekly Technician Hours"
						autoFocus
						className="w-full h-9 px-2.5 bg-base border border-border rounded-md text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
					/>
				</div>

				<div>
					<label
						htmlFor="save-report-description"
						className="block text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5"
					>
						Description <span className="text-faint normal-case font-normal">(optional)</span>
					</label>
					<textarea
						id="save-report-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="What this report is for"
						rows={3}
						className="w-full px-2.5 py-1.5 bg-base border border-border rounded-md text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none resize-none"
					/>
				</div>

				{error && (
					<p role="alert" className="text-sm text-error-text">
						{error}
					</p>
				)}
			</div>

			<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle">
				<button
					onClick={onClose}
					className="px-4 h-9 text-sm rounded-md border border-border text-text-tertiary hover:bg-surface hover:text-text-primary transition-colors"
				>
					Cancel
				</button>
				<button
					onClick={handleSave}
					disabled={!canSave}
					className="flex items-center gap-1.5 px-4 h-9 text-sm rounded-md bg-primary hover:bg-primary-hover text-on-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
					Save Report
				</button>
			</div>
		</div>
	);

	return <FullPopup content={content} isModalOpen={isOpen} onClose={onClose} size="md" />;
}
