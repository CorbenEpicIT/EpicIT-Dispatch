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
				backgroundColor: "#18181b",
				border: "1px solid #3f3f46",
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
						color: "#f4f4f5",
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
						color: "#52525b",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: "0 0 0 6px",
						lineHeight: 1,
						transition: "color 0.1s",
					}}
					onMouseEnter={(e) =>
						((e.currentTarget as HTMLElement).style.color =
							"#a1a1aa")
					}
					onMouseLeave={(e) =>
						((e.currentTarget as HTMLElement).style.color =
							"#52525b")
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
					backgroundColor: "rgba(59,130,246,0.15)",
					color: "#93c5fd",
					textTransform: "uppercase",
					letterSpacing: "0.04em",
				}}
			>
				{visit.status}
			</span>

			{/* Time */}
			<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 8 }}>
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
							techColorMap.get(vt.tech_id) ?? "#6b7280";
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
									color: "#e4e4e7",
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
						backgroundColor: "#3b82f6",
						border: "none",
						borderRadius: 5,
						cursor: "pointer",
						fontFamily: "inherit",
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "#2563eb")
					}
					onMouseLeave={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "#3b82f6")
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
						color: "#a1a1aa",
						backgroundColor: "#27272a",
						border: "1px solid #3f3f46",
						borderRadius: 5,
						cursor: "pointer",
						fontFamily: "inherit",
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "#3f3f46")
					}
					onMouseLeave={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "#27272a")
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
							color: "#71717a",
							backgroundColor: "#27272a",
							border: "1px solid #3f3f46",
							borderRadius: 5,
							cursor: "pointer",
							transition: "color 0.1s, background-color 0.1s",
						}}
						onMouseEnter={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "#d4d4d8";
							(
								e.currentTarget as HTMLElement
							).style.backgroundColor = "#3f3f46";
						}}
						onMouseLeave={(e) => {
							(
								e.currentTarget as HTMLElement
							).style.color = "#71717a";
							(
								e.currentTarget as HTMLElement
							).style.backgroundColor = "#27272a";
						}}
					>
						<Clock size={12} />
					</button>
				)}
			</div>
		</div>
	);
}
