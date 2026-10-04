## Epic 39: Broader Courtroom Technology Integration (F39)

### US-39.1: Authorize a Secure Courtroom Display Session
**As a** judge (Judge Robert Hale), **I want to** authorize a specific admitted exhibit or jury package to stream to a registered courtroom display endpoint, **so that** jurors and participants can view authorized evidence without exposing the full ledger to courtroom hardware.

**Acceptance Criteria:**
- [ ] A display session must never expose content beyond the specific exhibit(s)/package explicitly authorized for that session — no general ledger browsing from courtroom display hardware
- [ ] Sealed/restricted exhibits follow identical inclusion rules as jury packages — excluded by default, requiring the same explicit per-instance judge authorization to include, returning `COURTTECH_SEALED_DENIED` (422) otherwise
- [ ] A session requested outside an active proceeding returns `COURTTECH_NO_ACTIVE_PROCEEDING` (409)
- [ ] All display/streaming sessions are logged (session start/end, exhibit(s) shown, authorizing user), feeding the audit trail

**Priority:** P3 | **Feature Ref:** F39

---

### US-39.2: Monitor Courtroom Technology Integration Health and Incidents
**As a** system administrator (Priya Nandan), **I want to** monitor courtroom display/streaming integration health and respond to unauthorized connection attempts, **so that** courtroom technology incidents are caught and escalated quickly.

**Acceptance Criteria:**
- [ ] An unregistered hardware endpoint attempting connection is rejected and logged, returning `COURTTECH_UNREGISTERED_ENDPOINT` (403)
- [ ] Repeated unauthorized connection attempts escalate as a security exception, not merely a connection failure
- [ ] Courtroom hardware integration credentials are scoped narrowly (display/stream only, no general API access) with the same separation-of-duties discipline as other privileged integration credentials
- [ ] An integration connection failure returns `COURTTECH_CONNECTION_FAILED` (502) and is surfaced on the admin integration health view

**Priority:** P3 | **Feature Ref:** F39

---
