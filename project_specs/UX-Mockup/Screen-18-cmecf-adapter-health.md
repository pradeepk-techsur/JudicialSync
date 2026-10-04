### Screen 18: CM/ECF Adapter Health & Sync Conflicts

**Purpose:** Monitors CM/ECF sync health (last sync time, error rate, backlog) and lets Priya resolve routed conflicts without ever silently overwriting local edits or docket data.
**User Stories:** US-10.1, US-10.2
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ CM/ECF Integration Health                                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐    │
│ │ Last successful sync: 4 minutes ago   Error rate: 0.2%        │    │
│ │ Backlog: 0 pending   Outbound filings: disabled (no entitlement│    │
│ │ granted)                                                        │    │
│ └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│ ┌─ Open Sync Conflicts (3) ───────────────────────────────────┐    │
│ │ Record: Exhibit 14 location field                             │    │
│ │  CM/ECF value: "Evidence Room B-14"  (source_identifier: DKT-1102)│
│ │  Local value:  "Evidence Room A-02"  (locally modified 2026-10-02)│
│ │  ( ) Accept CM/ECF value   ( ) Keep local value (manual_override) │
│ │                                          [ Resolve Conflict ]     │
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ Duplicate Delivery Log (informational, no action needed) ───┐    │
│ │ source_identifier DKT-1099 — duplicate delivery, auto-ignored  │    │
│ └───────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Table/Card (conflict list), Radio buttons, Button, Tag (health status), Alert (for prolonged failure).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Open Sync Conflicts, each requiring explicit admin selection | Center, cannot be bulk-resolved |
| Primary | Adapter health metrics | Top Summary Box |
| Secondary | Duplicate-delivery log (informational only) | Lower section |
| Tertiary | Outbound filing entitlement status | Summary Box, read-only unless `docket_outbound` granted |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Healthy | Green Tags, "Last successful sync: 4 minutes ago" | — |
| Prolonged failure | Critical red Alert, non-dismissable | Triggers an alert automatically; feed unavailability shows "Feed temporarily unavailable" (CMECF_UNAVAILABLE, 503) |
| No conflicts open | Empty-state text | "No sync conflicts currently require review" |
| Conflict open | Both values shown side by side, neither pre-selected | Admin must make an explicit choice — no default/auto-selected radio |
| Conflict resolved | Row moves to resolved history, tagged `source_system` or `manual_override` | Logged to audit trail with both values preserved |
| Unauthorized outbound filing attempt | Action simply absent from UI for non-entitled users | CMECF_OUTBOUND_DENIED never surfaces as a clickable-then-rejected control |
| Duplicate delivery | Shown in informational log only, no action required | CMECF_DUPLICATE_IGNORED — idempotent, no duplicate record created |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Conflict radio group | Radio buttons | Forces one explicit selection before "Resolve Conflict" enables |
| "Resolve Conflict" | Button, primary | Logs resolution with both CM/ECF and chosen value, explicitly marked `source_system` or `manual_override` |
| Health Summary Box | Read-only | Links to a more detailed sync-log view if needed |
