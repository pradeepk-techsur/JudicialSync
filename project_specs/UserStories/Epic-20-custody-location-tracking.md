## Epic 20: Custody and Location Tracking (F20)

### US-20.1: Record a Custody Transfer with Purpose and Condition
**As a** courtroom deputy (Maria Santos), **I want to** initiate a custody transfer specifying recipient, purpose, location, and condition, **so that** every change of possession is explicit and traceable instead of tracked on a paper sign-out sheet.

**Acceptance Criteria:**
- [ ] A transfer to an unregistered/unknown custodian is rejected with `CUSTODY_UNKNOWN_CUSTODIAN` (422)
- [ ] Type-specific required fields (e.g., contraband authorization reference) must be present before a transfer for that type can be initiated, returning `CUSTODY_MISSING_TYPE_FIELD` (422) otherwise
- [ ] Transferor's initiation itself constitutes their acknowledgment of release
- [ ] Transfer record enters `pending` state and triggers notification to the designated recipient

**Priority:** P2 | **Feature Ref:** F20

---

### US-20.2: Acknowledge Receipt of a Transferred Exhibit
**As a** courtroom deputy (Maria Santos), **I want to** acknowledge receipt of an exhibit, confirming condition and time, **so that** custody responsibility is only ever transferred with dual confirmation, never silently.

**Acceptance Criteria:**
- [ ] Only the designated recipient may acknowledge a transfer; others attempting to acknowledge receive `CUSTODY_ACK_DENIED` (403)
- [ ] On acknowledgment, the transfer becomes `completed`, and the exhibit's current custodian/location fields update
- [ ] No auto-acknowledgment occurs on timeout — only explicit acknowledgment completes a transfer
- [ ] Full custody history remains queryable per exhibit, feeding closeout receipts and the case timeline

**Priority:** P2 | **Feature Ref:** F20

---

### US-20.3: Escalate Unacknowledged Custody Transfers
**As a** clerk/case administrator (David Okafor), **I want to** have unacknowledged custody transfers automatically escalate to a supervisory role after a configured SLA, **so that** no exhibit goes missing mid-trial without anyone noticing.

**Acceptance Criteria:**
- [ ] A transfer unacknowledged beyond the configured SLA raises `CUSTODY_SLA_BREACH` and fires an escalation alert to a supervisory role
- [ ] Escalation never completes the transfer automatically — only explicit acknowledgment does
- [ ] The goal of zero custody transfers left unacknowledged beyond SLA is measurable via the custody history and reporting feed

**Priority:** P2 | **Feature Ref:** F20

---
