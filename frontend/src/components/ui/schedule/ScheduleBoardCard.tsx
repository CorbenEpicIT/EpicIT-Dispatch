import { getTechInitials } from "./scheduleBoardUtils";
import {
	CARD_BG,
	TEXT_PRIMARY,
	TEXT_CLIENT,
	TEXT_TIME,
	CARD_SHADOW,
	CARD_SHADOW_HOVERED,
	OPEN_ENDED_GRADIENT,
	OPEN_ENDED_DASH,
} from "./scheduleTokens";

export interface AssignedTech {
	id: string;
	name: string;
	color: string;
	inFilter: boolean;
}

interface ScheduleBoardCardProps {
	visitName: string;
	clientName?: string;
	startLabel: string;
	endLabel: string | null;
	openEnded: boolean;
	priorityColor: string;
	assignedTechs: AssignedTech[];
	isHovered?: boolean;
	top: number;
	height: number;
	left: number;
	width: number;
	zIndex: number;
	onClick: () => void;
	onMouseEnter: () => void;
	onMouseLeave: (e: React.MouseEvent) => void;
	onDragStart: (e: React.DragEvent) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const STRIP_W    = 4;   // priority left strip
const H_PAD      = 10;  // 5px left + 5px right padding inside body
const V_PAD      = 8;   // 4px top + 4px bottom padding
const ELEM_GAP   = 3;   // gap between stacked rows
const TITLE_LH   = 12;  // 10px font × 1.2 line-height
const TIME_LH    = 10;  // 8px font × 1.2 line-height
const BUBBLE_SZ  = 16;  // initials circle diameter
const BUBBLE_GAP = 3;
const DOT_SZ     = 7;   // plain colour dot diameter
const DOT_GAP    = 2;

export default function ScheduleBoardCard({
	visitName,
	clientName,
	startLabel,
	endLabel,
	openEnded,
	priorityColor,
	assignedTechs,
	isHovered = false,
	top,
	height,
	left,
	width,
	zIndex,
	onClick,
	onMouseEnter,
	onMouseLeave,
	onDragStart,
}: ScheduleBoardCardProps) {
	// ── Available content area ────────────────────────────────────────────────
	const contentW = width - STRIP_W - H_PAD;   // usable horizontal pixels
	const contentH = height - V_PAD;            // usable vertical pixels

	const n = assignedTechs.length;

	// ── How many bubbles / dots fit in a single row? ──────────────────────────
	// Row width = n×size + (n-1)×gap  →  solved for n: n = floor((w+gap)/(size+gap))
	const bubblesRowW   = n > 0 ? n * (BUBBLE_SZ + BUBBLE_GAP) - BUBBLE_GAP : 0;
	const allBubblesFit = bubblesRowW <= contentW;

	const maxDotsInRow  = n > 0
		? Math.min(n, Math.floor((contentW + DOT_GAP) / (DOT_SZ + DOT_GAP)))
		: 0;

	// ── Decide bubble vs dot ──────────────────────────────────────────────────
	// Use initials bubbles only when every tech's bubble fits in one row AND
	// there is enough height for a sensible column layout with them.
	const minColumnWithBubbles = TITLE_LH + ELEM_GAP + BUBBLE_SZ;
	const useBubbles = allBubblesFit && contentH >= minColumnWithBubbles;

	const techRowH = useBubbles ? BUBBLE_SZ : (n > 0 ? DOT_SZ : 0);

	// ── Decide layout: column stack vs single inline row ─────────────────────
	// Column layout requires at minimum: one title line + gap + tech row.
	const minColumnH   = TITLE_LH + ELEM_GAP + techRowH;
	const useColumn    = n === 0
		? contentH >= TITLE_LH                  // no techs: just need title
		: contentH >= minColumnH;

	// ── Optional rows (only in column mode) ───────────────────────────────────
	// Each optional row is added only if the remaining height still leaves room
	// for the mandatory title line(s) + tech row.
	const mandatory = TITLE_LH + (n > 0 ? ELEM_GAP + techRowH : 0);

	const showTime   = useColumn && (contentH - mandatory) >= TIME_LH + ELEM_GAP;
	const showClient = showTime && !!clientName &&
	                   (contentH - mandatory - TIME_LH - ELEM_GAP) >= TIME_LH + ELEM_GAP;

	// ── How many title lines fit in the remaining height? ────────────────────
	// No hard upper cap — let the title fill whatever space remains above the tech row.
	const optionalH     = (showTime   ? TIME_LH + ELEM_GAP : 0)
	                    + (showClient ? TIME_LH + ELEM_GAP : 0);
	// Open-ended cards reserve bottom padding so techs clear the stripe indicator.
	const openEndedPad  = openEnded ? 6 : 0;
	const titleBudgetH  = contentH - optionalH - (n > 0 ? techRowH + ELEM_GAP : 0) - openEndedPad;
	const titleLines    = useColumn
		? Math.max(1, Math.floor(titleBudgetH / TITLE_LH))
		: 1;

	const timeLabel = endLabel ? `${startLabel}–${endLabel}` : startLabel;

	// ── Inline-mode: how many dots can share the row with the title? ──────────
	// Dots are flexShrink:0; title is flex:1 and will truncate.
	// Cap at what physically fits so no dot is ever clipped.
	const maxDotsInline = Math.max(1, Math.floor((contentW + DOT_GAP) / (DOT_SZ + DOT_GAP)));

	return (
		<div
			draggable
			role="button"
			tabIndex={0}
			onDragStart={onDragStart}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{
				position: "absolute",
				top, left, width, height, zIndex,
				backgroundColor: CARD_BG,
				borderRadius: 4,
				overflow: "hidden",
				cursor: "grab",
				boxSizing: "border-box",
				display: "flex",
				transition: "box-shadow 0.15s ease-out, transform 0.15s ease-out",
				boxShadow: isHovered ? CARD_SHADOW_HOVERED : CARD_SHADOW,
				transform: isHovered ? "translateY(-1px)" : "none",
			}}
		>
			{/* Priority strip */}
			<div style={{ width: STRIP_W, flexShrink: 0, backgroundColor: priorityColor }} />

			{/* Body */}
			<div style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}>

				{/* ── INLINE: single row — title truncated + dots ── */}
				{!useColumn && (
					<div style={{
						display: "flex",
						alignItems: "center",
						height: "100%",
						padding: "0 5px",
						gap: 4,
						overflow: "hidden",
					}}>
						<span style={{
							flex: 1,
							minWidth: 0,
							fontSize: 9,
							fontWeight: 700,
							color: TEXT_PRIMARY,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							lineHeight: 1,
						}}>
							{visitName}
						</span>
						{n > 0 && (
							<TechDots
								techs={assignedTechs}
								max={maxDotsInline}
							/>
						)}
					</div>
				)}

				{/* ── COLUMN: stacked rows ── */}
				{useColumn && (
					<div style={{
						display: "flex",
						flexDirection: "column",
						height: "100%",
						padding: openEnded ? "4px 5px 10px 5px" : "4px 5px",
						gap: ELEM_GAP,
						boxSizing: "border-box",
					}}>
						{/* Title */}
						<span style={{
							fontSize: 10,
							fontWeight: 700,
							color: TEXT_PRIMARY,
							letterSpacing: "-0.01em",
							lineHeight: 1.2,
							overflow: "hidden",
							display: "-webkit-box",
							WebkitBoxOrient: "vertical",
							WebkitLineClamp: titleLines,
						} as React.CSSProperties}>
							{visitName}
						</span>

						{showClient && (
							<span style={{
								fontSize: 9,
								color: TEXT_CLIENT,
								lineHeight: 1.2,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}>
								{clientName}
							</span>
						)}

						{showTime && (
							<span style={{
								fontSize: 9,
								color: TEXT_TIME,
								lineHeight: 1.2,
								whiteSpace: "nowrap",
							}}>
								{timeLabel}
							</span>
						)}

						{/* Push tech row to bottom */}
						{n > 0 && <div style={{ flex: 1 }} />}

						{/* Tech indicators */}
						{n > 0 && (
							useBubbles
								? <TechBubbles techs={assignedTechs} />
								: <TechDots techs={assignedTechs} max={maxDotsInRow} />
						)}
					</div>
				)}

			{/* Open-ended indicator — fade + dashed bottom edge */}
				{openEnded && (
					<>
						<div style={{
							position: "absolute",
							bottom: 0, left: 0, right: 0,
							height: 20,
							background: OPEN_ENDED_GRADIENT,
							pointerEvents: "none",
						}} />
						<div style={{
							position: "absolute",
							bottom: 0, left: 0, right: 0,
							height: 3,
							boxSizing: "border-box",
							borderBottom: `3px dashed ${OPEN_ENDED_DASH}`,
							pointerEvents: "none",
						}} />
					</>
				)}
			</div>
		</div>
	);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TechDots({ techs, max }: { techs: AssignedTech[]; max: number }) {
	const visible  = techs.slice(0, max);
	const overflow = techs.length - visible.length;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: DOT_GAP, flexShrink: 0 }}>
			{visible.map((t) => (
				<span
					key={t.id}
					style={{
						width: DOT_SZ,
						height: DOT_SZ,
						borderRadius: "50%",
						backgroundColor: t.color,
						flexShrink: 0,
						opacity: t.inFilter ? 1 : 0.4,
					}}
				/>
			))}
			{overflow > 0 && (
				<span style={{
					fontSize: 7,
					color: "rgba(255,255,255,0.45)",
					lineHeight: 1,
					flexShrink: 0,
				}}>
					+{overflow}
				</span>
			)}
		</div>
	);
}

function TechBubbles({ techs }: { techs: AssignedTech[] }) {
	return (
		<div style={{ display: "flex", gap: BUBBLE_GAP, flexWrap: "wrap", overflow: "hidden" }}>
			{techs.map((t) => (
				<span
					key={t.id}
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: BUBBLE_SZ,
						height: BUBBLE_SZ,
						borderRadius: "50%",
						fontSize: 7,
						fontWeight: 700,
						flexShrink: 0,
						backgroundColor: t.inFilter ? t.color : `${t.color}22`,
						color: t.inFilter ? "#fff" : t.color,
						border: t.inFilter ? "none" : `1px solid ${t.color}55`,
					}}
				>
					{getTechInitials(t.name)}
				</span>
			))}
		</div>
	);
}
