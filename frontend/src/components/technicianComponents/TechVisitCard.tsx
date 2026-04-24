import { useNavigate } from "react-router-dom";
import { FileText, Camera, ChevronRight, MapPin, CalendarDays } from "lucide-react";
import VisitActionButtons from "./VisitActionButtons";
import type { JobVisit } from "../../types/jobs";
import { VisitStatusLabels } from "../../types/jobs";
import { formatTime, formatDateTime, FALLBACK_TIMEZONE } from "../../util/util";

interface TechVisitCardProps {
	visit: JobVisit;
	techId: string;
	tz?: string;
	showDateTime?: boolean;
	showDistance?: boolean;
	distanceMiles?: number | null;
	onAddNotePhoto?: () => void;
}

const ACTIVE_STATUSES = new Set(["Driving", "OnSite", "InProgress", "Paused"]);
const COMING_SOON_MS = 90 * 60_000;


interface CardStyle {
	gradientColor: string;
	dotColor: string;
	textColor: string;
	label: string;
	animated: boolean;
}

const GREY_INACTIVE = {
	gradientColor: "#3f3f46",
	dotColor: "#52525b",
	textColor: "#71717a",
} as const; // zinc-700 / zinc-600 / zinc-500

const VISIT_CARD_COLORS: Record<
	"clockedIn" | "active" | "completed" | "cancelled" | "overdue" | "soon" | "scheduled",
	Pick<CardStyle, "gradientColor" | "dotColor" | "textColor">
> = {
	clockedIn:  { gradientColor: "#22c55e", dotColor: "#22c55e", textColor: "#4ade80" },  // green-500 / green-400
	active:     { gradientColor: "#3b82f6", dotColor: "#3b82f6", textColor: "#60a5fa" },  // blue-500 / blue-400
	completed:  { gradientColor: "#166534", dotColor: "#166534", textColor: "#4ade80" },  // green-800 / green-400
	cancelled:  GREY_INACTIVE,
	overdue:    { gradientColor: "#ef4444", dotColor: "#ef4444", textColor: "#f87171" },  // red-500 / red-400
	soon:       { gradientColor: "#f59e0b", dotColor: "#f59e0b", textColor: "#fbbf24" },  // amber-500 / amber-400
	scheduled:  GREY_INACTIVE,
};

function getCardStyle(visit: JobVisit, isClockedIn: boolean): CardStyle {
	const isActive = ACTIVE_STATUSES.has(visit.status);

	if (isActive && isClockedIn)
		return { ...VISIT_CARD_COLORS.clockedIn, label: "Clocked In", animated: true };
	if (isActive)
		return {
			...VISIT_CARD_COLORS.active,
			label: VisitStatusLabels[visit.status as keyof typeof VisitStatusLabels] ?? visit.status,
			animated: false,
		};
	if (visit.status === "Completed")
		return { ...VISIT_CARD_COLORS.completed, label: "Completed", animated: false };
	if (visit.status === "Cancelled")
		return { ...VISIT_CARD_COLORS.cancelled, label: "Cancelled", animated: false };

	const now = Date.now();
	const start = new Date(visit.scheduled_start_at).getTime();
	if (start < now)
		return { ...VISIT_CARD_COLORS.overdue, label: "Overdue", animated: false };
	if (start - now < COMING_SOON_MS)
		return { ...VISIT_CARD_COLORS.soon, label: "Soon", animated: false };
	return {
		...VISIT_CARD_COLORS.scheduled,
		label: VisitStatusLabels[visit.status as keyof typeof VisitStatusLabels] ?? visit.status,
		animated: false,
	};
}

export default function TechVisitCard({
	visit,
	techId,
	tz = FALLBACK_TIMEZONE,
	showDateTime = false,
	showDistance = false,
	distanceMiles,
	onAddNotePhoto,
}: TechVisitCardProps) {
	const navigate = useNavigate();

	const myOpenEntry = visit.time_entries?.find(
		(e) => e.tech_id === techId && e.clocked_out_at === null,
	);
	const isClockedIn = myOpenEntry != null;
	const style = getCardStyle(visit, isClockedIn);
	const openEntries =
		visit.time_entries?.filter((e) => e.clocked_out_at === null) ?? [];
	const isDone =
		visit.status === "Completed" || visit.status === "Cancelled";
	const showNotePhoto = Boolean(onAddNotePhoto && isClockedIn);

	return (
		<div
			style={{
				padding: "1px 1px 1px 3px",
				background: `linear-gradient(to right, ${style.gradientColor} 0%, #3f3f46 45%, #3f3f46 100%)`,
				borderRadius: "12px",
			}}
		>
			<div className="rounded-[11px] bg-zinc-900 px-4 py-4">
				{/* Header: title with badge on the right */}
				<div className="flex items-start justify-between gap-2 mb-0.5">
					<p
						className={`flex-1 min-w-0 text-[15px] font-bold leading-snug ${
							isDone ? "text-zinc-500 line-through" : "text-white"
						}`}
						title={visit.name ?? "Visit"}
					>
						{visit.name ?? "Visit"}
					</p>
					<div className="shrink-0 flex items-center gap-1.5">
						{style.animated ? (
							<span className="relative flex h-[7px] w-[7px] flex-shrink-0">
								<span
									className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
									style={{ backgroundColor: style.dotColor }}
								/>
								<span
									className="relative inline-flex h-[7px] w-[7px] rounded-full"
									style={{ backgroundColor: style.dotColor }}
								/>
							</span>
						) : (
							<span
								className="h-[7px] w-[7px] rounded-full flex-shrink-0"
								style={{ backgroundColor: style.dotColor }}
							/>
						)}
						<span
							className="text-[10px] font-bold tracking-[0.08em] uppercase leading-none"
							style={{ color: style.textColor }}
						>
							{style.label}
						</span>
					</div>
				</div>

				{/* Client */}
				{visit.job?.client?.name && (
					<p className="text-xs text-zinc-500 mb-0.5">
						{visit.job.client.name}
					</p>
				)}

				{/* Address + optional distance */}
				{visit.job?.address && (
					<p className="text-xs text-zinc-400 mb-0.5 flex items-center gap-1">
						<MapPin size={11} className="text-zinc-600 shrink-0" aria-hidden="true" />
						{visit.job.address}
						{showDistance && distanceMiles != null && (
							<span className="text-zinc-600 ml-2 tabular-nums">
								{distanceMiles < 0.1
									? "< 0.1 mi"
									: `${distanceMiles.toFixed(1)} mi`}
							</span>
						)}
					</p>
				)}

				{/* Date/time — visits page only */}
				{showDateTime && (
					<p className="text-xs text-zinc-500 mb-0.5 flex items-center gap-1">
						<CalendarDays size={11} className="text-zinc-600 shrink-0" aria-hidden="true" />
						{formatDateTime(visit.scheduled_start_at, tz)}
					</p>
				)}

				{/* Clock-in elapsed + on-site names — dashboard only (no showDateTime) */}
				{!showDateTime && isClockedIn && myOpenEntry && (
					<p className="text-xs text-zinc-400 mb-0.5">
						<span className="text-zinc-600 mr-1">Since</span>
						{formatTime(myOpenEntry.clocked_in_at, tz)}
					</p>
				)}
				{!showDateTime && openEntries.length > 0 && (
					<p className="text-[11px] text-zinc-500 mb-0.5">
						On site: {openEntries.map((e) => e.tech.name).join(", ")}
					</p>
				)}

				{/* Action row */}
				<div className="mt-2">
					{isDone ? (
						<button
							onClick={() => navigate(`/technician/visits/${visit.id}`)}
							className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-zinc-800 bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors text-[12px] font-medium"
						>
							View Details <ChevronRight size={13} />
						</button>
					) : (
						<div className="flex gap-2 items-stretch">
							<div className="flex-[3] min-w-0">
								<VisitActionButtons
									visit={visit}
									techId={techId}
									variant="card"
								/>
							</div>
							<div className="w-px bg-zinc-700/60 self-stretch mx-0.5" />
							<button
								onClick={() =>
									navigate(`/technician/visits/${visit.id}`)
								}
								className="flex-[1] flex items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-600 transition-all duration-150 active:scale-[0.97] px-2 py-2.5 min-w-[48px]"
								aria-label="View visit details"
							>
								{visit.status === "InProgress" ? (
									<>
										<span className="flex flex-col items-center leading-tight">
											<span className="text-[13px] font-semibold">Visit</span>
											<span className="text-[13px] font-semibold">Details</span>
										</span>
										<ChevronRight size={14} />
									</>
								) : (
									<>
										<span className="text-[11px] font-semibold">View</span>
										<ChevronRight size={13} />
									</>
								)}
							</button>
						</div>
					)}
				</div>

				{/* Note / Photo quick action — dashboard only, when clocked in */}
				{showNotePhoto && (
					<div className="mt-2">
						<button
							onClick={onAddNotePhoto}
							className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
						>
							<FileText size={12} />
							<Camera size={12} />
							Add Note / Photo
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
