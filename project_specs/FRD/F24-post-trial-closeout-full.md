## F24: Post-Trial Closeout (Full)

**Description:** Produces the complete appeal-ready closeout package: exportable exhibit list, return/retention tasks, custody receipts, and an audit package suitable for appellate review — superseding the baseline export (F19) with full disposition and audit-package assembly.

**Terminology:**
- **Disposition Action:** The final handling instruction for an exhibit post-trial (return to party, retain per court policy, transfer to permanent storage, destroy per retention schedule).
- **Appeal-Ready Audit Package:** A comprehensive, certified export including the full exhibit ledger history, custody chain, rulings, and reconciliation record for a proceeding, suitable for appellate review.

**Sub-features:**
- Full exhibit list export with status and disposition detail
- Return/retention/transfer task generation per court retention policy (F13)
- Receipt generation for all disposition actions
- Appeal-ready audit package assembly, clerk/deputy certified

**Process:**
1. Clerk initiates full closeout for a proceeding after trial conclusion and final reconciliation (F18) is complete with no unresolved high-severity discrepancies.
2. System determines the disposition action required for each exhibit based on its status, type (F23), and the court's retention schedule (F13 configuration): return to offering party, court retention, transfer to another custodian, or scheduled destruction per retention period.
3. System generates disposition tasks (F06) for each exhibit requiring action, assigned to the responsible clerk/custodian role.
4. As each disposition action is executed (physical return, transfer, retention confirmation), a receipt is generated and the exhibit's custody record (F20) is updated with the final disposition.
5. Once all exhibits have a finalized disposition (or an explicitly logged exception for any that remain outstanding beyond a reasonable closeout window), the system assembles the appeal-ready audit package: full exhibit list with final status, complete custody chain per exhibit, ruling history, reconciliation run summary, and all relevant audit trail excerpts.
6. Clerk/deputy reviews and certifies the full closeout package (same certification pattern as F19, but comprehensive rather than a simple filtered export).
7. Certification is audit-logged (F02), referencing the full snapshot of every included record's version at time of certification.

**Inputs:**
- `proceeding_id` (required, with completed reconciliation F18)
- Disposition execution inputs (per exhibit): `disposition_action` (enum): return | retain | transfer | destroy_scheduled, `executing_custodian_id`

**Outputs:**
- Disposition task list (F06) per exhibit
- Disposition receipts
- Full appeal-ready audit package artifact
- Certification record

**Validation:**
- Full closeout cannot begin while the proceeding's reconciliation (F18) has unresolved high-severity discrepancies.
- Every exhibit must have a determinable disposition action before the closeout package can be marked complete; exhibits without a clear disposition path are routed to an exception (F07) rather than silently omitted from the package.
- Destruction disposition actions must respect the court's configured retention period (F13) — destruction cannot be executed before the retention period has elapsed, enforced as a hard validation, not merely a warning.
- Certification requires `clerk_case_admin` entitlement and is a distinct action from package generation, mirroring F19's certification pattern but scoped to the comprehensive package.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Closeout attempted with unresolved reconciliation | 409 | CLOSEOUT_UNRESOLVED_RECONCILIATION | "Closeout cannot begin until reconciliation is complete" |
| Exhibit with no determinable disposition | 422 | CLOSEOUT_NO_DISPOSITION_PATH | "This exhibit has no determinable disposition action" |
| Destruction attempted before retention period elapsed | 409 | CLOSEOUT_RETENTION_NOT_ELAPSED | "Retention period has not yet elapsed for this record" |
| Certification attempted by unauthorized user | 403 | CLOSEOUT_CERTIFY_DENIED | "You are not authorized to certify closeout" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Full Closeout for `/evidentiary/proceedings/{id}/closeout`, `/evidentiary/closeout/{id}/dispositions`, `/evidentiary/closeout/{id}/certify` endpoints.

**Schema Surface (this feature):** uses tables `closeout_packages`, `disposition_records`, `disposition_receipts` — see `Y0b-schema-evidentiary.md` §Post-Trial Closeout.
