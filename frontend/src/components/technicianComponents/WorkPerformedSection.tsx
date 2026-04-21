import { useState, useRef, useEffect, useMemo } from "react";
import { PlusCircle, Camera, X, ChevronDown, ChevronUp } from "lucide-react";
import { useCreateJobNoteMutation, useJobNotesQuery } from "../../hooks/useJobs";
import { formatDateTime, FALLBACK_TIMEZONE } from "../../util/util";
import { useAuthStore } from "../../auth/authStore";
import type { JobNote } from "../../types/jobs";

// ── Note Add Sheet ────────────────────────────────────────────────────────────

function NoteSheet({
	jobId,
	visitId,
	onClose,
}: {
	jobId: string;
	visitId: string;
	onClose: () => void;
}) {
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;
	const createNote = useCreateJobNoteMutation();
	const [content, setContent] = useState("");
	const [visible, setVisible] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => { setTimeout(() => setVisible(true), 10); }, []);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [content]);

	const handleSubmit = async () => {
		if (!content.trim()) return;
		await createNote.mutateAsync({ jobId, data: { content: content.trim(), visit_id: visitId } });
		onClose();
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
					<h3 className="text-sm font-semibold text-white">Add Note</h3>
					<button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white p-1 -mr-1 rounded-md hover:bg-zinc-800 transition-colors">
						<X size={16} />
					</button>
				</div>

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					placeholder="Describe the work performed…"
					autoFocus
					className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none min-h-[120px] max-h-[40vh] overflow-y-auto"
				/>

				{/* Char count */}
				<div className="flex justify-end px-4 pb-3">
					<span className={`text-xs tabular-nums ${content.length > 0 ? "text-zinc-500" : "text-zinc-700"}`}>
						{content.length}
					</span>
				</div>

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
						disabled={!content.trim() || createNote.isPending}
						className="flex-1 py-3 text-sm rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-40 transition-colors"
					>
						{createNote.isPending ? "Saving…" : "Save Note"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Photo Label Sheet ─────────────────────────────────────────────────────────

const PHOTO_LABELS = ["Before", "After", "Other"] as const;
type PhotoLabel = (typeof PHOTO_LABELS)[number];

function PhotoLabelSheet({
	file,
	onConfirm,
	onClose,
}: {
	file: File;
	onConfirm: (label: PhotoLabel) => void;
	onClose: () => void;
}) {
	const [label, setLabel] = useState<PhotoLabel>("Before");
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
			<div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl border border-zinc-800 p-4">
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-sm font-semibold text-white">Photo Type</h3>
					<button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white"><X size={18} /></button>
				</div>
				<p className="text-xs text-zinc-500 mb-3 truncate">{file.name}</p>
				<div className="flex gap-2 mb-4">
					{PHOTO_LABELS.map((l) => (
						<button
							key={l}
							onClick={() => setLabel(l)}
							className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
								label === l
									? "bg-blue-600 text-white"
									: "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
							}`}
						>
							{l}
						</button>
					))}
				</div>
				<div className="flex gap-2">
					<button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800">
						Cancel
					</button>
					<button
						onClick={() => onConfirm(label)}
						className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
					>
						Attach Photo
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Note Item ─────────────────────────────────────────────────────────────────

function NoteItem({ note, tz }: { note: JobNote; tz: string }) {
	return (
		<div className="px-4 py-3 border-b border-zinc-800/60 last:border-0">
			{note.content && (
				<p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{note.content}</p>
			)}
			{note.photos && note.photos.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-1.5">
					{note.photos.map((p) => (
						<span
							key={p.id}
							className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400"
						>
							<Camera size={10} aria-hidden="true" />
							{p.photo_label}
						</span>
					))}
				</div>
			)}
			<p className="text-[11px] text-zinc-600 mt-1">
				{note.creator_tech?.name ?? note.creator_dispatcher?.name ?? "You"} · {formatDateTime(note.created_at, tz)}
			</p>
		</div>
	);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkPerformedSection({
	jobId,
	visitId,
}: {
	jobId: string;
	visitId: string;
}) {
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;
	const { data: notes = [] } = useJobNotesQuery(jobId);
	const createNote = useCreateJobNoteMutation();

	const [showNoteSheet, setShowNoteSheet] = useState(false);
	const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
	const [expanded, setExpanded] = useState(true);
	const photoInputRef = useRef<HTMLInputElement>(null);

	const visitNotes = useMemo(
		() =>
			[...notes]
				.filter((n) => n.visit_id === visitId || !n.visit_id)
				.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()),
		[notes, visitId],
	);

	const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) setPendingPhoto(file);
		// reset input so same file can be re-selected
		e.target.value = "";
	};

	const handlePhotoConfirm = async (label: PhotoLabel) => {
		if (!pendingPhoto) return;
		// Submit as a note with the label prefix; actual file upload infra TBD
		const content = `[${label} Photo] ${pendingPhoto.name}`;
		await createNote.mutateAsync({ jobId, data: { content, visit_id: visitId } });
		setPendingPhoto(null);
	};

	return (
		<div className="rounded-xl border border-zinc-800 overflow-hidden">
			{/* Header */}
			<button
				onClick={() => setExpanded((p) => !p)}
				aria-expanded={expanded}
				aria-controls="work-performed-panel"
				className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800"
			>
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Work Performed
					{visitNotes.length > 0 && (
						<span className="ml-2 text-zinc-500 font-normal normal-case tracking-normal">
							({visitNotes.length})
						</span>
					)}
				</span>
				{expanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
			</button>

			{expanded && (
				<>
					{/* Action row */}
					<div id="work-performed-panel" className="flex gap-2 px-4 py-3 border-b border-zinc-800">
						<button
							onClick={() => setShowNoteSheet(true)}
							className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
						>
							<PlusCircle size={14} />
							Add Note
						</button>
						<button
							onClick={() => photoInputRef.current?.click()}
							className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
						>
							<Camera size={14} />
							Add Photo
						</button>
						<input
							ref={photoInputRef}
							type="file"
							accept="image/*"
							capture="environment"
							className="hidden"
							onChange={handlePhotoSelected}
						/>
					</div>

					{/* Note list */}
					{visitNotes.length === 0 ? (
						<p className="px-4 py-6 text-center text-sm text-zinc-600">No notes yet</p>
					) : (
						<div>
							{visitNotes.map((note) => (
								<NoteItem key={note.id} note={note} tz={tz} />
							))}
						</div>
					)}
				</>
			)}

			{/* Sheets */}
			{showNoteSheet && (
				<NoteSheet jobId={jobId} visitId={visitId} onClose={() => setShowNoteSheet(false)} />
			)}
			{pendingPhoto && (
				<PhotoLabelSheet
					file={pendingPhoto}
					onConfirm={handlePhotoConfirm}
					onClose={() => setPendingPhoto(null)}
				/>
			)}
		</div>
	);
}
