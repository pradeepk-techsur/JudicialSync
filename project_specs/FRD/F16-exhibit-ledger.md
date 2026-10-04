## F16: Exhibit Ledger

**Description:** The current, authoritative-within-JudicialSync record of every exhibit's identifier, status, party, description, proceeding, confidentiality, and location. This is the Evidentiary Tracking module's system-of-record; every other Evidentiary feature (courtroom logging, custody, reconciliation, jury package, closeout) reads and writes through this ledger rather than maintaining a parallel status source.

**Terminology:**
- **Exhibit:** The top-level tracked entity — a proposed, offered, admitted, rejected, withdrawn, substituted, sealed, or returned item of evidence.
- **Exhibit Version:** A point-in-time snapshot capturing a status or attribute change, supporting full history reconstruction (distinct from F23 "exhibit file reference" which is a file pointer).
- **Status Lifecycle:** The defined set of states an exhibit may occupy and the permitted transitions between them.

**Sub-features:**
- Status lifecycle: proposed → offered → admitted | rejected | withdrawn | substituted; admitted → sealed | returned
- Identifier assignment/validation per court numbering convention (F03/F14)
- Confidentiality and location fields with security-designation enforcement
- Full status-change history feeding the audit trail (F02)

**Process:**
1. Exhibit ledger entry is created either from an accepted F15 intake submission (status `proposed`) or directly during courtroom proceedings (F17) for items not pre-submitted.
2. Each status transition (offer, ruling, withdrawal, substitution, seal, return) is requested by an authorized user action (typically via F17 during proceedings, or F20/F21/F24 post-trial) and validated against the court-configured workflow state set (F03) — only permitted transitions for the requesting role succeed.
3. Each transition creates a new **exhibit version** row (append-style history) rather than mutating the exhibit's canonical row destructively — the canonical row's `current_status` is updated, but the version history is retained in full.
4. Each transition emits an audit event (F02) with before/after status, actor, and timestamp.
5. Confidentiality/location fields are updated as part of custody actions (F20) or sealing actions (F21), each similarly versioned and audited.
6. Current ledger state is exposed via API/UI to all modules needing exhibit status (jury package F22, closeout F24, timeline F08, search F05), always reflecting the latest confirmed version.

**Inputs:**
- `exhibit_id` (UUID) or `proposed_number` (for new assignment)
- `status_transition` (enum, required): offer | admit | reject | withdraw | substitute | seal | return
- `proceeding_id`, `offering_party_id` (required context)
- `ruling_actor_id` (required for admit/reject transitions — must be attributed to the judge, never auto-decided, see F17)
- `notes` (string, optional)

**Outputs:**
- Updated exhibit ledger entry with `current_status`
- New exhibit version history row
- Audit event reference

**Validation:**
- Status transitions must follow the court-configured workflow state set (F03); an attempt to transition from `rejected` directly to `admitted` without an intervening re-offer, for example, is rejected unless the court's configuration explicitly allows it.
- The `admit`/`reject` transition (a ruling) must carry a `ruling_actor_id` attributed to a user holding the `judge` role for that proceeding — the system never defaults or auto-infers this value; the courtroom deputy records the occurrence of the ruling, but attribution is always to the judge (see F17 §Process for the human-in-command distinction between "deputy records" and "judge rules").
- Identifier assignment must conform to the active numbering scheme (F14/F03); a manually entered identifier outside the scheme's pattern is rejected.
- Confidentiality/location changes on an exhibit bearing a security designation require the entitlement specified in F21, not merely general ledger-edit rights.
- No exhibit version row may be deleted or edited after creation — corrections are made via a new version, never a retroactive edit (consistent with F02 audit immutability).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Invalid status transition per workflow config | 409 | LEDGER_INVALID_TRANSITION | "This status change is not permitted from the current state" |
| Ruling transition missing judge attribution | 422 | LEDGER_RULING_ACTOR_REQUIRED | "A ruling must be attributed to the presiding judge" |
| Identifier does not match active numbering scheme | 422 | LEDGER_INVALID_IDENTIFIER | "Exhibit identifier does not match the court's numbering scheme" |
| Confidentiality/location change without designation entitlement | 403 | LEDGER_DESIGNATION_DENIED | "This change requires additional authorization" |
| Attempt to edit/delete a prior exhibit version | 403 (internal guard) | LEDGER_VERSION_IMMUTABLE | "Prior exhibit versions cannot be modified" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Exhibit Ledger for `/evidentiary/exhibits`, `/evidentiary/exhibits/{id}/transition`, `/evidentiary/exhibits/{id}/versions` endpoints.

**Schema Surface (this feature):** uses tables `exhibits`, `exhibit_versions` — see `Y0b-schema-evidentiary.md` §Exhibit Ledger.
