### Screen 05: Live Courtroom Status (Chambers Mirror)

**Purpose:** A read-mostly, real-time mirror of the deputy's logging screen so Judge Hale (from the bench, on a secondary display) and Ana (from chambers) see every offer/objection/ruling the instant it's recorded, with explicit attribution — without ever appearing to let the system decide anything.
**User Stories:** US-17.2, US-16.3, US-11.1
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ● LIVE — United States v. Alvarez — Dept. 4            [Minimize] │
├──────────────────────────────────────────────────────────────────┤
│  Activity stream (reverse-chronological, auto-scrolling):          │
│                                                                      │
│  10:42:03 AM  Ruling entered: Judge Hale — Admitted                │
│               Exhibit 2 — Photograph, scene A                       │
│                                                                      │
│  10:41:40 AM  Objection recorded — Relevance                       │
│               Exhibit 2 — Photograph, scene A                       │
│                                                                      │
│  10:41:15 AM  Offered — Exhibit 2 — Photograph, scene A            │
│                                                                      │
│  10:38:02 AM  Ruling entered: Judge Hale — Admitted                 │
│               Exhibit 1 — Lease agreement                           │
├──────────────────────────────────────────────────────────────────┤
│  Current exhibit snapshot (Table): #1 Admitted · #2 Admitted ·     │
│  #3 Pending                                                         │
│                                                                      │
│  🛑 Sensitive item flagged — Exhibit 9     [ Review Sealing → ]     │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Site Alert ("● LIVE" indicator styled via Tag), Table (snapshot), Card (activity stream container), Icon (status glyphs), Link styled as Button for sealing review.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Most recent ruling/action, explicitly judge-attributed | Top of activity stream |
| Primary | Sensitive-item flag requiring sealing decision | Persistent banner until addressed |
| Secondary | Full activity stream (offers, objections) | Scrollable list below |
| Tertiary | Current exhibit-status snapshot table | Bottom |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Live, updating | New entries slide in at top, no manual refresh | Subtle highlight animation on newest entry (respects prefers-reduced-motion) |
| No session active | Empty state | "No live session is currently running for this proceeding" |
| Sensitive item flagged | Red banner, persistent until resolved | "Exhibit 9 flagged sensitive — sealing decision required" |
| Deputy offline/resyncing | Stream shows a gap marker | "Reconnecting… entries will appear once synced" (never silently frozen without indication) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Review Sealing →" | Button | Opens Screen-09 (Sealing & Jury Package Authorization) |
| "Minimize" | Button | Collapses to a small persistent status chip in the Chambers Home header, stream continues updating in background |
| Activity stream rows | Read-only, clickable | Clicking an entry deep-links to the exhibit's full ledger detail (via Case Timeline, F8) |
