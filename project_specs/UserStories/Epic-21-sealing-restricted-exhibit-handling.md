## Epic 21: Sealing and Restricted Exhibit Handling (F21)

### US-21.1: Seal or Release an Individual Exhibit as the Authorizing Judge
**As a** judge (Judge Robert Hale), **I want to** seal or release a specific exhibit with a defined entitlement scope, **so that** sensitive evidence receives protection distinct from the case's general security designation.

**Acceptance Criteria:**
- [ ] Sealing/release actions require `authorizing_judge_id` resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize, returning `SEAL_AUTHORIZATION_DENIED` (403) if attempted
- [ ] Release requires an explicit, symmetric judge-authorized action with a documented `release_reason`
- [ ] A sealed exhibit is automatically excluded from jury review packages unless individually and explicitly authorized for that specific instance, returning `SEAL_JURY_PACKAGE_DENIED` (422) otherwise
- [ ] Sealing/release actions are audit-logged with the authorizing/releasing judge's attribution

**Priority:** P2 | **Feature Ref:** F21

---

### US-21.2: Log Every Access Attempt to a Sealed Exhibit
**As a** system administrator (Priya Nandan), **I want to** have every successful and denied access attempt against a sealed or restricted exhibit logged as an individual audit event, **so that** I can monitor and verify zero unauthorized access succeeds.

**Acceptance Criteria:**
- [ ] An unauthorized access attempt to a sealed exhibit by direct ID returns a "not found" response (`SEAL_NOT_FOUND`, 404), not "access denied," to avoid confirming existence
- [ ] Every access attempt — successful or denied — against a sealed/restricted exhibit produces its own audit event, not merely an aggregate log line
- [ ] This logging requirement exceeds the general platform access-logging baseline and is enforced for sealed/restricted exhibits specifically

**Priority:** P2 | **Feature Ref:** F21

---
