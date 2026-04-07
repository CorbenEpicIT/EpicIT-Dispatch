import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNextCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import { createViewWeek, createViewMonthGrid } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createDragAndDropPlugin } from "@schedule-x/drag-and-drop";
import "@schedule-x/theme-default/dist/index.css";
import "./DashboardCalendar.css";
import DashboardCalendarToolbar from "./DashboardCalendarToolbar";
import type { Job, UpdateJobVisitInput } from "../../../types/jobs";
import type { Technician } from "../../../types/technicians";
import { useUpdateJobVisitMutation } from "../../../hooks/useJobs";
import { useRescheduleOccurrenceMutation } from "../../../hooks/useRecurringPlans";
import {
	buildVisitEvents,
	buildOccurrenceEvents,
	buildOccurrenceBadgeEvents,
	toZonedDateTime,
	type VisitWithJob,
} from "./dashboardCalendarUtils";
import { buildTechOrder, getTechColor, visitStartLabel, visitEndLabel } from "./scheduleBoardUtils";
import {
	POPUP_BG,
	BORDER,
	TEXT_PRIMARY,
	TEXT_SECONDARY,
	TEXT_FAINT,
	STATUS_BG,
	STATUS_TEXT,
	SURFACE,
	ACCENT_BG,
	ACCENT_BG_HOVER,
} from "./scheduleTokens";

interface DashboardCalendarProps {
	jobs: Job[];
	technicians: Technician[];
	view?: "week" | "month";
}

export default function DashboardCalendar({
	jobs,
	technicians,
	view = "week",
}: DashboardCalendarProps) {
	const navigate = useNavigate();
	const [showVisits, setShowVisits] = useState(true);
	const [showOccurrences, setShowOccurrences] = useState(true);
	const [selectedTechs, setSelectedTechs] = useState<Set<string>>(new Set());

	const [clickedVisit, setClickedVisit] = useState<{ visit: VisitWithJob; x: number; y: number } | null>(null);
	const mousePosRef = useRef({ x: 0, y: 0 });
	const popupRef    = useRef<HTMLDivElement>(null);

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();
	const { mutateAsync: rescheduleOccurrence } = useRescheduleOccurrenceMutation();

	const eventsService = useMemo(() => createEventsServicePlugin(), []);
	const dndPlugin = useMemo(() => createDragAndDropPlugin(), []);

	const techColorMap = useMemo(() => {
		const order = buildTechOrder(technicians);
		return new Map(order.map((id, i) => [id, getTechColor(i)]));
	}, [technicians]);

	const cal = useNextCalendarApp(
		{
			views: [createViewWeek(), createViewMonthGrid()],
			defaultView: view === "week" ? "week" : "month-grid",
			callbacks: {
				onEventClick(calEvent: any) {
					if (calEvent._type === "occurrence-badge") return;
					if (calEvent._type === "visit") {
						setClickedVisit({ visit: calEvent._data as VisitWithJob, x: mousePosRef.current.x, y: mousePosRef.current.y });
					}
				},
				async onEventUpdate(updatedEvent: any) {
					const type = updatedEvent._type;
					if (type !== "visit" && type !== "occurrence") return;
					const originalData = updatedEvent._data;

					if (type === "visit") {
						const input: UpdateJobVisitInput = {
							scheduled_start_at: new Date(updatedEvent.start.epochMilliseconds),
							scheduled_end_at: new Date(updatedEvent.end.epochMilliseconds),
						};
						try {
							await updateVisit({ id: originalData.id, data: input });
						} catch {
							eventsService.update({
								...updatedEvent,
								start: toZonedDateTime(originalData.scheduled_start_at),
								end: toZonedDateTime(originalData.scheduled_end_at),
							});
						}
					} else {
						try {
							await rescheduleOccurrence({
								occurrenceId: originalData.id,
								jobId: originalData.job_obj.id,
								input: {
									new_start_at: new Date(updatedEvent.start.epochMilliseconds).toISOString(),
								},
							});
						} catch {
							eventsService.update({
								...updatedEvent,
								start: toZonedDateTime(originalData.occurrence_start_at),
								end: toZonedDateTime(originalData.occurrence_start_at),
							});
						}
					}
				},
			},
		},
		[eventsService, dndPlugin]
	);

	// Close popup on outside click
	useEffect(() => {
		if (!clickedVisit) return;
		function handler(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node))
				setClickedVisit(null);
		}
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [clickedVisit]);

	// Rebuild events when jobs or filter toggles change
	useEffect(() => {
		const filteredJobs =
			selectedTechs.size === 0
				? jobs
				: jobs.map((job) => ({
						...job,
						visits: (job.visits ?? []).filter((v) =>
							v.visit_techs?.some((vt) => selectedTechs.has(vt.tech_id))
						),
				  }));

		const events = [
			...buildVisitEvents(filteredJobs, showVisits),
			...buildOccurrenceEvents(filteredJobs, showOccurrences),
			...buildOccurrenceBadgeEvents(filteredJobs, showOccurrences),
		];
		eventsService.set(events);
	}, [jobs, showVisits, showOccurrences, selectedTechs]);

	const toolbarComponent = useCallback(
		() => (
			<DashboardCalendarToolbar
				showVisits={showVisits}
				showOccurrences={showOccurrences}
				onToggleVisits={() => setShowVisits((v) => !v)}
				onToggleOccurrences={() => setShowOccurrences((v) => !v)}
				technicians={technicians}
				selectedTechs={selectedTechs}
				onTechFilterChange={setSelectedTechs}
				techColorMap={techColorMap}
			/>
		),
		[showVisits, showOccurrences, technicians, selectedTechs, techColorMap]
	);

	return (
		<div
			className="relative min-w-0"
			onMouseDown={(e) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; }}
		>
			<ScheduleXCalendar
				calendarApp={cal}
				customComponents={{
					headerContentRightPrepend: toolbarComponent,
				}}
			/>

			{/* Visit detail popup */}
			{clickedVisit && (() => {
				const v = clickedVisit.visit;
				const { x, y } = clickedVisit;
				const PAD = 8;
				const PW = 224, PH = 280;
				const vp = { w: window.innerWidth, h: window.innerHeight };
				const left = x + PW + PAD < vp.w ? x + 6 : Math.max(PAD, x - PW - 6);
				const top  = Math.max(PAD, Math.min(y - 20, vp.h - PH - PAD));

				const timeStart = visitStartLabel(v);
				const timeLabel = v.finish_constraint !== "when_done"
					? `${timeStart} – ${visitEndLabel(v)}`
					: `${timeStart} · finish when done`;

				return (
					<div
						ref={popupRef}
						style={{
							position: "fixed",
							top,
							left,
							width: PW,
							zIndex: 1000,
							backgroundColor: POPUP_BG,
							border: `1px solid ${BORDER}`,
							borderRadius: 8,
							boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
							padding: "10px 12px",
							fontFamily: "inherit",
						}}
					>
						{/* Header */}
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
							<span style={{ fontSize: 12, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.3, flex: 1 }}>
								{v.job_obj?.name}
							</span>
							<button
								aria-label="Close"
								onClick={() => setClickedVisit(null)}
								style={{ fontSize: 16, color: TEXT_FAINT, background: "none", border: "none", cursor: "pointer", padding: "0 0 0 6px", lineHeight: 1, transition: "color 0.1s" }}
								onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#a1a1aa")}
								onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = TEXT_FAINT)}
							>×</button>
						</div>

						{/* Status badge */}
						<span style={{
							display: "inline-block", fontSize: 9, fontWeight: 600,
							padding: "1px 6px", borderRadius: 10, marginBottom: 6,
							backgroundColor: STATUS_BG, color: STATUS_TEXT,
							textTransform: "uppercase", letterSpacing: "0.04em",
						}}>
							{v.status}
						</span>

						{/* Time */}
						<div style={{ fontSize: 10, color: TEXT_SECONDARY, marginBottom: 8 }}>
							{timeLabel}
						</div>

						{/* Tech pills */}
						{(v.visit_techs?.length ?? 0) > 0 && (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
								{v.visit_techs!.map((vt) => {
									const color = techColorMap.get(vt.tech_id) ?? "#6b7280";
									const name  = technicians.find((t) => t.id === vt.tech_id)?.name ?? vt.tech_id;
									return (
										<span key={vt.tech_id} style={{
											display: "inline-flex", alignItems: "center", gap: 3,
											fontSize: 9, color: "#e4e4e7",
											backgroundColor: color + "33", border: `1px solid ${color}55`,
											borderRadius: 10, padding: "1px 6px",
										}}>
											<span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color }} />
											{name}
										</span>
									);
								})}
							</div>
						)}

						{/* Buttons */}
						<div style={{ display: "flex", gap: 5 }}>
							<button
								onClick={() => { setClickedVisit(null); navigate(`/dispatch/jobs/${v.job_obj.id}/visits/${v.id}`); }}
								style={{
									flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
									color: "#fff", backgroundColor: ACCENT_BG, border: "none",
									borderRadius: 5, cursor: "pointer", fontFamily: "inherit", transition: "background-color 0.1s",
								}}
								onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = ACCENT_BG_HOVER)}
								onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = ACCENT_BG)}
							>View Visit →</button>
							<button
								onClick={() => { setClickedVisit(null); navigate(`/dispatch/jobs/${v.job_obj.id}`); }}
								style={{
									flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
									color: "#a1a1aa", backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
									borderRadius: 5, cursor: "pointer", fontFamily: "inherit", transition: "background-color 0.1s",
								}}
								onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = BORDER)}
								onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = SURFACE)}
							>View Job</button>
						</div>
					</div>
				);
			})()}
		</div>
	);
}
