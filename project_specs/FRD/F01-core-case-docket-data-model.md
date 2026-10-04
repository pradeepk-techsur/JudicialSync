## F01: Core Case and Docket Data Model

**Description:** Establishes the shared data model — court, division, case, proceeding, hearing, party, docket event, document reference, security designation — consumed by both the Evidentiary Tracking and Speedy Trial modules. This feature prevents each module from building a duplicate, divergent notion of "what case/proceeding/party means," which the PRD identifies as a core root cause of tool fragmentation.

**Terminology:**
- **Court:** A federal district court instance (top-level tenant boundary).
- **Division:** A sub-unit of a court (e.g., geographic division) used for scoping and local numbering.
- **Case:** The top-level matter record, synchronized from or linked to CM/ECF.
- **Proceeding:** A discrete procedural event within a case (e.g., a trial, a hearing session, a motion hearing) that both exhibit activity and Speedy Trial events attach to.
- **Hearing:** A scheduled or held session within a proceeding.
- **Party:** A participant in a case (defendant, plaintiff, government, counsel) with a role designation.
- **Document Reference:** A pointer to a CM/ECF-sourced or internally generated document, preserving the source system's identifier.

**Sub-features:**
- Court/division/case/proceeding/hearing/party entity model with referential hierarchy
- Docket event representation with source-system identifier preservation
- Document reference representation (pointer, not necessarily file storage — see F13/F23 for storage model)
- Security designation tagging at case and document level (sealed, restricted, grand jury, juvenile, PII)
- Shared case-context service/API consumed by both domain modules (no duplicate case model per module)

**Process:**
1. Case record is created either by CM/ECF sync (F10) or manual clerk entry (fallback when sync is unavailable or case predates sync).
2. Court/division association is assigned at case creation and is immutable thereafter (a case does not move between courts).
3. Proceedings and hearings are created under a case, either synced from CM/ECF or manually scheduled by clerk staff.
4. Parties are associated with the case with a role designation (defendant, government, plaintiff, counsel, pro se), sourced from CM/ECF where available.
5. Docket events arrive via F10 or manual entry, each preserving `source_system` and `source_identifier` fields.
6. Document references are created pointing to CM/ECF-sourced documents or internally generated artifacts (exports, packages); the model never embeds the authoritative document content unless F13's storage model `[ASSUMPTION: store]` applies.
7. Security designations are applied at case or document granularity by an authorized clerk/judge action, each designation change producing an audit event.
8. Both domain modules (Evidentiary, Speedy Trial) read case/proceeding/party/docket-event context exclusively through the shared case-context API — no module maintains a shadow copy of this data.

**Inputs:**
- `case_number` (string, required): court-assigned case number, human-readable
- `court_id`, `division_id` (UUID, required)
- `case_caption`, `case_type` (string, required)
- `party[]` (array of {name, role, external_id}, required at least one)
- `security_designation[]` (enum array, optional): sealed | restricted | grand_jury | juvenile | pii

**Outputs:**
- `case` record with resolved court/division/proceeding/party/designation graph
- `case_context` API response consumable by Evidentiary and Speedy Trial modules
- Docket event stream filtered/scoped per consuming module's subscription

**Validation:**
- `case_number` must be unique within its court+division scope.
- A case must have at least one associated party with role `defendant` before a Speedy Trial tracker (F26) may be initialized against it.
- Security designation changes require a role with `case_security_admin` entitlement (typically clerk or judge, per F00 ABAC); courtroom deputies may view but not alter designations.
- Docket events and document references must retain non-null `source_system` + `source_identifier` when originating from CM/ECF; manually entered events are flagged `source_system = 'manual'`.
- A proceeding cannot be deleted once it has associated exhibit or Speedy Trial activity — it may only be marked `closed`.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Duplicate case_number in court/division scope | 409 | CASE_DUPLICATE_NUMBER | "A case with this number already exists in this division" |
| Case missing required defendant party | 422 | CASE_MISSING_DEFENDANT | "At least one defendant party is required" |
| Unauthorized security-designation change | 403 | CASE_DESIGNATION_DENIED | "You are not authorized to change this record's security designation" |
| Attempt to delete proceeding with activity | 409 | CASE_PROCEEDING_IN_USE | "Cannot delete a proceeding with existing exhibit or tracker activity" |
| Docket event missing source identifier | 422 | CASE_EVENT_MISSING_SOURCE | "Imported docket events must include a source identifier" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Case & Docket Model for `/cases`, `/cases/{id}/proceedings`, `/cases/{id}/parties`, `/cases/{id}/docket-events` endpoints.

**Schema Surface (this feature):** uses tables `courts`, `divisions`, `cases`, `proceedings`, `hearings`, `parties`, `docket_events`, `document_references`, `security_designations` — see `Y0a-schema-shared.md` §Case Model.
