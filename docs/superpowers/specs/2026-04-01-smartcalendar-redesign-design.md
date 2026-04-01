# SmartCalendar Redesign — Design Spec

**Date:** 2026-04-01  
**Status:** Approved — ready for implementation planning  
**Visual companion session:** `HVAC/.superpowers/brainstorm/1428-1775069525/content/`

---

## 1. Context & Problem

`SmartCalendar.tsx` currently serves two pages with conflicting needs:

- **DashboardPage** — needs a compact week-at-a-glance calendar (existing day-grid behavior is correct)
- **SchedulePage** — needs a full dispatch board: time-grid, technician filtering, and visual separation of concurrent visits by different techs

Both pages use `<SmartCalendar>` today. The component has two significant pain points:

1. **Toolbar hack** — Visit/Occurrence toggle buttons are mounted via `createRoot` injected into FullCalendar's internal DOM nodes in `viewDidMount`. The roots re-render manually in a separate `useEffect`. This is fragile, breaks in React StrictMode, and is impossible to reason about.
2. **Wrong view type for SchedulePage** — A day-grid (all-day event rows) cannot show a dispatcher's time-grid reality: overlapping visits, precise scheduling, technician-by-technician visibility.

---

## 2. Approved Approach — Split into Two Components

**Approach B** was selected: split into `DashboardCalendar` and `ScheduleBoard`.

### File location

```
frontend/src/components/ui/schedule/
  DashboardCalendar.tsx    ← renamed/moved from SmartCalendar.tsx
  ScheduleBoard.tsx        ← new component
```

`SmartCalendar.tsx` is deleted after migration. Both pages update their imports.

### Page mapping

| Page | Component | View |
|---|---|---|
| `DashboardPage.tsx` | `DashboardCalendar` | Week (day-grid, unchanged) |
| `SchedulePage.tsx` | `ScheduleBoard` | Time-grid week |

`TechnicianDashboardPage.tsx` also imports SmartCalendar — evaluate separately; likely stays on DashboardCalendar or is removed from scope.

---

## 3. DashboardCalendar

A direct rename and relocation of `SmartCalendar.tsx`. The FullCalendar day-grid behavior is preserved as-is. The only functional change is **replacing the toolbar hack** with a proper React-controlled toolbar.

### Toolbar fix

Replace `viewDidMount` + `createRoot` injection with a wrapper layout:

```tsx
<div className="dashboard-calendar-shell">
  <div className="dc-toolbar">
    <span className="dc-title">{title}</span>
    <div className="dc-nav">...</div>
    <div className="dc-filters">
      <VisitsToggle ... />
      <OccurrencesToggle ... />
      <TechFilter ... />   {/* new */}
    </div>
  </div>
  <FullCalendar headerToolbar={false} ... />
</div>
```

`headerToolbar={false}` disables FullCalendar's built-in toolbar entirely. Navigation (`today`, `prev`, `next`) is wired to `calendarRef.current.getApi()` calls from the custom toolbar. This removes all DOM injection, `visitsRootRef`, `occurrencesRootRef`, `calendarKey`, and the secondary `useEffect` re-render.

### Tech filter (added to DashboardCalendar)

Filters which technicians' visits are shown. Adaptive based on tech count — see Section 5.

### Props change

Remove `toolbar?: ToolbarInput` (FullCalendar-specific type, no longer needed). Add `technicians: Technician[]` for the tech filter.

---

## 4. ScheduleBoard

A new custom React component. Does **not** use FullCalendar — built as a pure custom time-grid. No library imposes an overlap algorithm that would conflict with CascadeStack.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ TOOLBAR: [Day|Week|Month] [Today ‹ Apr 2026 ›]      │
│          [Visits] [Occurrences]  TECH [filter]      │
├────┬────────┬────────┬────────┬────────┬────────────┤
│    │ Mon 31 │ Tue  1 │ Wed  2 │ Thu  3 │  ...       │
├────┼────────┼────────┼────────┼────────┼────────────┤
│7AM │        │        │        │        │            │
│8AM │ [card] │ [card] │        │        │            │
│ .. │        │        │        │        │            │
│3PM │        │        │        │        │            │
└────┴────────┴────────┴────────┴────────┴────────────┘
```

- CSS grid: `48px gutter + repeat(7, minmax(90px, 1fr))`
- Each hour row: 56px tall (`SLOT_H = 56`)
- Default range: 7 AM – 3 PM (9 slots = 504px total column height)
- Day columns use `position: relative`; cards are `position: absolute`

### CascadeStack — overlapping events

When two or more visits overlap in time within the same day column, they are cascade-stacked horizontally.

#### Default state (no hover)

Each card receives an equal visible slice:

```
step = colWidth / n          // equal division
card[i].left  = PAD + i * step
card[i].width = colWidth - i * step
```

- Bottom card (i=0): full column width
- Top card (i=n-1): width = `colWidth / n` (one equal slice)
- All cards show an equal visible strip in the resting state

#### Hover state

On `mouseenter` for card at index `focus`:

- **Focused card:** expands to full column width
- **Cards left of focus (i < focus):** compress to `PEEK = 24px`, pinned left (`left = PAD + i * PEEK`)
- **Cards right of focus (i > focus):** compress to `PEEK = 24px`, pinned right (`left = PAD + colWidth - (n - i) * PEEK`)
- All transitions: `left 0.2s cubic-bezier(.4,0,.2,1), width 0.2s cubic-bezier(.4,0,.2,1)`
- Mouse stays within the day column — user does not need to leave the cell to interact with other events

On `mouseleave`: animate back to default equal-slice state.

#### Staggered overlaps

Events are grouped by the clustering algorithm: if any two events overlap in time, they are placed in the same stack group (transitive — chains are captured). Within a group, each card renders at its **own actual start time and height**, not the group's full span. Left-offset stacking still applies by index within the group.

This means cards at different heights can occupy different vertical positions while sharing the same horizontal stacking layer.

#### Content thresholds (by card height in px)

| Height | Content shown |
|---|---|
| ≥ 48px | Tech name · Time range · Job name |
| 32–47px | Tech name · Time range |
| 20–31px | Tech name only |
| 14–19px | Tech initials (centered) |
| < 14px | Solid color bar (no text) |

In peek state (compressed to 24px width), main text is hidden and rotated initials are shown vertically centered.

### Visit card anatomy

```
┌─────────────────┐
│ ┃ John S.       │  ← tech name (bold, 10px)
│ ┃ 8:00–9:30AM  │  ← time range (9px, muted)
│ ┃               │
│ ┃ Williams AC   │  ← job name (9px, dimmer, margin-top:auto)
└─────────────────┘
  ↑ colored left border (priority color)
```

Background color = tech's assigned color. Border-left = job priority color.

### Now indicator

A red horizontal line + dot marker at the current time, rendered on today's column only. Updates on mount; does not need to tick live for v1.

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

No new data needs. Receives `jobs: Job[]` (existing). Tech filter derives technician list from the visits within jobs. If visits carry `technician_id` + name/color, that's sufficient.

### ScheduleBoard

Needs explicit technician data for colors and display names:

```typescript
interface Technician {
  id: string;
  name: string;        // display name
  color: string;       // hex, assigned per tech for card backgrounds
  initials: string;    // 2-char for peek state
}
```

`SchedulePage.tsx` already calls `useAllTechniciansQuery` (visible in DashboardPage — confirm SchedulePage also has access or add the hook call). Tech color assignment: derive deterministically from technician ID if not stored in DB (e.g., index into a palette), or store as a user preference field.

Visit events for ScheduleBoard need `scheduled_start_at`, `scheduled_end_at`, and `technician_id`. These are already on `JobVisit`.

---

## 7. What Is Not In Scope

- **Month view on ScheduleBoard** — ScheduleBoard is week/day only. Month view stays on DashboardCalendar.
- **Drag-and-drop on ScheduleBoard** — DashboardCalendar retains its existing drag-to-reschedule. ScheduleBoard is read-only for v1; click-to-navigate is sufficient.
- **Replacing FullCalendar with @schedule-x** — Evaluated (see library analysis notes below). Not in scope for this implementation. DashboardCalendar keeps FullCalendar.
- **Technician color storage in DB** — Derive from palette for v1.
- **ScheduleBoard day/month toggle** — Toolbar shows the toggle but only week view is implemented for v1.

---

## 8. Library Analysis Notes (Reference)

Evaluated during brainstorming — no decision to migrate yet.

**@schedule-x/react** is the strongest alternative to FullCalendar for DashboardCalendar. Key advantage: named React component slots for toolbar and event cards (no `createRoot` hacks). MIT licensed, actively maintained. Migration is worthwhile but not a drop-in swap — requires full CSS rewrite, rebuilding occurrence badges (no `dayCellDidMount` equivalent), and validating drag-and-drop parity. Estimated effort: full component rewrite.

**FullCalendar v7** (currently beta): pure React rewrite, eliminates the Preact bridge, fixes toolbar React component limitations natively. Worth revisiting at GA.

**ScheduleBoard** is always a custom component regardless of library choice — no calendar library supports cascade fan-out stacking.

---

## 9. Mockup Reference

All mockups are in the visual companion session at:
`HVAC/.superpowers/brainstorm/1428-1775069525/content/`

| File | Shows |
|---|---|
| `week-view.html` | Day-grid vs time-grid week comparison |
| `overlap-approaches.html` | Approach A/B/C comparison |
| `cascade-v3.html` | Approved cascade hover behavior (both-edge peek) |
| `tech-filter-modes.html` | Pill vs dropdown mode comparison |
| `tech-filter-multiselect.html` | Interactive multi-select (both modes) |
| `schedule-board.html` | Full ScheduleBoard layout — approved mockup. Sat column = 6 same-slot events. Sun column = staggered overlaps. |

---

## 10. Implementation Order

1. Create `frontend/src/components/ui/schedule/` directory
2. Copy `SmartCalendar.tsx` → `DashboardCalendar.tsx`, fix toolbar hack, add tech filter
3. Update `DashboardPage.tsx` and `SchedulePage.tsx` imports
4. Delete `SmartCalendar.tsx`
5. Build `ScheduleBoard.tsx` — time-grid shell, card placement, CascadeStack
6. Wire `SchedulePage.tsx` to `ScheduleBoard` with real job/technician data
7. Verify tech filter works end-to-end on both components
