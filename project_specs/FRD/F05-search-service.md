## F05: Search Service

**Description:** Provides cross-module, access-scoped search by identifier, party, witness, status, date, description, or proceeding, so authorized users can retrieve exhibits, trackers, and case objects without browsing full case hierarchies. Search results strictly respect each user's access scope, never exposing sealed/restricted records to unauthorized users even as a search hit without content.

**Terminology:**
- **Search Index:** The denormalized, access-tagged index of searchable objects (exhibits, trackers, docket events, documents) rebuilt/updated incrementally as source records change.
- **Access-Scoped Result:** A search result filtered at query time (not merely at render time) so that unauthorized records produce zero hits, not a redacted placeholder hit.

**Sub-features:**
- Full-text and structured search across exhibits, Speedy Trial trackers, and case objects
- Filters: identifier, party, witness, status, date range, free-text description, proceeding
- Access-scoped result filtering (sealed/restricted records excluded unless requester holds the entitlement)

**Process:**
1. User submits a search query (free text and/or structured filters) via the Search API.
2. Service resolves the user's access scope (court/division/case assignments, security-designation entitlements) from F00.
3. Service queries the search index with the user's scope as a mandatory pre-filter — the index itself is access-tagged at write time so unauthorized documents are excluded from the candidate set before relevance ranking, not filtered post-hoc.
4. Service returns ranked results with object type, summary snippet, and a deep link; sealed/restricted object summaries are fully excluded (no "restricted result" placeholder is shown, to avoid confirming the existence of a sealed matter to an unauthorized user — `[ASSUMPTION]`: existence-of-record itself may be sensitive for sealed cases; this is flagged for pilot validation per PRD §9.3 sealed-handling open question).
5. Index updates: whenever a source record (exhibit, tracker, docket event) changes status, security designation, or content, an index-update event is emitted so search results remain current within a bounded staleness window (target: near-real-time, exact SLA is a TechArch concern).

**Inputs:**
- `query_text` (string, optional)
- `filters` (object, optional): `identifier`, `party_name`, `witness_name`, `status`, `date_from`, `date_to`, `proceeding_id`
- Implicit: requester's access scope (not user-supplied)

**Outputs:**
- Ranked result list: `{object_type, object_id, summary_snippet, deep_link, last_updated}`
- Zero results (not an error) when no matches exist or are authorized

**Validation:**
- Index pre-filtering by access scope is mandatory and occurs before ranking, not after — a relevance-ranked-then-filtered design is explicitly disallowed since it risks information leakage through ranking side effects (e.g., result count hints).
- Free-text queries must not search within sealed/restricted document *content* even for authorized users beyond what the object's designated access level permits (e.g., a user authorized for "restricted" but not "grand_jury" designation must not have grand-jury content searchable).
- Search queries themselves are not treated as material actions requiring F02 audit entries by default, except queries that return or attempt to return sealed/restricted results, which are logged as access_attempt audit events.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Query malformed (invalid filter combination) | 400 | SEARCH_INVALID_QUERY | "Search query is invalid: {detail}" |
| Search index unavailable | 503 | SEARCH_INDEX_UNAVAILABLE | "Search is temporarily unavailable" |
| Result set exceeds pagination limit without pagination params | 400 | SEARCH_PAGINATION_REQUIRED | "Please refine your search or use pagination" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Search for `/search` endpoint.

**Schema Surface (this feature):** uses a dedicated `search_index` table/materialized view (access-tagged, denormalized from `exhibits`, `defendant_trackers`, `docket_events`, `document_references`) — see `Y0a-schema-shared.md` §Search Index.
