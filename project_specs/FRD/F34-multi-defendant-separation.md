## F34: Multi-Defendant Separation

**Description:** Maintains independent Speedy Trial clocks per defendant in multi-defendant matters, with relationship visibility so related cases aren't collapsed into one misleading result. This directly addresses the vision document's "avoids oversimplification" principle — a joint motion or severance event affecting multiple defendants must be visible across all affected trackers without merging their individual clock results.

**Terminology:**
- **Co-Defendant Relationship:** A recorded association between two or more defendant trackers within the same case, reflecting joint proceedings, joint motions, or severance events.
- **Joint Event:** A docket event (e.g., a joint motion for continuance) that may generate candidate exclusions across multiple co-defendant trackers simultaneously.
- **Severance:** An event that splits a previously joint case-defendant relationship, after which affected trackers' subsequent clocks no longer share joint-event propagation.

**Sub-features:**
- Per-defendant independent clock calculation within a shared matter
- Cross-defendant relationship visibility (joint motions, severance events)
- Avoids result collapsing/oversimplification across co-defendants

**Process:**
1. When a case has multiple defendant parties, each defendant receives their own independent tracker (F26) — the system never creates a single shared tracker across defendants, even when they share a case.
2. A docket event categorized (F27) as affecting multiple defendants (e.g., a joint motion) generates linked candidate exclusions (F28) on each affected defendant's tracker, each exclusion carrying a `joint_event_group_id` linking them as siblings — but each remains a distinct record subject to independent review/confirmation (F30) per defendant.
3. A reviewer may accept, modify, or reject a joint-origin candidate exclusion differently per defendant (e.g., confirmed for defendant A but modified for defendant B due to a defendant-specific circumstance) — the system never forces identical review outcomes across co-defendants merely because the originating event was joint.
4. A severance event, once confirmed, is recorded and from that point forward, subsequent docket events affecting only one defendant do not propagate as joint candidates to the severed co-defendant(s).
5. The case conference view (F35) and portfolio dashboards (F36) display co-defendant relationships explicitly (e.g., "3 defendants in this matter; 2 are jointly tracked, 1 severed as of [date]"), never presenting a single collapsed "the case's" Speedy Trial status when multiple independent defendant clocks exist.

**Inputs:**
- `case_id` with multiple `defendant_party_id` associations (F01)
- Joint docket event with multiple affected `defendant_party_id` references
- `severance_event` with `severed_defendant_ids[]`, `severance_date`

**Outputs:**
- Independent tracker + calculation version per defendant (F26/F29)
- Linked candidate exclusions sharing a `joint_event_group_id` but independently reviewable
- Co-defendant relationship record, updated on severance

**Validation:**
- No UI or API surface may present a single aggregate "Speedy Trial status" for a multi-defendant case without explicit per-defendant breakdown — any case-level summary must clearly enumerate each defendant's independent status, never averaging or collapsing them.
- A joint-origin candidate exclusion's independent review per defendant must not be blocked or forced to a uniform outcome by the system — each defendant's tracker's F30 review workflow operates independently even when the source event was shared.
- Severance must be an explicit, confirmed, audit-logged event (not inferred) before joint-event propagation to severed defendants stops; absent an explicit severance record, the system continues treating defendants in the case as jointly affected by shared events by default.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Attempt to create a single shared tracker for multiple defendants | 422 (internal guard) | MULTIDEF_SHARED_TRACKER_DENIED | "Each defendant requires an independent tracker" |
| UI/report attempts to render collapsed case-level status | 500 (internal guard) | MULTIDEF_COLLAPSED_VIEW_VIOLATION | "System defect: case-level status must not collapse per-defendant results" |
| Severance recorded without confirmation/audit | 403 (internal guard) | MULTIDEF_SEVERANCE_UNCONFIRMED | "Severance must be explicitly confirmed before taking effect" |

**API Surface (this feature):** see `Y1c-api-speedytrial.md` §Multi-Defendant for `/speedytrial/cases/{id}/defendant-trackers`, `/speedytrial/cases/{id}/severance` endpoints.

**Schema Surface (this feature):** uses tables `codefendant_relationships`, `severance_events`, extends `candidate_exclusions.joint_event_group_id` — see `Y0c-schema-speedytrial.md` §Multi-Defendant Separation.
