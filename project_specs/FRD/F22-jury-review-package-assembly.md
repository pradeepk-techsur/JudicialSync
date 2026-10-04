## F22: Jury Review Package Assembly

**Description:** Builds a controlled package containing only admitted electronic exhibits authorized for jury review, with access and session controls, automatically excluding rejected, withdrawn, or unauthorized sealed items. This feature provides the secure digital analog to physically handing admitted exhibits to a jury room.

**Terminology:**
- **Jury Package:** A court-authorized, session-scoped collection of admitted electronic exhibits assembled for jury review.
- **Package Session:** A time-bounded, access-controlled viewing session during which jurors (via jury administrator-managed access) may review the package contents.

**Sub-features:**
- Court-authorized package composition from admitted electronic exhibits only
- Session-scoped, access-controlled review package delivery
- Automatic exclusion of rejected/withdrawn/unauthorized-sealed items
- Package-access logging

**Process:**
1. Judge or chambers authorizes jury package assembly for a proceeding, specifying inclusion scope (default: all currently `admitted` electronic exhibits) and any specific exclusions.
2. System queries F16 ledger for all exhibits in `admitted` status with `exhibit_type` compatible with electronic review (F23), automatically excluding any exhibit in `rejected`, `withdrawn`, or `sealed` status (per F21) unless individually authorized for this specific package.
3. Jury administrator reviews the assembled candidate package, confirms composition with the court's authorization, and the system generates the package as a session-scoped, access-controlled artifact.
4. Package access is granted only during an active, time-bounded review session; each access event (open, view individual exhibit, session end) is logged.
5. Package composition and every access event feed the audit trail (F02); composition is itself audit-logged distinctly since it reflects a judicial authorization of scope.
6. If the admitted-exhibit set changes after package assembly (e.g., a late ruling), the package does not silently update — a new package version must be explicitly re-authorized, preserving the principle that no previously delivered jury package is silently altered.

**Inputs:**
- `proceeding_id` (required)
- `authorizing_judge_id` (required)
- `inclusion_scope` (default: all admitted-and-electronic; optional explicit exclusions)
- `session_window` (start/end time or duration, required)

**Outputs:**
- Jury package record (composition list + authorization reference)
- Package access session with time-bounded entitlement
- Package-access audit log

**Validation:**
- Only `admitted`-status, electronically-reviewable exhibit types (F23) are eligible for inclusion; physical-only exhibit types are structurally excluded regardless of status.
- Sealed exhibits (F21) are excluded unless individually authorized for this specific package instance by the same judge authorizing the package.
- Package composition requires `authorizing_judge_id` resolved to an actual judge for the proceeding (same attribution pattern as F17/F21).
- A package version, once delivered/opened for a review session, is immutable — any change in composition requires a new package version, never an in-place edit of a delivered package.
- Package access outside the authorized session window is denied regardless of requester's general entitlements.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Package assembly attempted by non-judge authorization | 403 | JURY_AUTHORIZATION_DENIED | "Jury package assembly requires judge authorization" |
| Attempt to include non-electronic or non-admitted exhibit | 422 | JURY_INELIGIBLE_EXHIBIT | "This exhibit is not eligible for jury package inclusion" |
| Access attempted outside session window | 403 | JURY_SESSION_EXPIRED | "This review session is not currently active" |
| Attempt to modify a delivered package in place | 409 | JURY_PACKAGE_IMMUTABLE | "A delivered package cannot be modified; create a new version" |

**API Surface (this feature):** see `Y1b-api-evidentiary.md` §Jury Package for `/evidentiary/proceedings/{id}/jury-packages`, `/evidentiary/jury-packages/{id}/session` endpoints.

**Schema Surface (this feature):** uses tables `jury_packages`, `jury_package_items`, `jury_package_access_log` — see `Y0b-schema-evidentiary.md` §Jury Package.
