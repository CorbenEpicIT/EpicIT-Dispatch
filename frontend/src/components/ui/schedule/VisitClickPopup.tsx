import { useRef } from "react";
import { Clock } from "lucide-react";
import type { VisitWithJob } from "./dashboardCalendarUtils";
import type { Technician } from "../../../types/technicians";
import { visitStartLabel, visitEndLabel } from "./scheduleBoardUtils";

interface VisitClickPopupProps {
	visit: VisitWithJob;
	/** Caller controls position (position, top, left/right, width, zIndex, etc.) */
	style: React.CSSProperties;
	technicians: Technician[];
	techColorMap: Map<string, string>;
	/** Optional — if provided the popup forwards the ref to its root element */
	popupRef?: React.RefObject<HTMLDivElement | null>;
	onClose: () => void;
	onViewVisit: () => void;
	onViewJob: () => void;
	/** If provided, a clock icon button is shown to open the reschedule popup */
	onRescheduleClick?: () => void;
}

export default function VisitClickPopup({
	visit,
	style,
	technicians,
	techColorMap,
	popupRef,
	onClose,
	onViewVisit,
	onViewJob,
	onRescheduleClick,
}: VisitClickPopupProps) {
	const innerRef = useRef<HTMLDivElement>(null);
	const ref = (popupRef ?? innerRef) as React.RefObject<HTMLDivElement | null>;

	const timeStart = visitStartLabel(visit);
	const timeLabel =
		visit.finish_constraint !== "when_done"
			? `${timeStart} – ${visitEndLabel(visit)}`
			: `${timeStart} · finish when done`;

	return (
		<div
			ref={ref}
			style={{
				zIndex: 1000,
				backgroundColor: "var(--color-popup-bg)",
				border: "1px solid var(--color-border)",
				borderRadius: 8,
				boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
				padding: "10px 12px",
				fontFamily: "inherit",
				width: 224,
				...style,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: 6,
				}}
			>
				<span
					style={{
						fontSize: 12,
						fontWeight: 700,
						color: "var(--color-sched-text-primary)",
						lineHeight: 1.3,
						flex: 1,
					}}
				>
					{visit.job_obj?.name}
				</span>
				<button
					aria-label="Close"
					onClick={onClose}
					style={{
						fontSize: 16,
						color: "var(--color-text-faint)",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: "0 0 0 6px",
						lineHeight: 1,
						transition: "color 0.1s",
					}}
					onMouseEnter={(e) =>
						((e.currentTarget as HTMLElement).style.color =
							"var(--color-text-tertiary)")
					}
					onMouseLeave={(e) =>
						((e.currentTarget as HTMLElement).style.color =
							"var(--color-text-faint)")
					}
				>
					×
				</button>
			</div>

			{/* Status badge */}
			<span
				style={{
					display: "inline-block",
					fontSize: 9,
					fontWeight: 600,
					padding: "1px 6px",
					borderRadius: 10,
					marginBottom: 6,
					backgroundColor: "var(--color-sched-status-badge-bg)",
					color: "var(--color-sched-status-badge-text)",
					textTransform: "uppercase",
					letterSpacing: "0.04em",
				}}
			>
				{visit.status}
			</span>

			{/* Time */}
			<div style={{ fontSize: 10, color: "var(--color-sched-text-secondary)", marginBottom: 8 }}>
				{timeLabel}
			</div>

			{/* Tech pills */}
			{(visit.visit_techs?.length ?? 0) > 0 && (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 4,
						marginBottom: 10,
					}}
				>
					{visit.visit_techs!.map((vt) => {
						const color =
							techColorMap.get(vt.tech_id) ?? "var(--color-tech-unassigned)";
						const name =
							technicians.find((t) => t.id === vt.tech_id)
								?.name ?? vt.tech_id;
						return (
							<span
								key={vt.tech_id}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 3,
									fontSize: 9,
									color: "var(--color-text-on-surface)",
									backgroundColor:
										color + "33",
									border: `1px solid ${color}55`,
									borderRadius: 10,
									padding: "1px 6px",
								}}
							>
								<span
									style={{
										width: 5,
										height: 5,
										borderRadius: "50%",
										backgroundColor:
											color,
									}}
								/>
								{name}
							</span>
						);
					})}
				</div>
			)}

			{/* Action buttons */}
			<div style={{ display: "flex", gap: 5 }}>
				<button
					onClick={onViewVisit}
					style={{
						flex: 1,
						padding: "6px 0",
						fontSize: 11,
						fontWeight: 600,
						color: "#fff",
						backgroundColor: "var(--color-primary)",
						border: "none",
						borderRadius: 5,
						cursor: "pointer",
						fontFamily: "inherit",
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "var(--color-primary-hover)")
					}
					onMouseLeave={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "var(--color-primary)")
					}
				>
					View Visit
				</button>
				<button
					onClick={onViewJob}
					style={{
						flex: 1,
						padding: "6px 0",
						fontSize: 11,
						fontWeight: 600,
						color: "var(--color-text-tertiary)",
						backgroundColor: "var(--color-surface)",
						border: "1px solid var(--color-border)",
						borderRadius: 5,
						cursor: "pointer",
						fontFamily: "inherit",
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "var(--color-border)")
					}
					onMouseLeave={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "var(--color-surface)")
					}
				>
					View Job
				</button>
				{onRescheduleClick && (
					<button
						onClick={onRescheduleClick}
						title="Edit scheduled time"
						style={{
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							width: 28,
							flexShrink: 0,
							padding: 0,
							color: "var(--color-text-muted)",
							backgroundColor: "var(--color-surface)",
							border: "1px solid var(--color-border)",
							borderRadius: 5,
							cursor: "pointer",
							transition: "color 0.1s, background-color 0.1s",
						}}
						onMouseEnter={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "var(--color-sched-text-secondary)";
							(
								e.currentTarget as HTMLElement
							).style.backgroundColor = "var(--color-border)";
						}}
						onMouseLeave={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "var(--color-text-muted)";
							(
								e.currentTarget as HTMLElement
							).style.backgroundColor = "var(--color-surface)";
						}}
					>
						<Clock size={12} />
					</button>
				)}
			</div>
		</div>
	);
}
