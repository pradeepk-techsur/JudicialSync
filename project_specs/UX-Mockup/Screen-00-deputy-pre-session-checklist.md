## Screen Designs

### Screen 00: Deputy Pre-Session Checklist

**Purpose:** Confirms today's proceeding, parties, and exhibit list are correctly loaded before the judge takes the bench; surfaces any open exceptions tied to the proceeding so Maria never walks in blind.
**User Stories:** US-11.2, US-14.1, US-6.1, US-7.2
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ USWDS Banner (.gov identifier)                                    │
│ USWDS Header (basic) — Court seal, "JudicialSync", user menu      │
├──────────────────────────────────────────────────────────────────┤
│  Proceeding: United States v. Alvarez — Trial Day 1               │
│  Dept. 4 — Judge Robert Hale                    [Step Indicator]   │
│  ●───●───○───○   Setup → Verify → Open Session → Log              │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Summary Box ───────────────────────────────────────────────┐  │
│  │ Exhibit list: 24 proposed, 24 accepted, 0 pending intake     │  │
│  │ Parties bound: Government, Defense ✓                         │  │
│  │ Numbering scheme: USDC-EDNY-2026 ✓                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ⚠ Alert (warning, standard): "1 open exception tied to this        │
│     proceeding — duplicate submission flagged last night."          │
│     [Review Exception →]                                            │
│                                                                      │
│  ┌─ Card: Accepted Exhibit List (preview) ─────────────────────┐    │
│  │ Table (USWDS Table, borderless, compact)                    │    │
│  │ # | Description          | Party       | Status             │    │
│  │ 1 | Signed lease agree.  | Government  | Proposed           │    │
│  │ 2 | Photograph — scene A | Government  | Proposed           │    │
│  │ ...                                                          │    │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│              [ Open Courtroom Session ]  ← USWDS Button (big, primary) │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Banner, Header (basic), Step Indicator, Summary Box, Alert (warning), Card, Table (borderless/compact), Button (big, primary action).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | "Open Courtroom Session" button + open-exception warning | Bottom-center button; top Alert |
| Secondary | Exhibit list readiness summary box | Upper-center |
| Tertiary | Full accepted-exhibit preview table | Scrollable card below summary |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Default (clean) | Summary Box all green checks, no Alert | None needed — button enabled |
| Open exception present | Warning Alert banner above summary | "1 open exception tied to this proceeding" + deep link |
| Exhibit list incomplete | Summary Box row shows "3 pending intake" in amber | Button remains enabled (session can open; list loads what's accepted) |
| No proceeding assigned judge | Error Alert, blocking | "This proceeding has no presiding judge assigned — rulings cannot be logged until assigned" (COURTROOM_NO_JUDGE_ASSIGNED risk surfaced proactively) |
| Loading | USWDS Skeleton-style placeholder rows | "Loading today's proceeding…" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Open Courtroom Session" | USWDS Button, primary, large | Navigates to Screen-01, binds session to proceeding |
| "Review Exception →" | USWDS Link (within Alert) | Deep-links to Exception Queue (Screen-13), pre-filtered to this proceeding |
| Exhibit table rows | Read-only | No action — preview only; full interaction happens in Screen-01 |
