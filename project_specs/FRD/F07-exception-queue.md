## F07: Exception Queue

**Description:** A dedicated, cross-module queue highlighting data-quality issues — discrepancies, missing required fields, unmapped docket events, conflicting logs, incomplete approvals — so staff resolve them before they cause downstream errors (a stale ledger, a miscalculated Speedy Trial date). This feature operationalizes the PRD's "no proactive risk surfacing" root-cause fix.

**Terminology:**
- **Exception:** A flagged condition requiring human review and a documented resolution rationale before it can be closed.
- **Aging Indicator:** A visual/sortable signal showing how long an exception has remained unresolved, used to prioritize the oldest items.

**Sub-features:**
- Cross-module exception surfacing (exhibit reconciliation mismatches from F18, unmapped Speedy Trial events from F27, incomplete metadata from F15)
- Required rationale capture on exception resolution
- Age/aging indicators to prioritize oldest unresolved exceptions

**Process:**
1. A source feature (F15 intake validation, F18 reconciliation, F27 event mapping, F02 hash-chain integrity check) detects a condition meeting its exception criteria and creates an exception record: type, severity, object reference, detected timestamp, detecting feature.
2. Exception appears in the Exception Queue, filterable by module, type, severity, and age; a corresponding task (F6) is created for the owning role.
3. Authorized user opens the exception, reviews the detail (e.g., the specific field mismatch, the two conflicting log entries, the unmapped event's raw CM/ECF code), and takes a resolution action specific to the exception type (correct a field, accept one of two conflicting values, map an event to a category).
4. User must supply a resolution rationale (free text, minimum length enforced) before the exception can be marked `resolved`.
5. Resolution and rationale are logged as an audit event (F02); the exception's age-at-resolution is recorded for the F09 reporting feed.
6. Unresolved exceptions beyond a configured age threshold escalate via F04 notification to a supervisory role.

**Inputs:**
- `exception_type` (enum, required): reconciliation_mismatch | missing_metadata | unmapped_docket_event | conflicting_log_entry | incomplete_approval | audit_integrity_break
- `severity` (enum, required): low | medium | high | critical
- `object_reference` (object_type, object_id, required)
- `detail` (JSON, required): structured description of the discrepancy (e.g., field name, conflicting values, source raw event)
- Resolution input: `resolution_action` (enum, type-specific), `rationale` (string, required, min length enforced, e.g. 10 characters)

**Outputs:**
- Exception record with status (`open`, `in_review`, `resolved`, `escalated`)
- Exception Queue view: filterable, sortable by age/severity
- Resolution audit event with rationale attached

**Validation:**
- An exception cannot be marked `resolved` without a non-empty rationale meeting the minimum length/quality bar (`[ASSUMPTION]`: minimum 10 characters, not a single word — exact threshold is a UX/policy decision for pilot validation).
- Critical-severity exceptions (e.g., audit_integrity_break) cannot be auto-closed by any batch process; they require explicit individual review.
- An exception's resolution action must be type-appropriate (e.g., a `reconciliation_mismatch` exception's resolution must reference which source value was accepted, not an arbitrary free-text-only resolution).
- Exceptions related to legally significant data (unmapped Speedy Trial events, continuance findings gaps) must route to a role with the appropriate review authority per F03 workflow configuration, not merely any available clerk.

**Error States:**
| Scenario | HTTP Status | Error Code | Message |
|----------|-------------|------------|---------|
| Resolve attempted without rationale | 422 | EXCEPTION_RATIONALE_REQUIRED | "A resolution rationale is required" |
| Resolve attempted with rationale below minimum length | 422 | EXCEPTION_RATIONALE_TOO_SHORT | "Rationale must be at least 10 characters" |
| Critical exception auto-close attempted | 403 (internal guard) | EXCEPTION_CRITICAL_MANUAL_ONLY | "Critical exceptions require individual manual review" |
| Resolution action type mismatch | 422 | EXCEPTION_ACTION_TYPE_MISMATCH | "Resolution action does not match exception type" |

**API Surface (this feature):** see `Y1a-api-shared.md` §Exception Queue for `/exceptions`, `/exceptions/{id}/resolve` endpoints.

**Schema Surface (this feature):** uses table `exceptions` — see `Y0a-schema-shared.md` §Exception Queue.
