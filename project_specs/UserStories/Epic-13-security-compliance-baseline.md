## Epic 13: Security and Compliance Baseline (F13)

### US-13.1: Malware-Scan and Allowlist File Uploads
**As a** system administrator (Priya Nandan), **I want to** have every uploaded file pass malware scanning and a court-approved file-type allowlist before acceptance, **so that** no malicious or disallowed file ever enters the reference layer.

**Acceptance Criteria:**
- [ ] No file is persisted until malware scanning completes successfully; a failed scan returns `SECURITY_MALWARE_DETECTED` (422) with a user-facing reason, never silent acceptance
- [ ] File types outside the court-configured allowlist are rejected before scanning is even attempted, returning `SECURITY_FILE_TYPE_DENIED` (422)
- [ ] A policy-engine evaluation failure fails closed, returning `SECURITY_POLICY_UNAVAILABLE` (503) rather than defaulting to allow
- [ ] All data at rest and in transit is encrypted (TLS 1.2+, managed key service), with key rotation restricted to `security_officer` role

**Priority:** P0 | **Feature Ref:** F13

---

### US-13.2: Configure Retention and Disposition Schedules by Record Category
**As a** system administrator (Priya Nandan), **I want to** configure how long each record category is retained before disposition action is required, **so that** no record category is auto-purged without a human-confirmed disposition action.

**Acceptance Criteria:**
- [ ] Retention schedules are configured per record category (exhibit, document, audit event, notification) and court
- [ ] A scheduled disposition job surfaces due-for-disposition records as tasks for human action — no automated hard-delete occurs for any court-record-significant category
- [ ] A disposition action attempted without human confirmation returns `SECURITY_DISPOSITION_UNCONFIRMED` (403, internal guard)
- [ ] Security designation policy changes are rule-package-versioned and audit-logged — no designation policy may be altered via direct data edit outside the configuration engine

**Priority:** P0 | **Feature Ref:** F13

---

### US-13.3: Maintain Documented Manual-Fallback Procedures
**As a** system administrator (Priya Nandan), **I want to** have documented manual-fallback and resync procedures for courtroom or integration disruption, **so that** deputies can resume real-time logging promptly after an outage without data loss.

**Acceptance Criteria:**
- [ ] Courtroom logging interface persists entries in a local draft buffer during disruption and resyncs automatically on reconnection without data loss
- [ ] Manual-fallback runbooks are documented and exercised during pilot scenario testing
- [ ] A key-rotation attempt by a non-security-officer role returns `SECURITY_KEY_ACCESS_DENIED` (403)
- [ ] Encryption, scanning, and sensitive-record handling controls apply consistently regardless of which exhibit file storage model (store/reference/both) is ultimately selected

**Priority:** P0 | **Feature Ref:** F13

---
