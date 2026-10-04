## Epic 27: Docket Event Ingestion and Mapping (F27)

### US-27.1: Automatically Map Docket Events to Speedy Trial Categories
**As a** clerk/case administrator (David Okafor), **I want to** have incoming docket events automatically matched against the court's configured event-mapping rules, **so that** routine events don't require manual classification.

**Acceptance Criteria:**
- [ ] An event matching a configured mapping rule is assigned an `event_category` automatically
- [ ] Duplicate event delivery (same `source_identifier`, already ingested) is silently de-duplicated — no duplicate category assignment or downstream exclusion-candidate generation, acknowledged via `EVENT_DUPLICATE_IGNORED` (200)
- [ ] Manually entered events capture the entering user's identity and are flagged `source_system = 'manual'`

**Priority:** P0 | **Feature Ref:** F27

---

### US-27.2: Resolve an Unmapped Docket Event
**As a** clerk/case administrator (David Okafor), **I want to** classify an event that has no matching configuration rule, **so that** unmapped events don't silently corrupt downstream Speedy Trial calculations.

**Acceptance Criteria:**
- [ ] An event with no matching mapping rule is flagged `unmapped` and routed to the Exception Queue with the raw source code/description preserved (`EVENT_UNMAPPED`)
- [ ] Resolution requires `exclusion_reviewer`-equivalent entitlement, not general clerk access alone, returning `EVENT_RESOLUTION_DENIED` (403) otherwise
- [ ] Requesting a new standing mapping rule during resolution routes through the Configuration Engine's maker-checker process, while the individual event can still be classified immediately
- [ ] A manual entry missing required defendant/case association returns `EVENT_MISSING_ASSOCIATION` (422)

**Priority:** P0 | **Feature Ref:** F27

---
