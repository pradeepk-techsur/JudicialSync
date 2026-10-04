## Epic 22: Jury Review Package Assembly (F22)

### US-22.1: Authorize Assembly of a Jury Review Package
**As a** judge (Judge Robert Hale), **I want to** authorize a jury package composed only of currently admitted electronic exhibits, **so that** jurors review a controlled, court-approved set rather than an unfiltered ledger.

**Acceptance Criteria:**
- [ ] Package composition requires `authorizing_judge_id` resolved to an actual judge for the proceeding, returning `JURY_AUTHORIZATION_DENIED` (403) otherwise
- [ ] Only `admitted`-status, electronically-reviewable exhibit types are eligible; attempts to include ineligible types return `JURY_INELIGIBLE_EXHIBIT` (422)
- [ ] Sealed exhibits are excluded unless individually authorized by the same judge for this specific package instance
- [ ] Package composition is itself distinctly audit-logged as a judicial authorization of scope

**Priority:** P2 | **Feature Ref:** F22

---

### US-22.2: Confirm Composition and Deliver a Session-Scoped, Access-Controlled Package
**As a** jury administrator (Carla Jimenez), **I want to** confirm the system-assembled package matches the judge's authorized scope and then deliver it only during an active, time-bounded review session, **so that** jury access to admitted evidence is confirmed-correct, controlled, and logged — never silently assembled or opened without my check.

**Acceptance Criteria:**
- [ ] Composition confirmation is a distinct, logged action separate from the judge's authorization (US-22.1) — the candidate package is not delivered until the jury administrator confirms it matches the authorized scope
- [ ] A composition discrepancy (candidate package does not match authorized scope) is flagged back to chambers rather than silently adjusted or confirmed as-is
- [ ] Access outside the authorized session window is denied, returning `JURY_SESSION_EXPIRED` (403)
- [ ] Every package access event (open, view individual exhibit, session end) is logged
- [ ] A delivered package is immutable; any composition change requires a new package version, returning `JURY_PACKAGE_IMMUTABLE` (409) on in-place edit attempts
- [ ] If the admitted-exhibit set changes after assembly (e.g., a late ruling), the package does not silently update — it requires a new confirmed version

**Priority:** P2 | **Feature Ref:** F22

---
