import { useState, useRef, useEffect } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { useUploadNotePhotoMutation } from "../../hooks/useJobs";
import type { JobVisit } from "../../types/jobs";

export interface NotePhoto {
	photo_url: string;
	photo_label: "Before" | "After" | "Other";
	filename: string;
}

interface AddNotePhotoModalProps {
	visits: JobVisit[];
	preselectedVisitId?: string | null;
	onClose: () => void;
	onSubmit: (visitId: string, jobId: string, content: string, photos: NotePhoto[]) => Promise<void>;
}

const PHOTO_LABELS = ["Before", "After", "Other"] as const;
type PhotoLabel = (typeof PHOTO_LABELS)[number];

export default function AddNotePhotoModal({
	visits,
	preselectedVisitId,
	onClose,
	onSubmit,
}: AddNotePhotoModalProps) {
	const [content, setContent] = useState("");
	const [selectedVisitId, setSelectedVisitId] = useState(
		preselectedVisitId ?? visits[0]?.id ?? "",
	);
	const [photos, setPhotos] = useState<NotePhoto[]>([]);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [pendingUploadUrl, setPendingUploadUrl] = useState<string | null>(null);
	const [labelPickerOpen, setLabelPickerOpen] = useState(false);
	const [selectedLabel, setSelectedLabel] = useState<PhotoLabel>("Before");
	const [isUploading, setIsUploading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [visible, setVisible] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMutation = useUploadNotePhotoMutation();

	const selectedVisit = visits.find((v) => v.id === selectedVisitId);
	const canSave = (content.trim().length > 0 || photos.length > 0) && !isSaving;

	useEffect(() => {
		setTimeout(() => setVisible(true), 10);
	}, []);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [content]);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		setUploadError(null);
		setIsUploading(true);
		setLabelPickerOpen(true);
		setPendingFile(file);
		setSelectedLabel("Before");

		try {
			const url = await uploadMutation.mutateAsync(file);
			setPendingUploadUrl(url);
		} catch {
			setUploadError("Upload failed. Please try again.");
			setLabelPickerOpen(false);
			setPendingFile(null);
		} finally {
			setIsUploading(false);
		}
	};

	const handleConfirmLabel = () => {
		if (!pendingFile || !pendingUploadUrl) return;
		setPhotos((prev) => [
			...prev,
			{ photo_url: pendingUploadUrl, photo_label: selectedLabel, filename: pendingFile.name },
		]);
		setPendingFile(null);
		setPendingUploadUrl(null);
		setLabelPickerOpen(false);
		setUploadError(null);
	};

	const handleCancelLabel = () => {
		setPendingFile(null);
		setPendingUploadUrl(null);
		setLabelPickerOpen(false);
		setUploadError(null);
	};

	const handleRemovePhoto = (idx: number) => {
		setPhotos((prev) => prev.filter((_, i) => i !== idx));
	};

	const handleSubmit = async () => {
		if (!canSave || !selectedVisit) return;
		setIsSaving(true);
		setSaveError(null);
		try {
			await onSubmit(selectedVisitId, selectedVisit.job_id, content.trim(), photos);
			onClose();
		} catch {
			setSaveError("Failed to save. Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70">
			<div
				className={`w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 transition-transform duration-200 ease-out ${
					visible ? "translate-y-0" : "translate-y-full"
				}`}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
					<h2 className="text-sm font-semibold text-white">Add Note / Photo</h2>
					<button
						onClick={onClose}
						aria-label="Close"
						className="text-zinc-500 hover:text-white p-1 -mr-1 rounded-md hover:bg-zinc-800 transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				{/* Visit pills */}
				{visits.length > 1 && (
					<div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-zinc-800 scrollbar-none">
						{visits.map((v) => (
							<button
								key={v.id}
								onClick={() => setSelectedVisitId(v.id)}
								className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
									selectedVisitId === v.id
										? "bg-blue-600 text-white"
										: "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
								}`}
							>
								{v.name ?? "Visit"}
								{v.job?.client?.name ? ` — ${v.job.client.name}` : ""}
							</button>
						))}
					</div>
				)}

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					placeholder="Add a note…"
					autoFocus
					className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none min-h-[96px] max-h-[40vh] overflow-y-auto"
				/>

				{/* Photo chips */}
				{photos.length > 0 && (
					<div className="flex flex-wrap gap-2 px-4 pb-3">
						{photos.map((p, i) => (
							<div
								key={i}
								className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300"
							>
								<Camera size={11} className="text-zinc-500 shrink-0" />
								<span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-600/20 text-blue-400 border border-blue-600/30">
									{p.photo_label}
								</span>
								<span className="max-w-[100px] truncate text-zinc-400">
									{p.filename}
								</span>
								<button
									onClick={() => handleRemovePhoto(i)}
									aria-label={`Remove ${p.filename}`}
									className="text-zinc-600 hover:text-zinc-300 ml-0.5 p-0.5"
								>
									<X size={11} />
								</button>
							</div>
						))}
					</div>
				)}

				{/* Attach photo button */}
				<div className="px-4 pb-3">
					<button
						onClick={() => fileInputRef.current?.click()}
						disabled={labelPickerOpen || isUploading}
						className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-40"
					>
						{isUploading ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<Camera size={13} />
						)}
						{photos.length > 0 ? "Attach Another Photo" : "Attach Photo"}
					</button>
					{uploadError && (
						<p role="alert" className="text-xs text-red-400 mt-1.5">{uploadError}</p>
					)}
				</div>

				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					capture="environment"
					className="hidden"
					onChange={handleFileChange}
				/>

				{/* Save error */}
				{saveError && (
					<p role="alert" className="text-xs text-red-400 px-4 pb-2">{saveError}</p>
				)}

				{/* Actions */}
				<div className="flex gap-3 px-4 pt-3 pb-8 border-t border-zinc-800">
					<button
						onClick={onClose}
						className="flex-1 py-3 text-sm rounded-xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!canSave}
						className="flex-1 py-3 text-sm rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-40 transition-colors"
					>
						{isSaving ? "Saving…" : "Save Note"}
					</button>
				</div>
			</div>

			{/* Label picker overlay */}
			{labelPickerOpen && (
				<div className="absolute inset-0 flex items-end justify-center">
					<div className="absolute inset-0 bg-black/40" />
					<div className="relative w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 p-4 pb-8 z-10">
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-sm font-semibold text-white">Photo Type</h3>
							<button
								onClick={handleCancelLabel}
								aria-label="Close"
								className="text-zinc-500 hover:text-white"
							>
								<X size={18} />
							</button>
						</div>
						{pendingFile && (
							<p className="text-xs text-zinc-500 mb-3 truncate">
								{pendingFile.name}
							</p>
						)}
						{isUploading ? (
							<div className="flex items-center justify-center gap-2 py-6 text-zinc-500 text-sm">
								<Loader2 size={16} className="animate-spin" />
								Uploading…
							</div>
						) : uploadError ? (
							<p className="text-xs text-red-400 py-4 text-center">{uploadError}</p>
						) : (
							<>
								<div className="flex gap-2 mb-4">
									{PHOTO_LABELS.map((l) => (
										<button
											key={l}
											onClick={() => setSelectedLabel(l)}
											className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
												selectedLabel === l
													? "bg-blue-600 text-white"
													: "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
											}`}
										>
											{l}
										</button>
									))}
								</div>
								<div className="flex gap-2">
									<button
										onClick={handleCancelLabel}
										className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
									>
										Cancel
									</button>
									<button
										onClick={handleConfirmLabel}
										className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
									>
										Attach Photo →
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
