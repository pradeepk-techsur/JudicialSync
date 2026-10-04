### Screen 02: Deputy Session Close & Reconciliation Checkpoint

**Purpose:** Mandatory F18 reconciliation gate triggered by session close — compares the live ledger against party lists, session log, jury package manifest, and disposition records, surfacing discrepancies before the session can be marked closed.
**User Stories:** US-17.3, US-18.1, US-18.2, US-18.3
**Workspace:** Courtroom Deputy Interface

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: "Close Session — Trial Day 1"           [Back to Logging] │
├──────────────────────────────────────────────────────────────────┤
│ Step Indicator:  ●Gathering sources → ●Comparing → ○Resolve → ○Done│
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Summary Box ───────────────────────────────────────────────┐  │
│  │ Sources compared: Ledger ✓ | Session log ✓ | Party lists ✓  │  │
│  │                   Jury manifest — (none yet this trial)      │  │
│  │ Discrepancies found: 2 (1 high severity, 1 medium)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Accordion: Discrepancy #1 (HIGH) — Exhibit 14 ─────────────┐   │
│  │  Session log says: "Admitted"                                │   │
│  │  Government's list says: "Withdrawn"                         │   │
│  │  ( ) Accept session log value   ( ) Accept party list value  │   │
│  │  ( ) Enter different value: ______________                   │   │
│  │  Rationale (required): _______________________________       │   │
│  │                                        [ Resolve Discrepancy ]│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─ Accordion: Discrepancy #2 (MEDIUM) — Exhibit 9 ────────────┐   │
│  │  (collapsed — click to expand)                                │   │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  🛑 Alert (error): "1 high-severity discrepancy remains unresolved.  │
│     Session cannot close." [Supervisory Override →] (if entitled)   │
│                                                                      │
│                            [ Close Session ]  ← disabled until clear│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Step Indicator, Summary Box, Accordion (one per discrepancy, bordered variant), Radio buttons, Textarea (rationale, required), Alert (error, blocking), Button (disabled state with explanatory tooltip).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Blocking Alert + disabled "Close Session" button when high-severity items remain | Bottom, impossible to miss |
| Primary | Discrepancy Accordion list, high severity first | Center, sorted by severity then age |
| Secondary | Source-comparison Summary Box | Top |
| Tertiary | Supervisory override link | Only visible to supervisory role, inside the blocking Alert |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Gathering sources | Step 1 active, spinner-style progress | "Comparing ledger against all available sources…" |
| Source unavailable | Summary Box row shows amber "⚠ Unavailable" | "Jury package manifest could not be loaded — reconciliation is partial" (RECONCILE_SOURCE_UNAVAILABLE, 206) |
| Clean (no discrepancies) | Summary Box: "0 discrepancies found" in green | "Close Session" button enabled immediately |
| Discrepancies open | Accordion list populated, severity Tags (red=high, amber=medium) | Button disabled; blocking Alert shown |
| Resolving | Accordion expanded, Resolve button enabled only once rationale ≥ required length | Inline character-count helper (USWDS Character count component) |
| Resolved | Accordion collapses, row shows green check + "Resolved by M. Santos — [rationale snippet]" | Audit event reference displayed |
| All resolved | Blocking Alert disappears | "Close Session" button becomes enabled |
| Supervisory override | Confirmation Modal requiring its own rationale | "This bypasses the reconciliation gate — provide justification" (double-gated per US-18.3) |
| Closed | Step 4 complete | Redirect to F19 export screen with "Session closed — export ready" Alert (success) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Discrepancy Accordion header | USWDS Accordion trigger | Expands/collapses; severity Tag always visible even collapsed |
| Radio group (accept value) | Radio buttons | Selecting a value enables the rationale field |
| Rationale Textarea | Required, min-length enforced (10 chars) | "Resolve Discrepancy" disabled until valid (EXCEPTION_RATIONALE_TOO_SHORT prevented client-side, re-validated server-side) |
| "Resolve Discrepancy" | Button, per-accordion | Submits resolution; updates ledger as new exhibit version + audit event if value changed |
| "Supervisory Override →" | Link, role-gated (only rendered for supervisory entitlement) | Opens Modal requiring separate rationale; logs RECONCILE_OVERRIDE as its own audit event |
| "Close Session" | Button, primary | Disabled (with tooltip "Resolve all high-severity discrepancies first") until gate clears |
