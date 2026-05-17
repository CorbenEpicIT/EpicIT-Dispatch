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
export const CARD_BG             = "var(--color-card-bg)";
/** Occurrence card background (month view) — slightly more purple-tinted. */
export const OCCURRENCE_CARD_BG  = "var(--color-occurrence-bg)";
/** Floating popup background — zinc-950. */
export const POPUP_BG            = "var(--color-popup-bg)";
/** Secondary surface (e.g., popup secondary button) — zinc-800. */
export const SURFACE             = "var(--color-surface)";

// ── Text ─────────────────────────────────────────────────────────────────────

/** Primary text — card titles, popup headings. zinc-100. */
export const TEXT_PRIMARY        = "var(--color-sched-text-primary)";
/** Secondary text — popup time/date labels. zinc-300. */
export const TEXT_SECONDARY      = "var(--color-sched-text-secondary)";
/** Muted text — month mini-card time labels. ~38% white. */
export const TEXT_MUTED          = "var(--color-sched-text-muted)";
/** Client name label in board cards. ~42% white. */
export const TEXT_CLIENT         = "var(--color-sched-text-client)";
/** Time range label in board cards. ~58% white. */
export const TEXT_TIME           = "var(--color-sched-text-time)";
/** Faint text — close buttons, placeholder labels. zinc-600. */
export const TEXT_FAINT          = "var(--color-sched-text-faint)";
/** Visit card title in month view. slate-200. */
export const VISIT_TITLE         = "var(--color-sched-visit-title)";
/** Occurrence card title in month view. violet-300. */
export const OCCURRENCE_TITLE    = "var(--color-sched-occurrence-title)";

// ── Status badge (visit popup) ────────────────────────────────────────────────

/** Visit status badge background — blue-500 at 15% opacity. */
export const STATUS_BG           = "var(--color-sched-status-badge-bg)";
/** Visit status badge text — blue-300. */
export const STATUS_TEXT         = "var(--color-sched-status-badge-text)";

// ── Borders ──────────────────────────────────────────────────────────────────

/** Popup and sticky header border — zinc-700. */
export const BORDER              = "var(--color-border)";

// ── Accent ───────────────────────────────────────────────────────────────────

/** Primary action button background — blue-500. */
export const ACCENT_BG           = "var(--color-primary)";
/** Primary action button hover background — blue-600. */
export const ACCENT_BG_HOVER     = "var(--color-primary-hover)";

// ── Card shadows ─────────────────────────────────────────────────────────────

/** Resting visit card shadow. */
export const CARD_SHADOW         = "0 1px 3px rgba(0,0,0,0.3)";
/** Hovered/active visit card shadow — inset ring + depth. */
export const CARD_SHADOW_HOVERED = "0 0 0 1px rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.5)";

// ── Open-ended indicator ──────────────────────────────────────────────────────

/** Fade gradient at the bottom of open-ended cards. */
export const OPEN_ENDED_GRADIENT = "linear-gradient(to bottom, transparent, rgba(0,0,0,0.32))";
/** Dashed bottom border color for open-ended cards. */
export const OPEN_ENDED_DASH     = "var(--color-sched-open-ended-dash)";
