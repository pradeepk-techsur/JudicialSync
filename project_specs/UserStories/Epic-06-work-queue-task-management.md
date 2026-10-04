## Epic 6: Work Queue and Task Management (F6)

### US-6.1: View My Role-Scoped Work Queue
**As a** clerk/case administrator (David Okafor), **I want to** see a prioritized list of pending reviews, exceptions, and approvals relevant to my role, **so that** I work from a queue instead of searching entire cases for what needs attention.

**Acceptance Criteria:**
- [ ] Queue view is scoped to the viewing user's role (deputy, clerk, chambers, admin) and sorted by priority then age
- [ ] Cross-module tasks (exhibit + Speedy Trial) can be viewed together, filterable by module
- [ ] Tasks open beyond a configured age threshold are visually flagged and optionally escalated via notification
- [ ] A task created with an unresolvable `owner_role` raises `TASK_NO_ELIGIBLE_OWNER` (422) instead of silently creating an orphaned task

**Priority:** P0 | **Feature Ref:** F6

---

### US-6.2: Complete a Task with a Captured Audit Reference
**As a** judge (Judge Robert Hale), **I want to** complete a review task directly from the queue and have it reference the resulting audit event, **so that** no legally significant task can be quietly dismissed without an audit trace.

**Acceptance Criteria:**
- [ ] A task cannot be marked `completed` without a reference to the audit event produced by the underlying action; attempting this without one returns `TASK_MISSING_AUDIT_REF` (500, internal guard)
- [ ] Tasks tied to legally significant actions (exclusion review, approval request, continuance findings review) cannot be dismissed without a captured rationale, returning `TASK_RATIONALE_REQUIRED` (422) otherwise
- [ ] Opening a task deep-links directly to the underlying object's detail/review view
- [ ] Completed tasks age out of the active queue but remain queryable in history for a configurable retention window

**Priority:** P0 | **Feature Ref:** F6

---
