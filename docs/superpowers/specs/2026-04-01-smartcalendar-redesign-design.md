# SmartCalendar Redesign — Design Spec

**Date:** 2026-04-01  
**Status:** Approved — ready for implementation planning  
**Visual companion session:** `HVAC/.superpowers/brainstorm/1428-1775069525/content/`

---

## 1. Context & Problem

`SmartCalendar.tsx` currently serves two pages with conflicting needs:

- **DashboardPage** — needs a compact week-at-a-glance calendar (existing day-grid behavior is correct)
- **SchedulePage** — needs a full dispatch board: time-grid, technician visibility, and visual separation of concurrent visits

Both pages use `<SmartCalendar>` today. The component has two significant pain points:

1. **Toolbar hack** — Visit/Occurrence toggle buttons are mounted via `createRoot` injected into FullCalendar's internal DOM nodes in `viewDidMount`. The roots re-render manually in a separate `useEffect`. This is fragile, breaks in React StrictMode, and is impossible to reason about.
2. **Wrong view type for SchedulePage** — A day-grid (all-day event rows) cannot show a dispatcher's time-grid reality: overlapping visits, precise scheduling, per-technician visibility.

---

## 2. Approved Approach — Split into Two Components

**Approach B** was selected: split into `DashboardCalendar` and `ScheduleBoard`.

### File location

```
frontend/src/components/ui/schedule/
  DashboardCalendar.tsx    ← replaces SmartCalendar.tsx (migrated to @schedule-x)
  ScheduleBoard.tsx        ← new custom component
```

`SmartCalendar.tsx` is deleted after migration. Both pages update their imports.

### Page mapping

| Page | Component | View |
|---|---|---|
| `DashboardPage.tsx` | `DashboardCalendar` | Week (day-grid) |
| `SchedulePage.tsx` | `ScheduleBoard` | Time-grid week |

`TechnicianDashboardPage.tsx` also imports SmartCalendar — evaluate separately; likely stays on DashboardCalendar or is removed from scope.

---

## 3. DashboardCalendar

Migrated from `SmartCalendar.tsx` to **`@schedule-x/react`**. All existing behavior is preserved; the toolbar hack and Preact bridge are eliminated.

### Why @schedule-x

FullCalendar v6's `viewDidMount` + `createRoot` toolbar pattern is structurally incompatible with React StrictMode (double-invokes effects → duplicate roots on the same DOM node). `@schedule-x/react` provides named React component slots for both the toolbar and event cards — the toolbar buttons become a plain React component, no DOM injection anywhere.

Occurrence badges (currently using `dayCellDidMount` DOM injection) are migrated to render as a special event type with a custom `dateGridEvent` component styled as a badge — no lifecycle hooks needed.

### Toolbar

Replace `viewDidMount` + `createRoot` injection with `@schedule-x`'s header slots:

```tsx
<ScheduleXCalendar
  calendarApp={cal}
  customComponents={{
    headerContentRightPrepend: DashboardCalendarToolbar,  // Visits + Occurrences toggles + TechFilter
    dateGridEvent: VisitEventCard,
    monthGridEvent: VisitEventCard,
  }}
/>
```

`DashboardCalendarToolbar` is a plain React component with full access to app state via closure. Removes: `visitsRootRef`, `occurrencesRootRef`, `calendarKey`, the secondary `useEffect` re-render, and all `createRoot` calls.

### Occurrence badges

Render occurrence counts as a distinct event type (`type: 'occurrence-badge'`). The custom `dateGridEvent` component detects this type and renders a purple circle badge instead of an event chip. Badge tooltip stays as CSS `::after`.

### Reactive updates

Replace `calendarKey` force-remount with `eventsServicePlugin.set(events)` on data change. No full re-mount required.

### Resize handling

Remove the three `useEffect` resize workarounds — `@schedule-x` handles sizing via CSS. Verify on sidebar-expand scenarios during implementation; re-add a single `ResizeObserver` only if needed.

### Props change

Remove `toolbar?: ToolbarInput` (FullCalendar-specific). Add `technicians: Technician[]` for the tech filter.

### Drag-and-drop

`@schedule-x/drag-and-drop` plugin replaces FullCalendar's `eventDrop`. Existing reschedule logic (API call + revert on failure) ports directly — validate parity during implementation.

### CSS

All 300+ lines of `.fc-*` overrides are replaced with `@schedule-x` theme variables and targeted class overrides. Dark theme tokens are already well-defined from the existing design; this is mechanical translation.

---

## 4. ScheduleBoard

A new **custom React component** — no calendar library. Pure CSS grid + absolute-positioned cards.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ TOOLBAR: [Today ‹ Apr 2026 ›]  [Visits][Occurrences]│
│          TECH [filter]                              │
├────┬────────┬────────┬────────┬────────┬────────────┤
│    │ Mon 31 │ Tue  1 │ Wed  2 │ Thu  3 │  ...       │
├────┼────────┼────────┼────────┼────────┼────────────┤
│7AM │        │        │        │        │            │
│8AM │ [████] │ [████] │        │        │            │
│    │  [████]│        │        │        │            │
│3PM │        │        │        │        │            │
└────┴────────┴────────┴────────┴────────┴────────────┘
```

- CSS grid: `48px gutter + repeat(7, minmax(150px, 1fr))`
- Each hour slot: 56px tall (`SLOT_H = 56`)
- Time range: 7 AM – 5 PM (10 slots)
- Day columns: `position: relative`, `overflow: visible` (cards may slightly peek past edge at high density)

### Refined Cascade — card layout

Each visit is a **fixed-width card** (proportional to viewport: `clamp(72px, 6.8vw, 96px)`). Cards are never stretched to fill the column.

#### Global tech ordering

A global ordering of all technicians is defined once (derived from technician list, e.g. by ID or name). This ordering determines each tech's horizontal position within any day column — consistently, across all 7 days.

#### Per-day positioning

For each day column, only the techs with visits that day are considered ("active techs"). Their relative order from the global ordering is preserved, and they are re-indexed 0…N-1 for that day.

```
LEFT_PAD  = 5px
RIGHT_PAD = 10px   // breathing room from column right border

step = (colWidth - CARD_W - LEFT_PAD - RIGHT_PAD) / (nActiveTechs - 1)

card[i].left  = LEFT_PAD + i * step
card[i].width = CARD_W               // fixed, never changes
```

**Effect:** With 3 active techs, cards spread comfortably across the full column. With 6 active techs, cards compress (larger overlap) but still reach the right edge with the same 10px gap. The rightmost card's right edge always lands `RIGHT_PAD` from the column border.

**With a single active tech:** card sits at `LEFT_PAD`, no step applied.

#### Overlap behavior

Cards from different techs that share the same time window naturally layer (z-order = global tech index). No dynamic width changes. The visible strip of each background card shows its tech color — this is the "cascade" visual.

#### Hover

`mouseenter` → raise card to z-index 30 (front of everything), add drop shadow, `translateY(-1px)`.  
`mouseleave` → restore original z-index and shadow.

No expand/compress animation. Hover simply surfaces the card for full reading.

#### Sorting / z-order

Cards are rendered in global tech index order (lower index rendered first = sits behind). Higher-indexed techs appear on top by default. On hover, any card can be brought to front regardless of index.

### Visit card anatomy

```
┌──────────────────┐  ← fixed width (~88px), background = tech color
│ ┃ John S.        │  ← tech name (bold, 10px)
│ ┃ 8:00–9:30AM   │  ← time range (9px, muted)
│ ┃                │
│ ┃ Williams AC    │  ← job name (9px, dimmer, margin-top:auto)
└──────────────────┘
  ↑ colored left border = job priority color
```

#### Content thresholds (by card height in px)

| Height | Content shown |
|---|---|
| ≥ 48px | Tech name · Time range · Job name |
| 32–47px | Tech name · Time range |
| 20–31px | Tech name only |
| 14–19px | Tech initials centered |
| < 14px | Solid color bar only |

### Now indicator

Red horizontal line + dot at current time on today's column. Set on mount; does not need to tick live for v1.

---

## 5. Tech Filter — Adaptive Pill / Dropdown

Shared behavior for both DashboardCalendar and ScheduleBoard.

### Threshold

- **≤ 5 technicians** → pill row (multi-select)
- **≥ 6 technicians** → custom dropdown (multi-select)

### Pill mode (≤ 5)

All techs rendered as pill buttons in the toolbar. "All" pill is leftmost.

- "All" active by default (empty selection set = show all)
- Click a tech pill: adds to selection; filters events to selected set
- Click an already-selected tech: removes from selection
- If all individual techs are selected: auto-resets to "All"
- Click "All": clears all selections

### Dropdown mode (≥ 6)

A single trigger button in the toolbar ("All technicians" when no filter active).

- Opens a panel with a checkmark list: "All technicians" header row + one row per tech with color dot
- Selecting a tech does **not** close the dropdown (supports multi-select flow)
- Checking all individuals → auto-resets to All
- "All technicians" row click: clears all selections, checks the All row
- Trigger button reflects active state:
  - Neutral: grey border, "All technicians" label
  - Active: blue tint border, dot-stack of selected tech colors (up to 3), label = `"FirstName +N"` for multiple
- Click outside the dropdown panel: closes it

### State shape

```typescript
selectedTechs: Set<string>  // empty = All; IDs of selected techs
```

---

## 6. Data Requirements

### DashboardCalendar

Receives `jobs: Job[]` (existing) + `technicians: Technician[]` (new, for filter). No backend changes.

### ScheduleBoard

Needs technician data for global ordering, colors, and display names:

```typescript
interface Technician {
  id: string;
  name: string;      // display name (e.g. "John S.")
  color: string;     // hex background color for visit cards
  initials: string;  // 2-char (e.g. "JS")
}
```

`SchedulePage.tsx` currently does not call `useAllTechniciansQuery` — this hook call must be added. Tech color assignment: derive deterministically from a fixed palette indexed by technician ID for v1 (no DB changes needed).

Visit cards need `scheduled_start_at`, `scheduled_end_at`, `technician_id`, and `name`/`job_obj.name`. All already present on `JobVisit`.

---

## 7. What Is Not In Scope

- **Month view on ScheduleBoard** — week/day only. Month view stays on DashboardCalendar.
- **Drag-and-drop on ScheduleBoard** — read-only for v1.
- **Technician color storage in DB** — palette derivation for v1.
- **ScheduleBoard day toggle** — toolbar renders the button; only week view implemented for v1.
- **FullCalendar v7** — still in beta; revisit at GA.

---

## 8. Mockup Reference

All mockups at: `HVAC/.superpowers/brainstorm/1428-1775069525/content/`

| File | Shows |
|---|---|
| `cascade-refined.html` | **Approved ScheduleBoard design** — fixed-width cards, global tech ordering, full-width spread, hover lift |
| `tech-filter-multiselect.html` | Interactive tech filter — pill mode + dropdown mode |
| `layout-comparison.html` | Rejected alternatives: fixed sub-lane columns vs resource timeline |
| `schedule-board.html` | Earlier cascade iteration (superseded by cascade-refined) |
| `tech-filter-modes.html` | Pill vs dropdown threshold comparison |

---

## 9. Implementation Order

1. Create `frontend/src/components/ui/schedule/` directory
2. **DashboardCalendar** — install `@schedule-x/react` and plugins; rewrite `SmartCalendar.tsx` as `DashboardCalendar.tsx` against @schedule-x API; migrate CSS; validate drag-and-drop parity and occurrence badges
3. Update `DashboardPage.tsx` import; delete `SmartCalendar.tsx`
4. Update `SchedulePage.tsx` import (temporary: point to DashboardCalendar until ScheduleBoard is ready)
5. **ScheduleBoard** — build time-grid shell (CSS grid, time gutter, day headers, hour lines, now indicator)
6. Build visit card placement (global tech ordering, `step` calculation, fixed-width cards, content thresholds)
7. Build tech filter (pill/dropdown adaptive, shared with DashboardCalendar)
8. Add `useAllTechniciansQuery` to `SchedulePage.tsx`; wire ScheduleBoard to real job + technician data
9. Replace temporary DashboardCalendar import on SchedulePage with ScheduleBoard
10. Verify tech filter works end-to-end on both components
