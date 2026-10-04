## Epic 25: Exhibit Portfolio Dashboard and Court Templates (F25)

### US-25.1: View Cross-Case Exhibit Operations Portfolio
**As a** clerk/case administrator (David Okafor), **I want to** see a portfolio-level view of open exceptions, outstanding custody items, and closeout backlog across my full caseload, **so that** I don't have to check each case individually.

**Acceptance Criteria:**
- [ ] Dashboard aggregates across all cases/proceedings within the viewer's authorized court/division scope
- [ ] Dashboard supports drill-through to underlying case/proceeding detail, scoped to the viewer's own authorized caseload
- [ ] Access outside the viewer's authorized scope returns `PORTFOLIO_SCOPE_DENIED` (403) — a clerk never sees another court's portfolio

**Priority:** P3 | **Feature Ref:** F25

---

### US-25.2: Create and Apply Reusable Court Configuration Templates
**As a** system administrator (Priya Nandan), **I want to** export a court's exhibit configuration as a versioned template and apply it when onboarding a new court, **so that** new-court setup is faster and consistent.

**Acceptance Criteria:**
- [ ] Template creation requires `system_admin` entitlement, returning `TEMPLATE_CREATE_DENIED` (403) otherwise
- [ ] Template application to a new court requires the same maker-checker approval pattern as general configuration changes, returning `TEMPLATE_SOD_VIOLATION` (403) without a second approver
- [ ] A template, once published and applied to at least one court, is immutable — further changes create a new version, returning `TEMPLATE_VERSION_IMMUTABLE` (409) on edit attempts

**Priority:** P3 | **Feature Ref:** F25

---
