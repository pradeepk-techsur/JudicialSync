## Epic 38: Advanced Analytics (F38)

### US-38.1: View Cross-Court Trend Analytics for Program Management
**As a** system administrator (Priya Nandan, supporting AO program management), **I want to** view de-identified, cross-court trend analysis of discrepancy rates, reconciliation effort, and alert effectiveness, **so that** I can support program management decisions without ever evaluating judicial performance.

**Acceptance Criteria:**
- [ ] No individual case, defendant, or named exhibit may appear in any advanced analytics output, regardless of the requester's underlying case-level entitlements — this surface is strictly aggregate-only with no drill-through
- [ ] Access requires a distinct `ao_program_analytics` entitlement, separate from routine operational roles and the F09 baseline reporting role, returning `ANALYTICS_ACCESS_DENIED` (403) otherwise
- [ ] Any metric that could function as a proxy for judicial decision evaluation (e.g., ruling-outcome rates by judge) is structurally excluded from the metric catalog, returning `ANALYTICS_METRIC_OUT_OF_SCOPE` (422) if requested
- [ ] A cross-court scope exceeding the requester's authorization returns `ANALYTICS_SCOPE_DENIED` (403)
- [ ] Every analytics surface carries the persistent guardrail label: "Administrative/program metrics — not for use in case determinations"

**Priority:** P3 | **Feature Ref:** F38

---
