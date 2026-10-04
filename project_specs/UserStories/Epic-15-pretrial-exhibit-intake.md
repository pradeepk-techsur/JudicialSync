## Epic 15: Pretrial Exhibit Intake (F15)

### US-15.1: Submit a Structured Exhibit List with Optional File
**As a** clerk/case administrator (David Okafor), **I want to** submit a structured exhibit list entry with description, offering party, type, and an optional file, **so that** proposed exhibits enter a controlled intake pipeline rather than an ad hoc submission.

**Acceptance Criteria:**
- [ ] Required fields (description, offering_party_id, proceeding_id, exhibit_type) must be present; missing fields route to the Exception Queue rather than silent rejection, via `INTAKE_MISSING_METADATA` (422)
- [ ] Any attached file passes malware scanning and the file-type allowlist (F13) before further processing, returning `INTAKE_FILE_REJECTED` (422) on scan failure
- [ ] Unsupported file formats return `INTAKE_UNSUPPORTED_FORMAT` (422)
- [ ] Submission is created in `proposed` state pending clerk/deputy review

**Priority:** P0 | **Feature Ref:** F15

---

### US-15.2: Detect Duplicate Submissions Automatically
**As a** clerk/case administrator (David Okafor), **I want to** have duplicate exhibit submissions automatically flagged, **so that** I catch redundant entries before they reach the courtroom.

**Acceptance Criteria:**
- [ ] Duplicate detection compares offering party + description similarity + file hash (if present) within the same proceeding
- [ ] An exact file-hash match is always flagged as a duplicate, returning `INTAKE_DUPLICATE` (409)
- [ ] Flagged duplicates route to the shared Exception Queue with both/all conflicting submissions preserved for review
- [ ] Submitter is notified when correction or clarification is needed

**Priority:** P0 | **Feature Ref:** F15

---

### US-15.3: Accept, Reject, or Request Correction on a Submission
**As a** clerk/case administrator (David Okafor), **I want to** explicitly accept, reject, or request correction on each intake submission, **so that** only validated, deliberately-reviewed exhibits are promoted onto the ledger.

**Acceptance Criteria:**
- [ ] Only users with `clerk_case_admin` or `courtroom_deputy` entitlement may accept/reject/request-correction; unauthorized attempts return `INTAKE_REVIEW_DENIED` (403)
- [ ] Acceptance promotes the submission to a F16 ledger entry in `proposed` status
- [ ] A rejection or correction request must carry a reason/detail relayed back to the submitter — never a bare rejection
- [ ] External submitters can never self-accept their own submission, returning `INTAKE_EXTERNAL_ACCEPT_DENIED` (403)

**Priority:** P0 | **Feature Ref:** F15

---
