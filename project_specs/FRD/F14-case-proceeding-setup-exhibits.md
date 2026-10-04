## F14: Case and Proceeding Setup for Exhibits

**Description:** Allows clerk staff to create or synchronize the matter, proceeding, parties, exhibit numbering scheme, and security designations before exhibit activity begins. This is the Evidentiary Tracking module's entry point — no exhibit intake or ledger entry can occur against a case that has not been set up here.

**Terminology:**
- **Exhibit Numbering Scheme:** A court-specific convention (e.g., `P-1`, `D-1`, `GOV-101`) governing how exhibit identifiers are assigned, configured via F03 and applied per-case here.

**Sub-features:**
- Case/proceeding creation or sync from CM/ECF (reuses F01/F10)
- Party and security-designation setup for exhibit purposes
- Court-specific exhibit numbering scheme configuration/activation for the case

**Process:**
1. Clerk opens "Set up exhibit tracking" for a case already present via F01 (synced or manually created).
2. Clerk confirms or adds parties relevant to exhibit offering (prosecution, defense, additional parties) using F01 party records.
3. Clerk selects or confirms the court's active exhibit numbering scheme (from F03 configuration) and any case-specific numbering override (e.g., separate prefix ranges per party).
4. Clerk applies or confirms security designations relevant to exhibits for this case (sealed exhibit handling default, grand jury default) sourced from F01/F13 policy.
5. System marks the case as "exhibit-tracking active," unlocking F15 intake and F16 ledger operations for this case/proceeding.
6. Setup completion and any designation choices are logged to the audit trail (F02).

**Inputs:**
- `case_id` (required, must already exist via F01)
- `proceeding_id` (required or created inline)
- `numbering_scheme_id` (required, selected from F03 court configuration)
- `party_ids[]` (required, at least prosecution + defense or equivalent)
- `security_designations[]` (optional)

**Outputs:**
- `exhibit_tracking_context` record marking the case/proceeding as ready for exhibit activity
- Confirmation that numbering scheme and parties are bound to the proceeding

**Validation:**
- A case must have at least one proceeding before exhibit tracking can be activated.
- Numbering scheme must be an active, published scheme from F03 — ad hoc numbering is not permitted.
- Only users with `clerk_case_admin` or higher entitlement may activate exhibit tracking for a case.
- Re-running setup on an already-active case must not reset or duplicate existing exhibit records — it is idempotent, allowing addition of parties/designations only.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Case has no proceeding | 422 | EXHIBIT_SETUP_NO_PROCEEDING | "A proceeding must exist before exhibit tracking can be activated" |
| Numbering scheme not found/not published | 422 | EXHIBIT_SETUP_INVALID_SCHEME | "Selected numbering scheme is not valid" |
| Unauthorized setup attempt | 403 | EXHIBIT_SETUP_DENIED | "You are not authorized to set up exhibit tracking for this case" |
| Setup re-run attempts to change numbering mid-case with existing exhibits | 409 | EXHIBIT_SETUP_SCHEME_LOCKED | "Numbering scheme cannot be changed after exhibits have been assigned" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Case Setup for `/evidentiary/cases/{id}/setup` endpoint.

**Schema Surface (this feature):** uses table `exhibit_tracking_contexts` plus references to `cases`, `proceedings`, `parties` — see `Y0b-schema-evidentiary.md` §Case Setup.
