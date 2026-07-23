import { useState, useRef, useEffect, useMemo } from "react";
import { PlusCircle, Camera, X, ChevronDown, ChevronUp } from "lucide-react";
import { useCreateJobNoteMutation, useJobNotesQuery } from "../../hooks/useJobs";
import { formatDateTime, FALLBACK_TIMEZONE } from "../../util/util";
import { useAuthStore } from "../../auth/authStore";
import type { JobNote, JobVisit } from "../../types/jobs";
import NotePhotoGallery from "../jobs/NotePhotoGallery";
import AddNotePhotoModal from "../../components/technicianComponents/AddNotePhotoModal";
import type { NotePhoto } from "../../components/technicianComponents/AddNotePhotoModal";

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
		<div className="fixed inset-0 z-[60] flex items-end justify-center bg-overlay">
			<div
				className={`w-full max-w-lg bg-base rounded-t-2xl border border-border-subtle transition-transform duration-200 ease-out ${
					visible ? "translate-y-0" : "translate-y-full"
				}`}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
					<h3 className="text-sm font-semibold text-text-primary">Add Note</h3>
					<button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary p-1 -mr-1 rounded-md hover:bg-surface transition-colors">
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
					className="w-full px-4 pt-3 pb-2 bg-transparent text-sm text-text-primary placeholder:text-faint focus:outline-none resize-none min-h-[120px] max-h-[40vh] overflow-y-auto"
				/>

				{/* Char count */}
				<div className="flex justify-end px-4 pb-3">
					<span className={`text-xs tabular-nums ${content.length > 0 ? "text-text-muted" : "text-text-faint"}`}>
						{content.length}
					</span>
				</div>

				{/* Actions */}
				<div className="flex gap-3 px-4 pt-3 pb-8 border-t border-border-subtle">
					<button
						onClick={onClose}
						className="flex-1 py-3 text-sm rounded-xl border border-border text-text-tertiary hover:bg-surface hover:text-text-primary transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!content.trim() || createNote.isPending}
						className="flex-1 py-3 text-sm rounded-xl bg-primary-hover hover:bg-primary text-on-primary font-semibold disabled:opacity-40 transition-colors"
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
		<div className="fixed inset-0 z-[60] flex items-end justify-center bg-overlay">
			<div className="w-full max-w-lg bg-base rounded-t-2xl border border-border-subtle p-4">
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-sm font-semibold text-text-primary">Photo Type</h3>
					<button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary"><X size={18} /></button>
				</div>
				<p className="text-xs text-text-muted mb-3 truncate">{file.name}</p>
				<div className="flex gap-2 mb-4">
					{PHOTO_LABELS.map((l) => (
						<button
							key={l}
							onClick={() => setLabel(l)}
							className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
								label === l
									? "bg-primary-hover text-on-primary"
									: "bg-surface text-text-tertiary border border-border hover:bg-surface-raised"
							}`}
						>
							{l}
						</button>
					))}
				</div>
				<div className="flex gap-2">
					<button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg border border-border text-text-tertiary hover:bg-surface">
						Cancel
					</button>
					<button
						onClick={() => onConfirm(label)}
						className="flex-1 py-2 text-sm rounded-lg bg-primary-hover hover:bg-primary text-on-primary font-medium"
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
		<div className="px-4 py-3 border-b border-border-subtle/60 last:border-0">
			{note.content && (
				<p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{note.content}</p>
			)}
			{note.photos && note.photos.length > 0 && (
				<div className="mt-2">
					<NotePhotoGallery photos={note.photos} />
				</div>
			)}
			<p className="text-[11px] text-text-faint mt-1">
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

	const [showNotePhotoModal, setShowNotePhotoModal] = useState(false);
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

	const handleAddNotePhoto = async (
		visitId: string,
		jobId: string,
		content: string,
		photos: NotePhoto[],
	) => {
		await createNote.mutateAsync({
			jobId,
			data: {
				content,
				visit_id: visitId,
				photos: photos.map((p) => ({
					photo_url: p.photo_url,
					photo_label: p.photo_label,
				})),
			},
		});
	};

	return (
		<div className="rounded-xl border border-border-subtle overflow-hidden">
			{/* Header */}
			<button
				onClick={() => setExpanded((p) => !p)}
				aria-expanded={expanded}
				aria-controls="work-performed-panel"
				className="w-full flex items-center justify-between px-4 py-3 bg-base/60 border-b border-border-subtle"
			>
				<span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
					Work Performed
					{visitNotes.length > 0 && (
						<span className="ml-2 text-text-muted font-normal normal-case tracking-normal">
							({visitNotes.length})
						</span>
					)}
				</span>
				{expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
			</button>

			{expanded && (
				<>
					{/* Action row */}
					<div id="work-performed-panel" className="flex gap-2 px-4 py-3 border-b border-border-subtle">
						<button
							onClick={() => setShowNotePhotoModal(true)}
							className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:bg-surface-raised hover:text-text-primary transition-colors"
						>
							<PlusCircle size={14} />
							Add Note / Photo
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
						<p className="px-4 py-6 text-center text-sm text-text-faint">No notes yet</p>
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
			{showNotePhotoModal && (
				<AddNotePhotoModal
					visits={[{ id: visitId, job_id: jobId } as JobVisit]}
					preselectedVisitId={visitId}
					onClose={() => {setShowNotePhotoModal(false);}}
					onSubmit={handleAddNotePhoto}
				/>
			)}
		</div>
	);
}
