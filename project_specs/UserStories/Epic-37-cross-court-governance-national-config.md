## Epic 37: Cross-Court Governance and National Configuration (F37)

### US-37.1: Define the National Configuration Baseline
**As a** system administrator (Priya Nandan, acting as national governance administrator), **I want to** define a national baseline configuration and designate which fields each court may locally override, **so that** many federal districts can share one codebase without ungoverned divergence.

**Acceptance Criteria:**
- [ ] National baseline defines `{field, default_value, court_overridable}` for each configurable item
- [ ] A court/division can never directly modify a field designated non-overridable at the national level; any such attempt is rejected at the API layer, not merely flagged after the fact
- [ ] All national baseline changes are audit-logged with the approving national administrator's identity

**Priority:** P3 | **Feature Ref:** F37

---

### US-37.2: Route Out-of-Scope Local Change Requests to Governance Review
**As a** system administrator (Priya Nandan), **I want to** have a court's request to change a nationally-fixed field routed to governance review rather than applied directly, **so that** local configuration changes stay within their permitted override scope.

**Acceptance Criteria:**
- [ ] A governance request requires a distinct `national_governance_admin` entitlement to approve, separate from any court's `config_admin` role, returning `GOVERNANCE_APPROVAL_DENIED` (403) otherwise
- [ ] Attempting to modify a locked field directly returns `GOVERNANCE_FIELD_LOCKED` (403)
- [ ] Cross-court consistency reports never expose one court's local configuration detail to another court's administrators, returning `GOVERNANCE_REPORT_SCOPE_DENIED` (403) for court-scoped requesters

**Priority:** P3 | **Feature Ref:** F37

---
