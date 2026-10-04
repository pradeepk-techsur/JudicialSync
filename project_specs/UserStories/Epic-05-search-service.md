## Epic 5: Search Service (F5)

### US-5.1: Search Across Exhibits, Trackers, and Case Objects
**As a** clerk/case administrator (David Okafor), **I want to** search by identifier, party, witness, status, date, description, or proceeding across both modules, **so that** I can retrieve what I need without browsing full case hierarchies.

**Acceptance Criteria:**
- [ ] Search accepts free text and/or structured filters (`identifier`, `party_name`, `witness_name`, `status`, `date_from`, `date_to`, `proceeding_id`)
- [ ] Results are ranked with object type, summary snippet, deep link, and last-updated timestamp
- [ ] A malformed filter combination returns `SEARCH_INVALID_QUERY` (400); an unavailable index returns `SEARCH_INDEX_UNAVAILABLE` (503)
- [ ] Zero authorized matches returns an empty result set, not an error

**Priority:** P0 | **Feature Ref:** F5

---

### US-5.2: Exclude Sealed and Restricted Records from Unauthorized Search Results
**As a** system administrator (Priya Nandan), **I want to** guarantee that sealed/restricted records never appear in search results for unauthorized users, even as a placeholder hit, **so that** the existence of a sealed matter is never confirmed to someone without entitlement.

**Acceptance Criteria:**
- [ ] Index pre-filtering by access scope occurs before relevance ranking, not after
- [ ] Unauthorized sealed/restricted records produce zero hits — no "restricted result" placeholder is ever shown
- [ ] A query that returns or attempts to return sealed/restricted results is logged as an `access_attempt` audit event
- [ ] Free-text search never exposes sealed/restricted document *content* beyond what the requester's designated access level permits

**Priority:** P0 | **Feature Ref:** F5

---
