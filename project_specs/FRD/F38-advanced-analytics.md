## F38: Advanced Analytics

**Description:** Deeper operational and risk analytics across courts/dockets beyond the baseline reporting feed (F09), supporting AO-level program management with cross-court trend analysis — strictly bounded to inform program management, never judicial determinations.

**Terminology:**
- **Trend Analysis:** Multi-court, multi-period comparison of operational metrics (discrepancy rates, reconciliation effort, alert effectiveness) to identify systemic patterns.

**Sub-features:**
- Cross-court trend analysis (discrepancy rates, reconciliation effort, alert effectiveness)
- De-identified / role-limited analytics exports
- Explicit guardrail: analytics inform program management only, never judicial determinations

**Process:**
1. AO program manager (or equivalent cross-court analytics role) requests a trend analysis across a selected set of courts and a time period, choosing from available metric categories (discrepancy rate trends from F18, reconciliation effort trends, alert effectiveness/acknowledgment-rate trends from F31).
2. System aggregates the requested metrics at court-level granularity across the selected courts/period, applying the same de-identification discipline as F09 (no case- or defendant-level detail, ever, in this cross-court context).
3. System renders trend visualizations (charts, period-over-period comparisons) and supports export.
4. Every analytics surface carries the same persistent guardrail labeling as F09: "Administrative/program metrics — not for use in case determinations," reinforced here because cross-court trend data could otherwise tempt interpretation as implying judicial performance evaluation, which is explicitly out of scope.

**Inputs:**
- `court_ids[]` (selected courts, within requester's authorized cross-court scope)
- `metric_categories[]`
- `period` (date range, comparison granularity)

**Outputs:**
- Trend visualization/dashboard
- Export artifact (de-identified, court-level granularity minimum)

**Validation:**
- No individual case, defendant, or named exhibit may appear in any advanced analytics output, regardless of requester's underlying case-level entitlements elsewhere in the system — this surface is strictly aggregate-only, with no drill-through path (distinguishing it from F36's court-level dashboard, which does permit authorized drill-through).
- Access requires a distinct `ao_program_analytics` entitlement, separate from both routine operational roles and the F09 baseline reporting role.
- Any proposed metric that could function as a proxy for judicial decision evaluation (e.g., ruling outcome rates by judge) is explicitly excluded from the available metric catalog by design, not merely by policy — the metric catalog structurally does not include judge-attributed outcome metrics.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Requester lacks ao_program_analytics entitlement | 403 | ANALYTICS_ACCESS_DENIED | "You do not have advanced analytics access" |
| Attempt to request a judge-outcome-attributed metric | 422 (structurally unavailable) | ANALYTICS_METRIC_OUT_OF_SCOPE | "This metric is not available; judicial outcome evaluation is out of scope" |
| Cross-court scope exceeds requester's authorization | 403 | ANALYTICS_SCOPE_DENIED | "One or more requested courts are outside your authorized scope" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Advanced Analytics for `/analytics/trends`, `/analytics/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over F09's reporting views plus historical trend storage in `analytics_trend_snapshots` — see `Y0a-schema-shared.md` §Advanced Analytics.
