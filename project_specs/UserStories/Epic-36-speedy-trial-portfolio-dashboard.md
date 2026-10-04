## Epic 36: Speedy Trial Portfolio Dashboard (F36)

### US-36.1: View My Personal Caseload Risk Dashboard
**As a** judge (Judge Robert Hale), **I want to** see which of my assigned trackers are approaching a threshold, have data gaps, or have unreviewed candidate exclusions, **so that** I can prioritize attention across my full caseload instead of checking each tracker individually.

**Acceptance Criteria:**
- [ ] Dashboard is strictly limited to trackers the viewing judge/clerk is assigned to — it never surfaces out-of-scope trackers, even in aggregate count form, enforced via `PORTFOLIO_SCOPE_VIOLATION` (403, internal guard)
- [ ] Risk indicators include approaching-threshold, data-gap, unreviewed-exclusion, and stale-calculation categories
- [ ] Each risk indicator links through to the relevant tracker's case conference view or review queue
- [ ] Dashboard refreshes on a near-real-time basis as new calculation versions, exceptions, or confirmations occur

**Priority:** P2 | **Feature Ref:** F36

---

### US-36.2: View the Court-Level Aggregate Risk Dashboard
**As a** court administrator (Thomas Reyes), **I want to** see court-wide aggregate counts of trackers approaching thresholds or with data gaps, **so that** I can monitor caseload-wide Speedy Trial risk without needing case-level access myself.

**Acceptance Criteria:**
- [ ] Court-level dashboard access requires `court_admin` entitlement; a routine clerk/judge role does not receive it merely from a large personal caseload, returning `PORTFOLIO_ADMIN_DENIED` (403) otherwise
- [ ] A court with no risk-indicator configuration returns `PORTFOLIO_NO_CONFIG` (422)
- [ ] Staleness/approaching-threshold band widths are court-configurable, not hardcoded
- [ ] Authorized administrators may still drill through to individual tracker detail where their case-access entitlements permit, distinct from the stricter de-identified F09 reporting feed

**Priority:** P2 | **Feature Ref:** F36

---
