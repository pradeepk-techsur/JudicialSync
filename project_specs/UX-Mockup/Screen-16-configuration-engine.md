### Screen 16: Configuration Engine

**Purpose:** Lets authorized admins configure numbering schemes, workflow states, thresholds, and event mappings per court — and enforces maker-checker (separation of duties) before any change takes effect, since configuration errors can silently affect an entire court's Speedy Trial calculations.
**User Stories:** US-3.1, US-3.2, US-3.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Configuration — EDNY Court Profile              [Tag: Draft v4.3] │
│ Tabs: [Numbering] [Workflow States] [Thresholds] [Event Mappings]  │
├──────────────────────────────────────────────────────────────────┤
│ THRESHOLDS TAB                                                      │
│ Table (editable rows)                                               │
│ Tier         | Min (days) | Max (days) | Severity                   │
│ Safe         | 31         | ∞          | info                       │
│ Approaching  | 15         | 30         | warning                    │
│ Critical     | 0          | 14         | critical                   │
│ ⚠ Gap detected: 30–31 unclassified          [Fix: adjust Approaching max]│
│                                                                      │
│ [ Save Draft ]                                                      │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Publish ─────────────────────────────────────────────────────┐  │
│ │ Drafted by: David Okafor (you)                                  │  │
│ │ [ Publish ]  ← disabled: "A second approver is required"        │  │
│ │ Approver: [ Select a different user to approve ▾ ]              │  │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs, Table (editable), Alert (inline validation, blocking), Tooltip, Select (approver picker), Button (disabled state with tooltip).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Structural validation errors (gaps, orphaned states, ambiguous mappings) | Inline, directly under the offending row |
| Primary | Publish control + SoD enforcement | Bottom panel, always visible |
| Secondary | Tab content (numbering/workflow/thresholds/mappings) | Main editing area |
| Tertiary | Draft version Tag | Header |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Editing draft | Tag: "Draft v4.3", autosave indicator | — |
| Structural validation failure | Red inline Alert per offending row | "Threshold tiers must be contiguous and non-overlapping" (CONFIG_THRESHOLD_GAP) |
| Ambiguous event mapping | Red inline Alert on mapping row | "Event code {code} is mapped to multiple categories" (CONFIG_AMBIGUOUS_MAPPING) |
| Orphaned workflow state | Red Alert on Workflow States tab | "Workflow state sets must have at least one terminal state and no unreachable states" |
| Non-admin viewing | Entire edit surface read-only | "You do not have configuration administration access" (CONFIG_EDIT_DENIED) |
| Same-user publish attempt | Publish button disabled + Tooltip | "A second approver is required to publish this configuration" (CONFIG_SOD_VIOLATION) — structurally blocked, not just rejected after click |
| Published | Tag updates to "Published v4.3 — effective 2026-10-05" | Prior version (v4.2) remains retrievable via version history link |
| In-flight calculations | No automatic effect shown | Explicit note: "Existing calculations referencing v4.2 are not retroactively recalculated" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Tab set | USWDS Tabs | Numbering / Workflow States / Thresholds / Event Mappings |
| Editable Table rows | Inline edit | Client-side pre-validation mirrors server rules, surfaces errors immediately |
| "Save Draft" | Button | Persists draft without publishing; no effect on live rule package |
| Approver Select | USWDS Select, excludes current user | Populates only with users holding `config_admin` other than the drafter |
| "Publish" | Button, primary, conditionally disabled | Enabled only for the selected distinct approver's own session; creates new immutable `rule_package_version` |
