## Epic 1: Core Case and Docket Data Model (F1)

### US-1.1: Establish Shared Case, Proceeding, and Party Context
**As a** clerk/case administrator (David Okafor), **I want to** create or sync a case's court, division, proceeding, hearing, and party records in one shared model, **so that** both the Evidentiary Tracking and Speedy Trial modules work from the same case context instead of duplicating it.

**Acceptance Criteria:**
- [ ] A case can be created via CM/ECF sync (F10) or manual entry when sync is unavailable or the case predates sync
- [ ] `case_number` is unique within its court+division scope; a duplicate returns `CASE_DUPLICATE_NUMBER` (409)
- [ ] Court/division association is set at creation and is immutable thereafter
- [ ] A proceeding with existing exhibit or Speedy Trial activity cannot be deleted, only marked `closed`, returning `CASE_PROCEEDING_IN_USE` (409) on delete attempts
- [ ] Both domain modules read case/proceeding/party context exclusively through the shared case-context API — no module maintains a shadow copy

**Priority:** P0 | **Feature Ref:** F1

---

### US-1.2: Apply Security Designations at Case and Document Level
**As a** clerk/case administrator (David Okafor), **I want to** tag a case or document as sealed, restricted, grand jury, juvenile, or PII, **so that** access control and notification content are enforced consistently everywhere that record is referenced.

**Acceptance Criteria:**
- [ ] Security designation changes require a `case_security_admin` entitlement; courtroom deputies may view but not alter designations
- [ ] Unauthorized designation-change attempts return `CASE_DESIGNATION_DENIED` (403)
- [ ] Each designation change produces an audit event with before/after state and actor
- [ ] A case must have at least one `defendant` party before a Speedy Trial tracker (F26) may be initialized against it, enforced via `CASE_MISSING_DEFENDANT` (422)

**Priority:** P0 | **Feature Ref:** F1

---

### US-1.3: Preserve Source Identifiers on Imported Docket Events
**As a** clerk/case administrator (David Okafor), **I want to** have every CM/ECF-sourced docket event and document reference retain its originating source identifier, **so that** authoritative-source discipline is never broken by local edits.

**Acceptance Criteria:**
- [ ] Docket events/document references originating from CM/ECF carry non-null `source_system` and `source_identifier` fields
- [ ] A docket event missing a source identifier is rejected with `CASE_EVENT_MISSING_SOURCE` (422)
- [ ] Manually entered events are explicitly flagged `source_system = 'manual'` for later explainability
- [ ] Document references never embed authoritative content unless the storage model explicitly calls for it, preserving a pointer-based reference by default

**Priority:** P0 | **Feature Ref:** F1

---
