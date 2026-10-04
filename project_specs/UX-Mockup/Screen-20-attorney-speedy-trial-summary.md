### Screen 20: Attorney Speedy Trial Summary (Read-Only)

**Purpose:** Gives an authorized attorney a read-only Speedy Trial summary for their associated defendant — remaining time, next threshold, confirmed trigger/exclusion periods — without exposing full explainability detail, override history, or any write affordance.
**User Stories:** US-12.2
**Workspace:** Restricted External Attorney Portal

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Speedy Trial Summary — United States v. Alvarez (read-only)       │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ Summary Box ───────────────────────────────────────────────┐   │
│ │ Remaining includable time: 41 days                            │   │
│ │ Next threshold: "Approaching" at 30 days remaining             │   │
│ │ Status: Within limit                                            │   │
│ │ (decision support only — not a legal determination)             │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ Confirmed periods (no candidate/proposed detail shown):             │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Jan 5 – Feb 2    Included                                        │ │
│ │ Feb 3 – Mar 18    Excluded — Continuance (confirmed)              │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ℹ️ Full calculation explainability, override history, and candidate │
│    exclusions are not available through this portal. Contact the    │
│    clerk's office with questions about this calculation.             │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Summary Box, Table (simplified, read-only), Site Alert (informational scope notice, persistent).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Remaining time + next threshold + status | Top Summary Box |
| Secondary | Confirmed-only period list | Below summary |
| Tertiary | Scope-limitation disclosure | Bottom, persistent |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Security-designated case | Entire screen inaccessible, case absent from attorney's list | "This case is not available through the external portal" (PORTAL_DESIGNATION_DENIED) — only shown if attorney somehow had a direct link; default is non-listing |
| Visibility level narrower (court-configured) | Some rows omitted per court policy | No error — simply a narrower confirmed-period list, per F3 configuration |
| Clean | Full confirmed summary shown | — |
| No tracker yet initialized | Empty-state text | "A Speedy Trial tracker has not yet been established for this defendant" |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| **None beyond read/scroll** | — | This screen has zero write affordances — no edit, no override request, no candidate-review control — the external token's audience claim structurally cannot invoke F29/F30 write endpoints even if such a control were mistakenly rendered |
