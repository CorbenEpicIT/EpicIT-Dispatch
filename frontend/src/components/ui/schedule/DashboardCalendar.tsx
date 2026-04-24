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
import { useRescheduleOccurrenceMutation, useGenerateVisitFromOccurrenceMutation } from "../../../hooks/useRecurringPlans";
import {
	buildVisitEvents,
	buildOccurrenceEvents,
	buildOccurrenceBadgeEvents,
	toZonedDateTime,
	type VisitWithJob,
	type OccurrenceWithPlan,
} from "./dashboardCalendarUtils";
import { buildTechOrder, getTechColor } from "./scheduleBoardUtils";
import VisitClickPopup from "./VisitClickPopup";
import OccurrenceClickPopup from "./OccurrenceClickPopup";
import ReschedulePopup from "./ReschedulePopup";
import OccurrenceReschedulePopup from "./OccurrenceReschedulePopup";

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
	const [clickedOccurrence, setClickedOccurrence] = useState<{ occ: OccurrenceWithPlan; x: number; y: number } | null>(null);
	const [generatingVisitId, setGeneratingVisitId] = useState<string | null>(null);
	const [pendingClickReschedule, setPendingClickReschedule] = useState<{
		type: "visit" | "occurrence";
		visit?: VisitWithJob;
		occurrence?: OccurrenceWithPlan;
		anchorRect: DOMRect;
	} | null>(null);
	const mousePosRef = useRef({ x: 0, y: 0 });
	const popupRef    = useRef<HTMLDivElement>(null);
	const occurrencePopupRef = useRef<HTMLDivElement>(null);

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();
	const { mutateAsync: rescheduleOccurrence } = useRescheduleOccurrenceMutation();
	const { mutateAsync: generateVisitFromOccurrence } = useGenerateVisitFromOccurrenceMutation();

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
						setClickedOccurrence(null);
						setClickedVisit({ visit: calEvent._data as VisitWithJob, x: mousePosRef.current.x, y: mousePosRef.current.y });
					} else if (calEvent._type === "occurrence") {
						setClickedVisit(null);
						setClickedOccurrence({ occ: calEvent._data as OccurrenceWithPlan, x: mousePosRef.current.x, y: mousePosRef.current.y });
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

	// Close occurrence popup on outside click
	useEffect(() => {
		if (!clickedOccurrence) return;
		function handler(e: MouseEvent) {
			if (occurrencePopupRef.current && !occurrencePopupRef.current.contains(e.target as Node))
				setClickedOccurrence(null);
		}
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [clickedOccurrence]);

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
				return (
					<VisitClickPopup
						visit={v}
						style={{ position: "fixed", top, left }}
						technicians={technicians}
						techColorMap={techColorMap}
						popupRef={popupRef}
						onClose={() => setClickedVisit(null)}
						onViewVisit={() => { setClickedVisit(null); navigate(`/dispatch/jobs/${v.job_obj.id}/visits/${v.id}`); }}
						onViewJob={() => { setClickedVisit(null); navigate(`/dispatch/jobs/${v.job_obj.id}`); }}
						onRescheduleClick={() => { setClickedVisit(null); setPendingClickReschedule({ type: "visit", visit: v, anchorRect: new DOMRect(x, y, 0, 0) }); }}
					/>
				);
			})()}

			{/* Occurrence detail popup */}
			{clickedOccurrence && (() => {
				const { occ, x, y } = clickedOccurrence;
				const PAD = 8;
				const PW = 236, PH = 200;
				const vp = { w: window.innerWidth, h: window.innerHeight };
				const left = x + PW + PAD < vp.w ? x + 6 : Math.max(PAD, x - PW - 6);
				const top  = Math.max(PAD, Math.min(y - 20, vp.h - PH - PAD));
				return (
					<OccurrenceClickPopup
						occurrence={occ}
						style={{ position: "fixed", top, left }}
						popupRef={occurrencePopupRef}
						isGenerating={generatingVisitId === occ.id}
						onClose={() => setClickedOccurrence(null)}
						onViewPlan={() => { setClickedOccurrence(null); navigate(`/dispatch/recurring-plans/${occ.plan.id}`); }}
						onGenerate={async () => {
							setGeneratingVisitId(occ.id);
							setClickedOccurrence(null);
							try { await generateVisitFromOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id }); } catch {}
							setGeneratingVisitId(null);
						}}
						onRescheduleClick={() => { setClickedOccurrence(null); setPendingClickReschedule({ type: "occurrence", occurrence: occ, anchorRect: new DOMRect(x, y, 0, 0) }); }}
					/>
				);
			})()}

			{/* Click-reschedule: visit (clock button) */}
			{pendingClickReschedule?.type === "visit" && pendingClickReschedule.visit && (() => {
				const v = pendingClickReschedule.visit;
				const nd = new Date(v.scheduled_start_at).toISOString().split("T")[0];
				// Build allVisitsOnNewDay from jobs prop
				const allVisits: VisitWithJob[] = jobs.flatMap((job_obj) =>
					(job_obj.visits ?? []).map((vis) => ({ ...vis, job_obj }))
				);
				const allVisitsOnNewDay = allVisits.filter((vis) => {
					if (!vis.scheduled_start_at) return false;
					return new Date(vis.scheduled_start_at).toISOString().split("T")[0] === nd;
				});
				return (
					<ReschedulePopup
						visit={v}
						oldDateStr={nd}
						newDateStr={nd}
						allVisitsOnNewDay={allVisitsOnNewDay}
						technicians={technicians}
						techColorMap={techColorMap}
						anchorRect={pendingClickReschedule.anchorRect}
						onSave={async (data) => { try { await updateVisit({ id: v.id, data }); } catch {} setPendingClickReschedule(null); }}
						onUndo={() => setPendingClickReschedule(null)}
					/>
				);
			})()}

			{/* Click-reschedule: occurrence (clock button) */}
			{pendingClickReschedule?.type === "occurrence" && pendingClickReschedule.occurrence && (() => {
				const occ = pendingClickReschedule.occurrence;
				const nd  = new Date(occ.occurrence_start_at).toISOString().split("T")[0];
				return (
					<OccurrenceReschedulePopup
						occurrence={occ}
						oldDateStr={nd}
						newDateStr={nd}
						anchorRect={pendingClickReschedule.anchorRect}
						onReschedule={async (newStartAt, newEndAt, scope) => {
							try { await rescheduleOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id, input: { new_start_at: newStartAt, new_end_at: newEndAt, scope } }); } catch {}
							setPendingClickReschedule(null);
						}}
						onGenerate={async (newStartAt, newEndAt) => {
							setGeneratingVisitId(occ.id);
							setPendingClickReschedule(null);
							try {
								await rescheduleOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id, input: { new_start_at: newStartAt, new_end_at: newEndAt } });
								await generateVisitFromOccurrence({ occurrenceId: occ.id, jobId: occ.job_obj.id });
							} catch {}
							setGeneratingVisitId(null);
						}}
						onCancel={() => setPendingClickReschedule(null)}
					/>
				);
			})()}
		</div>
	);
}
