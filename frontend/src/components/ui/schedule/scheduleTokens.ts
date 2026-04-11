/**
 * Design tokens for schedule components.
 *
 * Card-level components (ScheduleBoardCard, MonthMiniCard) and the
 * DashboardCalendar visit popup use inline styles for absolutely-positioned
 * rendering — Tailwind classes are not viable there. These named constants
 * replace ad-hoc hex literals throughout the schedule component tree so that
 * any future palette change is a single-file edit.
 */

// ── Surfaces ─────────────────────────────────────────────────────────────────

/** Visit card and month mini-card background (slightly blue-tinted zinc). */
export const CARD_BG             = "#2a2d38";
/** Occurrence card background (month view) — slightly more purple-tinted. */
export const OCCURRENCE_CARD_BG  = "#2d2f45";
/** Floating popup background — zinc-950. */
export const POPUP_BG            = "#18181b";
/** Secondary surface (e.g., popup secondary button) — zinc-800. */
export const SURFACE             = "#27272a";

// ── Text ─────────────────────────────────────────────────────────────────────

/** Primary text — card titles, popup headings. zinc-100. */
export const TEXT_PRIMARY        = "#f4f4f5";
/** Secondary text — popup time/date labels. zinc-300. */
export const TEXT_SECONDARY      = "#d4d4d8";
/** Muted text — month mini-card time labels. ~38% white. */
export const TEXT_MUTED          = "rgba(255,255,255,0.38)";
/** Client name label in board cards. ~42% white. */
export const TEXT_CLIENT         = "rgba(255,255,255,0.42)";
/** Time range label in board cards. ~58% white. */
export const TEXT_TIME           = "rgba(255,255,255,0.58)";
/** Faint text — close buttons, placeholder labels. zinc-600. */
export const TEXT_FAINT          = "#52525b";
/** Visit card title in month view. slate-200. */
export const VISIT_TITLE         = "#e2e8f0";
/** Occurrence card title in month view. violet-300. */
export const OCCURRENCE_TITLE    = "#c4b5fd";

// ── Status badge (visit popup) ────────────────────────────────────────────────

/** Visit status badge background — blue-500 at 15% opacity. */
export const STATUS_BG           = "rgba(59,130,246,0.15)";
/** Visit status badge text — blue-300. */
export const STATUS_TEXT         = "#93c5fd";

// ── Borders ──────────────────────────────────────────────────────────────────

/** Popup and sticky header border — zinc-700. */
export const BORDER              = "#3f3f46";

// ── Accent ───────────────────────────────────────────────────────────────────

/** Primary action button background — blue-500. */
export const ACCENT_BG           = "#3b82f6";
/** Primary action button hover background — blue-600. */
export const ACCENT_BG_HOVER     = "#2563eb";

// ── Card shadows ─────────────────────────────────────────────────────────────

/** Resting visit card shadow. */
export const CARD_SHADOW         = "0 1px 3px rgba(0,0,0,0.3)";
/** Hovered/active visit card shadow — inset ring + depth. */
export const CARD_SHADOW_HOVERED = "0 0 0 1px rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.5)";

// ── Open-ended indicator ──────────────────────────────────────────────────────

/** Fade gradient at the bottom of open-ended cards. */
export const OPEN_ENDED_GRADIENT = "linear-gradient(to bottom, transparent, rgba(0,0,0,0.32))";
/** Dashed bottom border color for open-ended cards. */
export const OPEN_ENDED_DASH     = "rgba(255,255,255,0.38)";
