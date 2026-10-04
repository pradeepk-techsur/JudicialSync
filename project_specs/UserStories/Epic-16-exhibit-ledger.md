## Epic 16: Exhibit Ledger (F16)

### US-16.1: Maintain One Authoritative Exhibit Status Record
**As a** courtroom deputy (Maria Santos), **I want to** have one current, authoritative ledger entry per exhibit instead of a personal shadow spreadsheet, **so that** every module (jury package, closeout, timeline, search) reads the same current status.

**Acceptance Criteria:**
- [ ] Ledger entries are created either from an accepted F15 intake submission (`proposed`) or directly during courtroom proceedings (F17) for unlisted items
- [ ] Each status transition creates a new append-style exhibit version rather than destructively mutating the canonical row
- [ ] Every status transition emits an audit event with before/after status, actor, and timestamp
- [ ] No prior exhibit version can be edited or deleted after creation, returning `LEDGER_VERSION_IMMUTABLE` (403, internal guard) if attempted

**Priority:** P0 | **Feature Ref:** F16

---

### US-16.2: Enforce Court-Configured Workflow Transitions
**As a** courtroom deputy (Maria Santos), **I want to** have status transitions validated against the court's configured workflow states, **so that** an exhibit can't be moved into an invalid or nonsensical status.

**Acceptance Criteria:**
- [ ] An invalid transition for the current state (e.g., `rejected` directly to `admitted` without re-offer) returns `LEDGER_INVALID_TRANSITION` (409) unless explicitly configured
- [ ] Identifier assignment must conform to the active numbering scheme; a non-conforming manual identifier returns `LEDGER_INVALID_IDENTIFIER` (422)
- [ ] Confidentiality/location changes on a security-designated exhibit require the F21 sealing entitlement, not merely general ledger-edit rights, returning `LEDGER_DESIGNATION_DENIED` (403) otherwise

**Priority:** P0 | **Feature Ref:** F16

---

### US-16.3: Attribute Every Ruling to the Presiding Judge
**As a** courtroom deputy (Maria Santos), **I want to** have admit/reject ruling transitions always attributed to the presiding judge of record, **so that** the system never appears to decide a ruling on its own.

**Acceptance Criteria:**
- [ ] An admit/reject transition must carry a `ruling_actor_id` attributed to a user holding the `judge` role for that proceeding — never defaulted or auto-inferred
- [ ] A ruling attempted without judge attribution returns `LEDGER_RULING_ACTOR_REQUIRED` (422)
- [ ] The deputy's action records "the judge ruled," never originates or infers the ruling content itself
- [ ] Ruling attribution and timestamp are part of the audit-event payload for that transition

**Priority:** P0 | **Feature Ref:** F16

---
