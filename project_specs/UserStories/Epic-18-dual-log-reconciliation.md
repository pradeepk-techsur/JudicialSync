## Epic 18: Dual-Log and Source Reconciliation (F18)

### US-18.1: Run a Reconciliation Checkpoint Against All Available Sources
**As a** courtroom deputy (Maria Santos), **I want to** compare the live ledger against party lists, my session log, jury package manifests, and disposition records at recess, day-end, trial-close, or on demand, **so that** discrepancies are caught before they pile up into a post-trial crisis.

**Acceptance Criteria:**
- [ ] A reconciliation run gathers every comparison source available for the proceeding at checkpoint time (ledger, session logs, submitted lists, jury package manifest, disposition records)
- [ ] A comparison source that fails to load during the run raises a `reconciliation_partial` exception rather than silently reporting "no discrepancies" (`RECONCILE_SOURCE_UNAVAILABLE`, 206)
- [ ] Each field-by-field or status mismatch generates a discrepancy record with all conflicting values preserved for review
- [ ] Reconciliation run history (checkpoint type, time, discrepancy count, resolution time) feeds operational reporting

**Priority:** P0 | **Feature Ref:** F18

---

### US-18.2: Resolve a Discrepancy with a Required Rationale
**As a** courtroom deputy (Maria Santos), **I want to** select or enter the correct resolved value for a discrepancy and provide a rationale, **so that** the ledger reflects a deliberate, documented decision rather than an unexplained correction.

**Acceptance Criteria:**
- [ ] A resolution submitted without rationale returns `RECONCILE_RATIONALE_REQUIRED` (422)
- [ ] If the resolved value differs from current ledger state, resolution updates the ledger as a new exhibit version plus audit event
- [ ] Resolution and rationale are fully audit-logged, consistent with the shared Exception Queue resolution pattern

**Priority:** P0 | **Feature Ref:** F18

---

### US-18.3: Block Checkpoint Completion on Unresolved High-Severity Discrepancies
**As a** clerk/case administrator (David Okafor), **I want to** prevent a reconciliation checkpoint from being marked complete while high-severity discrepancies remain open, **so that** the quality-control mechanism can't be bypassed without explicit, logged accountability.

**Acceptance Criteria:**
- [ ] A checkpoint completion attempt with unresolved high-severity discrepancies returns `RECONCILE_UNRESOLVED_HIGH_SEVERITY` (409)
- [ ] A supervisory override to bypass this gate requires its own separately logged rationale (double-gated)
- [ ] A non-supervisory role attempting the override returns `RECONCILE_OVERRIDE_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F18

---
