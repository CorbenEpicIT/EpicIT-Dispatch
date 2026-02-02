import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import { Eye, EyeOff, Plus, ExternalLink, Calendar as CalendarIcon } from "lucide-react";
import { createRoot } from "react-dom/client";
import type { Job, JobVisit, UpdateJobVisitInput } from "../../types/jobs";
import type { RecurringOccurrence, RecurringPlan } from "../../types/recurringPlans";
import { useUpdateJobVisitMutation } from "../../hooks/useJobs";
import {
	useRescheduleOccurrenceMutation,
	useGenerateVisitFromOccurrenceMutation,
} from "../../hooks/useRecurringPlans";
import type { ToolbarInput } from "@fullcalendar/core/index.js";

interface SmartCalendarProps {
	jobs: Job[];
	view: "month" | "week";
	toolbar?: ToolbarInput;
}

interface VisitWithJob extends JobVisit {
	job_obj: Job;
}

interface OccurrenceWithPlan extends RecurringOccurrence {
	plan: RecurringPlan;
	job_obj: Job;
}

type CalendarEvent = {
	id: string;
	type: "visit" | "occurrence";
	data: VisitWithJob | OccurrenceWithPlan;
};

export default function SmartCalendar({ jobs, view, toolbar }: SmartCalendarProps) {
	const navigate = useNavigate();
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
	const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
	const [showVisits, setShowVisits] = useState(true);
	const [showOccurrences, setShowOccurrences] = useState(true);
	const [calendarKey, setCalendarKey] = useState(0); // Used to force re-render (for occurrence badges)
	const popupRef = useRef<HTMLDivElement>(null);
	const visitsRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
	const occurrencesRootRef = useRef<ReturnType<typeof createRoot> | null>(null);

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();
	const { mutateAsync: rescheduleOccurrence } = useRescheduleOccurrenceMutation();
	const { mutateAsync: generateVisit } = useGenerateVisitFromOccurrenceMutation();

	// Close popup on outside click
	useEffect(() => {
		function handleMouseDown(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				setSelectedEvent(null);
			}
		}
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, []);

	// Occurrence badges update when data changes
	useEffect(() => {
		setCalendarKey((prev) => prev + 1);
	}, [jobs]);

	// Update button renders when state changes
	useEffect(() => {
		if (visitsRootRef.current) {
			visitsRootRef.current.render(
				<button
					onClick={() => setShowVisits(!showVisits)}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
						showVisits
							? "bg-blue-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					{showVisits ? <Eye size={14} /> : <EyeOff size={14} />}
					Visits
				</button>
			);
		}

		if (occurrencesRootRef.current) {
			occurrencesRootRef.current.render(
				<button
					onClick={() => setShowOccurrences(!showOccurrences)}
					className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
						showOccurrences
							? "bg-purple-600 text-white"
							: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
					}`}
				>
					{showOccurrences ? <Eye size={14} /> : <EyeOff size={14} />}
					Occurrences
				</button>
			);
		}
	}, [showVisits, showOccurrences]);

	// Extract visits from jobs
	const allVisits: VisitWithJob[] = jobs.flatMap((job_obj) => {
		if (!job_obj.visits) return [];
		return job_obj.visits.map((visit: JobVisit) => ({ ...visit, job_obj }));
	});

	// Extract occurrences from jobs with recurring plans
	const allOccurrences: OccurrenceWithPlan[] = jobs.flatMap((job_obj) => {
		const plan = (job_obj as any).recurring_plan as RecurringPlan | undefined;
		if (!plan?.occurrences) return [];

		const now = new Date();

		return plan.occurrences
			.filter((occ) => {
				if (occ.job_visit_id) return false;
				if (new Date(occ.occurrence_start_at) < now) return false;
				if (occ.status === "skipped" || occ.status === "cancelled")
					return false;
				return occ.status === "planned";
			})
			.map((occ) => ({ ...occ, plan, job_obj }));
	});

	function getPriorityColor(priority?: string): string {
		switch (priority?.toLowerCase()) {
			case "emergency":
				return "#dc2626";
			case "urgent":
				return "#ea580c";
			case "high":
				return "#ef4444";
			case "medium":
				return "#f59e0b";
			case "low":
				return "#10b981";
			default:
				return "#3b82f6";
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case "Scheduled":
				return "#3b82f6";
			case "InProgress":
				return "#f59e0b";
			case "Completed":
				return "#10b981";
			case "Cancelled":
				return "#ef4444";
			default:
				return "#6b7280";
		}
	}

	function formatTime(date: Date | string): string {
		const d = typeof date === "string" ? new Date(date) : date;
		return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === "string" ? new Date(date) : date;
		return d.toLocaleDateString([], {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	function formatConstraintInfo(event: VisitWithJob | OccurrenceWithPlan): string {
		const isOccurrence = "plan" in event;

		let arrival: string;
		let finish: string;
		let arrivalTime: string | null | undefined;
		let arrivalWindowStart: string | null | undefined;
		let arrivalWindowEnd: string | null | undefined;
		let finishTime: string | null | undefined;

		if (isOccurrence) {
			const occ = event as OccurrenceWithPlan;
			const rule = occ.plan.rules?.[0];
			if (!rule) return "No schedule information";

			arrival = rule.arrival_constraint;
			finish = rule.finish_constraint;
			arrivalTime = rule.arrival_time;
			arrivalWindowStart = rule.arrival_window_start;
			arrivalWindowEnd = rule.arrival_window_end;
			finishTime = rule.finish_time;
		} else {
			const visit = event as VisitWithJob;
			arrival = visit.arrival_constraint;
			finish = visit.finish_constraint;
			arrivalTime = visit.arrival_time;
			arrivalWindowStart = visit.arrival_window_start;
			arrivalWindowEnd = visit.arrival_window_end;
			finishTime = visit.finish_time;
		}

		let parts: string[] = [];

		if (arrival === "at" && arrivalTime) {
			parts.push(`Arrive at ${arrivalTime}`);
		} else if (arrival === "between" && arrivalWindowStart && arrivalWindowEnd) {
			parts.push(`Arrive ${arrivalWindowStart}-${arrivalWindowEnd}`);
		} else if (arrival === "by" && arrivalWindowEnd) {
			parts.push(`Arrive by ${arrivalWindowEnd}`);
		} else if (arrival === "anytime") {
			parts.push("Arrive anytime");
		}

		if (finish === "at" && finishTime) {
			parts.push(`finish at ${finishTime}`);
		} else if (finish === "by" && finishTime) {
			parts.push(`finish by ${finishTime}`);
		}

		return parts.join(", ");
	}

	// Create calendar events from visits
	const visitEvents = showVisits
		? allVisits.map((visit) => {
				const startDate = new Date(visit.scheduled_start_at);
				const dateStr = startDate.toISOString().split("T")[0];

				return {
					id: `visit-${visit.id}`,
					title: `${formatTime(visit.scheduled_start_at)} ${visit.name || visit.job_obj.name}`,
					start: dateStr,
					allDay: true,
					backgroundColor: getStatusColor(visit.status),
					borderColor: getPriorityColor(visit.job_obj.priority),
					borderWidth: 2,
					classNames: ["event-solid"],
					extendedProps: {
						type: "visit",
						data: visit,
					},
				};
			})
		: [];

	// Create calendar events from occurrences (dashed style)
	const occurrenceEvents = showOccurrences
		? allOccurrences.map((occurrence) => {
				const startDate = new Date(occurrence.occurrence_start_at);
				const dateStr = startDate.toISOString().split("T")[0];

				return {
					id: `occurrence-${occurrence.id}`,
					title: `${formatTime(occurrence.occurrence_start_at)} ${occurrence.job_obj.name} (recurring)`,
					start: dateStr,
					allDay: true,
					backgroundColor: "#6b7280",
					borderColor: getPriorityColor(occurrence.job_obj.priority),
					borderWidth: 2,
					classNames: ["event-dashed"],
					extendedProps: {
						type: "occurrence",
						data: occurrence,
					},
				};
			})
		: [];

	const events = [...visitEvents, ...occurrenceEvents];

	// Count occurrences per day for badge display
	const occurrenceCountByDay = allOccurrences.reduce(
		(acc, occ) => {
			const dateStr = new Date(occ.occurrence_start_at)
				.toISOString()
				.split("T")[0];
			acc[dateStr] = (acc[dateStr] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	const handleGenerateVisit = async (occurrence: OccurrenceWithPlan) => {
		try {
			await generateVisit({
				occurrenceId: occurrence.id,
				jobId: occurrence.job_obj.id,
			});
			setSelectedEvent(null);
		} catch (error) {
			console.error("Failed to generate visit:", error);
		}
	};

	return (
		<div className="relative">
			<style>{`
	/* ============================================================================ */
	/* CALENDAR BASE STYLING */
	/* ============================================================================ */
	
	/* Base calendar background */
	.fc {
		background-color: var(--main); 
		color: #e4e4e7; /* zinc-200 text */
	}

	/* Calendar header (month title and nav buttons) */
	.fc-toolbar-title {
		color: #f4f4f5; /* zinc-100 */
		font-size: 1.25rem;
		font-weight: 600;
	}

	.fc-button {
		background: #27272a !important; /* zinc-800 */
		border: 1px solid #3f3f46 !important;
		color: #e4e4e7 !important;
		border-radius: 6px !important;
		padding: 4px 10px !important;
		transition: all 0.2s ease-in-out;
	}

	.fc-button:hover {
		background: #3f3f46 !important;
	}

	/* Remove any global white background or wrapper borders */
	.fc-scrollgrid {
		background-color: var(--main) !important;
		border: none !important;
	}

	/* The combined header+body container */
	.fc-scrollgrid-section.fc-scrollgrid-section-header {
		border: none !important;
	}

	/* Lock weekdays column in place */
	.fc-scrollgrid-section.fc-scrollgrid-section-header th {
		position: static !important;
		top: auto !important;
		z-index: auto !important;
	}

	.fc-scrollgrid-section.fc-scrollgrid-section-body {
		background-color: var(--main) !important;
		border: none !important;
		border-radius: 0.75rem !important;
		overflow: hidden;
		margin-top: 0 !important;
	}

	/* Weekday header row */
	.fc-theme-standard th {
		background-color: var(--main) !important;
		border: none !important;
		border-bottom: 1px solid #3f3f46 !important;
		color: #e4e4e7;
		font-weight: 500;
		padding: 0.5rem 0;
	}

	/* Ensure header table doesn't draw borders */
	.fc-scrollgrid-section.fc-scrollgrid-section-header table,
	.fc-scrollgrid-section.fc-scrollgrid-section-header thead,
	.fc-scrollgrid-section.fc-scrollgrid-section-header tr {
		border: none !important;
		background-color: #1f1f22 !important;
	}

	/* Day grid cells */
	.fc-theme-standard td {
		background-color: var(--main); 
		border: 1px solid #38383d;
		border-bottom: none !important;
	}

	/* Remove outer outline */
	.fc-theme-standard td:first-child,
	.fc-theme-standard th:first-child {
		border-left: none !important;
	}
	.fc-theme-standard td:last-child,
	.fc-theme-standard th:last-child {
		border-right: none !important;
	}

	/* Event block styling */
	.fc-event {
		background-color: #3b82f6;
		border: none;
		border-radius: 4px;
		color: white;
		padding: 2px 4px;
		font-size: 0.75rem;
		transition: background-color 0.2s ease;
	}
	.fc-event:hover {
		background-color: #2563eb;
	}

	/* Scrollable days when many events */
	.fc-daygrid-day-events {
		max-height: 120px;
		overflow-y: auto;
	}

	/* The outer grid wrapper */
	.fc-daygrid {
		border: none !important;
	}

	/* Apply border around visible month days area */
	.fc-daygrid-body {
		border-left: 1px solid #3f3f46 !important;
		border-right: 1px solid #3f3f46 !important;
		border-bottom: 1px solid #3f3f46 !important;
		border-top: none !important;
		border-radius: 0 0 0.75rem 0.75rem !important;
		overflow: hidden;
		background-color: var(--main) !important;
	}

	.fc-daygrid-body table {
		border-radius: 0 0 0.75rem 0.75rem !important;
		overflow: hidden;
	}

	/* Today highlight */
	.fc-day-today {
		background-color: #27272a !important;
	}

	/* Custom toolbar styling */
	.fc .fc-toolbar-chunk .fc-jobsTitle-button {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0 !important;
		margin: 0 !important;
		color: #f4f4f5 !important;
		font-size: 1.25rem !important;
		font-weight: 600 !important;
		text-transform: none !important;
		cursor: default !important;
	}

	.fc .fc-toolbar {
		align-items: center !important;
	}

	/* ============================================================================ */
	/* NEXT MONTH DAYS STYLING (dimmed events) */
	/* ============================================================================ */
	
	/* Dim events in next month's preview days */
	.fc-day-other .fc-event {
		opacity: 0.4 !important;
	}

	.fc-day-other .fc-event:hover {
		opacity: 0.5 !important;
	}

	/* ============================================================================ */
	/* EVENT TYPE STYLING */
	/* ============================================================================ */

	/* Solid events (visits) */
	.event-solid .fc-event {
		border-style: solid !important;
	}

	/* Dashed events (occurrences) */
	.event-dashed .fc-event {
		border-style: dashed !important;
		opacity: 0.8;
	}

	.event-dashed .fc-event:hover {
		opacity: 1;
	}

	/* Dashed events in next month - extra dimming */
	.fc-day-other .event-dashed .fc-event {
		opacity: 0.3 !important;
	}

	.fc-day-other .event-dashed .fc-event:hover {
		opacity: 0.4 !important;
	}

	/* ============================================================================ */
	/* OCCURRENCE BADGE STYLING */
	/* ============================================================================ */
	/* Day cell badges for occurrence count */
	.fc-daygrid-day-top {
		position: relative;
		display: flex !important;
		align-items: center !important;
		gap: 4px !important;
	}

	/* Occurrence badge */
	.occurrence-badge {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background-color: rgb(147 51 234);
		color: white;
		font-size: 10px;
		font-weight: 700;
		border-radius: 50%;
		cursor: help;
		flex-shrink: 0;
	}

	/* Tooltip appears BELOW the badge - default centered */
	.occurrence-badge:hover::after {
		content: attr(data-tooltip);
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;

		padding: 4px 8px;
		background-color: rgb(24 24 27);
		color: white;
		font-size: 11px;
		font-weight: 500;
		white-space: nowrap;
		border-radius: 4px;
		border: 1px solid rgb(63 63 70);
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
		z-index: 1000;
		pointer-events: none;
	}

	/* Rightmost column: shift tooltip toward center (left) to prevent overflow */
	.occurrence-badge.occ-tip-rightmost:hover::after {
		left: 50%;
		transform: translateX(-75%); /* Shift significantly left toward center */
	}

	/* When near RIGHT edge (viewport), anchor to badge's right side */
	.occurrence-badge.occ-tip-right:hover::after {
		left: auto;
		right: 0;
		transform: none;
	}

	/* When near LEFT edge (viewport), anchor to badge's left side */
	.occurrence-badge.occ-tip-left:hover::after {
		left: 0;
		transform: none;
	}

	/* HIDE tooltip for badges in next month's preview days */
	.fc-day-other .occurrence-badge:hover::after {
		display: none !important;
	}
`}</style>

			<FullCalendar
				key={calendarKey}
				plugins={[dayGridPlugin, interactionPlugin]}
				initialView={view === "week" ? "dayGridWeek" : "dayGridMonth"}
				headerToolbar={{
					left: "title",
					center: "",
					right: "today prev,next",
				}}
				views={{
					dayGridWeek: { type: "dayGrid", duration: { days: 7 } },
					dayGridMonth: {},
				}}
				events={events}
				height="auto"
				editable={true}
				eventStartEditable={true}
				eventDurationEditable={false}
				viewDidMount={() => {
					let centerChunk = document.querySelector(
						".fc-toolbar-chunk:nth-child(2)"
					) as HTMLElement;

					if (!centerChunk) {
						const toolbar = document.querySelector(
							".fc-toolbar.fc-header-toolbar"
						);
						if (toolbar) {
							centerChunk = document.createElement("div");
							centerChunk.className = "fc-toolbar-chunk";
							const rightChunk = toolbar.querySelector(
								".fc-toolbar-chunk:nth-child(2)"
							);
							if (rightChunk) {
								toolbar.insertBefore(
									centerChunk,
									rightChunk
								);
							}
						}
					}

					if (
						centerChunk &&
						!centerChunk.querySelector(".filter-buttons")
					) {
						const filterContainer =
							document.createElement("div");
						filterContainer.className =
							"filter-buttons flex gap-2";

						const visitsContainer =
							document.createElement("div");
						visitsContainer.id = "visits-button-container";

						const occurrencesContainer =
							document.createElement("div");
						occurrencesContainer.id =
							"occurrences-button-container";

						filterContainer.appendChild(visitsContainer);
						filterContainer.appendChild(occurrencesContainer);
						centerChunk.appendChild(filterContainer);

						visitsRootRef.current = createRoot(visitsContainer);
						occurrencesRootRef.current =
							createRoot(occurrencesContainer);

						visitsRootRef.current.render(
							<button
								onClick={() =>
									setShowVisits(!showVisits)
								}
								className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
									showVisits
										? "bg-blue-600 text-white"
										: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
								}`}
							>
								{showVisits ? (
									<Eye size={14} />
								) : (
									<EyeOff size={14} />
								)}
								Visits
							</button>
						);

						occurrencesRootRef.current.render(
							<button
								onClick={() =>
									setShowOccurrences(
										!showOccurrences
									)
								}
								className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
									showOccurrences
										? "bg-purple-600 text-white"
										: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
								}`}
							>
								{showOccurrences ? (
									<Eye size={14} />
								) : (
									<EyeOff size={14} />
								)}
								Occurrences
							</button>
						);
					}
				}}
				eventDrop={async (info) => {
					const eventId = info.event.id;
					const newDate = info.event.start;
					const eventType = info.event.extendedProps.type;
					const fcEvent = info.event;

					if (!newDate) {
						info.revert();
						return;
					}

					try {
						if (eventType === "visit") {
							const visit = allVisits.find(
								(v) => `visit-${v.id}` === eventId
							);
							if (!visit) {
								info.revert();
								return;
							}

							const originalStart = new Date(
								visit.scheduled_start_at
							);
							const originalEnd = new Date(
								visit.scheduled_end_at
							);
							const durationMs =
								originalEnd.getTime() -
								originalStart.getTime();

							const newStart = new Date(
								Date.UTC(
									newDate.getFullYear(),
									newDate.getMonth(),
									newDate.getDate(),
									originalStart.getUTCHours(),
									originalStart.getUTCMinutes(),
									0,
									0
								)
							);
							const newEnd = new Date(
								newStart.getTime() + durationMs
							);

							const updates: UpdateJobVisitInput = {
								scheduled_start_at:
									newStart.toISOString(),
								scheduled_end_at:
									newEnd.toISOString(),
							};

							await updateVisit({
								id: visit.id,
								data: updates,
							});
						} else if (eventType === "occurrence") {
							const occurrence = allOccurrences.find(
								(o) =>
									`occurrence-${o.id}` ===
									eventId
							);
							if (!occurrence) {
								info.revert();
								return;
							}

							const originalStart = new Date(
								occurrence.occurrence_start_at
							);
							const originalEnd = new Date(
								occurrence.occurrence_end_at
							);
							const durationMs =
								originalEnd.getTime() -
								originalStart.getTime();

							const newStart = new Date(
								Date.UTC(
									newDate.getFullYear(),
									newDate.getMonth(),
									newDate.getDate(),
									originalStart.getUTCHours(),
									originalStart.getUTCMinutes(),
									0,
									0
								)
							);
							const newEnd = new Date(
								newStart.getTime() + durationMs
							);

							await rescheduleOccurrence({
								occurrenceId: occurrence.id,
								jobId: occurrence.job_obj.id,
								input: {
									new_start_at:
										newStart.toISOString(),
									new_end_at: newEnd.toISOString(),
								},
							});

							fcEvent.setStart(newStart);
							fcEvent.setEnd(newEnd);

							// Update the extended props with new dates so popup shows correct info
							const updatedData = {
								...occurrence,
								occurrence_start_at:
									newStart.toISOString(),
								occurrence_end_at:
									newEnd.toISOString(),
							};
							fcEvent.setExtendedProp(
								"data",
								updatedData
							);

							// Update the title to reflect new time
							fcEvent.setProp(
								"title",
								`${formatTime(newStart)} ${occurrence.job_obj.name} (recurring)`
							);
						}
					} catch (err) {
						console.error("Failed to update event date", err);
						info.revert();
					}
				}}
				eventClick={(info) => {
					const eventType = info.event.extendedProps.type;
					const eventData = info.event.extendedProps.data;

					if (!eventData) return;

					const rect = info.el.getBoundingClientRect();
					const eventCenterX = rect.left + rect.width / 2;
					const eventCenterY = rect.top + rect.height / 2;
					const screenCenterX = window.innerWidth / 2;

					const POPUP_WIDTH = 380;
					const POPUP_HEIGHT = 300;

					const placeRight = eventCenterX < screenCenterX;

					const left = placeRight
						? rect.right + 12
						: rect.left - POPUP_WIDTH - 12;

					const top = Math.max(
						10,
						Math.min(
							eventCenterY - POPUP_HEIGHT / 2,
							window.innerHeight - POPUP_HEIGHT - 10
						)
					);

					setPopupPos({ top, left });
					setSelectedEvent({
						id: info.event.id,
						type: eventType,
						data: eventData,
					});
				}}
				dayCellDidMount={(arg) => {
					const dateStr = arg.date.toISOString().split("T")[0];
					const count = occurrenceCountByDay[dateStr];

					if (count && showOccurrences) {
						const badge = document.createElement("div");
						badge.className = "occurrence-badge";
						badge.textContent = count.toString();
						badge.setAttribute(
							"data-tooltip",
							`${count} pending occurrence${count !== 1 ? "s" : ""}`
						);

						const dayOfWeek = arg.date.getDay();
						const isRightmostColumn = dayOfWeek === 6; // Saturday is last column

						// Also check if it's the last visible column (in case of custom views)
						const allDayCells =
							arg.el.parentElement?.parentElement?.querySelectorAll(
								".fc-daygrid-day"
							) || [];
						let isLastVisibleColumn = false;
						if (allDayCells.length > 0) {
							const lastCell =
								allDayCells[allDayCells.length - 1];
							isLastVisibleColumn = arg.el === lastCell;
						}

						// Apply rightmost class if in rightmost column
						if (isRightmostColumn || isLastVisibleColumn) {
							badge.classList.add("occ-tip-rightmost");
						}

						// On hover, detect if we're near the viewport edges for additional adjustment
						const handleEnter = () => {
							// Remove edge-based classes first
							badge.classList.remove(
								"occ-tip-left",
								"occ-tip-right"
							);

							const rect = badge.getBoundingClientRect();
							const EST_TOOLTIP_WIDTH = 220;
							const PAD = 10;

							const badgeCenterX =
								rect.left + rect.width / 2;
							const tooltipLeft =
								badgeCenterX -
								EST_TOOLTIP_WIDTH / 2;
							const tooltipRight =
								badgeCenterX +
								EST_TOOLTIP_WIDTH / 2;

							// Only add edge classes if not already handled by rightmost column logic
							if (
								!badge.classList.contains(
									"occ-tip-rightmost"
								)
							) {
								if (
									tooltipRight >
									window.innerWidth - PAD
								) {
									badge.classList.add(
										"occ-tip-right"
									);
									return;
								}

								if (tooltipLeft < PAD) {
									badge.classList.add(
										"occ-tip-left"
									);
								}
							}
						};

						const handleLeave = () => {
							badge.classList.remove(
								"occ-tip-left",
								"occ-tip-right"
							);
						};

						badge.addEventListener("mouseenter", handleEnter);
						badge.addEventListener("mouseleave", handleLeave);

						const dayTop =
							arg.el.querySelector(".fc-daygrid-day-top");
						if (dayTop) {
							dayTop.appendChild(badge);
						}
					}
				}}
			/>

			{/* Hover Popup */}
			{selectedEvent && popupPos && (
				<div
					ref={popupRef}
					className="fixed z-[6000] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 text-sm"
					style={{
						top: popupPos.top,
						left: popupPos.left,
						minWidth: "380px",
					}}
				>
					{selectedEvent.type === "visit" ? (
						<>
							{(() => {
								const visit =
									selectedEvent.data as VisitWithJob;
								return (
									<>
										<div className="flex items-start justify-between mb-3">
											<h2 className="text-xl font-bold text-white">
												{visit.name ||
													visit
														.job_obj
														.name}
											</h2>
											<span
												className="inline-block w-3 h-3 rounded-full"
												style={{
													backgroundColor:
														getStatusColor(
															visit.status
														),
												}}
											/>
										</div>

										<div className="space-y-2 text-zinc-300">
											<p>
												<strong className="text-zinc-400">
													Client:
												</strong>{" "}
												{visit
													.job_obj
													.client
													?.name ||
													"Unassigned"}
											</p>

											<p>
												<strong className="text-zinc-400">
													Status:
												</strong>{" "}
												{
													visit.status
												}
											</p>

											<p>
												<strong className="text-zinc-400">
													Priority:
												</strong>{" "}
												<span
													className="inline-block w-2 h-2 rounded-full mr-1"
													style={{
														backgroundColor:
															getPriorityColor(
																visit
																	.job_obj
																	.priority
															),
													}}
												/>
												{visit
													.job_obj
													.priority ||
													"normal"}
											</p>

											<p>
												<strong className="text-zinc-400">
													Schedule:
												</strong>{" "}
												{formatConstraintInfo(
													visit
												)}
											</p>

											<p>
												<strong className="text-zinc-400">
													Date:
												</strong>{" "}
												{formatDate(
													visit.scheduled_start_at
												)}
											</p>

											{visit.visit_techs &&
												visit
													.visit_techs
													.length >
													0 && (
													<p>
														<strong className="text-zinc-400">
															Technicians:
														</strong>{" "}
														{visit.visit_techs
															.map(
																(
																	vt
																) =>
																	vt
																		.tech
																		.name
															)
															.join(
																", "
															)}
													</p>
												)}

											{visit
												.job_obj
												.address && (
												<p>
													<strong className="text-zinc-400">
														Address:
													</strong>{" "}
													{
														visit
															.job_obj
															.address
													}
												</p>
											)}

											{visit.description && (
												<p>
													<strong className="text-zinc-400">
														Description:
													</strong>{" "}
													{
														visit.description
													}
												</p>
											)}
										</div>

										<button
											className="w-full mt-4 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
											onClick={() => {
												navigate(
													`/dispatch/jobs/${visit.job_obj.id}/visits/${visit.id}`
												);
												setSelectedEvent(
													null
												);
											}}
										>
											<ExternalLink
												size={
													14
												}
											/>
											View Visit
											Details
										</button>
									</>
								);
							})()}
						</>
					) : (
						<>
							{(() => {
								const occurrence =
									selectedEvent.data as OccurrenceWithPlan;
								return (
									<>
										<div className="flex items-start justify-between mb-3">
											<div>
												<h2 className="text-xl font-bold text-white">
													{
														occurrence
															.job_obj
															.name
													}
												</h2>
												<p className="text-xs text-purple-400 mt-1">
													Recurring
													Plan
													Occurrence
												</p>
											</div>
											<span
												className="inline-block w-3 h-3 rounded-full"
												style={{
													backgroundColor:
														"#6b7280",
												}}
											/>
										</div>

										<div className="space-y-2 text-zinc-300">
											<p>
												<strong className="text-zinc-400">
													Client:
												</strong>{" "}
												{occurrence
													.job_obj
													.client
													?.name ||
													"Unassigned"}
											</p>

											<p>
												<strong className="text-zinc-400">
													Status:
												</strong>{" "}
												{
													occurrence.status
												}
											</p>

											<p>
												<strong className="text-zinc-400">
													Priority:
												</strong>{" "}
												<span
													className="inline-block w-2 h-2 rounded-full mr-1"
													style={{
														backgroundColor:
															getPriorityColor(
																occurrence
																	.plan
																	.priority
															),
													}}
												/>
												{occurrence
													.plan
													.priority ||
													"normal"}
											</p>

											<p>
												<strong className="text-zinc-400">
													Date:
												</strong>{" "}
												{formatDate(
													occurrence.occurrence_start_at
												)}
											</p>

											<p>
												<strong className="text-zinc-400">
													Time:
												</strong>{" "}
												{formatTime(
													occurrence.occurrence_start_at
												)}{" "}
												-{" "}
												{formatTime(
													occurrence.occurrence_end_at
												)}
											</p>

											{occurrence
												.job_obj
												.address && (
												<p>
													<strong className="text-zinc-400">
														Address:
													</strong>{" "}
													{
														occurrence
															.job_obj
															.address
													}
												</p>
											)}

											{occurrence
												.plan
												.description && (
												<p>
													<strong className="text-zinc-400">
														Description:
													</strong>{" "}
													{
														occurrence
															.plan
															.description
													}
												</p>
											)}
										</div>

										<div className="flex gap-2 mt-4">
											<button
												className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
												onClick={() =>
													handleGenerateVisit(
														occurrence
													)
												}
											>
												<Plus
													size={
														14
													}
												/>
												Create
												Visit
											</button>
											<button
												className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
												onClick={() => {
													navigate(
														`/dispatch/recurring-plans/${occurrence.plan.id}`
													);
													setSelectedEvent(
														null
													);
												}}
											>
												<CalendarIcon
													size={
														14
													}
												/>
												View
												Plan
											</button>
										</div>
									</>
								);
							})()}
						</>
					)}

					<button
						className="absolute top-2 right-2 text-zinc-400 hover:text-white transition-colors"
						onClick={() => setSelectedEvent(null)}
					>
						×
					</button>
				</div>
			)}
		</div>
	);
}
