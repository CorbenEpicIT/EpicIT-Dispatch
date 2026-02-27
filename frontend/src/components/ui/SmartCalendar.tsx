import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { Job, JobVisit, UpdateJobVisitInput } from "../../types/jobs";
import { useUpdateJobVisitMutation } from "../../hooks/useJobs";
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
	const [selectedVisit, setSelectedVisit] = useState<VisitWithJob | null>(null);
	const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
	const popupRef = useRef<HTMLDivElement>(null);

	const { mutateAsync: updateVisit } = useUpdateJobVisitMutation();

	// Close popup on outside click
	useEffect(() => {
		function handleMouseDown(e: MouseEvent) {
			if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
				setSelectedVisit(null);
			}
		}
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, []);

	// Extract all visits from all jobs with job info
	const allVisits: VisitWithJob[] = jobs.flatMap((job_obj) => {
		if (!job_obj.visits) return [];
		return job_obj.visits.map((visit: JobVisit) => ({ ...visit, job_obj }));
	});

	function getPriorityColor(priority?: string): string {
		switch (priority?.toLowerCase()) {
			case "high":
				return "#ef4444"; // red
			case "medium":
				return "#f59e0b"; // amber
			case "low":
				return "#10b981"; // green
			case "normal":
			default:
				return "#3b82f6"; // blue
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case "Scheduled":
				return "#3b82f6"; // blue
			case "InProgress":
				return "#f59e0b"; // amber
			case "Completed":
				return "#10b981"; // green
			case "Cancelled":
				return "#ef4444"; // red
			default:
				return "#6b7280"; // gray
		}
	}

	function formatTime(date: Date | string): string {
		const d = typeof date === "string" ? new Date(date) : date;
		return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	}

	function formatDuration(start: Date | string, end: Date | string): string {
		const startDate = typeof start === "string" ? new Date(start) : start;
		const endDate = typeof end === "string" ? new Date(end) : end;
		const diffMs = endDate.getTime() - startDate.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		const hrs = Math.floor(diffMins / 60);
		const mins = diffMins % 60;

		if (hrs === 0) return `${mins}m`;
		if (mins === 0) return `${hrs}h`;
		return `${hrs}h ${mins}m`;
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === "string" ? new Date(date) : date;
		return d.toLocaleDateString([], {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	function formatDateTimeRange(visit: VisitWithJob): string {
		const start = new Date(visit.scheduled_start_at);
		const end = new Date(visit.scheduled_end_at);

		if (visit.schedule_type === "all_day") {
			return "All Day";
		} else if (
			visit.schedule_type === "window" &&
			visit.arrival_window_start &&
			visit.arrival_window_end
		) {
			return `${formatTime(visit.arrival_window_start)} - ${formatTime(visit.arrival_window_end)} (window)`;
		} else {
			return `${formatTime(start)} - ${formatTime(end)}`;
		}
	}

	// Sort visits: all-day visits first, then by start time
	const sortedVisits = [...allVisits].sort((a, b) => {
		const isAllDayA = a.schedule_type === "all_day";
		const isAllDayB = b.schedule_type === "all_day";

		if (isAllDayA && !isAllDayB) return -1;
		if (!isAllDayA && isAllDayB) return 1;

		const timeA = new Date(a.scheduled_start_at).getTime();
		const timeB = new Date(b.scheduled_start_at).getTime();
		return timeA - timeB;
	});

	const events = sortedVisits.map((visit, index) => {
		const startDate = new Date(visit.scheduled_start_at);
		const dateStr = startDate.toISOString().split("T")[0];
		const isAllDay = visit.schedule_type === "all_day";

		// Format title based on schedule type
		const title = isAllDay
			? visit.job_obj.name
			: `${formatTime(visit.scheduled_start_at)} ${visit.job_obj.name}`;

		return {
			id: visit.id,
			title: title,
			start: dateStr,
			allDay: true,
			backgroundColor: getStatusColor(visit.status),
			borderColor: getPriorityColor(visit.job_obj.priority),
			extendedProps: {
				sortOrder: index, // Use index from sorted array
				isAllDay: isAllDay,
				visit: visit,
			},
		};
	});

	return (
		<div className="relative">
			<FullCalendar
				plugins={[dayGridPlugin, interactionPlugin]}
				initialView={view === "week" ? "dayGridWeek" : "dayGridMonth"}
				headerToolbar={toolbar || false}
				views={{
					dayGridWeek: { type: "dayGrid", duration: { days: 7 } },
					dayGridMonth: {},
				}}
				events={events}
				height="auto"
				editable={true}
				eventStartEditable={true}
				eventDurationEditable={false}
				eventOrder="sortOrder,title" // Sort by our custom order, then title
				eventDrop={async (info) => {
					const visitId = info.event.id;
					const newDate = info.event.start;

					if (!newDate) {
						info.revert();
						return;
					}

					try {
						const visit = allVisits.find(
							(v) => v.id === visitId
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

						// Calculate duration to maintain it
						const durationMs =
							originalEnd.getTime() -
							originalStart.getTime();

						let newStart: Date;
						let newEnd: Date;

						// For all-day visits, use date only (no time)
						if (visit.schedule_type === "all_day") {
							newStart = new Date(
								Date.UTC(
									newDate.getFullYear(),
									newDate.getMonth(),
									newDate.getDate(),
									0,
									0,
									0,
									0
								)
							);
							newEnd = new Date(
								newStart.getTime() + durationMs
							);
						} else {
							// For timed visits, preserve the original time
							newStart = new Date(
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
							newEnd = new Date(
								newStart.getTime() + durationMs
							);
						}

						// Also update window times if they exist
						const updates: UpdateJobVisitInput = {
							scheduled_start_at: newStart.toISOString(),
							scheduled_end_at: newEnd.toISOString(),
						};

						if (
							visit.arrival_window_start &&
							visit.arrival_window_end
						) {
							const windowStart = new Date(
								visit.arrival_window_start
							);
							const windowEnd = new Date(
								visit.arrival_window_end
							);

							updates.arrival_window_start = new Date(
								Date.UTC(
									newDate.getFullYear(),
									newDate.getMonth(),
									newDate.getDate(),
									windowStart.getUTCHours(),
									windowStart.getUTCMinutes(),
									0,
									0
								)
							).toISOString();

							updates.arrival_window_end = new Date(
								Date.UTC(
									newDate.getFullYear(),
									newDate.getMonth(),
									newDate.getDate(),
									windowEnd.getUTCHours(),
									windowEnd.getUTCMinutes(),
									0,
									0
								)
							).toISOString();
						}

						await updateVisit({
							id: visitId,
							data: updates,
						});
					} catch (err) {
						console.error("Failed to update visit date", err);
						info.revert();
					}
				}}
				eventClick={(info) => {
					const visit = allVisits.find((v) => v.id === info.event.id);
					if (!visit) return;

					const rect = info.el.getBoundingClientRect();
					const eventCenterX = rect.left + rect.width / 2;
					const eventCenterY = rect.top + rect.height / 2;
					const screenCenterX = window.innerWidth / 2;

					const POPUP_WIDTH = 350;
					const POPUP_HEIGHT = 250;

					const placeRight = eventCenterX < screenCenterX;

					const left = placeRight
						? rect.right + 12
						: rect.left - POPUP_WIDTH - 12;

					const top = eventCenterY - POPUP_HEIGHT / 2;

					setPopupPos({ top, left });
					setSelectedVisit(visit);
				}}
			/>

			{selectedVisit && popupPos && (
				<div
					ref={popupRef}
					className="fixed z-[6000] bg-zinc-900 border border-zinc-700
                     rounded-lg shadow-xl p-4 text-sm"
					style={{
						top: popupPos.top,
						left: popupPos.left,
						minWidth: "350px",
					}}
				>
					<h2 className="text-xl font-bold mb-3 text-gray-200">
						{selectedVisit.job_obj.name}
					</h2>

					<div className="space-y-2 text-gray-300">
						<p>
							<strong className="text-gray-400">
								Client:
							</strong>{" "}
							{selectedVisit.job_obj.client
								? selectedVisit.job_obj.client.name
								: "Unassigned"}
						</p>

						<p>
							<strong className="text-gray-400">
								Visit Status:
							</strong>{" "}
							<span
								className="inline-block w-2 h-2 rounded-full mr-1"
								style={{
									backgroundColor:
										getStatusColor(
											selectedVisit.status
										),
								}}
							/>
							{selectedVisit.status}
						</p>

						<p>
							<strong className="text-gray-400">
								Job Status:
							</strong>{" "}
							{selectedVisit.job_obj.status}
						</p>

						<p>
							<strong className="text-gray-400">
								Priority:
							</strong>{" "}
							<span
								className="inline-block w-2 h-2 rounded-full mr-1"
								style={{
									backgroundColor:
										getPriorityColor(
											selectedVisit
												.job_obj
												.priority
										),
								}}
							/>
							{selectedVisit.job_obj.priority || "normal"}
						</p>

						<p>
							<strong className="text-gray-400">
								Schedule:
							</strong>{" "}
							{formatDateTimeRange(selectedVisit)}
						</p>

						<p>
							<strong className="text-gray-400">
								Date:
							</strong>{" "}
							{formatDate(
								selectedVisit.scheduled_start_at
							)}
						</p>

						<p>
							<strong className="text-gray-400">
								Duration:
							</strong>{" "}
							{formatDuration(
								selectedVisit.scheduled_start_at,
								selectedVisit.scheduled_end_at
							)}
						</p>

						{selectedVisit.visit_techs &&
							selectedVisit.visit_techs.length > 0 && (
								<p>
									<strong className="text-gray-400">
										Technicians:
									</strong>{" "}
									{selectedVisit.visit_techs
										.map(
											(vt) =>
												vt
													.tech
													.name
										)
										.join(", ")}
								</p>
							)}

						{selectedVisit.job_obj.address && (
							<p>
								<strong className="text-gray-400">
									Address:
								</strong>{" "}
								{selectedVisit.job_obj.address}
							</p>
						)}

						{selectedVisit.job_obj.description && (
							<p>
								<strong className="text-gray-400">
									Description:
								</strong>{" "}
								{selectedVisit.job_obj.description}
							</p>
						)}

						{selectedVisit.actual_start_at && (
							<p>
								<strong className="text-gray-400">
									Started:
								</strong>{" "}
								{formatTime(
									selectedVisit.actual_start_at
								)}
							</p>
						)}

						{selectedVisit.actual_end_at && (
							<p>
								<strong className="text-gray-400">
									Completed:
								</strong>{" "}
								{formatTime(
									selectedVisit.actual_end_at
								)}
							</p>
						)}
					</div>

					<div className="flex justify-end mt-4">
						<button
							className="px-3 py-1.5 rounded-sm border border-zinc-700 
                         hover:bg-zinc-800 text-sm text-gray-200 transition-colors"
							onClick={() => setSelectedVisit(null)}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
