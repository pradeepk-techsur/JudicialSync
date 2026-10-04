### Screen 04: Chambers Oversight Home

**Purpose:** The judge/chambers landing workspace composing case timeline, pending approvals, exhibit status oversight, and a pre-session briefing — so Judge Hale and Ana see what needs attention without hunting across screens.
**User Stories:** US-11.1, US-8.1, US-6.1, US-6.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header | Side Navigation: Home · Timeline · Speedy Trial ·        │
│         Case Conference · Exhibits · Audit (if entitled)          │
├────────────┬───────────────────────────────────────────────────┤
│            │  Today's Proceeding — United States v. Alvarez       │
│  Side Nav  │  ┌─ Card: Live Courtroom Status ──────────────────┐  │
│  (persist) │  │ ● LIVE — Exhibit 2 ruled: "Admitted" (Judge Hale│  │
│            │  │   via deputy, 10:42:03 AM)      [View Live →]   │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │                                                       │
│            │  ┌─ Pending Approvals (Work Queue, this role) ──────┐ │
│            │  │ ⚠ Candidate exclusion — U.S. v. Reyes  [Review]  │ │
│            │  │ ⚠ Continuance findings incomplete — U.S. v. Cho  │ │
│            │  │   [Review]                                        │ │
│            │  │ ○ Config approval needed (n/a — not chambers role)│ │
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  ┌─ Exhibit Status Oversight (read + ruling action) ─┐│
│            │  │ Table: # | Description | Status | Last action     ││
│            │  │ (ruling controls only enabled if entitled + live)  ││
│            │  └────────────────────────────────────────────────────┘ │
│            │                                                       │
│            │  [Explain This Date] quick card for 3 active trackers │
└────────────┴───────────────────────────────────────────────────┘
```

**USWDS components:** Side navigation, Header (extended), Card, Table (compact), Tag (status), Icon (alert glyphs), Button (links styled as secondary buttons for "Review"/"View Live").

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Live Courtroom Status card (if a session is active today) | Top of content area |
| Primary | Pending Approvals queue (exclusion review, continuance findings, ruling-adjacent tasks) | Upper-middle, sorted by age/priority |
| Secondary | Exhibit status oversight table | Mid-page |
| Tertiary | Quick-access Explain-This-Date cards for active trackers | Lower section |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No session today | Live Courtroom Status card hidden/replaced | "No proceeding scheduled today" |
| Session live | Card pulses subtly with "● LIVE" indicator, updates without refresh | Real-time ruling text appears the instant deputy logs it |
| Pending approvals present | Queue populated, aged items visually flagged (border-left accent) | Oldest-first ordering |
| No pending approvals | Empty-state illustration + text | "Nothing needs your review right now" |
| Component unavailable | Card shows partial-availability Alert | "Part of this workspace is temporarily unavailable" (UI_COMPONENT_UNAVAILABLE, 206) — rest of page still usable |
| No workspace assigned (edge case) | Full-page Alert | "No workspace is configured for your account; contact an administrator" (UI_NO_WORKSPACE_ASSIGNED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "View Live →" | Link/Button | Opens Live Courtroom Status full panel (mirrors Screen-01, read-mostly) |
| "Review" (per task) | Button | Deep-links to Screen-07 (Candidate Exclusion Review) or continuance-flag detail |
| Exhibit table "Ruling" control | Button, conditionally rendered/enabled | **Only enabled** if viewer holds judge entitlement AND exhibit is in a ruleable state — read-only viewers never see this control enabled, even though the row is visible (US-11.1 entitlement-not-role-label rule) |
| "Explain This Date" card | Card, clickable | Navigates to Screen-06 for that tracker |
