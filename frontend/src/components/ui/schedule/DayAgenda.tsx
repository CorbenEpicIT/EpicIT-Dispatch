import type { AgendaGroup, VisitWithJob, OccurrenceWithPlan } from "./dashboardCalendarUtils";
import { formatTime } from "./dashboardCalendarUtils";
import MonthMiniCard from "./MonthMiniCard";
import { getPriorityColor, visitStartLabel } from "./scheduleBoardUtils";

// Mirrors WeekStrip.tsx's local visitTimeLabel/occurrenceTimeLabel, except an
// "anytime" visit falls back to its scheduled_start_at here instead of blanking
// out — the agenda always needs a displayable time, unlike the compact cards.
function visitTimeLabel(v: VisitWithJob): string {
	if (v.arrival_constraint === "anytime") return formatTime(v.scheduled_start_at);
	return visitStartLabel(v);
}

function occurrenceTimeLabel(occ: OccurrenceWithPlan): string {
	const d = new Date(occ.occurrence_start_at);
	if (d.getHours() === 0 && d.getMinutes() === 0) return "";
	return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface DayAgendaProps {
	groups: AgendaGroup[];
	techColorMap: Map<string, string>;
	onVisitClick: (visit: VisitWithJob, rect: DOMRect) => void;
	onVisitDragStart: (e: React.DragEvent, visit: VisitWithJob) => void;
	onOccurrenceClick: (occ: OccurrenceWithPlan, rect: DOMRect) => void;
	onOccurrenceDragStart: (e: React.DragEvent, occ: OccurrenceWithPlan) => void;
	onDragEnd: () => void;
	onOpenFullSchedule: () => void;
    sortMode: "tech" | "time";
    onSortModeChange: (mode: "tech" | "time") => void;
}

export default function DayAgenda({
	groups,
	techColorMap,
	onVisitClick,
	onVisitDragStart,
	onOccurrenceClick,
	onOccurrenceDragStart,
	onDragEnd,
	onOpenFullSchedule,
    sortMode,
    onSortModeChange
}: DayAgendaProps) {
	return (
		<div>
            <div className="m-2">
                <div className="flex items-center justify-between gap-2">
                    <button className="text-xs font-medium hover:cursor-pointer hover:bg-surface-raised px-2 py-1 border border-border-subtle rounded-md" onClick={() => onSortModeChange(sortMode === "time" ? "tech" : "time")}>
                        Sort by {sortMode === "time" ? "Technician" : "Time"}
                    </button>
                    <button className="text-primary text-xs font-medium hover:cursor-pointer hover:underline shrink-0" onClick={onOpenFullSchedule}>
                        Open full schedule →
                    </button>
                </div>

                {groups.map((ag, i) => {
                    if (sortMode === "tech") {
                        return (
                            <div key={ag.techId + "-" + i} >
                                <div className="py-1">
                                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ag.color }} /> {ag.techName}
                                    <p className="text-text-muted text-xs">{ag.items.length} visits</p>
                                </div>
                                {ag.items.map((i) => {
                                    if (i.type === "visit") {
                                        const v = i.item;
                                        const techs = v.visit_techs.map((vt) => ({
                                            id: vt.tech_id,
                                            color: techColorMap.get(vt.tech_id) ?? "var(--color-tech-unassigned)",
                                        }));
                                        return (
                                            <MonthMiniCard
                                                key={ag.techId + " " + v.id}
                                                visitName={v.job_obj?.name ?? "Visit"}
                                                priorityColor={getPriorityColor(v.job_obj?.priority)}
                                                timeLabel={visitTimeLabel(v)}
                                                techs={techs}
                                                maxLines={2}
                                                size="lg"
                                                onDragStart={(e) => onVisitDragStart(e, v)}
                                                onDragEnd={onDragEnd}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                    onVisitClick(v, rect);
                                                }}
                                            />
                                        );
                                    }
                                    const occ = i.item;
                                    return (
                                        <MonthMiniCard
                                            key={ag.techId + " " + occ.id}
                                            visitName={occ.job_obj?.name ?? "Recurring"}
                                            priorityColor={getPriorityColor(occ.job_obj?.priority)}
                                            timeLabel={occurrenceTimeLabel(occ)}
                                            techs={[]}
                                            maxLines={2}
                                            size="lg"
                                            isOccurrence
                                            onDragStart={(e) => onOccurrenceDragStart(e, occ)}
                                            onDragEnd={onDragEnd}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                onOccurrenceClick(occ, rect);
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        );
                    } else if (sortMode === "time") {
                        return (
                            <div key={ag.techId + "-" + i} >
                                <div className="py-1">
                                    <p className="text-text-muted text-xs">{ag.items.length} visits</p>
                                </div>
                                {ag.items.map((i) => {
                                    if (i.type === "visit") {
                                        const v = i.item;
                                        const techs = v.visit_techs.map((vt) => ({
                                            id: vt.tech_id,
                                            color: techColorMap.get(vt.tech_id) ?? "var(--color-tech-unassigned)",
                                        }));
                                        return (
                                            <MonthMiniCard
                                                key={ag.techId + " " + v.id}
                                                visitName={v.job_obj?.name ?? "Visit"}
                                                priorityColor={getPriorityColor(v.job_obj?.priority)}
                                                timeLabel={visitTimeLabel(v)}
                                                techs={techs}
                                                maxLines={2}
                                                size="lg"
                                                onDragStart={(e) => onVisitDragStart(e, v)}
                                                onDragEnd={onDragEnd}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                    onVisitClick(v, rect);
                                                }}
                                            />
                                        );
                                    }
                                    const occ = i.item;
                                    return (
                                        <MonthMiniCard
                                            key={ag.techId + " " + occ.id}
                                            visitName={occ.job_obj?.name ?? "Recurring"}
                                            priorityColor={getPriorityColor(occ.job_obj?.priority)}
                                            timeLabel={occurrenceTimeLabel(occ)}
                                            techs={[]}
                                            maxLines={2}
                                            size="lg"
                                            isOccurrence
                                            onDragStart={(e) => onOccurrenceDragStart(e, occ)}
                                            onDragEnd={onDragEnd}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                onOccurrenceClick(occ, rect);
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        );
                    }
                })}
            </div>
		</div>
	);
}
