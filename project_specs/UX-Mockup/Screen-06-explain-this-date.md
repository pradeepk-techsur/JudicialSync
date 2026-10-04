### Screen 06: Explain This Date

**Purpose:** Renders the full "explain this date" breakdown of a Speedy Trial calculation — every contributing segment with its event, rule reference, period, review status, reviewer, and reason — so Judge Hale can produce a complete, defensible explanation if the number is ever challenged on appeal. The single most important explainability screen in the product.
**User Stories:** US-29.1, US-29.2, US-29.3, US-32.1
**Workspace:** Judge/Chambers Workspace

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ United States v. Reyes — Defendant Tracker            [Compare ▾] │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐   │
│ │ Remaining includable time: 23 days   Calculation date: today │   │
│ │ Status: ⚠ Approaching threshold                               │   │
│ │ ──────────────────────────────────────────────────────────── │   │
│ │ "This is decision support, not a legal determination."        │   │
│ │  (persistent, non-dismissable label)                          │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Timeline (visual segment bar — included = solid teal,             │
│  excluded = diagonal-hatched gray):                                 │
│  ████████████░░░░░░████████████░░░░░████████                        │
│                                                                      │
│  ┌─ Accordion: Segment 1 — Included (Jan 5 – Feb 2) ─────────┐      │
│  │ Event: Arraignment (confirmed trigger)                      │     │
│  │ Rule reference: 18 U.S.C. §3161(c)(1), Rule Package v4.2     │     │
│  │ Status: Confirmed   Reviewer: Judge Hale   2026-01-05        │     │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌─ Accordion: Segment 2 — Excluded (Feb 3 – Mar 18) ────────┐      │
│  │ Event: Defense continuance motion, Doc #44                   │     │
│  │ Rule reference: 18 U.S.C. §3161(h)(7), Rule Package v4.2     │     │
│  │ Status: Confirmed (Modified)  Reviewer: Judge Hale            │     │
│  │ Reason/rationale: "Granted per ends-of-justice finding,       │     │
│  │  end date adjusted to match signed order."      [View Order] │     │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌─ Accordion: Segment 3 — Pending review (unconfirmed) ──────┐     │
│  │ ⚠ This candidate is NOT included in the calculation above.  │     │
│  │  Event: Competency motion, Doc #51   [ Review Candidate → ]  │     │
│  └────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Tag (status: confirmed/pending/approaching-threshold color-coded), Accordion (one per segment, bordered), Icon, Link styled as Button, custom data-visualization segment bar built from USWDS color tokens (per USWDS data visualization guidance — accessible color pairings, pattern fill not color-alone for included/excluded distinction).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Remaining time + status + persistent decision-support label | Top Summary Box, always visible |
| Primary | Visual segment timeline | Immediately below summary |
| Secondary | Per-segment Accordion detail (event, rule, reviewer, reason) | Main scroll area |
| Tertiary | "Compare versions" control | Top-right, secondary action |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Clean (all segments confirmed) | All Accordions show green "Confirmed" Tag | No pending-review callouts |
| Pending segment present | Distinct amber Accordion with warning Icon, clearly separated from confirmed segments | "This candidate is NOT included in the calculation" — prevents any ambiguity about what counts |
| Override present | Segment shows "Confirmed (Modified)" Tag + rationale text inline | Rationale always visible, never requires an extra click to find |
| System defect (should never occur) | Full-page blocking Alert, not a silent fallback | "System defect: unconfirmed exclusion used in calculation" (CALC_UNCONFIRMED_EXCLUSION_USED) — surfaced loudly, routed to Exception Queue automatically |
| Calculation pre-start-confirmation | Entire screen replaced with blocking message | "Cannot calculate: tracker start context is not yet confirmed" (CALC_START_NOT_CONFIRMED) + link to confirm start context |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| "Compare ▾" | Button, opens dropdown/select | Navigates to version-to-version diff (F32, "what changed") |
| Segment Accordion | USWDS Accordion | Expand/collapse; pending segments default-expanded to force visibility |
| "Review Candidate →" | Button | Opens Screen-07 for that specific candidate exclusion |
| "View Order" | Link | Deep-links to the linked document reference (F1 document_reference, CM/ECF-sourced) |
