## F27: Docket Event Ingestion and Mapping

**Description:** Receives docket events from CM/ECF (via F10) or structured manual entry, maps them to configured Speedy Trial event categories, and routes unrecognized events to a resolution queue shared with F07. Accurate, reviewed event mapping is the prerequisite for everything downstream — a misclassified event silently corrupts the clock calculation (F29) without this gate.

**Terminology:**
- **Event Category:** A Speedy Trial-relevant classification (trigger event, motion filed, motion disposed, continuance granted, competency proceeding, interlocutory appeal, etc.) that a raw docket event is mapped to, per F03 configuration.
- **Unmapped Event:** A docket event for which no configured mapping rule matches, requiring human classification before it can feed F28's exclusion engine.

**Sub-features:**
- Inbound event ingestion from CM/ECF adapter (F10) or structured manual entry
- Configurable event-category mapping per court (F03)
- Unmapped-event resolution queue (shared with F07)
- Duplicate-event detection and resolution

**Process:**
1. A docket event arrives via F10 (CM/ECF sync) or manual structured entry, associated with a case/defendant.
2. System attempts to match the event's source code/description against the court's active event-mapping rules (F03), assigning an `event_category` if a match is found.
3. If no mapping rule matches, the event is flagged `unmapped` and routed to the Exception Queue (F07) as `unmapped_docket_event`, with the raw source code/description preserved for the reviewer.
4. An authorized reviewer resolves the unmapped event either by selecting the correct existing category or by requesting a new mapping rule be added to the court's configuration (F03) — the latter requires going through F03's configuration change process, not an ad hoc one-off mapping.
5. System checks for duplicate event delivery (same source_identifier, already-ingested) and silently de-duplicates (idempotent, no duplicate category assignment or downstream exclusion-candidate generation) rather than creating a second record.
6. Once categorized (automatically or via resolution), the event becomes available as an input to F28's candidate exclusion engine and F26's trigger-event detection.

**Inputs:**
- Raw docket event: `source_identifier`, `source_code`, `source_description`, `event_date`, `case_id`, `defendant_party_id` (where applicable)
- Resolution input (for unmapped events): `event_category` (selected) or `new_mapping_rule_request`

**Outputs:**
- Categorized docket event record, consumable by F26/F28
- `unmapped_docket_event` exception (F07) when no mapping matches
- Duplicate-ignored acknowledgment (idempotent, logged but not user-facing error)

**Validation:**
- Duplicate detection is based on `source_identifier` uniqueness within the ingestion pipeline — an event with an already-seen source_identifier is never re-processed as new, preventing double-counting in F28/F29.
- Event-category resolution for an unmapped event requires `exclusion_reviewer`-equivalent entitlement (shared with F26/F28/F30's reviewer role), not general clerk access alone, since miscategorization directly affects legally significant calculations.
- A new mapping rule requested during resolution must go through F03's configuration change process (including its maker-checker approval) before becoming a standing rule — the individual event resolution itself may proceed immediately (classify this one event), but the standing rule addition is gated separately.
- Manually entered events must capture the entering user's identity and are flagged `source_system = 'manual'`, distinct from CM/ECF-sourced events, for explainability purposes (F29).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Event arrives with no matching mapping rule | n/a (exception) | EVENT_UNMAPPED | "This docket event could not be mapped to a Speedy Trial category" |
| Duplicate event_identifier detected | 200 (idempotent, logged) | EVENT_DUPLICATE_IGNORED | "Duplicate event ignored" |
| Resolution attempted by user lacking reviewer entitlement | 403 | EVENT_RESOLUTION_DENIED | "You are not authorized to resolve event mapping" |
| Manual entry missing required defendant/case association | 422 | EVENT_MISSING_ASSOCIATION | "Event must be associated with a case and defendant" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Event Ingestion for `/speedytrial/events`, `/speedytrial/events/{id}/resolve-mapping` endpoints.

**Schema Surface (this feature):** uses tables `speedy_trial_events`, `event_category_mappings` (F03-configured) — see `Y0c-schema-speedytrial.md` §Event Ingestion.
