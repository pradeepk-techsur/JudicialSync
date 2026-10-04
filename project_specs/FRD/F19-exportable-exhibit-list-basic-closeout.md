## F19: Exportable Exhibit List and Basic Closeout

**Description:** Produces a one-click, court-approved export of admitted (or filtered) exhibits for review, filing, or downstream use — the baseline, non-pilot-hardened closeout capability, superseded by the full appeal-ready closeout (F24) in a later increment.

**Terminology:**
- **Export Certification:** The clerk/deputy's explicit confirmation that an exported list accurately represents the ledger at export time, itself an audit-logged action.

**Sub-features:**
- Filter-and-export of exhibit lists by status (e.g., admitted-only)
- Clerk/deputy certification of the export
- Basic exportable record suitable as an interim closeout artifact

**Process:**
1. Clerk/deputy selects a proceeding and a status filter (e.g., admitted-only, all-non-withdrawn) for export.
2. System generates an export artifact (structured format — CSV/PDF, exact format a TechArch concern) listing each matching exhibit's identifier, description, party, status, and ruling reference.
3. Clerk/deputy reviews the generated list and explicitly certifies it as accurate at time of export (a distinct confirmation action, not implied by the download itself).
4. Certification is logged to the audit trail (F02), capturing the exact ledger state snapshot (version references) the export was generated from, so a later audit can confirm what was exported and when.
5. Export artifact is made available for download/filing; it is explicitly labeled as a non-final, interim record where the court has not yet completed full post-trial closeout (F24).

**Inputs:**
- `proceeding_id` (required)
- `status_filter[]` (enum array, required, e.g. `['admitted']`)
- `export_format` (enum, optional, default per court configuration)

**Outputs:**
- Export artifact file
- Certification record referencing exact exhibit version snapshot included

**Validation:**
- Export cannot be certified by a user without `clerk_case_admin` or `courtroom_deputy` entitlement for the proceeding.
- Certification requires explicit confirmation action distinct from mere file generation/download — generating a preview does not itself constitute certification.
- Every certified export retains a snapshot reference (which exhibit version of each included exhibit was captured) so later ledger changes do not retroactively alter what a previously certified export is understood to have contained.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Export requested for proceeding with no matching exhibits | 404 | EXPORT_NO_MATCHING_EXHIBITS | "No exhibits match the selected filter" |
| Certification attempted by unauthorized user | 403 | EXPORT_CERTIFY_DENIED | "You are not authorized to certify this export" |
| Certification attempted without prior export generation | 409 | EXPORT_NOT_GENERATED | "An export must be generated before it can be certified" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Basic Closeout for `/evidentiary/exports`, `/evidentiary/exports/{id}/certify` endpoints.

**Schema Surface (this feature):** uses table `exhibit_exports` (snapshot references into `exhibit_versions`) — see `Y0b-schema-evidentiary.md` §Basic Closeout.
