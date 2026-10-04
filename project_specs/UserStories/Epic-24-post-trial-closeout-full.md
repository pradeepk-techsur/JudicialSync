## Epic 24: Post-Trial Closeout (Full) (F24)

### US-24.1: Generate the Appeal-Ready Closeout Package
**As a** clerk/case administrator (David Okafor), **I want to** generate a complete closeout package — exhibit list, custody chain, ruling history, and reconciliation summary — once a proceeding concludes, **so that** I can produce an appeal-ready record without manually reassembling it across spreadsheets.

**Acceptance Criteria:**
- [ ] Full closeout cannot begin while reconciliation (F18) has unresolved high-severity discrepancies, returning `CLOSEOUT_UNRESOLVED_RECONCILIATION` (409)
- [ ] Every exhibit must have a determinable disposition action before the package is marked complete; undeterminable cases route to an exception rather than being silently omitted (`CLOSEOUT_NO_DISPOSITION_PATH`, 422)
- [ ] Certification requires `clerk_case_admin` entitlement, returning `CLOSEOUT_CERTIFY_DENIED` (403) otherwise
- [ ] Certification references the full snapshot of every included record's version at time of certification

**Priority:** P2 | **Feature Ref:** F24

---

### US-24.2: Generate Disposition Tasks and Receipts
**As a** courtroom deputy (Maria Santos), **I want to** receive a disposition task per exhibit requiring return, retention, transfer, or scheduled destruction, with a receipt generated for each completed action, **so that** post-trial exhibit handling is tracked as deliberately as courtroom logging.

**Acceptance Criteria:**
- [ ] Disposition action is determined per exhibit based on status, type, and the court's retention schedule
- [ ] Destruction cannot be executed before the configured retention period has elapsed, returning `CLOSEOUT_RETENTION_NOT_ELAPSED` (409) as a hard validation
- [ ] A receipt is generated for every disposition action, and the exhibit's custody record updates with the final disposition
- [ ] Disposition tasks are surfaced via the shared work queue and tracked to completion

**Priority:** P2 | **Feature Ref:** F24

---
