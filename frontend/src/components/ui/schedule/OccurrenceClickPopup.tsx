import { useRef } from "react";
import { Clock, RotateCw } from "lucide-react";
import type { OccurrenceWithPlan } from "./dashboardCalendarUtils";

interface OccurrenceClickPopupProps {
	occurrence: OccurrenceWithPlan;
	/** Caller controls position (position, top, left/right, width, zIndex, etc.) */
	style: React.CSSProperties;
	/** Optional — if provided the popup forwards the ref to its root element */
	popupRef?: React.RefObject<HTMLDivElement | null>;
	isGenerating?: boolean;
	onClose: () => void;
	onViewPlan: () => void;
	onGenerate: () => void;
	/** If provided, a clock icon button is shown to open the reschedule popup */
	onRescheduleClick?: () => void;
}

export default function OccurrenceClickPopup({
	occurrence,
	style,
	popupRef,
	isGenerating = false,
	onClose,
	onViewPlan,
	onGenerate,
	onRescheduleClick,
}: OccurrenceClickPopupProps) {
	const innerRef = useRef<HTMLDivElement>(null);
	const ref = (popupRef ?? innerRef) as React.RefObject<HTMLDivElement | null>;

	const startLabel = new Date(occurrence.occurrence_start_at).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
	const endLabel =
		occurrence.finish_constraint === "when_done"
			? "When Done"
			: new Date(occurrence.occurrence_end_at).toLocaleTimeString([], {
					hour: "numeric",
					minute: "2-digit",
				});

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
				width: 236,
				...style,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					marginBottom: 4,
				}}
			>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontSize: 12,
							fontWeight: 700,
							color: "#f4f4f5",
							lineHeight: 1.3,
							marginBottom: 1,
						}}
					>
						{occurrence.plan.name}
					</div>
					<div
						style={{
							fontSize: 10,
							color: "#a1a1aa",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{occurrence.job_obj?.name}
					</div>
				</div>
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

			{/* Badge */}
			<span
				style={{
					display: "inline-block",
					fontSize: 9,
					fontWeight: 600,
					padding: "1px 6px",
					borderRadius: 10,
					marginBottom: 6,
					backgroundColor: "rgba(139,92,246,0.15)",
					color: "#a78bfa",
					textTransform: "uppercase",
					letterSpacing: "0.04em",
				}}
			>
				Planned
			</span>

			{/* Time */}
			<div style={{ fontSize: 10, color: "#d4d4d8", marginBottom: 10 }}>
				{startLabel} – {endLabel}
			</div>

			{/* Action buttons */}
			<div style={{ display: "flex", gap: 5 }}>
				<button
					onClick={onViewPlan}
					style={{
						flex: 1,
						padding: "6px 0",
						fontSize: 11,
						fontWeight: 600,
						color: "#a78bfa",
						backgroundColor: "rgba(139,92,246,0.12)",
						border: "1px solid rgba(139,92,246,0.25)",
						borderRadius: 5,
						cursor: "pointer",
						fontFamily: "inherit",
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "rgba(139,92,246,0.2)")
					}
					onMouseLeave={(e) =>
						((
							e.currentTarget as HTMLElement
						).style.backgroundColor = "rgba(139,92,246,0.12)")
					}
				>
					View Plan
				</button>
				<button
					onClick={!isGenerating ? onGenerate : undefined}
					disabled={isGenerating}
					style={{
						flex: 1,
						padding: "6px 0",
						fontSize: 11,
						fontWeight: 600,
						color: "#fff",
						backgroundColor: "#3b82f6",
						border: "none",
						borderRadius: 5,
						cursor: isGenerating ? "default" : "pointer",
						fontFamily: "inherit",
						opacity: isGenerating ? 0.55 : 1,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 5,
						transition: "background-color 0.1s, opacity 0.1s",
					}}
					onMouseEnter={(e) => {
						if (!isGenerating)
							(
								e.currentTarget as HTMLElement
							).style.backgroundColor = "#2563eb";
					}}
					onMouseLeave={(e) => {
						(
							e.currentTarget as HTMLElement
						).style.backgroundColor = "#3b82f6";
					}}
				>
					{isGenerating ? (
						<>
							<RotateCw
								size={11}
								className="animate-spin"
							/>{" "}
							Generating…
						</>
					) : (
						"Generate Visit"
					)}
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
