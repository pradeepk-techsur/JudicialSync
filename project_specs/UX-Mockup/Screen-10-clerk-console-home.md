### Screen 10: Clerk Console Home

**Purpose:** David's landing workspace composing case setup access, intake queue, exception queue, reconciliation actions, and portfolio dashboards — his full operational caseload from one place.
**User Stories:** US-11.3, US-6.1, US-7.2
**Workspace:** Clerk/Case Administrator Console

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Case Setup · Intake Queue ·       │
│         Exceptions · Portfolio · (Configuration, if entitled)      │
├────────────┬───────────────────────────────────────────────────┤
│  Side Nav  │  ┌─ My Work Queue (role-scoped, cross-module) ─────┐ │
│            │  │ [All] [Exhibits] [Speedy Trial]        Sort: Age │ │
│            │  │ ⚠ (3d) Unmapped docket event — U.S. v. Cho       │ │
│            │  │ ⚠ (1d) Intake: missing metadata — U.S. v. Diaz   │ │
│            │  │ ○ (2h) Custody ack pending — Exhibit 14          │ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Open Exceptions Summary ──┐ ┌─ Portfolio Snapshot ┐│
│            │  │ Critical: 0  High: 1         │ │ 6 cases nearing    ││
│            │  │ Medium: 4    Low: 2          │ │ ST threshold       ││
│            │  │          [View Queue →]      │ │ 2 closeout backlog ││
│            │  │                               │ │   [View Portfolio →]││
│            │  └───────────────────────────────┘ └────────────────────┘│
│            │                                                       │
│            │  ┌─ Recent Case Setups ────────────────────────────┐  │
│            │  │ U.S. v. Alvarez — exhibit tracking active        │  │
│            │  └────────────────────────────────────────────────────┘ │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Tag (filter chips), Card, Table/List, Icon (priority glyphs), Summary Box (exception counts), Button.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | My Work Queue, cross-module, age-sorted | Top-left, largest card |
| Secondary | Open Exceptions Summary + Portfolio Snapshot | Side-by-side cards below queue |
| Tertiary | Recent Case Setups list | Bottom |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Empty queue | Illustration + text | "Nothing needs your attention right now" |
| Items aged beyond threshold | Red left-border accent on the row | Visual aging flag (shared pattern with Exception Queue) |
| Critical exception present | Exceptions Summary "Critical" count in red, pulsing dot | Cannot be dismissed from this summary view — must open queue |
| Filter applied | Selected Tag chip shows solid fill | Queue list updates in place |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Module filter Tags | Toggle Tag/Button group | Filters "My Work Queue" list by module |
| Task row | Clickable | Deep-links directly to the underlying object's detail/review view (per F6 requirement) |
| "View Queue →" | Button | Navigates to Screen-13 (Exception Queue) |
| "View Portfolio →" | Button | Navigates to Screen-14 (Portfolio Dashboards) |
