## Epic 10: CM/ECF Integration Adapter (F10)

### US-10.1: Sync Docket Data Without Overwriting Local Corrections
**As a** system administrator (Priya Nandan), **I want to** have CM/ECF updates apply automatically only when no conflicting local edit exists, **so that** JudicialSync never silently overwrites a clerk's manual correction.

**Acceptance Criteria:**
- [ ] An inbound record missing `source_identifier` is rejected with `CMECF_MISSING_SOURCE_ID` (422) and never persisted
- [ ] When a CM/ECF-authoritative field differs from a current value that was never locally modified, the adapter auto-updates the field (not an overwrite of an edit)
- [ ] When the current value *was* locally modified, the adapter creates a Sync Conflict exception for human review instead of auto-overwriting, returning `CMECF_SYNC_CONFLICT` (409, internal)
- [ ] Duplicate inbound delivery of the same `source_identifier`/payload is idempotent — no duplicate records or duplicate conflict exceptions are created, returning `CMECF_DUPLICATE_IGNORED` (200)

**Priority:** P0 | **Feature Ref:** F10

---

### US-10.2: Monitor Adapter Health and Resolve Sync Conflicts
**As a** system administrator (Priya Nandan), **I want to** monitor CM/ECF sync health and resolve routed conflicts, **so that** stale or incomplete docket data never silently degrades downstream exhibit or Speedy Trial accuracy.

**Acceptance Criteria:**
- [ ] Adapter health (last successful sync time, error rate, backlog) is visible on the admin dashboard
- [ ] A prolonged sync failure triggers a critical alert; feed unavailability returns `CMECF_UNAVAILABLE` (503)
- [ ] Resolved conflicts are logged to the audit trail with both the CM/ECF value and the chosen value, explicitly marked `source_system` or `manual_override`
- [ ] Unauthorized outbound filing attempts return `CMECF_OUTBOUND_DENIED` (403); outbound references require a distinct `docket_outbound` entitlement and are themselves audit-logged

**Priority:** P0 | **Feature Ref:** F10

---
