### Screen 14: Portfolio Dashboards (Exhibit + Speedy Trial)

**Purpose:** Aggregate, cross-case visibility into exhibit operations and Speedy Trial risk across David's full caseload — "which of these forty cases actually needs my attention today" — without opening cases one by one.
**User Stories:** US-25.1, US-36.1, US-36.2
**Workspace:** Clerk/Case Administrator Console (Speedy Trial personal view also appears in Judge/Chambers Workspace; court-level aggregate is Admin-gated)

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Portfolio — My Caseload (EDNY / Brooklyn)        Tabs: [Exhibits] │
│                                                    [Speedy Trial]  │
├──────────────────────────────────────────────────────────────────┤
│ SPEEDY TRIAL TAB                                                    │
│ Risk filter chips: [Approaching threshold (6)] [Data gap (2)]      │
│                    [Unreviewed exclusion (4)] [Stale calc (1)]     │
│                                                                      │
│ Table (sortable)                                                    │
│ Case              | Defendant | Remaining | Risk           | Last   │
│ U.S. v. Reyes     | Reyes     | 23 days   | ⚠ Approaching  | today  │
│ U.S. v. Cho       | Cho       | —         | ⚠ Data gap     | 3d ago │
│ U.S. v. Patel     | Patel     | 61 days   | ✓ On track     | today  │
├──────────────────────────────────────────────────────────────────┤
│ EXHIBITS TAB                                                        │
│ Open exceptions: 7   Outstanding custody: 2   Closeout backlog: 3   │
│ Table: Case | Open exceptions | Custody pending | Closeout status   │
└──────────────────────────────────────────────────────────────────┘
```

**USWDS components:** Tabs, Tag (filter chips, risk indicators), Table (sortable, drill-through), Summary Box (aggregate counts).

#### Information Hierarchy

| Priority | Content | Placement |
|----------|---------|-----------|
| Primary | Risk filter chips (counts visible at a glance) | Top of Speedy Trial tab |
| Primary | Case-level risk table | Main content |
| Secondary | Exhibit-side aggregate counts (exceptions/custody/closeout) | Exhibits tab equivalent |
| Tertiary | "Last" activity column | Rightmost, supports staleness sorting |

#### States

| State | Appearance | User Feedback |
|-------|------------|----------------|
| Out-of-scope access attempted | Entire dashboard blocked | "You do not have access to this portfolio" (PORTFOLIO_SCOPE_DENIED) — a clerk never sees another court's portfolio |
| No risk configuration | Empty-state Alert | "No risk-indicator configuration exists for this court" (PORTFOLIO_NO_CONFIG) + link to Configuration Engine (if entitled) |
| Risk chip selected | Chip shows solid fill, table filters | — |
| Clean caseload | All rows "✓ On track" | Reassuring green state, no action needed |
| Stale calculation flagged | Row Tag: "Stale calc" (grey/amber) | Indicates calculation hasn't run recently — prompts explicit recalculation request |
| Court-level aggregate (admin-only) | Additional "Court-Wide" tab appears only for `court_admin` entitlement | A routine clerk/judge role never sees this tab merely from a large personal caseload (PORTFOLIO_ADMIN_DENIED) |

#### Interactive Elements

| Element | Type | Behavior |
|---------|------|----------|
| Risk filter chips | Toggle Tag | Filters table; multiple chips combine as OR filter |
| Table row | Clickable | Drill-through to Case Conference View (Screen-08) or Exception Queue, scoped to viewer's authorized entitlements |
| Tabs | USWDS Tabs | Switches between Exhibits and Speedy Trial aggregate views |
