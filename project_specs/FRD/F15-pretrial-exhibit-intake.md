## F15: Pretrial Exhibit Intake

**Description:** Receives structured exhibit lists and, where permitted, digital files from attorneys or staff; validates required metadata and routes incomplete or duplicate submissions to the shared exception queue (F07). This is the controlled entry point through which proposed exhibits become candidates for the authoritative ledger (F16).

**Terminology:**
- **Proposed Exhibit:** An intake submission not yet accepted onto the official ledger; exists in `proposed` state until a clerk/deputy accepts it.
- **Deficiency:** A missing-metadata or validation failure on a submission, requiring correction before acceptance.

**Sub-features:**
- Structured exhibit list intake with optional file upload
- Required-metadata validation; duplicate and unsupported-format detection
- Clerk/deputy accept, reject, or request-correction workflow
- Integration with the shared exception queue (F07)

**Process:**
1. Submitter (internal staff or external attorney via F12) provides a structured exhibit list entry: description, offering party, proposed exhibit number (optional, system may assign), exhibit type (F23), and optionally a digital file.
2. If a file is attached, it passes through the F13 malware-scanning and file-type-allowlist gate before further processing.
3. System validates required metadata fields (description, offering party, proceeding association) are present and well-formed.
4. System checks for duplicate submissions (same offering party + same description/file-hash within the same proceeding) and unsupported file formats.
5. Submissions failing validation, flagged as duplicate, or in an unsupported format are routed to the Exception Queue (F07) as `missing_metadata` or a dedicated `intake_deficiency` exception type, with the submitter notified (F04) that correction is needed.
6. Submissions passing validation enter a clerk/deputy review queue (F06 task) with options: **accept** (promotes to F16 ledger in `proposed` status), **reject** (with reason, submitter notified), or **request correction** (returns to submitter with specific deficiency detail).
7. All intake decisions (accept/reject/correction-request) are logged to the audit trail (F02).

**Inputs:**
- `description` (string, required)
- `offering_party_id` (UUID, required)
- `proceeding_id` (UUID, required)
- `exhibit_type` (enum, required): file_reference | physical | demonstrative | contraband | special_storage (see F23)
- `proposed_number` (string, optional)
- `file` (binary, optional, subject to F13 scanning/allowlist)
- `submitted_via` (enum): internal | external_portal (set by F12 if applicable)

**Outputs:**
- Intake submission record in state `proposed`, `in_review`, `accepted`, `rejected`, or `correction_requested`
- On acceptance: new or updated F16 exhibit ledger entry referencing this intake submission

**Validation:**
- Required fields (description, offering_party_id, proceeding_id, exhibit_type) must be present; missing any routes to Exception Queue, not silent rejection.
- Duplicate detection compares offering_party + description similarity + file hash (if present) within the same proceeding; exact file-hash match is always flagged, description similarity uses a configurable fuzzy-match threshold (`[ASSUMPTION]`: exact similarity algorithm/threshold is an implementation detail for TechArch, default conservative threshold to avoid false negatives).
- Only users with `clerk_case_admin` or `courtroom_deputy` entitlement may accept/reject/request-correction; external submitters may only submit, never self-accept.
- A rejected or correction-requested submission must carry a reason/detail that is relayed back to the submitter (no bare rejection without explanation).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Required metadata missing | 422 | INTAKE_MISSING_METADATA | "Required exhibit metadata is missing: {fields}" |
| Duplicate submission detected | 409 | INTAKE_DUPLICATE | "This exhibit appears to be a duplicate submission" |
| Unsupported file format | 422 | INTAKE_UNSUPPORTED_FORMAT | "This file format is not supported" |
| File fails malware scan | 422 | INTAKE_FILE_REJECTED | "File rejected: failed security scan" (see F13) |
| Non-authorized user attempts accept/reject | 403 | INTAKE_REVIEW_DENIED | "You are not authorized to review intake submissions" |
| External submitter attempts self-accept | 403 | INTAKE_EXTERNAL_ACCEPT_DENIED | "External submitters cannot accept their own submissions" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Pretrial Intake for `/evidentiary/intake`, `/evidentiary/intake/{id}/accept`, `/evidentiary/intake/{id}/reject`, `/evidentiary/intake/{id}/request-correction` endpoints.

**Schema Surface (this feature):** uses table `exhibit_intake_submissions` — see `Y0b-schema-evidentiary.md` §Pretrial Intake.
