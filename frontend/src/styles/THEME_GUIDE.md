# Theme Guide

Single source of truth: `src/styles/theme.css` — all color tokens defined in Tailwind v4 `@theme`.

## Token naming convention

Semantic names only. Never literal color names.
- `--color-primary` not `--color-blue-500`
- `--color-error` not `--color-red`
- `--color-border` not `--color-zinc-700`

## Using tokens in components

### Tailwind utilities (preferred)

Tokens in `@theme` auto-generate utility classes:
```css
--color-primary: #3b82f6
```
generates: `bg-primary`, `text-primary`, `border-primary`, `ring-primary`, etc.

```tsx
<button className="bg-primary hover:bg-primary-hover text-text-primary">Save</button>
```

Opacity modifiers work on solid hex tokens:
```tsx
<div className="bg-primary/20 border border-primary/30">...</div>
```
⚠️ Do NOT use opacity modifiers on `rgba()` tokens (already have alpha baked in):
- `bg-primary-bg` ✅ (already rgba)
- `bg-primary-bg/50` ❌ (double-alpha, broken)

### Inline styles (for absolutely-positioned elements, SVG)
```tsx
style={{ color: "var(--color-sched-text-primary)", background: "var(--color-card-bg)" }}
```

### SVG / Recharts
```tsx
<Area stroke="var(--color-chart-primary)" fill="var(--color-chart-primary)" />
<stop stopColor="var(--color-chart-primary)" />
```

### Injected CSS strings (DatePicker, DateRangeFilter)
```typescript
const css = `--rdp-accent-color: var(--color-primary);`
// var() resolves against document :root — works correctly
```

---

## Complete token reference

### Surfaces

| Token | Value | Usage |
|---|---|---|
| `--color-canvas` | `#09090b` | App background / outermost layer |
| `--color-base` | `#18181b` | Page/route content background |
| `--color-surface` | `#27272a` | Card, panel, popover surfaces |
| `--color-surface-raised` | `#3f3f46` | Elevated surfaces, hover states |
| `--color-surface-inset` | `#09090b` | Inset wells, recessed areas |

### Text

| Token | Value | Usage |
|---|---|---|
| `--color-text-primary` | `#ffffff` | Body text, headings |
| `--color-text-secondary` | `#d4d4d8` | Supporting / secondary labels |
| `--color-text-tertiary` | `#a1a1aa` | Tertiary labels, form hints |
| `--color-text-muted` | `#71717a` | Muted / de-emphasized text |
| `--color-text-faint` | `#52525b` | Faint / disabled text |
| `--color-text-inverse` | `#18181b` | Text on light/inverted backgrounds |
| `--color-text-link` | `#3b82f6` | Hyperlink text |
| `--color-text-on-surface` | `#e4e4e7` | Text on tinted schedule surfaces (slightly off-white) |
| `--color-success-bright-text` | `#4ade80` | "Clocked In" / "Completed" text on dark gradient strips |

### Primary (blue)

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#3b82f6` | Primary actions, focus rings, links |
| `--color-primary-hover` | `#2563eb` | Hover state for primary elements |
| `--color-primary-active` | `#1d4ed8` | Pressed/active state |
| `--color-primary-bg` | `rgba(59,130,246,0.20)` | Primary background tint (badges, selection) |
| `--color-primary-bg-subtle` | `rgba(59,130,246,0.10)` | Subtle primary background |
| `--color-primary-bg-dim` | `rgba(59,130,246,0.06)` | Very faint primary background |
| `--color-primary-border` | `rgba(59,130,246,0.30)` | Primary-tinted border |
| `--color-primary-text` | `#93c5fd` | Badge/label text on primary tints |
| `--color-on-primary` | `#ffffff` | Text/icon on filled primary button |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--color-border-subtle` | `#27272a` | Subtle dividers |
| `--color-border` | `#3f3f46` | Default border |
| `--color-border-strong` | `#52525b` | Emphasized border |
| `--color-border-input` | `#505058` | Input field border |
| `--color-border-card` | `#3a3a3f` | Card inset border (sits between `border-subtle` and `border`) |

### Confirm CTA (green action buttons)

| Token | Value | Usage |
|---|---|---|
| `--color-confirm` | `#16a34a` | Confirm/save CTA button fill |
| `--color-confirm-hover` | `#22c55e` | Hover state for confirm button |

### Status: Success

| Token | Value | Usage |
|---|---|---|
| `--color-success` | `#10b981` | Success indicators |
| `--color-success-text` | `#34d399` | Success badge/label text |
| `--color-success-bg` | `rgba(16,185,129,0.15)` | Success background tint |
| `--color-success-border` | `rgba(16,185,129,0.30)` | Success border |

### Status: Error

| Token | Value | Usage |
|---|---|---|
| `--color-error` | `#ef4444` | Error / destructive elements |
| `--color-error-strong` | `#dc2626` | Stronger error emphasis |
| `--color-error-text` | `#f87171` | Error badge/label text |
| `--color-error-bg` | `rgba(239,68,68,0.15)` | Error background tint |
| `--color-error-border` | `rgba(239,68,68,0.30)` | Error border |

### Status: Warning

| Token | Value | Usage |
|---|---|---|
| `--color-warning` | `#f59e0b` | Warning indicators |
| `--color-warning-text` | `#fbbf24` | Warning badge/label text |
| `--color-warning-bg` | `rgba(245,158,11,0.15)` | Warning background tint |
| `--color-warning-border` | `rgba(245,158,11,0.30)` | Warning border |

### Status: Info

| Token | Value | Usage |
|---|---|---|
| `--color-info` | `#06b6d4` | Info indicators |
| `--color-info-text` | `#67e8f9` | Info badge/label text |
| `--color-info-bg` | `rgba(6,182,212,0.15)` | Info background tint |
| `--color-info-border` | `rgba(6,182,212,0.30)` | Info border |

### Status: Reviewing (purple)

| Token | Value | Usage |
|---|---|---|
| `--color-reviewing` | `#8b5cf6` | Quote "Reviewing" state |
| `--color-reviewing-text` | `#a78bfa` | Reviewing badge/label text |
| `--color-reviewing-bg` | `rgba(139,92,246,0.20)` | Reviewing background tint |
| `--color-reviewing-border` | `rgba(139,92,246,0.30)` | Reviewing border |

### Status: Rejected (rose)

| Token | Value | Usage |
|---|---|---|
| `--color-rejected` | `#f43f5e` | Rejected state |
| `--color-rejected-text` | `#fb7185` | Rejected badge/label text |
| `--color-rejected-bg` | `rgba(244,63,94,0.20)` | Rejected background tint |
| `--color-rejected-border` | `rgba(244,63,94,0.30)` | Rejected border |

### Priority

| Token | Value | Usage |
|---|---|---|
| `--color-priority-emergency` | `#dc2626` | Emergency priority strip |
| `--color-priority-urgent` | `#ea580c` | Urgent priority strip |
| `--color-priority-high` | `#ef4444` | High priority strip |
| `--color-priority-medium` | `#f59e0b` | Medium priority strip |
| `--color-priority-low` | `#10b981` | Low priority strip |
| `--color-priority-default` | `#3b82f6` | Default/none priority strip |

### Visit Status

| Token | Value | Usage |
|---|---|---|
| `--color-visit-scheduled` | `#71717a` | Scheduled status dot/badge |
| `--color-visit-driving` | `#3b82f6` | Driving/en-route status |
| `--color-visit-onsite` | `#f59e0b` | On-site status |
| `--color-visit-inprogress` | `#06b6d4` | In-progress status |
| `--color-visit-paused` | `#f97316` | Paused status |
| `--color-visit-delayed` | `#eab308` | Delayed status |
| `--color-visit-completed` | `#22c55e` | Completed status |
| `--color-visit-cancelled` | `#ef4444` | Cancelled status |

### Visit Card Text Variants

| Token | Value | Usage |
|---|---|---|
| `--color-visit-driving-text` | `#60a5fa` | Driving state label text |
| `--color-visit-completed-dark` | `#166534` | Completed gradient strip (dark green) |
| `--color-visit-delayed-text` | `#fb923c` | Delayed state label text |
| `--color-visit-paused-text` | `#facc15` | Paused state label text |

### Schedule Card Surfaces

| Token | Value | Usage |
|---|---|---|
| `--color-card-bg` | `#2a2d38` | Board visit card background |
| `--color-occurrence-bg` | `#2d2f45` | Occurrence card background |
| `--color-popup-bg` | `#18181b` | Floating popup background |

### Schedule Text Variants

| Token | Value | Usage |
|---|---|---|
| `--color-sched-text-primary` | `#f4f4f5` | Card/popup primary text |
| `--color-sched-text-secondary` | `#d4d4d8` | Popup time/date labels |
| `--color-sched-text-muted` | `rgba(255,255,255,0.38)` | Month mini-card time labels |
| `--color-sched-text-client` | `rgba(255,255,255,0.42)` | Client name in board cards |
| `--color-sched-text-time` | `rgba(255,255,255,0.58)` | Time range label in board cards |
| `--color-sched-text-faint` | `#52525b` | Close buttons, placeholder labels |
| `--color-sched-visit-title` | `#e2e8f0` | Visit card title in month view |
| `--color-sched-occurrence-title` | `#c4b5fd` | Occurrence card title in month view |
| `--color-sched-occurrence-badge` | `#7c3aed` | Occurrence count badge fill |
| `--color-sched-today-bg` | `#1e3a5f` | Today column highlight |
| `--color-sched-status-badge-bg` | `rgba(59,130,246,0.15)` | Visit popup status badge background |
| `--color-sched-status-badge-text` | `#93c5fd` | Visit popup status badge text |
| `--color-sched-open-ended-dash` | `rgba(255,255,255,0.38)` | Dashed bottom border on open-ended cards |

### Calendar (schedule-x)

| Token | Value | Usage |
|---|---|---|
| `--color-cal-month-day` | `#d4d4d8` | Month view day number text |

### Charts

| Token | Value | Usage |
|---|---|---|
| `--color-chart-primary` | `#3b82f6` | Primary data series |
| `--color-chart-success` | `#10b981` | Success/green data series |
| `--color-chart-warning` | `#f59e0b` | Warning/amber data series |
| `--color-chart-info` | `#06b6d4` | Info/cyan data series |
| `--color-chart-error` | `#ef4444` | Error/red data series |
| `--color-chart-fallback` | `#3f3f46` | Unknown/empty chart segment |
| `--color-chart-axis` | `#a1a1aa` | Axis tick labels |
| `--color-chart-hole-bg` | `#121212` | Donut chart center hole background |

### Tech Palette (map/feed — Paul Tol "light", colorblind-safe)

| Token | Value | Usage |
|---|---|---|
| `--color-tech-1` | `#77AADD` | Tech color slot 1 |
| `--color-tech-2` | `#EE8866` | Tech color slot 2 |
| `--color-tech-3` | `#EEDD88` | Tech color slot 3 |
| `--color-tech-4` | `#FFAABB` | Tech color slot 4 |
| `--color-tech-5` | `#99DDFF` | Tech color slot 5 |
| `--color-tech-6` | `#44BB99` | Tech color slot 6 |
| `--color-tech-7` | `#BBCC33` | Tech color slot 7 |
| `--color-tech-8` | `#AAAA00` | Tech color slot 8 |
| `--color-tech-9` | `#DDDDDD` | Tech color slot 9 |
| `--color-tech-unassigned` | `#6b7280` | Fallback for unassigned technician |

### Schedule Board Tech Palette (12 colors)

| Token | Value | Usage |
|---|---|---|
| `--color-sched-tech-1` | `#3b82f6` | Board tech color slot 1 |
| `--color-sched-tech-2` | `#10b981` | Board tech color slot 2 |
| `--color-sched-tech-3` | `#f59e0b` | Board tech color slot 3 |
| `--color-sched-tech-4` | `#8b5cf6` | Board tech color slot 4 |
| `--color-sched-tech-5` | `#ef4444` | Board tech color slot 5 |
| `--color-sched-tech-6` | `#06b6d4` | Board tech color slot 6 |
| `--color-sched-tech-7` | `#f97316` | Board tech color slot 7 |
| `--color-sched-tech-8` | `#ec4899` | Board tech color slot 8 |
| `--color-sched-tech-9` | `#84cc16` | Board tech color slot 9 |
| `--color-sched-tech-10` | `#14b8a6` | Board tech color slot 10 |
| `--color-sched-tech-11` | `#a855f7` | Board tech color slot 11 |
| `--color-sched-tech-12` | `#eab308` | Board tech color slot 12 |

### Mapbox Geocoder

| Token | Value | Usage |
|---|---|---|
| `--color-mapbox-bg` | `#17171a` | Geocoder input background |
| `--color-mapbox-bg-hover` | `#3f3f46` | Geocoder result hover background |
| `--color-mapbox-border` | `#505058` | Geocoder input border |

### Gradient / Special

| Token | Value | Usage |
|---|---|---|
| `--color-gradient-tech-teal` | `#2dd4bf` | Technician stats gradient end (teal) |
| `--color-dispatcher-avatar-to` | `#8b5cf6` | Dispatcher avatar gradient end (violet) |

---

## Adding a new token

1. Add to `@theme` in `theme.css`:
   ```css
   --color-my-new-token: #hexvalue;
   ```
2. Tailwind auto-generates `bg-my-new-token`, `text-my-new-token`, `border-my-new-token`
3. Use in components: `className="bg-my-new-token"` or `style={{ color: "var(--color-my-new-token)" }}`

No config file changes needed.

---

## Dark/light mode architecture

The app is currently dark-only. When light mode is added:

1. `@theme` stays at root level with light palette defaults (`@theme` is compile-time only in Tailwind v4 — cannot be nested in selectors)
2. Add dark overrides as plain CSS:
   ```css
   [data-theme="dark"] {
     --color-base: #18181b;
     --color-surface: #27272a;
     /* ... override all tokens ... */
   }
   ```
3. Toggle: `document.documentElement.dataset.theme = "dark"`
4. No component files change — only `theme.css`

---

## Organization theming (future)

Per-org accent color: inject a `<style>` on a wrapper `<div>` overriding `--color-primary` and related tokens. No component changes needed.

```tsx
<div style={{ "--color-primary": org.accentColor } as React.CSSProperties}>
  {/* entire app subtree */}
</div>
```

---

## Known exceptions

- `CARD_SHADOW` / `CARD_SHADOW_HOVERED` in `scheduleTokens.ts` — box-shadow rgba blacks/whites; universal, not themed
- `OPEN_ENDED_GRADIENT` in `scheduleTokens.ts` — fade-to-black gradient; universal
- `--anim-primary-80`, `--anim-primary-30`, `--anim-surface-flash` in `index.css` — animation intermediates; not Tailwind tokens (intentionally kept outside `@theme`)
- `border: "1px solid #7c3aed55"` in `ScheduleBoard.tsx` — semi-transparent violet border with no exact token match; flagged for a future `--color-occurrence-border` token
- `placeholder-zinc-500` in search inputs — no semantic placeholder token yet; flagged for `--color-placeholder`
