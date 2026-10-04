## Epic 12: Restricted External Attorney Portal (F12)

### US-12.1: Submit Structured Exhibit Metadata as an Authorized Attorney
**As an** authorized external attorney (restricted portal user), **I want to** submit proposed exhibit metadata or deficiency corrections for a case where I am a party of record, **so that** my submissions enter the standard intake review process without me ever writing directly to the official ledger.

**Acceptance Criteria:**
- [ ] Submission is only permitted for cases/proceedings where the attorney holds an active, CM/ECF-sourced party-of-record association — not self-asserted
- [ ] Submission enters `proposed` state tagged `submitted_via = 'external_portal'` and routes into the standard F15 intake validation flow
- [ ] An attorney with no party-of-record association for the case receives `PORTAL_NOT_PARTY_OF_RECORD` (403)
- [ ] All external submissions are immutably logged with the submitting attorney's identity, feeding the same audit trail as internal submissions

**Priority:** P1 | **Feature Ref:** F12

---

### US-12.2: View Read-Only Speedy Trial Deadline Information
**As an** authorized external attorney (restricted portal user), **I want to** view a read-only Speedy Trial summary for my associated defendant, **so that** I understand remaining time and next thresholds without accessing full explainability or override detail.

**Acceptance Criteria:**
- [ ] Portal visibility is limited to a confirmed-calculation summary (remaining time, next threshold, confirmed trigger/exclusion periods) per the court's configured visibility level
- [ ] Sealed/restricted/grand-jury/juvenile cases are never visible through the portal unless explicitly and individually authorized by the court
- [ ] Attempting to view a security-designated case returns `PORTAL_DESIGNATION_DENIED` (403)
- [ ] External principal tokens are structurally distinct (different issuer/audience claim) so no internal write API can be invoked via a portal token

**Priority:** P1 | **Feature Ref:** F12

---

### US-12.3: Review and Accept External Attorney Submissions
**As a** clerk/case administrator (David Okafor), **I want to** review attorney-submitted exhibit metadata through the same intake queue as internal submissions, **so that** external submissions receive identical validation and oversight before entering the ledger.

**Acceptance Criteria:**
- [ ] External submissions appear in the same F15 intake queue, distinguished only by `submitted_via = 'external_portal'`
- [ ] An external submitter attempting to self-accept their own submission receives `PORTAL_WRITE_DENIED` / `INTAKE_EXTERNAL_ACCEPT_DENIED` (403)
- [ ] Clerk accept/reject/request-correction decisions are logged to the audit trail identically to internally-submitted exhibits
- [ ] An expired or invalid external IdP assertion returns `PORTAL_AUTH_FAILED` (401)

**Priority:** P1 | **Feature Ref:** F12

---
