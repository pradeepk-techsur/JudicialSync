### Screen 17: Audit Explorer

**Purpose:** A strictly read-only surface to filter and reconstruct the full history of actions by case, user, date range, or object — the system's core accountability mechanism, used to investigate disputes and verify separation-of-duties compliance.
**User Stories:** US-2.1, US-2.2, US-2.3
**Workspace:** Admin Dashboard

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Audit Explorer                            🔒 Chain verified ✓     │
├──────────────────────────────────────────────────────────────────┤
│ Filters: Case [________▾]  User [________▾]  Date range [___–___] │
│          Object type [Exhibit ▾]                     [ Search ]    │
├──────────────────────────────────────────────────────────────────┤
│ Table (read-only, no edit/delete affordance anywhere)               │
│ Timestamp        | Actor      | Action         | Before→After | Rule│
│ 10:20:14 AM      | J. Hale    | access (granted)| —            | v4.2│
│ 10:15:02 AM      | M. Santos  | access (denied) | —            | v4.2│
│ 09:58:40 AM      | D. Okafor  | status_change    | proposed→admitted│ v4.2│
│ 09:40:11 AM      | (config)   | config_change    | threshold diff   | v4.1→v4.2│
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Row detail: status_change ───────────────────────────────────┐ │
│ │ Actor: David Okafor   Object: Exhibit 14   Rule ref: v4.2       │ │
│ │ Before: {status: proposed}  After: {status: admitted}           │ │
│ │ [ View Rule Package v4.2 → ]  [ View Object Detail → ]           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box/Tag ("Chain verified ✓" integrity badge), Combo Box (case/user filters), Date range picker, Select, Table (read-only), Accordion/expandable row for detail.

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Chain integrity status badge | Top-right, always visible |
| Primary | Filter controls | Top toolbar |
| Secondary | Chronological result table, including denied access attempts as distinct rows | Main content |
| Tertiary | Expanded row detail with rule/calculation version deep links | Below selected row |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| No `audit_reader` entitlement | Entire screen replaced with Alert | "You do not have audit explorer access" (AUDIT_READ_DENIED, 403) |
| Sealed-case query, no designation entitlement | Query returns no sealed rows + logs the attempt itself | "This case's audit history requires additional authorization" (AUDIT_DESIGNATION_DENIED) — and this very attempt appears as a new row next time anyone queries |
| Chain verified | Green badge, "Chain verified ✓" | — |
| Chain broken | Badge replaced with critical red Alert, non-dismissable | "Audit integrity check failed — escalated to security officer" (AUDIT_CHAIN_BROKEN) |
| Denied access attempt in results | Row shown with "denied" Tag, not omitted | Distinguishes "tried and was told no" from records that simply don't exist |
| Empty result | Standard empty state | "No audit events match these filters" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Filter controls | Combo Box, Date range picker, Select | `case_id`, `user_id`, `date_range`, `object_type` |
| "Search" | Button | Executes filtered query |
| Row click | Expand | Reveals before/after diff + rule/calculation version link |
| "View Rule Package v4.2 →" | Link | Deep-links to Configuration Engine's version history (read-only for non-admins) |
| **No edit/delete control exists anywhere on this screen** | — | Structural guarantee per US-2.3 — write API is service-to-service only |
