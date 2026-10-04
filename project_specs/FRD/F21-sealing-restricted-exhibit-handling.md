## F21: Sealing and Restricted Exhibit Handling

**Description:** Enforces explicit policy-driven handling for sealed, restricted, grand-jury, juvenile, and other sensitive exhibits beyond the platform-level baseline (F13), including judge-authorized sealing/release actions specific to individual exhibits. This feature exists because an exhibit's sensitivity may differ from its case's general security designation — a single exhibit within an otherwise-open case may need sealing.

**Terminology:**
- **Exhibit-Level Designation:** A sealing/restriction status applied to an individual exhibit, distinct from and potentially more restrictive than the case-level designation (F01).
- **Sealing Action:** A judge-authorized action restricting an exhibit's visibility to a narrower entitlement set than the proceeding's general participants.

**Sub-features:**
- Judge-authorized sealing and release workflow for individual exhibits
- Access restriction enforcement distinct from general case security designation
- Audit of every sealed-record access attempt (successful or denied)

**Process:**
1. Judge (or chambers, on the judge's behalf with explicit attribution) initiates a sealing action on a specific exhibit, specifying the designation category (sealed, restricted, grand_jury, juvenile) and the entitlement scope permitted to view it.
2. System applies the exhibit-level designation (F16 status update to `sealed` where applicable, or a non-status designation flag for restricted-but-not-sealed items), evaluated by the central policy engine (F13) at every subsequent access attempt.
3. Every attempt to view, search for (F05), include in a timeline (F08), or export (F19/F24) a sealed/restricted exhibit is checked against the requester's entitlement; both successful (authorized) and denied (unauthorized) attempts are logged as audit events (F02) — this exceeds the general platform baseline's access logging by making sealed-exhibit access attempts individually significant events, not just aggregate log lines.
4. Release (un-sealing) requires an explicit judge-authorized action, symmetric to sealing, and is itself audit-logged with the releasing judge's attribution.
5. Sealed exhibits are automatically excluded from jury review package assembly (F22) unless individually and explicitly authorized for that specific jury review instance.

**Inputs:**
- `exhibit_id` (required)
- `designation_category` (enum, required): sealed | restricted | grand_jury | juvenile
- `authorizing_judge_id` (required, system-resolved, not self-asserted)
- `permitted_entitlement_scope` (object, required): which roles/specific users may view
- Release: `release_authorizing_judge_id`, `release_reason` (required)

**Outputs:**
- Updated exhibit designation state
- Access-attempt audit log entries (successful and denied)
- Release record when applicable

**Validation:**
- Sealing/release actions require `authorizing_judge_id` resolved to an actual judge role holder for the proceeding — a clerk cannot self-authorize a seal even if acting "on the judge's behalf" without an attributable judge identity tied to the action (mirrors F17's ruling-attribution pattern).
- A sealed exhibit's existence may itself be sensitive (`[ASSUMPTION]`, consistent with F05's existence-hiding note) — unauthorized users must receive a "not found" response rather than an "access denied" response when attempting to access a sealed exhibit by direct ID, to avoid confirming its existence.
- Every access attempt against a sealed/restricted exhibit — successful or denied — must produce an audit event; this is a stricter logging requirement than the general platform baseline and is not optional/samples-only.
- Sealed exhibits are excluded from F22 jury packages by default; inclusion requires a separate, explicit judge authorization scoped to that specific jury review instance (not merely general release).

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Non-judge attempts to seal/release | 403 | SEAL_AUTHORIZATION_DENIED | "Sealing actions require judge authorization" |
| Unauthorized access attempt to sealed exhibit by ID | 404 (existence-hiding) | SEAL_NOT_FOUND | "Exhibit not found" |
| Attempt to include sealed exhibit in jury package without specific authorization | 422 | SEAL_JURY_PACKAGE_DENIED | "This exhibit is sealed and not authorized for jury review" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Sealing for `/evidentiary/exhibits/{id}/seal`, `/evidentiary/exhibits/{id}/release` endpoints.

**Schema Surface (this feature):** uses tables `exhibit_designations`, extends `audit_events` access-attempt logging — see `Y0b-schema-evidentiary.md` §Sealing & Restricted Handling.
