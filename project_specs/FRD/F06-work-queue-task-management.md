## F06: Work Queue and Task Management

**Description:** Surfaces items requiring user action — pending reviews, unresolved exceptions, approvals — in role-scoped queues, so users work from a prioritized list instead of searching entire cases for what needs attention. This feature is the primary "inbox" pattern consumed by courtroom deputies, clerks, and chambers across both modules.

**Terminology:**
- **Task:** A unit of required human action (review a candidate exclusion, resolve an exception, approve a configuration change, acknowledge a custody transfer) with an owner role/user, status, and due/age indicator.
- **Work Queue:** A role-scoped, filterable view aggregating open tasks relevant to the viewing user.

**Sub-features:**
- Role-scoped task/work-queue views (deputy, clerk, chambers, admin)
- Task assignment, status, and completion tracking
- Cross-module aggregation (exhibit tasks + Speedy Trial tasks in one view where appropriate)

**Process:**
1. A triggering feature (F18 reconciliation discrepancy, F28 candidate exclusion, F30 approval request, F33 continuance findings flag) creates a task via the Task API: task type, owner role or specific user, related object reference, priority, created timestamp.
2. Task appears in the relevant role-scoped work queue(s) — e.g., a candidate exclusion task appears in the chambers/clerk queue per F03 workflow-role configuration.
3. User opens a task from the queue, which deep-links to the underlying object's detail/review view (e.g., F28's candidate exclusion review screen).
4. User completes the required action in the source feature (accept/reject/resolve); the source feature marks the task `completed` with a reference to the resulting audit event (F02).
5. Completed tasks age out of the active queue but remain queryable in a completed-task history for a configurable retention window.
6. Tasks that remain open beyond a configured age threshold are flagged (visually and optionally via F04 escalation notification) to support the "aging indicators" requirement shared with F07.

**Inputs:**
- `task_type` (enum, required): exception_resolution | exclusion_review | approval_request | custody_acknowledgment | continuance_findings_review | config_approval
- `owner_role` or `owner_user_id` (required, at least one)
- `object_reference` (object_type, object_id, required)
- `priority` (enum, optional, default `normal`): low | normal | high | urgent

**Outputs:**
- Task record with current status (`open`, `in_progress`, `completed`, `dismissed`)
- Role-scoped queue view: list of open tasks sorted by priority then age
- Cross-module aggregate view (exhibit + Speedy Trial tasks combined, filterable by module)

**Validation:**
- A task cannot be marked `completed` without a reference to the audit event produced by the underlying completing action (no "quiet" task dismissal that leaves no audit trace for a legally significant action).
- Tasks related to legally significant actions (exclusion review, approval request, continuance findings review) cannot be `dismissed` without a captured rationale (shared requirement with F07).
- A task's owner_role assignment must resolve to at least one user with that role in the relevant court/division scope at creation time; otherwise the task creation itself raises an exception (F07) rather than silently creating an orphaned task.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Task created with unresolvable owner_role | 422 | TASK_NO_ELIGIBLE_OWNER | "No user holds the required role to receive this task" |
| Dismiss attempted without rationale on legally significant task | 422 | TASK_RATIONALE_REQUIRED | "A rationale is required to dismiss this task" |
| Complete attempted without audit event reference | 500 (internal guard) | TASK_MISSING_AUDIT_REF | "Task cannot be completed without an audit record" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Work Queue for `/tasks`, `/tasks/my-queue`, `/tasks/{id}/complete`, `/tasks/{id}/dismiss` endpoints.

**Schema Surface (this feature):** uses table `tasks` — see `Y0a-schema-shared.md` §Work Queue.
