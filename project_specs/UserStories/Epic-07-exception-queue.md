## Epic 7: Exception Queue (F7)

### US-7.1: Resolve a Flagged Exception with a Documented Rationale
**As a** clerk/case administrator (David Okafor), **I want to** review a flagged discrepancy, missing-metadata, or unmapped-event exception and resolve it with a required rationale, **so that** data-quality issues are fixed deliberately rather than silently cleared.

**Acceptance Criteria:**
- [ ] An exception cannot be marked `resolved` without a non-empty rationale of at least 10 characters, returning `EXCEPTION_RATIONALE_REQUIRED` or `EXCEPTION_RATIONALE_TOO_SHORT` (422) otherwise
- [ ] A resolution action must be type-appropriate to the exception (e.g., a reconciliation mismatch resolution must reference which source value was accepted), otherwise returning `EXCEPTION_ACTION_TYPE_MISMATCH` (422)
- [ ] Resolution and rationale are logged as an audit event, and the exception's age-at-resolution feeds operational reporting
- [ ] Exceptions tied to legally significant data route to a role with the appropriate review authority, not merely any available clerk

**Priority:** P0 | **Feature Ref:** F7

---

### US-7.2: Prioritize Oldest Unresolved Exceptions and Block Auto-Closing Critical Items
**As a** clerk/case administrator (David Okafor), **I want to** see exceptions sorted by age and severity, with critical exceptions never auto-closed, **so that** the oldest and highest-risk issues get attention first.

**Acceptance Criteria:**
- [ ] Exception Queue is filterable by module, type, severity, and age, with a visible aging indicator
- [ ] A critical-severity exception (e.g., `audit_integrity_break`) cannot be auto-closed by any batch process, returning `EXCEPTION_CRITICAL_MANUAL_ONLY` (403, internal guard) if attempted
- [ ] Unresolved exceptions beyond a configured age threshold escalate via notification to a supervisory role
- [ ] Exception creation captures type, severity, object reference, detected timestamp, and detecting feature for full traceability

**Priority:** P0 | **Feature Ref:** F7

---
