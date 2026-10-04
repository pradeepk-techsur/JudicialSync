## F36: Speedy Trial Portfolio Dashboard

**Description:** Court-level and personal dashboards identifying cases nearing thresholds, data gaps, or conflicting interpretations across a judge's or clerk's full caseload. This gives chambers and court administrators the proactive, caseload-wide risk visibility the PRD identifies as a core root-cause fix, rather than requiring staff to check each tracker individually.

**Terminology:**
- **Personal Dashboard:** A judge/clerk-scoped view limited to trackers within that individual's assigned caseload.
- **Court-Level Dashboard:** An administrator-scoped aggregate view across the full court's tracked defendants.
- **Risk Indicator:** A caseload-level signal (approaching threshold, data gap, unreviewed candidate, stale calculation) surfaced to prioritize attention.

**Sub-features:**
- Personal dashboard (judge/clerk-scoped caseload view)
- Court-level aggregate dashboard (administrator-scoped)
- Risk indicators: approaching thresholds, data gaps, unresolved exclusions

**Process:**
1. User opens their personal dashboard (judge/clerk) or, if entitled, the court-level aggregate dashboard (court administrator).
2. System aggregates across the viewer's authorized tracker scope: trackers with remaining time within a configurable "approaching" band of the next threshold (F31), trackers with open `missing_trigger_event` or `unmapped_docket_event` exceptions (F07/F26/F27), trackers with unreviewed candidate exclusions aged beyond a configurable staleness threshold (F28/F30), and trackers whose current calculation version is stale (no recalculation since a configurable period despite new docket activity).
3. Each risk indicator links through to the relevant tracker's case conference view (F35) or review queue (F06) for immediate action.
4. Court-level dashboard additionally aggregates counts/trends across the full court (e.g., "14 trackers approaching threshold this week," "3 trackers with data gaps older than 10 days") without exposing defendant-identifying detail in the aggregate summary tier, consistent with F09's de-identification approach for administrator-facing metrics — though court administrators with case-access entitlements may still drill through to individual tracker detail where authorized, distinct from the stricter de-identified reporting feed (F09) intended for AO-level review.
5. Dashboards refresh on a near-real-time basis as new calculation versions, exceptions, or confirmations occur.

**Inputs:**
- `scope` (personal — viewer's assigned caseload; or court-level — administrator's authorized court/division)
- `risk_filters` (optional): approaching_threshold | data_gap | unresolved_exclusion | stale_calculation

**Outputs:**
- Dashboard view: list of flagged trackers with risk indicator type, age/severity, and deep link

**Validation:**
- Personal dashboard scope is strictly limited to trackers the viewing judge/clerk is assigned to (via F01 proceeding/case assignment) — it must never surface trackers outside their caseload, even in aggregate count form.
- Court-level dashboard access requires `court_admin` entitlement; a routine clerk/judge role does not receive court-level aggregate access merely by having a large personal caseload.
- Staleness/approaching-threshold band widths are court-configurable (F03), not hardcoded, so courts can tune sensitivity to their own risk tolerance.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Personal dashboard query attempts to include out-of-scope trackers | 403 (internal guard) | PORTFOLIO_SCOPE_VIOLATION | "Dashboard scope restricted to your assigned caseload" |
| Court-level dashboard access by non-admin | 403 | PORTFOLIO_ADMIN_DENIED | "Court-level dashboard requires administrator access" |
| No risk-indicator configuration found for court | 422 | PORTFOLIO_NO_CONFIG | "Risk indicator thresholds are not configured for this court" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Portfolio Dashboard for `/speedytrial/dashboard/personal`, `/speedytrial/dashboard/court` endpoints.

**Schema Surface (this feature):** read-only aggregation over `defendant_trackers`, `calculation_versions`, `exceptions`, `candidate_exclusions` — no dedicated writable table; see `Y0c-schema-speedytrial.md` §Portfolio Dashboard.
