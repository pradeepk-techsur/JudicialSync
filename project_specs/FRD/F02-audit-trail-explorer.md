## F02: Audit Trail and Audit Explorer

**Description:** Captures a tamper-evident, immutable record of every material action across both modules — status changes, rulings, custody transfers, calculation overrides, approvals — and provides an Audit Explorer UI to reconstruct who did what, when, and under which rule or calculation version. This is the system's core accountability mechanism and a binding requirement for appellate-review suitability.

**Terminology:**
- **Material Action:** Any state transition the PRD designates as audit-worthy: status change, ruling, custody transfer, calculation override, approval/confirmation, security-designation change, configuration change.
- **Tamper-Evident:** The audit log is append-only and cryptographically chainable (each entry's hash includes the prior entry's hash) such that any retroactive edit is detectable, even if not cryptographically impossible to attempt.
- **Audit Explorer:** The read-only UI/API surface for reconstructing history by case, user, date range, or object.

**Sub-features:**
- Append-only audit event capture triggered by every material action across both modules
- Hash-chained tamper-evidence (each audit row stores `prev_hash` and `row_hash`)
- Strict separation of audit read access from operational edit access (a user with ledger-edit rights does not automatically get audit-read rights, and vice versa)
- Audit Explorer UI: filter/reconstruct by case, user, date range, object type/ID
- Linkage of every audit entry to the specific configuration/rule-package version or calculation version in effect at action time

**Process:**
1. Any feature performing a material action calls the shared Audit Service (internal API, not directly exposed) with: actor, action type, object type/ID, before-state, after-state, rule/calculation version reference (if applicable), timestamp, and client context (IP, session ID).
2. Audit Service computes `row_hash = hash(row_content + prev_hash)` and persists the entry as a new append-only row; no update or delete operation is ever issued against this table at the application layer, and database-level permissions enforce this (no UPDATE/DELETE grants on the audit table for the application role).
3. Audit entry is immediately queryable via the Audit Explorer API, scoped by the requester's access rights to the underlying case/object (an auditor cannot see sealed-case audit entries without the sealed-record entitlement).
4. Periodic integrity verification job re-walks the hash chain and raises an exception-queue item (F07) if any break is detected.
5. Audit Explorer UI renders a chronological, filterable reconstruction; each entry deep-links to the relevant object detail view (exhibit, tracker, calculation version).

**Inputs:**
- `actor_id` (UUID, required, system-supplied from session — never client-supplied)
- `action_type` (enum, required): status_change | ruling | custody_transfer | calculation_override | approval | designation_change | config_change | access_attempt
- `object_type`, `object_id` (required)
- `before_state`, `after_state` (JSON, required for state-changing actions)
- `rule_version_ref` / `calculation_version_ref` (UUID, conditional — required when the action relates to a versioned calculation or rule package)
- Explorer query inputs: `case_id`, `user_id`, `date_range`, `object_type` (all optional filters)

**Outputs:**
- Persisted audit event row (immutable)
- Audit Explorer result set: chronological list of audit events matching filter, each with actor, action, before/after diff summary, rule/calculation version link

**Validation:**
- Every status-changing operation in F16 (ledger), F17 (courtroom logging), F20 (custody), F29/F30 (calculation/review) **must** emit a corresponding audit event before the operation is considered complete (enforced via transactional outbox pattern — the audit write and the domain write commit atomically, or neither does).
- Audit read access requires a distinct `audit_reader` entitlement, never implied by operational edit roles alone (separation of duties, per NFR "Auditability").
- Sealed/restricted-case audit entries are themselves access-restricted — viewing them requires the same security-designation entitlement as viewing the underlying record, and the *attempt* to view a sealed audit entry without entitlement is itself logged as an audit event (access_attempt).
- Hash-chain verification failures must raise a P0 exception-queue item, not merely a log line.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Audit write fails during transactional domain action | 500 | AUDIT_WRITE_FAILED | "Action could not be completed; audit record failed" (transaction rolled back) |
| Explorer query without audit_reader entitlement | 403 | AUDIT_READ_DENIED | "You do not have audit explorer access" |
| Explorer query against sealed case without designation entitlement | 403 | AUDIT_DESIGNATION_DENIED | "This case's audit history requires additional authorization" |
| Hash-chain integrity break detected | 500 (internal alert, not user-facing) | AUDIT_CHAIN_BROKEN | "Audit integrity check failed — escalated to security officer" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Audit for `/audit/events` (internal write, service-to-service only) and `/audit/explorer` (read, user-facing) endpoints.

**Schema Surface (this feature):** uses table `audit_events` (append-only, hash-chained) — see `Y0a-schema-shared.md` §Audit. Referenced by nearly every other table via `object_type`/`object_id` polymorphic linkage.
