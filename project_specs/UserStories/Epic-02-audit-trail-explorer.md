## Epic 2: Audit Trail and Audit Explorer (F2)

### US-2.1: Reconstruct Case or User History via Audit Explorer
**As a** system administrator (Priya Nandan), **I want to** filter and reconstruct the full history of actions by case, user, date range, or object, **so that** I can answer who did what, when, and under which rule or calculation version during an incident review or appellate challenge.

**Acceptance Criteria:**
- [ ] Audit Explorer supports filtering by `case_id`, `user_id`, `date_range`, and `object_type`
- [ ] Each result shows actor, action type, before/after diff summary, and a link to the relevant rule-package or calculation version
- [ ] Audit read access requires a distinct `audit_reader` entitlement, never implied by operational edit roles
- [ ] A query without `audit_reader` entitlement returns `AUDIT_READ_DENIED` (403)
- [ ] Sealed/restricted-case audit entries require the same security-designation entitlement as the underlying record; unauthorized attempts return `AUDIT_DESIGNATION_DENIED` (403) and are themselves logged

**Priority:** P0 | **Feature Ref:** F2

---

### US-2.2: Guarantee Tamper-Evident, Hash-Chained Audit Logging
**As a** system administrator (Priya Nandan), **I want to** have every material action captured as an append-only, hash-chained audit entry, **so that** any retroactive edit to the audit trail is detectable.

**Acceptance Criteria:**
- [ ] Every status change, ruling, custody transfer, calculation override, and approval emits an audit event that commits atomically with the domain action (transactional outbox) — if the audit write fails, the domain action rolls back with `AUDIT_WRITE_FAILED` (500)
- [ ] Each audit row stores `prev_hash` and `row_hash`; no UPDATE/DELETE grants exist on the audit table for the application role
- [ ] A periodic integrity-verification job re-walks the hash chain and raises a critical (P0) exception-queue item on any detected break, not merely a log line
- [ ] Hash-chain break detection returns/escalates `AUDIT_CHAIN_BROKEN` to the security officer

**Priority:** P0 | **Feature Ref:** F2

---

### US-2.3: Separate Audit Read Access from Operational Editing
**As a** system administrator (Priya Nandan), **I want to** ensure a user with ledger-edit or calculation-edit rights does not automatically receive audit-read rights (and vice versa), **so that** separation of duties holds for the system's core accountability mechanism.

**Acceptance Criteria:**
- [ ] `audit_reader` is a distinct entitlement from any operational edit role
- [ ] The audit write API (`/audit/events`) is service-to-service only and never directly callable by end-user clients
- [ ] Audit Explorer is read-only; no edit or delete affordance exists anywhere in the UI
- [ ] Attempted direct access/delete calls against audit rows are rejected at the database-permission layer, not merely the application layer

**Priority:** P0 | **Feature Ref:** F2

---
