## F09: Operational Reporting Feed

**Description:** Produces outbound, role-limited or de-identified operational metrics (backlog, data quality, adoption indicators) for court administrators and AO program managers, explicitly guarded against influencing judicial determinations. This is administrative analytics, not case-outcome analytics.

**Terminology:**
- **De-identified Export:** A reporting output with defendant/party/attorney identifying detail removed or aggregated beyond re-identification risk for the intended audience.
- **Adoption Indicator:** A metric reflecting system usage health (e.g., manual-parallel-tracking incidents, task completion rates) rather than case substance.

**Sub-features:**
- Operational dashboards for configuration consistency, backlog age, and adoption metrics
- Role-limited / de-identified export suitable for administrative review
- Explicit design guard against using aggregate analytics to alter judicial decisions

**Process:**
1. Reporting feed periodically aggregates operational metrics from F06 (task completion), F07 (exception age/volume), F18 (reconciliation discrepancy counts), F31 (alert delivery/acknowledgment rates) across the admin's authorized court/division scope.
2. Aggregation applies de-identification rules appropriate to the requesting role (court_admin sees court-level aggregates without defendant names; AO program manager may see cross-court aggregates with court-level, not case-level, granularity).
3. Dashboard renders metrics with no drill-through path into individual case/defendant records for the de-identified view tier (drill-through to case detail requires the viewer's own independent case-access entitlement, not granted by the reporting feed itself).
4. Export (CSV/structured) is generated on demand, carrying the same de-identification rules as the dashboard.
5. All reporting outputs carry a persistent UI label: "Administrative metrics — not for use in case determinations," reinforcing the human-in-command NFR.

**Inputs:**
- `scope` (court_id, division_id, or cross-court per role entitlement)
- `metric_set[]` (requested metric categories): backlog_age | exception_volume | adoption_rate | config_consistency | alert_effectiveness
- `date_range` (optional)

**Outputs:**
- Dashboard view with aggregate metrics, charts, trend indicators
- On-demand export file (CSV/structured), de-identified per role

**Validation:**
- Court-level dashboards must not expose individual defendant names, party names, or attorney names in aggregate metric displays — only counts, rates, and ages.
- Cross-court (AO-level) views aggregate at court granularity minimum; no cross-court view may expose single-case-level detail.
- Export access requires a distinct `reporting_viewer` entitlement, separate from operational edit roles.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Requester lacks reporting_viewer entitlement | 403 | REPORT_ACCESS_DENIED | "You do not have reporting access" |
| Requested scope exceeds role's authorized aggregation level | 403 | REPORT_SCOPE_DENIED | "This aggregation level is not available to your role" |
| Export requested for unsupported metric combination | 422 | REPORT_INVALID_METRIC_SET | "Requested metric combination is not supported" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Reporting for `/reporting/dashboard`, `/reporting/export` endpoints.

**Schema Surface (this feature):** read-only aggregation over `tasks`, `exceptions`, `reconciliation_runs`, `notification_deliveries` — no dedicated writable table; see `Y0a-schema-shared.md` §Reporting (aggregate view definitions).
