### Screen 13: Exception Queue (Shared Component, Clerk-Focused View)

**Purpose:** A cross-module queue of flagged discrepancies, missing metadata, and unmapped events, filterable by module/type/severity/age, with required rationale on every resolution — the convergence point where Maria, David, Priya, and chambers escalations all meet.
**User Stories:** US-7.1, US-7.2, US-18.2
**Workspace:** Clerk/Case Administrator Console (also surfaced, access-scoped, in other workspaces)

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Exception Queue                                                    │
│ Filters: [Module ▾] [Type ▾] [Severity ▾]      Sort: [Age ▾]       │
├──────────────────────────────────────────────────────────────────┤
│ Table                                                               │
│ Severity | Type                  | Object           | Age | Status │
│ 🔴 High   | reconciliation_mismatch| Exhibit 14       | 18h | Open   │
│ 🟠 Medium | unmapped_docket_event  | U.S. v. Cho       | 3d  | Open   │
│ 🟡 Low    | missing_metadata       | Exhibit list (ext)| 5h  | Open   │
│ ⚫ Critical| audit_integrity_break  | Audit chain       | 2m  | Open   │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Expanded: unmapped_docket_event — U.S. v. Cho ─────────────┐    │
│ │ Raw source code: "MOT-CONT-AMD"  Description: "Amended       │    │
│ │  Motion for Continuance"  Detected: F27, 2026-10-01 09:14     │    │
│ │                                                                 │    │
│ │ Map to category: [ Continuance                            ▾ ] │    │
│ │ ☐ Also create a standing mapping rule for this code            │    │
│ │   (routes through Configuration Engine maker-checker)          │    │
│ │                                                                 │    │
│ │ Rationale (required, ≥10 chars):                                │    │
│ │ [_____________________________________________]                 │    │
│ │                                           [ Resolve Exception ] │    │
│ └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Table (sortable/filterable), Tag/Icon (severity color + glyph, never color-alone), Select (category mapping, filters), Checkbox, Textarea, Button, Character count (rationale helper).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Severity + age (sorted oldest/highest-severity first by default) | Leftmost columns |
| Primary | Required rationale field on resolution | Expanded row, cannot submit without it |
| Secondary | Type-appropriate resolution action (category select, value-accept radio, etc.) | Expanded row, varies per exception_type |
| Tertiary | "Create standing mapping rule" checkbox | Expanded row, optional |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Critical severity | Black/dark Tag, cannot be resolved via any batch action | "Critical exceptions require individual manual review" (EXCEPTION_CRITICAL_MANUAL_ONLY) — no bulk-resolve checkbox ever appears next to it |
| Aging beyond threshold | Row gets a left-border accent + clock icon | Visual aging indicator, sortable |
| Resolution without rationale | Submit disabled | "A resolution rationale is required" (EXCEPTION_RATIONALE_REQUIRED) |
| Rationale too short | Inline error on blur | "Rationale must be at least 10 characters" (EXCEPTION_RATIONALE_TOO_SHORT) |
| Wrong resolution type for exception | Submit blocked | "Resolution action does not match exception type" (EXCEPTION_ACTION_TYPE_MISMATCH) |
| Legally significant exception, wrong reviewer role | Resolution controls disabled | Routed instead to the role with appropriate review authority (e.g., chambers) |
| Resolved | Row moves to "Resolved" filter, strikethrough removed from view by default | Audit event reference shown in exception detail history |
| Escalated (age threshold) | Row Tag: "Escalated" | Notification sent to supervisory role automatically |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter Selects | USWDS Select | Module, type, severity |
| Sort control | Select/Button | Age (default), severity |
| Row expand | Click/Enter | Reveals type-specific resolution UI |
| "Resolve Exception" | Button, primary | Disabled until rationale valid and resolution type-appropriate |
| "Also create a standing mapping rule" checkbox | Checkbox | Routes a *separate* request through Configuration Engine maker-checker while still resolving this individual instance immediately |
