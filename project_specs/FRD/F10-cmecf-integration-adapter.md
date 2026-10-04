## F10: CM/ECF Integration Adapter

**Description:** A controlled, primarily inbound adapter synchronizing case, party, docket-event, order, and document-reference data from CM/ECF (or a successor case-management platform), preserving the docket as the single authoritative source. This feature is the enforcement point for the system's "authoritative-source discipline" principle — it is architecturally impossible for JudicialSync to silently overwrite docket data because this adapter is the only inbound path and it never performs a blind overwrite.

**Terminology:**
- **Authoritative Source:** CM/ECF (or successor); its data always wins in a conflict unless a human explicitly overrides via a documented exception resolution.
- **Sync Conflict:** A detected mismatch between an incoming CM/ECF record and the existing JudicialSync record for the same source identifier.

**Sub-features:**
- Inbound sync of case/party/docket-event/order/document-reference data
- Source-identifier preservation on all imported records
- No silent overwrite of docket data — conflicts route to human review (F07)
- Controlled outbound references/filings only where explicitly authorized

**`[ASSUMPTION]`:** The PRD/vision document leaves open which CM/ECF events, orders, and documents are available via supported interfaces and their latency (PRD §9.3, vision §9.3). This FRD assumes a polling- or webhook-based adapter (exact mechanism is a TechArch decision) that treats any field present in the CM/ECF feed as authoritative and any field CM/ECF does not expose as locally-managed metadata layered on top of the synced record.

**Process:**
1. Adapter receives or polls for new/updated case, party, docket-event, order, and document-reference records from CM/ECF, each carrying a CM/ECF-native identifier.
2. For a new source identifier not yet known to JudicialSync, adapter creates the corresponding internal record (F01 case/party/docket-event/document-reference), storing `source_system = 'CM/ECF'` and `source_identifier`.
3. For an existing source identifier, adapter compares incoming field values against the current JudicialSync record. If all CM/ECF-authoritative fields match, no action is taken (or a `last_synced_at` timestamp is refreshed).
4. If a CM/ECF-authoritative field differs from the current JudicialSync value AND the JudicialSync value was never locally modified, adapter updates the field automatically (this is not an overwrite-of-local-edit, merely applying a fresh authoritative value).
5. If a CM/ECF-authoritative field differs from the current JudicialSync value AND the JudicialSync value *was* locally modified (e.g., a clerk corrected a party name pending CM/ECF catch-up), adapter does **not** auto-overwrite; it creates a Sync Conflict exception (F07) for human resolution.
6. Resolved conflicts are logged to the audit trail (F02) with both the CM/ECF value and the locally-chosen value, and the chosen value is explicitly marked `source_system = 'CM/ECF'` or `'manual_override'` accordingly.
7. Controlled outbound operations (e.g., a generated post-trial closeout package referenced back to the docket) occur only through an explicitly authorized, separately permissioned outbound path — never as a side effect of inbound sync.
8. Adapter health (last successful sync time, error rate, backlog) is monitored and surfaced to system administrators; prolonged sync failure triggers an F04 critical alert.

**Inputs:**
- Inbound CM/ECF feed records: case, party, docket_event, order, document_reference (schema per CM/ECF interface spec — `[ASSUMPTION]`: exact schema is a TechArch/integration-contract concern, treated here as an opaque structured payload with the fields enumerated in F01/F01's docket event model)
- `source_identifier` (required on every inbound record)

**Outputs:**
- Created/updated internal case/party/docket-event/document-reference records with source lineage preserved
- Sync Conflict exception records (F07) for unresolved mismatches
- Adapter health/status metrics (for F09, admin dashboards)

**Validation:**
- No inbound record may be persisted without a non-null `source_identifier`.
- No automated process may overwrite a JudicialSync field that has a recorded local modification without first routing through conflict resolution — this is enforced structurally (the adapter checks a `locally_modified` flag before applying any authoritative update), not merely by convention.
- Outbound filings/references require a distinct `docket_outbound` entitlement and are themselves audit-logged as a material action.
- Duplicate inbound delivery (same source_identifier, same payload, redelivered) must be idempotent — no duplicate internal records or duplicate conflict exceptions are created.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Inbound record missing source_identifier | 422 | CMECF_MISSING_SOURCE_ID | "Inbound record rejected: missing source identifier" |
| Sync conflict detected (locally modified field vs. new CM/ECF value) | 409 (internal, routes to F07) | CMECF_SYNC_CONFLICT | "Docket update conflicts with a local modification; routed for review" |
| CM/ECF feed unavailable / sync failure | 503 | CMECF_UNAVAILABLE | "CM/ECF synchronization is currently unavailable" |
| Unauthorized outbound filing attempt | 403 | CMECF_OUTBOUND_DENIED | "You are not authorized to submit outbound docket references" |
| Duplicate inbound delivery detected | 200 (idempotent no-op, logged) | CMECF_DUPLICATE_IGNORED | "Duplicate delivery ignored" |

**API Surface (this feature):** see `Y1a-api-shared.md` §CM/ECF Adapter for `/integrations/cmecf/sync` (inbound webhook/poll endpoint), `/integrations/cmecf/status`, `/integrations/cmecf/outbound` endpoints.

**Schema Surface (this feature):** uses tables `docket_events`, `document_references`, `parties`, `cases` (via `source_system`/`source_identifier`/`locally_modified` columns), plus a dedicated `sync_conflicts` and `adapter_health_log` table — see `Y0a-schema-shared.md` §CM/ECF Integration.
