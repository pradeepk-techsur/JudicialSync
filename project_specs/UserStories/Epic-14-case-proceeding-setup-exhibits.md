## Epic 14: Case and Proceeding Setup for Exhibits (F14)

### US-14.1: Activate Exhibit Tracking for a Case
**As a** clerk/case administrator (David Okafor), **I want to** activate exhibit tracking on a case once its proceeding and parties exist, **so that** intake and ledger operations are unlocked only after proper setup.

**Acceptance Criteria:**
- [ ] A case must have at least one proceeding before exhibit tracking can be activated, returning `EXHIBIT_SETUP_NO_PROCEEDING` (422) otherwise
- [ ] Only users with `clerk_case_admin` or higher entitlement may activate exhibit tracking, returning `EXHIBIT_SETUP_DENIED` (403) otherwise
- [ ] Setup completion marks the case/proceeding as "exhibit-tracking active," unlocking F15 intake and F16 ledger operations
- [ ] Re-running setup on an already-active case is idempotent — it never resets or duplicates existing exhibit records

**Priority:** P0 | **Feature Ref:** F14

---

### US-14.2: Configure Numbering Scheme and Security Designations per Case
**As a** clerk/case administrator (David Okafor), **I want to** select an active numbering scheme and apply security designations relevant to exhibits for this case, **so that** exhibit identifiers and sensitive-item handling follow the court's published configuration.

**Acceptance Criteria:**
- [ ] Numbering scheme must be an active, published scheme from the Configuration Engine; an invalid/unpublished scheme returns `EXHIBIT_SETUP_INVALID_SCHEME` (422)
- [ ] Numbering scheme cannot be changed after exhibits have already been assigned, returning `EXHIBIT_SETUP_SCHEME_LOCKED` (409)
- [ ] Setup completion and designation choices are logged to the audit trail
- [ ] Setup binds at least prosecution and defense (or equivalent) parties to the proceeding before activation

**Priority:** P0 | **Feature Ref:** F14

---
