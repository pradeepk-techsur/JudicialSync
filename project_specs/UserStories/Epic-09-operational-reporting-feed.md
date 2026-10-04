## Epic 9: Operational Reporting Feed (F9)

### US-9.1: View De-Identified Operational Dashboards
**As a** court administrator (Thomas Reyes), **I want to** view backlog age, data quality, and adoption metrics aggregated for my court without any defendant or party names shown, **so that** I can assess operational health without exposing case substance.

**Acceptance Criteria:**
- [ ] Court-level dashboards show only counts, rates, and ages — never individual defendant, party, or attorney names
- [ ] Every reporting surface carries a persistent label: "Administrative metrics — not for use in case determinations"
- [ ] A requester scope exceeding their authorized aggregation level returns `REPORT_SCOPE_DENIED` (403)
- [ ] Cross-court (AO-level) views aggregate at court granularity minimum, with no single-case-level detail exposed

**Priority:** P1 | **Feature Ref:** F9

---

### US-9.2: Export Role-Limited Operational Metrics
**As a** court administrator (Thomas Reyes), **I want to** generate an on-demand export of operational metrics, **so that** I can share adoption and data-quality indicators with court leadership or AO program managers.

**Acceptance Criteria:**
- [ ] Export access requires a distinct `reporting_viewer` entitlement, separate from operational edit roles
- [ ] A requester lacking `reporting_viewer` receives `REPORT_ACCESS_DENIED` (403)
- [ ] An unsupported metric combination returns `REPORT_INVALID_METRIC_SET` (422)
- [ ] Export file applies the same de-identification rules as the dashboard view

**Priority:** P1 | **Feature Ref:** F9

---
