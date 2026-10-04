### Screen 08: Case Conference View

**Purpose:** A concise, single-screen chronology for conference/hearing preparation — clock state, pending motions, continuance history, and open issues — so Ana and Judge Hale don't reconstruct case status from the raw docket by hand.
**User Stories:** US-35.1, US-35.2, US-34.1, US-34.2
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Case Conference — United States v. Alvarez & Reyes (joint)        │
│                                         [ Generate Packet (PDF) ]  │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Co-Defendant Summary Panel (always shown if multi-defendant) ─┐│
│  │ Defendant: Alvarez   Remaining: 41 days   Status: On track      ││
│  │ Defendant: Reyes     Remaining: 23 days   Status: ⚠ Approaching ││
│  │ Relationship: 2 jointly tracked · 0 severed                     ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ Clock State (confirmed only) ──────┐ ┌─ Pending Motions ──────┐│
│  │ Elapsed: 47 days  Excluded: 21 days  │ │ • Competency eval (new)││
│  │ [Explain This Date →]                │ │ • Suppression motion   ││
│  └───────────────────────────────────────┘ └──────────────────────┘│
│                                                                      │
│  ┌─ Continuance History ──────────────┐ ┌─ Open Issues ───────────┐│
│  │ ✓ Mar 10 — granted, findings clean │ │ ⚠ 1 unreviewed exclusion││
│  │ ⚠ Jan 22 — findings incomplete     │ │ ⚠ 1 unacknowledged alert││
│  └──────────────────────────────────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Card (grid of panels), Tag (status), Summary Box, Icon list (continuance history), Button ("Generate Packet").

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Co-Defendant Summary Panel (multi-defendant matters only) | Top, full-width, never collapsed into a single status |
| Primary | Open Issues panel | Right column, top |
| Secondary | Clock state + pending motions + continuance history | Two-column grid, equal weight |
| Tertiary | "Generate Packet" action | Top-right, secondary button |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Single defendant | Co-Defendant panel omitted entirely | Standard single-column layout |
| Multi-defendant, all jointly tracked | Co-Defendant panel shows all rows, "N jointly tracked · 0 severed" | — |
| Multi-defendant, some severed | Panel shows severed defendants with distinct Tag + date | "3 defendants; 2 jointly tracked, 1 severed as of [date]" |
| Tracker not found/unauthorized | Full-page Alert | "Case conference not found or not authorized" (CONFERENCE_TRACKER_NOT_FOUND, 404) |
| Packet generation — partial data | Generated PDF carries a visible partial-data watermark/banner | "Some data was unavailable at generation time" (CONFERENCE_PACKET_PARTIAL, 206) |
| Clean | All sections populated, no warning Tags | — |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Generate Packet (PDF)" | Button | Produces a timestamped, printable packet mirroring on-screen content; no certification required since it changes no record |
| "Explain This Date →" | Link/Button | Opens Screen-06 for the relevant tracker |
| Continuance History rows | Clickable list items | Deep-link to the underlying continuance/exclusion detail |
| Open Issues rows | Clickable list items | Deep-link to Exception Queue or Candidate Exclusion Review as appropriate |
