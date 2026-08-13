import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
	Truck,
	Warehouse,
	CheckCircle2,
	Briefcase,
	User,
	Pencil,
	Check,
	X,
	Printer,
	QrCode,
} from "lucide-react";
import { useLabelQueueStore } from "../../../stores/labelQueueStore";
import {
	movementReasonDot,
	movementReasonIcon,
	movementReasonLabel,
} from "../../../lib/movementReasons";
import { useSerialHistoryQuery, useUpdateSerialMutation } from "../../../hooks/useTracking";
import QRLabel from "../labels/QRLabel";
import { SERIAL_STATUS_BADGE, SERIAL_STATUS_LABEL } from "../../../types/tracking";
import type { SerialHistoryDetail, SerialHistoryEvent } from "../../../types/tracking";
import { formatDateTime } from "../../../util/util";

// Shared body across every SerialDetailDrawer mount point, so they don't
// drift. Only two variance axes (renderActions, dense) — duplicate rather
// than add a third.

export interface SerialDetailBodyProps {
	serialId: string;
	/**
	 * Render prop, not a node — lets the caller gate actions on status/timeline
	 * (e.g. Mark Returned only in warehouse) without a second fetch.
	 */
	renderActions?: (ctx: {
		serial: SerialHistoryDetail;
		timeline: SerialHistoryEvent[];
	}) => ReactNode;
	/** Single-column, tighter type. For the ~420px drawer. */
	dense?: boolean;
	/** Shows the note pencil. Dispatchers with manage_inventory only. */
	canEditNote?: boolean;
}

function locationLabel(
	locationType: string,
	vehicle: { id: string; name: string } | null,
): string {
	if (vehicle) return vehicle.name;
	if (locationType === "warehouse") return "Warehouse";
	if (!locationType) return "Unknown";
	return locationType
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function TimelineRow({ event }: { event: SerialHistoryEvent }) {
	const Icon = movementReasonIcon(event.reason);
	const dotClass = movementReasonDot(event.reason);
	const reasonLabel = movementReasonLabel(event.reason);
	const from = locationLabel(event.from_location_type, event.from_vehicle);
	const to = locationLabel(event.to_location_type, event.to_vehicle);

	return (
		<li className="relative flex gap-3 pb-5 last:pb-0">
			<span
				className="absolute left-[13px] top-7 bottom-0 w-px bg-border-subtle last:hidden"
				aria-hidden
			/>
			<span
				className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 ${dotClass}`}
			>
				<Icon size={14} />
			</span>
			<div className="flex-1 min-w-0 pt-0.5">
				<div className="flex flex-wrap items-baseline gap-x-2">
					<span className="text-sm font-medium text-text-primary">{reasonLabel}</span>
					<span className="text-xs text-text-faint">
						{formatDateTime(event.created_at)}
					</span>
				</div>
				<div className="text-xs text-text-secondary mt-0.5">
					{from} <span className="text-text-faint">→</span> {to}
				</div>
				{event.visit && (
					<Link
						to={`/dispatch/jobs/${event.visit.job.id}`}
						className="inline-flex items-center gap-1 text-xs text-text-link hover:underline mt-1"
					>
						<Briefcase size={11} />
						{event.visit.job.job_number} · {event.visit.job.name}
					</Link>
				)}
				{event.note && (
					<p className="text-xs text-text-muted italic mt-1">"{event.note}"</p>
				)}
				<div className="text-[11px] text-text-faint mt-0.5 capitalize">
					{event.actor_type}
				</div>
			</div>
		</li>
	);
}

export default function SerialDetailBody({
	serialId,
	renderActions,
	dense = false,
	canEditNote = false,
}: SerialDetailBodyProps) {
	const navigate = useNavigate();
	const addToLabelQueue = useLabelQueueStore((s) => s.add);
	const updateNote = useUpdateSerialMutation(serialId);
	const [noteEditing, setNoteEditing] = useState(false);
	const [noteDraft, setNoteDraft] = useState("");
	const [noteError, setNoteError] = useState<string | null>(null);

	const { data, isLoading } = useSerialHistoryQuery(serialId);
	const serial = data?.serial;
	const timeline = data?.timeline ?? [];

	if (isLoading) {
		return (
			<div className="space-y-4 animate-pulse">
				<div className="h-6 w-48 bg-surface-raised rounded" />
				<div className="h-32 bg-surface-raised rounded-xl" />
				<div className="h-64 bg-surface-raised rounded-xl" />
			</div>
		);
	}

	if (!serial) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<div className="text-text-primary text-lg">Serial unit not found</div>
			</div>
		);
	}

	const startEditNote = () => {
		setNoteDraft(serial.note ?? "");
		setNoteError(null);
		setNoteEditing(true);
	};

	const saveNote = async () => {
		setNoteError(null);
		try {
			await updateNote.mutateAsync({ note: noteDraft.trim() || null });
			setNoteEditing(false);
		} catch (e) {
			setNoteError(e instanceof Error ? e.message : "Failed to save note");
		}
	};

	return (
		<div className={dense ? "space-y-4" : "space-y-6"}>
			<div>
				{/* Plain text, not a link — the only consumer is the drawer already on
				    this item's page; navigating there would just re-close it. */}
				<div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-1.5">
					{serial.item.name}
				</div>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2.5 flex-wrap">
							<h2
								className={`${
									dense ? "text-lg" : "text-2xl"
								} font-semibold text-text-primary`}
							>
								{serial.serial_number}
							</h2>
							<span
								className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SERIAL_STATUS_BADGE[serial.status]}`}
							>
								{SERIAL_STATUS_LABEL[serial.status]}
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-text-muted">
							<span className="font-mono text-xs">{serial.code}</span>
							<span className="text-text-faint">·</span>
							<span className="inline-flex items-center gap-1">
								{serial.current_vehicle ? (
									<Truck size={13} />
								) : (
									<Warehouse size={13} />
								)}
								{serial.current_vehicle
									? serial.current_vehicle.name
									: "Warehouse"}
							</span>
							{serial.batch && (
								<>
									<span className="text-text-faint">·</span>
									<Link
										to={`/dispatch/inventory/batches/${serial.batch.id}`}
										className="text-text-link hover:underline"
									>
										Batch {serial.batch.batch_number}
									</Link>
								</>
							)}
						</div>
					</div>
					{renderActions && (
						<div className="flex items-center gap-2 flex-wrap">
							{renderActions({ serial, timeline })}
						</div>
					)}
				</div>
			</div>

			{/* QR preview and its two actions grouped in one card. QrCode queues and
			    stays; Printer queues and navigates (see AddToLabelQueueButton). */}
			<div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
				<div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
					Label
				</div>
				<div className="flex items-center justify-center px-4 py-3">
					<QRLabel
						code={serial.code}
						kind="serial"
						primaryLabel={serial.item.name}
						secondaryLabel={serial.serial_number}
						widthIn={1.75}
						heightIn={0.7}
					/>
				</div>
				<div className="flex items-stretch border-t border-border-subtle divide-x divide-border-subtle">
					<button
						type="button"
						onClick={() =>
							addToLabelQueue({
								id: serial.id,
								code: serial.code,
								kind: "serial",
								primaryLabel: serial.item.name,
								secondaryLabel: serial.serial_number,
							})
						}
						className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
					>
						<QrCode size={13} />
						Add to Queue
					</button>
					<button
						type="button"
						onClick={() => {
							addToLabelQueue({
								id: serial.id,
								code: serial.code,
								kind: "serial",
								primaryLabel: serial.item.name,
								secondaryLabel: serial.serial_number,
							});
							navigate("/dispatch/inventory/labels/print");
						}}
						className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
					>
						<Printer size={13} />
						Print Label
					</button>
				</div>
			</div>

			<div
				className={`bg-surface border border-border-subtle rounded-xl p-4 flex items-stretch gap-4 ${
					dense ? "flex-col" : "flex-col sm:flex-row"
				}`}
			>
				<div className="flex-1 min-w-[180px] flex flex-col justify-center gap-2.5">
					<div>
						<div className="text-xs text-text-muted">Received</div>
						<div className="text-sm text-text-primary">
							{formatDateTime(serial.received_at)}
						</div>
					</div>
					<div className="pt-2 border-t border-border-subtle/60">
						<div className="flex items-center justify-between">
							<div className="text-xs text-text-muted">Note</div>
							{canEditNote && !noteEditing && (
								<button
									type="button"
									onClick={startEditNote}
									className="text-text-faint hover:text-text-primary transition-colors"
									title="Edit note"
								>
									<Pencil size={12} />
								</button>
							)}
						</div>
						{noteEditing ? (
							<div className="mt-1 space-y-1.5">
								<textarea
									value={noteDraft}
									onChange={(e) => setNoteDraft(e.target.value)}
									rows={2}
									maxLength={500}
									className="w-full px-2 py-1 text-xs bg-base border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
									placeholder="Add a note…"
								/>
								{noteError && (
									<p className="text-[11px] text-error-text">{noteError}</p>
								)}
								<div className="flex items-center gap-1.5">
									<button
										type="button"
										onClick={saveNote}
										disabled={updateNote.isPending}
										className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-primary-hover hover:bg-primary-active text-on-primary rounded transition-colors disabled:opacity-50"
									>
										<Check size={11} />
										Save
									</button>
									<button
										type="button"
										onClick={() => setNoteEditing(false)}
										className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary transition-colors"
									>
										<X size={11} />
										Cancel
									</button>
								</div>
							</div>
						) : serial.note ? (
							<p className="text-xs text-text-secondary italic mt-0.5">
								"{serial.note}"
							</p>
						) : (
							<p className="text-xs text-text-faint mt-0.5">
								No notes on receiving.
							</p>
						)}
					</div>
				</div>
			</div>

			{serial.status === "consumed" && serial.client && (
				<div className="bg-success-bg border border-success-border rounded-xl p-4">
					<div className="flex items-center gap-2 text-success-text font-semibold text-sm mb-2">
						<CheckCircle2 size={16} />
						Installed
					</div>
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<Link
							to={`/dispatch/clients/${serial.client.id}`}
							className="inline-flex items-center gap-1.5 text-text-link hover:underline"
						>
							<User size={13} />
							{serial.client.name}
						</Link>
						{serial.consumed_visit && (
							<Link
								to={`/dispatch/jobs/${serial.consumed_visit.job.id}`}
								className="inline-flex items-center gap-1.5 text-text-link hover:underline"
							>
								<Briefcase size={13} />
								{serial.consumed_visit.job.job_number} ·{" "}
								{serial.consumed_visit.job.name}
							</Link>
						)}
						{serial.consumed_at && (
							<span className="text-text-muted text-xs">
								{formatDateTime(serial.consumed_at)}
							</span>
						)}
					</div>
				</div>
			)}

			<div className="bg-surface border border-border-subtle rounded-xl p-4">
				<div className="flex items-baseline gap-2 mb-4">
					<h3 className="font-semibold text-text-primary">Lifecycle</h3>
					{timeline.length > 0 && (
						<span className="text-xs text-text-faint">
							{timeline.length} event{timeline.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>
				{timeline.length === 0 ? (
					<p className="text-sm text-text-muted py-4 text-center">
						No history recorded yet.
					</p>
				) : (
					<ol>
						{timeline.map((event) => (
							<TimelineRow key={event.id} event={event} />
						))}
					</ol>
				)}
			</div>
		</div>
	);
}
