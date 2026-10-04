## Epic 19: Exportable Exhibit List and Basic Closeout (F19)

### US-19.1: Export a Filtered Exhibit List
**As a** courtroom deputy (Maria Santos), **I want to** generate a one-click export of admitted (or otherwise filtered) exhibits for a proceeding, **so that** I can produce a clean, usable record for the judge, parties, or an interim closeout without re-typing anything.

**Acceptance Criteria:**
- [ ] Export supports filtering by status (e.g., `['admitted']`) and generates a structured artifact listing identifier, description, party, status, and ruling reference
- [ ] A proceeding with no matching exhibits returns `EXPORT_NO_MATCHING_EXHIBITS` (404)
- [ ] The export is explicitly labeled as a non-final, interim record where full post-trial closeout (F24) has not yet occurred

**Priority:** P1 | **Feature Ref:** F19

---

### US-19.2: Certify an Export Against a Snapshot of Ledger State
**As a** clerk/case administrator (David Okafor), **I want to** explicitly certify a generated export as accurate at the time it was produced, **so that** later ledger changes don't retroactively alter what a previously certified export is understood to contain.

**Acceptance Criteria:**
- [ ] Certification requires `clerk_case_admin` or `courtroom_deputy` entitlement, returning `EXPORT_CERTIFY_DENIED` (403) otherwise
- [ ] Certification is a distinct confirmation action, not implied merely by generating or downloading a preview; certifying without prior generation returns `EXPORT_NOT_GENERATED` (409)
- [ ] Every certified export retains a snapshot reference to the exact exhibit version(s) included
- [ ] Certification is logged to the audit trail with the ledger state snapshot reference

**Priority:** P1 | **Feature Ref:** F19

---
